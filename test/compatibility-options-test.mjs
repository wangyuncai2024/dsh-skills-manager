import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
// 回归：标志顺序、非法组合与必需 peer 缺失必须被检测。
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, readFile } from "node:fs/promises";
import { parseOptions } from "../scripts/compatibility-options.mjs";
import { sameExistingPath, resolveTempRoot } from "../scripts/compat-paths.mjs";
import { assertHostPeers, supportedHosts, peerRange, developmentHost } from "../scripts/hosts.mjs";
import { cordisPin, hostCordisOverrides, pinHostDependencies } from "../scripts/compat-dependencies.mjs";
const mixed = { dependencies: { "@deepseek-ai/dsh-app-boot": "^0.1.6-alpha.1", other: "^2" }, peerDependencies: { "@deepseek-ai/dsh-base": "*" } };
const pinned = pinHostDependencies(mixed, "0.1.6-alpha.1");
assert.equal(pinned.dependencies["@deepseek-ai/dsh-app-boot"], "0.1.6-alpha.1");
assert.equal(pinned.peerDependencies["@deepseek-ai/dsh-base"], "0.1.6-alpha.1");
assert.equal(pinned.dependencies.other, "^2");
assert.equal(mixed.dependencies["@deepseek-ai/dsh-app-boot"], "^0.1.6-alpha.1");
assert.equal(cordisPin("0.1.5-rc.2"), "4.0.2");
assert.equal(cordisPin("0.1.7-rc.1"), "4.0.4");
assert.equal(cordisPin("0.1.7-rc.2"), "4.0.4");
assert.equal(cordisPin("0.2.0-rc.1"), "4.0.4");
assert.equal(cordisPin("0.2.0-rc.2"), "4.0.4");
// 阈值推导：未登记的较新宿主必须跟随所属 Cordis 线，而不是回退到过旧的 4.0.2。
assert.equal(cordisPin("0.2.1-alpha.1"), "4.0.5-alpha.1");
assert.equal(cordisPin("0.2.1-alpha.2"), "4.0.5-alpha.1");
assert.equal(cordisPin("0.2.5"), "4.0.5-alpha.1");
assert.equal(cordisPin("0.4.0-rc.1"), "4.0.5-alpha.1");
assert.equal(hostCordisOverrides("0.1.1-rc.2")["@deepseek-ai/cordis-plugin-hmr"], "1.0.17");
assert.equal(hostCordisOverrides("0.1.1-rc.2")["@deepseek-ai/cordis-plugin-timer"], "1.1.4");
assert.equal(hostCordisOverrides("0.1.7-rc.1")["@deepseek-ai/cordis-plugin-hmr"], "1.0.19");
assert.equal(hostCordisOverrides("0.1.7-rc.2")["@deepseek-ai/cordis-plugin-hmr"], "1.0.19");
assert.equal(hostCordisOverrides("0.2.0-rc.1")["@deepseek-ai/cordis-plugin-hmr"], "1.0.19");
assert.equal(hostCordisOverrides("0.2.0-rc.2")["@deepseek-ai/cordis-plugin-hmr"], "1.0.19");
assert.equal(hostCordisOverrides("0.2.1-alpha.1")["@deepseek-ai/cordis"], "4.0.5-alpha.1");
assert.equal(hostCordisOverrides("0.2.1-alpha.1")["@deepseek-ai/cordis-plugin-hmr"], "1.0.20-alpha.1");
assert.equal(hostCordisOverrides("0.2.1-alpha.2")["@deepseek-ai/cordis"], "4.0.5-alpha.1");
assert.equal(cordisPin(developmentHost), "4.0.5-alpha.1");
assert.equal(developmentHost, "0.2.1-alpha.2");
assert.deepEqual(supportedHosts, ["0.1.2-rc.1", "0.1.5-rc.1", "0.1.5-rc.2", "0.1.5-rc.3", "0.1.7-rc.1", "0.1.7-rc.2", "0.2.0-rc.1", "0.2.0-rc.2", "0.2.1-alpha.1", "0.2.1-alpha.2"]);
assert.deepEqual(parseOptions(["--keep"]).versions, supportedHosts);
assert.equal(parseOptions(["--keep", supportedHosts[0]]).keep, true);
assert.deepEqual(parseOptions([supportedHosts[0], "--keep"]).versions, [supportedHosts[0]]);
assert.equal(parseOptions(["--list"]).list, true);
assert.equal(parseOptions(["--help"]).help, true);
for (const args of [["--wat"], ["--all", supportedHosts[0]], [supportedHosts[0], supportedHosts[1]], ["--list", "--keep"]]) {
  assert.throws(() => parseOptions(args));
}
assert.throws(() => parseOptions(["--serve"]), /单一版本/);
assert.throws(() => parseOptions(["--all", "--serve"]), /单一版本/);
assert.equal(parseOptions(["--serve", supportedHosts[0]]).serve, true);
const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
assertHostPeers(manifest.peerDependencies);
for (const [name, range] of Object.entries(manifest.peerDependencies)) {
  if (name.startsWith("@deepseek-ai/dsh-")) assert.equal(range, peerRange, name);
}
// 核心防复发回归：peer 范围必须是区间，未来宿主版本不能被兼容门拒绝。
// 否则每出一个新的 DSH 版本，宿主就会整体跳过本组合包（1.1.8 起连续复发三次）。
const semver = (await import("semver")).default;
assert.match(peerRange, /^>=/, "peer 范围必须是区间；枚举式范围会随新宿主版本失效");
for (const future of ["0.2.1-alpha.2", "0.2.2-alpha.1", "0.2.5", "0.3.0-rc.1", "0.9.9"]) {
  assert.equal(semver.satisfies(future, peerRange, { includePrerelease: true }), true, `${future} 不应被兼容门拒绝`);
}
// 已淘汰与破坏性大版本仍必须被拒绝。
for (const rejected of ["0.1.0-rc.8", "1.0.0", "1.1.0"]) {
  assert.equal(semver.satisfies(rejected, peerRange, { includePrerelease: true }), false, `${rejected} 不应被放行`);
}
// 每个受支持宿主都必须真的落在声明范围内，避免清单与范围脱节。
for (const host of supportedHosts) {
  assert.equal(semver.satisfies(host, peerRange, { includePrerelease: true }), true, `${host} 在受支持清单内却不在声明范围内`);
}
assert.equal(manifest.devDependencies["@deepseek-ai/cordis"], cordisPin(developmentHost));
for (const [name, version] of Object.entries(manifest.devDependencies)) {
  if (name.startsWith("@deepseek-ai/dsh-")) assert.equal(version, developmentHost, name);
}
const missing = { ...manifest.peerDependencies };
delete missing["@deepseek-ai/dsh-web-app"];
assert.throws(() => assertHostPeers(missing));
assert.throws(() => assertHostPeers({ ...manifest.peerDependencies, "@deepseek-ai/dsh-unknown": "1" }));
// 缺失工具必须在创建宿主沙箱前失败。
const temp = await mkdtemp(join(tmpdir(), "skills-missing-tool-"));
try {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== "path"));
  Object.assign(env, { PATH: "", TEMP: temp, TMP: temp, TMPDIR: temp });
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/test-host-compatibility.mjs", import.meta.url)), supportedHosts[0]], { env, encoding: "utf8", timeout: 10000, windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PATH 中找不到可运行的 npm/);
  assert.deepEqual(await readdir(temp), []);
} finally { await rm(temp, { recursive: true, force: true }); }
const pathRoot = await mkdtemp(join(tmpdir(), "skills-compat-path-"));
try {
  const resolved = await resolveTempRoot(pathRoot);
  assert.equal(await sameExistingPath(pathRoot, resolved), true);
  assert.equal(await sameExistingPath(pathRoot, join(pathRoot, ".", "nested", "..")), true);
  assert.equal(await sameExistingPath(pathRoot, join(pathRoot, "missing")), false);
} finally { await rm(pathRoot, { recursive: true, force: true }); }
console.log("兼容参数、必需 peer 与缺失工具回归通过");
