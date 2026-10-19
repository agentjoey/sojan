"use server";

import type { Omen } from "@sojan/core";
import { getUid } from "@/lib/account/uid";
import { sql } from "@/lib/db";
import { ActionError, withUid } from "@/lib/data/_shared";
import type { JiaoHistoryEntry } from "@/lib/jiao-history";
import type { ActionResult } from "@/lib/errors";

/**
 * 掷筊问事历史（EP-jiao，Neon）。存 omen（筊象，库里有 check 约束）+ summary + fullText
 * （灵的回复全文）。**不存问题原文**——红线。每个档案只留最近 10 条：append 在同一事务内
 * 「插入 + 裁剪」，两步都带 profile_id + user_id。
 */

const MAX_JIAO_HISTORY = 10;

type Row = { id: string; omen: Omen; summary: string; full_text: string | null; created_at: string | Date };
const toEntry = (r: Row): JiaoHistoryEntry => ({
  id: r.id,
  omen: r.omen,
  summary: r.summary,
  fullText: r.full_text,
  createdAt: new Date(r.created_at).toISOString(),
});

/** 别人的 profileId / 无会话 → `[]`（不泄露该档案是否存在）。 */
export async function listJiaoHistory(profileId: string): Promise<JiaoHistoryEntry[]> {
  const uid = await getUid();
  if (!uid) return [];
  const rows = await sql()`
    select id, omen, summary, full_text, created_at from jiao_history
    where profile_id = ${profileId} and user_id = ${uid}
    order by created_at desc, id desc limit ${MAX_JIAO_HISTORY}`;
  return (rows as Row[]).map(toEntry);
}

export async function appendJiaoHistory(
  profileId: string,
  omen: Omen,
  summary: string,
  fullText: string,
): Promise<ActionResult<void>> {
  return withUid(async (uid) => {
    const owned = await sql()`select 1 from profiles where id = ${profileId} and user_id = ${uid}`;
    if (owned.length === 0) throw new ActionError("profile_not_found");
    await sql().transaction((tx) => [
      tx`insert into jiao_history (user_id, profile_id, omen, summary, full_text)
         values (${uid}, ${profileId}, ${omen}, ${summary}, ${fullText})`,
      tx`delete from jiao_history
         where profile_id = ${profileId} and user_id = ${uid}
           and id not in (
             select id from jiao_history
             where profile_id = ${profileId} and user_id = ${uid}
             order by created_at desc, id desc limit ${MAX_JIAO_HISTORY})`,
    ]);
  });
}
