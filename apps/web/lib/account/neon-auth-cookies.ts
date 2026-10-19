/**
 * Neon Auth 在本站写下的 cookie 名。
 *
 * 出处：`@neondatabase/auth@0.6.0-beta` 的 `dist/server-pZf5ArnA.mjs`（第 293–302 行）：
 *   NEON_AUTH_COOKIE_PREFIX = "__Secure-neon-auth"
 *   session_token / local.session_data / session_challenge / session_challange（旧的拼写错误版，SDK 仍兼容）
 * 这些常量没有从包的公开入口导出，所以在此抄一份；升级 SDK 时对照该文件。
 *
 * - `session_token`：主会话 cookie。
 * - `local.session_data`：SDK 在本站缓存的签名会话数据（`cookies.sessionDataTtl`，默认 300s）。
 *   不清的话，账号删除后 `auth.getSession()` 最长 5 分钟内仍会返回已删除的 uid。
 * - `session_challenge`（及旧拼写）：OAuth 流程的临时 cookie。
 *
 * 属性与 SDK 写入时一致：`Path=/`、`Secure`、`HttpOnly`、`SameSite=Lax`、无 `Domain`
 * （`lib/auth/server.ts` 没配 `cookies.domain`）。`__Secure-` 前缀要求清除时同样带 `Secure`。
 */
export const NEON_AUTH_COOKIE_PREFIX = "__Secure-neon-auth";

export const NEON_AUTH_COOKIE_NAMES: readonly string[] = [
  `${NEON_AUTH_COOKIE_PREFIX}.session_token`,
  `${NEON_AUTH_COOKIE_PREFIX}.local.session_data`,
  `${NEON_AUTH_COOKIE_PREFIX}.session_challenge`,
  `${NEON_AUTH_COOKIE_PREFIX}.session_challange`,
];
