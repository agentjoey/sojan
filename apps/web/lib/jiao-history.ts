"use client";

import type { Omen } from "@sojan/core";
import { supabase, ensureSession } from "./supabase";

/**
 * 掷筊问事历史（EP-jiao）——存 omen（筊象）+ summary（第三人称主题摘要，供列表展示）
 * + fullText（灵的回复全文，供点击续追问用）。**不存问题原文**（迁移 0019 的注释）。
 */
export type JiaoHistoryEntry = {
  id: string;
  omen: Omen;
  summary: string;
  fullText: string | null;
  createdAt: string;
};

type Row = { id: string; omen: Omen; summary: string; full_text: string | null; created_at: string };
const toEntry = (r: Row): JiaoHistoryEntry => ({
  id: r.id,
  omen: r.omen,
  summary: r.summary,
  fullText: r.full_text,
  createdAt: r.created_at,
});

const MAX_JIAO_HISTORY = 10;

export async function listJiaoHistory(profileId: string): Promise<JiaoHistoryEntry[]> {
  await ensureSession();
  const { data, error } = await supabase()
    .from("jiao_history")
    .select("id, omen, summary, full_text, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(MAX_JIAO_HISTORY);
  if (error) throw error;
  return (data as Row[] | null)?.map(toEntry) ?? [];
}

/** 追加一条历史，并把超出最近 10 条的旧行直接删除（不做归档）。 */
export async function appendJiaoHistory(profileId: string, omen: Omen, summary: string, fullText: string): Promise<void> {
  await ensureSession();
  const { error } = await supabase().from("jiao_history").insert({ profile_id: profileId, omen, summary, full_text: fullText });
  if (error) throw error;

  const { data: rows, error: listErr } = await supabase()
    .from("jiao_history")
    .select("id")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (listErr) throw listErr;
  const stale = ((rows as { id: string }[] | null) ?? []).slice(MAX_JIAO_HISTORY).map((r) => r.id);
  if (stale.length > 0) {
    const { error: delErr } = await supabase().from("jiao_history").delete().in("id", stale);
    if (delErr) throw delErr;
  }
}
