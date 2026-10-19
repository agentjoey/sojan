import type { Omen } from "@sojan/core";
import * as data from "@/lib/data/jiao-history";
import { unwrap } from "@/lib/errors";

/**
 * 掷筊问事历史客户端门面：本体在服务端（`lib/data/jiao-history.ts`，Neon + 会话 uid 隔离），
 * 这里把写操作的 `ActionResult` 解包回迁移前的签名（未登录 → `UnauthenticatedError`，
 * 档案不属于当前用户 → `Error("profile_not_found")`）。
 *
 * 存 omen（筊象）+ summary（第三人称主题摘要，供列表展示）+ fullText（灵的回复全文，
 * 供点击续追问用）。**不存问题原文**（迁移 0019 的注释）。
 * 无指令：客户端组件直接 import；服务端只取 `JiaoHistoryEntry` 类型。
 */
export type JiaoHistoryEntry = {
  id: string;
  omen: Omen;
  summary: string;
  fullText: string | null;
  createdAt: string;
};

export { listJiaoHistory } from "@/lib/data/jiao-history";

/** 追加一条历史；每个档案只保留最近 10 条（服务端同事务裁剪，不做归档）。 */
export async function appendJiaoHistory(profileId: string, omen: Omen, summary: string, fullText: string): Promise<void> {
  unwrap(await data.appendJiaoHistory(profileId, omen, summary, fullText));
}
