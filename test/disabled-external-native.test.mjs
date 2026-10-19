// 用真实 DSH scope 合并与 skill.execute 回归；仅使用临时用户目录。
// DSH_RUNTIME_DIR 指向含原生 @deepseek-ai/* 依赖的 dsh 包目录。
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const req = process.env.DSH_RUNTIME_DIR
  ? createRequire(join(resolve(process.env.DSH_RUNTIME_DIR), "package.json"))
  : createRequire(createRequire(import.meta.url).resolve("@deepseek-ai/dsh-web-app/package.json"));
const load = (name) => import(pathToFileURL(req.resolve(name)).href);
const qa = await mkdtemp(join(tmpdir(), "dssm-disabled-external-"));
process.env.USERPROFILE = process.env.HOME = join(qa, "user");
process.env.DSH_HOME = join(qa, "home");
process.env.DSH_AGENTS_HOME = join(qa, "user", ".agents");
const skill = "bundled-regression";
const bundled = join(qa, "bundled");
const core = await import("../lib/core.js");
async function fixture(root, body) {
  const dir = join(root, skill);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), `---\nname: ${skill}\ndescription: fixture\n---\n${body}`);
  return dir;
}
const roots = core.userRoots();
const cc = roots.find((r) => r.key === "ccswitch");
const wb = roots.find((r) => r.key === "workbuddy");
await fixture(bundled, "plugin fixture");
const ccDir = await fixture(cc.path, "ccswitch fixture");
await fixture(wb.path, "workbuddy fixture");
await core.setSourceEnabled("ccswitch", false);
await core.setSourceEnabled("workbuddy", false);
const { Context } = await load("@deepseek-ai/cordis");
const { SkillRegistry, isUserInvocable } = await load("@deepseek-ai/dsh-skill");
const { createScope } = await load("@deepseek-ai/dsh-scope");
const { FileSystemSkillProvider } = await load("@deepseek-ai/dsh-skill-filesystem");
const toolmod = await load("@deepseek-ai/dsh-tool-skill");
const ctx = new Context();
const registry = ctx.plugin(SkillRegistry);
await registry.await();
let scope;
let runRegression;
const harness = ctx.plugin({ name: "regression-harness", inject: ["skills"], apply(host) {
  host.skills.registerProvider((control) => new FileSystemSkillProvider(host, control, {
    providerName: "bundled-plugin", includeDefaultRoots: true, bundledSkillDir: bundled, watch: false,
  }));
  const agent = { session: { header: { cwd: qa } } };
  scope = createScope(host, agent);
  let invalidate;
  scope.ctx.skills.registerProvider((control) => {
    invalidate = control.invalidate;
    return { name: "dsh-skills-manager-external", list: core.listProviderCandidates, get: core.getProviderSkill };
  });
  let tool;
  // 较新的 dsh-tool-skill 在 execute 时会读 ctx.workingDirectory 解析 agent 工作目录；
  // 这里只需要把已知 cwd 原样返回，避免为回归测试引入真实沙箱。
  const workingDirectory = { ensure: async () => qa };
  toolmod.apply({ skills: host.skills, workingDirectory, tools: { register(t) { tool = t; } }, on() {} });
  runRegression = async () => {
    const selected = async () => {
      invalidate();
      return (await host.skills.list({ cwd: qa, scope: agent })).find((s) => s.name === skill);
    };
    const execute = () => tool.execute({ name: skill }, { agent, signal: new AbortController().signal });
    const chosen = await selected();
    assert.equal(chosen.provider, "bundled-plugin", "关闭的外部来源不遮蔽全局插件");
    assert.ok(isUserInvocable(chosen), "斜杠入口可用");
    await execute();
    console.log("通过：关闭外部来源后 bundled 目录与实际技能调用正常");
    await core.setSourceEnabled("ccswitch", true);
    assert.equal((await selected()).source, "agent-ccswitch");
    await execute();
    assert.equal((await core.readManagerState()).state.sources.workbuddy, false);
    console.log("通过：重新启用 CC Switch，WorkBuddy 保持关闭");
    await core.setSourceEnabled("ccswitch", false);
    const agentsRoot = join(process.env.DSH_AGENTS_HOME, "skills");
    await fixture(agentsRoot, "native fixture");
    await core.setSourceEnabled("agents", false);
    assert.equal(isUserInvocable(await selected()), false);
    await assert.rejects(execute, /not available for model invocation/);
    console.log("通过：原生来源禁用仍阻止实际技能调用");
    const projectSkills = join(qa, ".codex", "skills");
    await fixture(projectSkills, "project external fixture");
    const projectCodex = (await core.projectRoots([qa])).find((r) => r.kind === "project-codex");
    await core.setSourceEnabled(projectCodex.key, false, undefined, { projectCwds: [qa] });
    assert.equal(isUserInvocable(await selected()), false);
    await assert.rejects(execute, /not available for model invocation/);
    console.log("通过：项目外部来源关闭时保留原生用户来源的禁用覆盖");
    await core.setSourceEnabled("agents", true);
    assert.equal((await selected()).source, "agent-agents");
    await execute();
    await core.setSourceEnabled("agents", false);
    console.log("通过：项目外部来源关闭不阻止原生用户来源重新启用");
    await rm(join(agentsRoot, skill), { recursive: true });
    await symlink(ccDir, join(agentsRoot, skill), process.platform === "win32" ? "junction" : "dir");
    assert.equal(isUserInvocable(await selected()), false);
    await assert.rejects(execute, /not available for model invocation/);
    console.log("通过：项目外部来源关闭时保留原生分发链接的禁用覆盖");
    await rm(join(projectSkills, skill), { recursive: true });
    assert.equal(isUserInvocable(await selected()), false);
    await assert.rejects(execute, /not available for model invocation/);
    console.log("通过：链入原生根的外部副本保持禁用");
  };
} });
await harness.await();
try {
  await runRegression();
} finally {
  await scope?.dispose();
  await harness.dispose();
  await registry.dispose();
  await rm(qa, { recursive: true, force: true });
}