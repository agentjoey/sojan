import "server-only";
import { createNeonAuth, type NeonAuth } from "@neondatabase/auth/next/server";

let instance: NeonAuth | undefined;

function getAuth(): NeonAuth {
  instance ??= createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
  });
  return instance;
}

/**
 * Neon Auth 服务端实例（Managed Better Auth）。
 *
 * 惰性创建：`createNeonAuth` 在 cookie secret 缺失/过短时会直接 throw，
 * 若在 import 期创建，任何（间接）import 本模块的测试/构建步骤在没配 env 时都会崩。
 * 这里用 Proxy 推迟到第一次真正访问成员时。
 */
export const auth: NeonAuth = new Proxy({} as NeonAuth, {
  get(_t, prop) {
    const target = getAuth();
    const v = Reflect.get(target, prop);
    return typeof v === "function" ? v.bind(target) : v;
  },
});
