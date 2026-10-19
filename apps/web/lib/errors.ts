/**
 * 认证 / 数据层的共享错误与 Server Action 返回约定。
 * 无 `server-only` / `"use client"` 指令——客户端、服务端都可 import。
 */

export class UnauthenticatedError extends Error {
  constructor(message = "unauthenticated") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export type ActionErrorCode =
  | "unauthenticated"
  | "profile_limit"
  | "profile_not_found"
  | "invalid_nickname";

export type ActionResult<T> = { ok: true; value: T } | { ok: false; code: ActionErrorCode };

/**
 * 客户端解包 ActionResult。`profile_limit` 等业务码抛成 `new Error(code)`，
 * 与现有页面的 `err.message === "profile_limit"` 判断保持兼容。
 */
export function unwrap<T>(r: ActionResult<T>): T {
  if (r.ok) return r.value;
  if (r.code === "unauthenticated") throw new UnauthenticatedError();
  throw new Error(r.code);
}
