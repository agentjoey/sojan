"use server";

import { getUid } from "@/lib/account/uid";
import { sql } from "@/lib/db";
import { ActionError, withUid } from "@/lib/data/_shared";
import type { DreamHistoryEntry } from "@/lib/dream-history";
import type { ActionResult } from "@/lib/errors";

/**
 * 解梦历史（EP-dream-history，Neon）。存 summary（第三人称主题摘要）+ fullText（灵的
 * 解读全文，供续追问）。**不存梦原文**——红线，fullText 是模型生成物不是用户陈述。
 * 每个档案只留最近 10 条：append 在同一事务内「插入 + 裁剪」，两步都带 profile_id + user_id。
 */

const MAX_DREAM_HISTORY = 10;

type Row = { id: string; summary: string; full_text: string | null; created_at: string | Date };
const toEntry = (r: Row): DreamHistoryEntry => ({
  id: r.id,
  summary: r.summary,
  fullText: r.full_text,
  createdAt: new Date(r.created_at).toISOString(),
});

/** 别人的 profileId / 无会话 → `[]`（不泄露该档案是否存在）。 */
export async function listDreamHistory(profileId: string): Promise<DreamHistoryEntry[]> {
  const uid = await getUid();
  if (!uid) return [];
  const rows = await sql()`
    select id, summary, full_text, created_at from dream_history
    where profile_id = ${profileId} and user_id = ${uid}
    order by created_at desc, id desc limit ${MAX_DREAM_HISTORY}`;
  return (rows as Row[]).map(toEntry);
}

export async function appendDreamHistory(
  profileId: string,
  summary: string,
  fullText: string,
): Promise<ActionResult<void>> {
  return withUid(async (uid) => {
    const owned = await sql()`select 1 from profiles where id = ${profileId} and user_id = ${uid}`;
    if (owned.length === 0) throw new ActionError("profile_not_found");
    await sql().transaction((tx) => [
      tx`insert into dream_history (user_id, profile_id, summary, full_text)
         values (${uid}, ${profileId}, ${summary}, ${fullText})`,
      tx`delete from dream_history
         where profile_id = ${profileId} and user_id = ${uid}
           and id not in (
             select id from dream_history
             where profile_id = ${profileId} and user_id = ${uid}
             order by created_at desc, id desc limit ${MAX_DREAM_HISTORY})`,
    ]);
  });
}
