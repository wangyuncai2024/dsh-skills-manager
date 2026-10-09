// 0.1.7-rc.1 起（含 0.2.0-rc.1/rc.2）依赖 Cordis ~4.0.4；0.2.1-alpha.1 起依赖 Cordis ~4.0.5-alpha.1；更早的已验证 rc 宿主继续锁定 4.0.2。
// 官方 Cordis 插件的最新版只接受当前 Cordis 线。旧宿主若让它们浮动，HMR 服务不会注册，补丁监听会直接退出。
// 按阈值推导而不是逐个枚举：未登记的较新宿主若回退到过旧的 Cordis，宿主会在兼容检查连上之前就退出。
const CORDIS_LINES = Object.freeze([
  { since: "0.2.1-alpha.1", cordis: "4.0.5-alpha.1" },
  { since: "0.1.7-rc.1", cordis: "4.0.4" },
  { since: "0.0.0-0", cordis: "4.0.2" },
]);
const CORDIS_PLUGIN_PINS = Object.freeze({
  "4.0.2": {
    "@deepseek-ai/cordis-plugin-group": "1.0.2",
    "@deepseek-ai/cordis-plugin-hmr": "1.0.17",
    "@deepseek-ai/cordis-plugin-include": "1.0.7",
    "@deepseek-ai/cordis-plugin-loader": "1.0.3",
    "@deepseek-ai/cordis-plugin-timer": "1.1.4",
  },
  "4.0.4": {
    "@deepseek-ai/cordis-plugin-group": "1.0.4",
    "@deepseek-ai/cordis-plugin-hmr": "1.0.19",
    "@deepseek-ai/cordis-plugin-include": "1.0.9",
    "@deepseek-ai/cordis-plugin-loader": "1.0.5",
    "@deepseek-ai/cordis-plugin-timer": "1.1.6",
  },
  "4.0.5-alpha.1": {
    "@deepseek-ai/cordis-plugin-group": "1.0.5-alpha.1",
    "@deepseek-ai/cordis-plugin-hmr": "1.0.20-alpha.1",
    "@deepseek-ai/cordis-plugin-include": "1.0.10-alpha.1",
    "@deepseek-ai/cordis-plugin-loader": "1.0.6-alpha.1",
    "@deepseek-ai/cordis-plugin-timer": "1.1.7-alpha.1",
  },
});

// 按 SemVer 规则比较宿主版本，取满足阈值的最新一条 Cordis 线。
// 预发布段必须参与比较：0.2.1-alpha.1 低于 0.2.1，忽略它会把未发布的线提前套到旧宿主上。
import semver from "semver";

function compareVersions(left, right) {
  return semver.compare(left, right);
}

export function cordisPin(hostVersion) {
  for (const line of CORDIS_LINES) {
    if (compareVersions(hostVersion, line.since) >= 0) return line.cordis;
  }
  return CORDIS_LINES[CORDIS_LINES.length - 1].cordis;
}

export function hostCordisOverrides(hostVersion) {
  const cordis = cordisPin(hostVersion);
  return { "@deepseek-ai/cordis": cordis, ...CORDIS_PLUGIN_PINS[cordis] };
}

// pnpm 的包名通配 override 不保证匹配传递依赖；在解析每个包时锁定官方依赖。
export function pinHostDependencies(manifest, version) {
  const pinned = { ...manifest };
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    if (!manifest[field]) continue;
    pinned[field] = Object.fromEntries(Object.entries(manifest[field]).map(([name, range]) =>
      [name, name === "@deepseek-ai/dsh" || name.startsWith("@deepseek-ai/dsh-") ? version : range]));
  }
  return pinned;
}
