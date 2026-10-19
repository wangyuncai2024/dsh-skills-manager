// 默认只校验；--write 从版本清单同步发布元数据和当前 README，历史 CHANGELOG 不参与生成。
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import {
  supportedHosts,
  peerRange,
  developmentHost,
  assertHostPeers,
} from "./hosts.mjs";
import { cordisPin } from "./compat-dependencies.mjs";
const manifestUrl = new URL("../package.json", import.meta.url);
const original = await readFile(manifestUrl, "utf8");
const manifest = JSON.parse(original);
assertHostPeers(manifest.peerDependencies);
assert.equal(new Set(supportedHosts).size, supportedHosts.length);
assert(supportedHosts.includes(developmentHost));
// 声明范围（区间）和已验证清单是两件事：范围保证新宿主不被兼容门拦下，清单说明实际跑过测试的版本。
for (const [field, value] of [
  ["peerDependencies", peerRange],
  ["devDependencies", developmentHost],
]) {
  for (const name of Object.keys(manifest[field])) {
    if (name.startsWith("@deepseek-ai/dsh-")) manifest[field][name] = value;
  }
}
assert.equal(
  manifest.devDependencies["@deepseek-ai/cordis"],
  cordisPin(developmentHost),
  "开发用的 Cordis 版本必须与该宿主所属的 Cordis 线一致；运行 node scripts/sync-hosts.mjs --write",
);
const expected = JSON.stringify(manifest, null, 2) + "\n";
const write = process.argv.includes("--write");
if (write) await writeFile(manifestUrl, expected);
else
  assert.deepEqual(
    JSON.parse(original),
    manifest,
    "package.json 与 hosts.mjs 不一致；运行 node scripts/sync-hosts.mjs --write",
  );
// 徽章和"本文对应哪个版本"两行同样要跟清单/版本号同步，
// 否则发布后 README 会长期停在旧宿主版本上。
const latestHost = supportedHosts.at(-1);
const shieldsHost = latestHost.replace(/(\d)-/g, "$1--");
for (const [file, pattern, line] of [
  [
    "README.md",
    /^- Plugin `[^`]+` (?:is tested with|accepts) DeepSeek Harness .*$/m,
    `- Plugin \`${manifest.version}\` accepts DeepSeek Harness \`${peerRange}\` and is verified against ${supportedHosts.map((v) => "`" + v + "`").join(", ")}.`,
  ],
  [
    "README.zh-CN.md",
    /^- `[^`]+` (?:已验证兼容|接受) DeepSeek Harness .*$/m,
    `- \`${manifest.version}\` 接受 DeepSeek Harness \`${peerRange}\`，并已验证 ${supportedHosts.map((v) => "`" + v + "`").join("、")}。`,
  ],
  [
    "README.md",
    /^This README describes \*\*[^*]+\*\*\. See the \[changelog\]\(CHANGELOG\.md\).*$/m,
    `This README describes **${manifest.version}**. See the [changelog](CHANGELOG.md) and [release notes](https://github.com/MichengAI/dsh-skills-manager/releases/latest).`,
  ],
  [
    "README.zh-CN.md",
    /^本文对应 \*\*[^*]+\*\*。完整变更见\[更新日志\]\(CHANGELOG\.zh-CN\.md\).*$/m,
    `本文对应 **${manifest.version}**。完整变更见[更新日志](CHANGELOG.zh-CN.md)与[最新发行说明](https://github.com/MichengAI/dsh-skills-manager/releases/latest)。`,
  ],
  [
    "README.md",
    /^  \[!\[DSH supported through [^\[]+\]\(https:\/\/img\.shields\.io\/badge\/DSH-up%20to%20[^)]+\)\]\(#installation\)$/m,
    `  [![DSH supported through ${latestHost}](https://img.shields.io/badge/DSH-up%20to%20${shieldsHost}-2563eb.svg)](#installation)`,
  ],
  [
    "README.zh-CN.md",
    /^  \[!\[DSH 支持至 [^\[]+\]\(https:\/\/img\.shields\.io\/badge\/DSH-%E6%94%AF%E6%8C%81%E8%87%B3%20[^)]+\)\]\(#安装\)$/m,
    `  [![DSH 支持至 ${latestHost}](https://img.shields.io/badge/DSH-%E6%94%AF%E6%8C%81%E8%87%B3%20${shieldsHost}-2563eb.svg)](#安装)`,
  ],
]) {
  const url = new URL("../" + file, import.meta.url);
  const content = await readFile(url, "utf8");
  assert(pattern.test(content), `${file} 缺少兼容说明段落`);
  if (write) await writeFile(url, content.replace(pattern, line));
  else
    assert.equal(content.match(pattern)[0], line, `${file} 兼容说明需要同步`);
}
