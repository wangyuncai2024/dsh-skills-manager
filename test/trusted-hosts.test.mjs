// 回归：DSH 0.2.1-alpha.2 移除了 webRuntime 服务，trustedHosts 迁到 connection。
// 插件必须两种来源都能读，且服务缺失时不能让插件卡在 pending 或抛
// "cannot get property ... without inject"。
import assert from "node:assert/strict";
import { Context } from "@deepseek-ai/cordis";
import { WebServer } from "@deepseek-ai/dsh-host-webserver";
import { createServer } from "node:http";
import { request } from "node:http";
import * as plugin from "../lib/index.js";

const prefix = "/api/dsh-skills-manager";

/** 用给定的服务组合启动插件，返回可直接调用的 prefix 路由。
 *  tools/sessions 由真实宿主恒常提供，这里一并补上，只让被验证的服务成为变量。 */
async function startHost(services) {
  const ctx = new Context();
  const server = { exact: new Map(), prefixes: new Map(), register: WebServer.prototype.register };
  ctx.provide("webServer", server);
  ctx.provide("tools", {});
  ctx.provide("sessions", {});
  for (const [name, value] of Object.entries(services)) ctx.provide(name, value);
  const fiber = ctx.plugin(plugin);
  await fiber.await();
  const route = server.prefixes.get(prefix);
  assert.ok(route, "插件必须注册主路由（否则说明它被 inject 卡住）");
  return { ctx, fiber, route };
}

/** 用指定 Host 头请求一次，返回状态码。 */
function statusFor(route, host) {
  const server = createServer((req, res) => route.handler(req, res));
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const req = request(
        { host: "127.0.0.1", port, path: `${prefix}/state`, headers: { host } },
        (res) => {
          res.resume();
          res.on("end", () => server.close(() => resolve(res.statusCode)));
        },
      );
      req.on("error", (error) => server.close(() => reject(error)));
      req.end();
    });
  });
}

// 1) 旧宿主：仅 webRuntime 提供 trustedHosts（无 get，属性访问路径）。
{
  const { ctx, fiber, route } = await startHost({
    webRuntime: { trustedHosts: ["dsh.lan:8443"] },
    skills: { registerProvider() { return () => {}; } },
  });
  assert.equal(await statusFor(route, "dsh.lan:8443"), 200, "旧宿主应信任 webRuntime 里的条目");
  assert.equal(await statusFor(route, "evil.example"), 403, "未信任的 Host 仍必须拒绝");
  await fiber.dispose();
  await ctx.fiber.dispose();
}

// 2) 新宿主：webRuntime 不存在，trustedHosts 来自 connection。
{
  const { ctx, fiber, route } = await startHost({
    connection: { trustedHosts: ["dsh.lan:8443"] },
    skills: { registerProvider() { return () => {}; } },
  });
  assert.equal(await statusFor(route, "dsh.lan:8443"), 200, "新宿主应信任 connection 里的条目");
  assert.equal(await statusFor(route, "evil.example"), 403, "未信任的 Host 仍必须拒绝");
  await fiber.dispose();
  await ctx.fiber.dispose();
}

// 3) 两者都缺失：不得抛错，loopback 仍放行、外部 Host 仍拒绝。
{
  const { ctx, fiber, route } = await startHost({
    skills: { registerProvider() { return () => {}; } },
  });
  assert.equal(await statusFor(route, "127.0.0.1"), 200, "loopback 必须始终放行");
  assert.equal(await statusFor(route, "evil.example"), 403, "缺少信任来源时不得放宽");
  await fiber.dispose();
  await ctx.fiber.dispose();
}

// 4) 插件不再 inject webRuntime/connection，避免宿主缺少服务时永久 pending。
assert.deepEqual([...plugin.inject].sort(), ["sessions", "skills", "tools", "webServer"]);

console.log("跨版本 trustedHosts：webRuntime / connection / 双双缺失 均通过，且未 inject 已移除的服务");
