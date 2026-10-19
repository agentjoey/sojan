import "server-only";
import { getUid } from "@/lib/account/uid";
import type { ActionErrorCode, ActionResult } from "@/lib/errors";

/** 业务层可预期的失败：由 `withUid` 转成 `{ ok:false, code }`，而不是 500。 */
export class ActionError extends Error {
  constructor(public code: ActionErrorCode) {
    super(code);
    this.name = "ActionError";
  }
}

/**
 * data 层 Server Action 的统一包装：取会话 uid → 执行 fn → 把可预期错误转成 ActionResult。
 * 无会话时不调用 fn；非 ActionError 的异常照常抛出。
 * （放在非 action 模块里：`"use server"` 文件只能导出 async 函数。）
 */
export async function withUid<T>(fn: (uid: string) => Promise<T>): Promise<ActionResult<T>> {
  const uid = await getUid();
  if (!uid) return { ok: false, code: "unauthenticated" };
  try {
    return { ok: true, value: await fn(uid) };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, code: e.code };
    throw e;
  }
}
