/**
 * 登录成功后的回跳地址白名单：只接受同源相对路径，其余一律回到 `/account`。防 open redirect。
 *
 * 两层校验：
 * 1. 快速拒绝：必须以 `/` 开头、不以 `//` 开头、不含反斜杠（浏览器会把 `/\evil.com` 规整成 `//evil.com`）。
 * 2. 按 WHATWG URL 解析后核对 origin：解析器会剥掉制表符/换行/回车，`/\t/evil.com` 实际解析成
 *    `https://evil.com/`，光看字符串前缀拦不住。解析后 origin 必须仍是同源占位（覆盖未来解析器的其它怪癖）。
 * 无 `server-only` / `"use client"`——客户端页面与服务端都可 import。
 */
export const DEFAULT_NEXT = "/account";

const PROBE_ORIGIN = "http://safe-next.invalid";

export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return DEFAULT_NEXT;
  try {
    if (new URL(raw, PROBE_ORIGIN).origin !== PROBE_ORIGIN) return DEFAULT_NEXT;
  } catch {
    return DEFAULT_NEXT;
  }
  return raw;
}
