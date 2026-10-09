import assert from "node:assert/strict";
// 实际跑过真实宿主兼容测试的版本：用于 CI 矩阵和 README 的「已验证」声明。
export const supportedHosts = Object.freeze(["0.1.2-rc.1", "0.1.5-rc.1", "0.1.5-rc.2", "0.1.5-rc.3", "0.1.7-rc.1", "0.1.7-rc.2", "0.2.0-rc.1", "0.2.0-rc.2", "0.2.1-alpha.1", "0.2.1-alpha.2"]);
// 宿主启动时的兼容门读取下面这个范围，不满足的 peer 会让它整体跳过本组合包。
// 这里必须是区间而不是枚举：枚举每遇到一个新宿主版本就把插件挡在门外（1.1.8→1.1.13 连续复发三次）。
// DSH 0.x 全线（含预发布）放行；1.0.0 起 API 可能破坏性变更，需要人工复核后再扩范围。
export const peerRange = ">=0.1.2-rc.1 <1.0.0";
export const developmentHost = "0.2.1-alpha.2";

export const requiredHostPeers = Object.freeze([
  "@deepseek-ai/dsh-client-locale",
  "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-host-webserver",
  "@deepseek-ai/dsh-session",
  "@deepseek-ai/dsh-skill",
  "@deepseek-ai/dsh-tools",
  "@deepseek-ai/dsh-web-app",
]);
export function assertHostPeers(peers) {
  assert.deepEqual(Object.keys(peers).filter(name => name.startsWith("@deepseek-ai/dsh-")).sort(), [...requiredHostPeers].sort(), "官方 peer 集合与必需清单不一致");
}
