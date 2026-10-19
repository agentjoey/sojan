/**
 * 登录成功后的回跳地址白名单：只接受同源相对路径（以 `/` 开头、不以 `//` 开头），
 * 其余一律回到 `/account`。防 open redirect。
 * 反斜杠也拒绝：浏览器会把 `/\evil.com` 规整成 `//evil.com`。
 * 无 `server-only` / `"use client"`——客户端页面与服务端都可 import。
 */
export const DEFAULT_NEXT = "/account";

export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return DEFAULT_NEXT;
  return raw;
}
