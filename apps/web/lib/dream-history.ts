import * as data from "@/lib/data/dream-history";
import { unwrap } from "@/lib/errors";

/**
 * 解梦历史客户端门面：本体在服务端（`lib/data/dream-history.ts`，Neon + 会话 uid 隔离），
 * 这里把写操作的 `ActionResult` 解包回迁移前的签名（未登录 → `UnauthenticatedError`，
 * 档案不属于当前用户 → `Error("profile_not_found")`）。
 *
 * 存 summary（第三人称主题摘要，供列表展示）+ fullText（灵的解读全文，供点击续追问用）。
 * 不存梦原文（迁移 0018 的注释）：`fullText` 是灵自己生成、已过 sanitizeDream 等全套后置链
 * 的输出，不是用户的原始陈述，不违反「梦原文不落库」的红线。迁移前写入的旧行没有 fullText
 * （可能为 null）——那些条目只能当摘要展示，续接功能对它们降级不可用。
 * 无指令：客户端组件直接 import；服务端只取 `DreamHistoryEntry` 类型。
 */
export type DreamHistoryEntry = {
  id: string;
  summary: string;
  fullText: string | null;
  createdAt: string;
};

export { listDreamHistory } from "@/lib/data/dream-history";

/** 追加一条历史；每个档案只保留最近 10 条（服务端同事务裁剪，不做归档）。 */
export async function appendDreamHistory(profileId: string, summary: string, fullText: string): Promise<void> {
  unwrap(await data.appendDreamHistory(profileId, summary, fullText));
}
