"use server";

import type { BirthInput, QuestionnaireAnswers, UnifiedChart } from "@sojan/core";
import { getUid } from "@/lib/account/uid";
import { sql } from "@/lib/db";
import { ActionError, withUid } from "@/lib/data/_shared";
import { getEntitlement, isMember } from "@/lib/entitlements";
import type { ActionResult } from "@/lib/errors";
import type { Profile } from "@/lib/profiles";

/**
 * 档案读写（Neon）。所有查询都带 `user_id = <会话 uid>`：拿别人的 id 读返回空、
 * 写影响 0 行（仍回 `{ ok:true }`，不泄露该 id 是否存在）。
 * 读：无会话返回空值；写：经 `withUid`，无会话返回 `{ ok:false, code:"unauthenticated" }`。
 * 命盘建档时一次写入并冻结（库里 `profiles_freeze_trg` 拒绝改 chart/birth_input/user_id）。
 */

type Row = {
  id: string;
  nickname: string;
  birth_input: BirthInput;
  chart: UnifiedChart;
  created_at: string | Date;
  reading: string | null;
};

const toProfile = (r: Row): Profile => ({
  id: r.id,
  nickname: r.nickname,
  birthInput: r.birth_input,
  chart: r.chart,
  createdAt: new Date(r.created_at).toISOString(),
  reading: r.reading ?? null,
});

export async function listProfiles(): Promise<Profile[]> {
  const uid = await getUid();
  if (!uid) return [];
  const rows = await sql()`
    select id, nickname, birth_input, chart, created_at, reading from profiles
    where user_id = ${uid} order by created_at desc`;
  return (rows as Row[]).map(toProfile);
}

export async function getProfile(id: string): Promise<Profile | null> {
  const uid = await getUid();
  if (!uid) return null;
  const rows = await sql()`
    select id, nickname, birth_input, chart, created_at, reading from profiles
    where id = ${id} and user_id = ${uid}`;
  return rows[0] ? toProfile(rows[0] as Row) : null;
}

/** 关系记忆（EP-spirit-05）。spirit_memory 为 jsonb，存的是一段摘要字符串。 */
export async function getSpiritMemory(profileId: string): Promise<string | null> {
  const uid = await getUid();
  if (!uid) return null;
  const rows = await sql()`select spirit_memory from profiles where id = ${profileId} and user_id = ${uid}`;
  return (rows[0]?.spirit_memory as string | null | undefined) ?? null;
}

/** 心理问卷（EP-profile-q）。questionnaire 为 jsonb，存答案对象 {questionId: optionValue}。 */
export async function getQuestionnaire(profileId: string): Promise<QuestionnaireAnswers | null> {
  const uid = await getUid();
  if (!uid) return null;
  const rows = await sql()`select questionnaire from profiles where id = ${profileId} and user_id = ${uid}`;
  return (rows[0]?.questionnaire as QuestionnaireAnswers | null | undefined) ?? null;
}

/**
 * 建档。`BILLING_ENABLED=1` 时由服务端校验免费上限（`FREE_PROFILE_LIMIT`，缺省 3）：
 * 先数档案，到了上限才查会员——绝大多数建档不多一次权益查询。
 */
export async function createProfile(input: {
  nickname?: string;
  birthInput: BirthInput;
  chart: UnifiedChart;
}): Promise<ActionResult<Profile>> {
  return withUid(async (uid) => {
    if (process.env.BILLING_ENABLED === "1") {
      // `||` 而非 `??`：.env.example 里是空值占位，照抄成 `FREE_PROFILE_LIMIT=` 时
      // 空串不能变成上限 0（那会把所有免费用户挡在建档之外）。
      const limit = Number(process.env.FREE_PROFILE_LIMIT || 3);
      const [{ n }] = (await sql()`select count(*)::int as n from profiles where user_id = ${uid}`) as { n: number }[];
      if (n >= limit && !isMember(await getEntitlement(uid))) throw new ActionError("profile_limit");
    }
    const rows = await sql()`
      insert into profiles (user_id, nickname, birth_input, chart)
      values (${uid}, ${input.nickname?.trim() || "无名"}, ${JSON.stringify(input.birthInput)}::jsonb, ${JSON.stringify(input.chart)}::jsonb)
      returning id, nickname, birth_input, chart, created_at, reading`;
    return toProfile(rows[0] as Row);
  });
}

/** 保存生成好的解读（命盘冻结，仅写 reading*）。 */
export async function saveReading(profileId: string, markdown: string, model?: string): Promise<ActionResult<void>> {
  return withUid(async (uid) => {
    await sql()`
      update profiles set reading = ${markdown}, reading_model = ${model ?? null}, reading_at = now()
      where id = ${profileId} and user_id = ${uid}`;
  });
}

/** 删档（dream_history / jiao_history 由外键级联删除）。 */
export async function deleteProfile(id: string): Promise<ActionResult<void>> {
  return withUid(async (uid) => {
    await sql()`delete from profiles where id = ${id} and user_id = ${uid}`;
  });
}

export async function saveSpiritMemory(profileId: string, memory: string): Promise<ActionResult<void>> {
  return withUid(async (uid) => {
    await sql()`
      update profiles set spirit_memory = ${JSON.stringify(memory)}::jsonb
      where id = ${profileId} and user_id = ${uid}`;
  });
}

export async function saveQuestionnaire(profileId: string, answers: QuestionnaireAnswers): Promise<ActionResult<void>> {
  return withUid(async (uid) => {
    await sql()`
      update profiles set questionnaire = ${JSON.stringify(answers)}::jsonb
      where id = ${profileId} and user_id = ${uid}`;
  });
}

/**
 * 改昵称：去首尾空白后 1–24 字符（页面先校验；这里是服务端兜底）。
 * 校验在 `withUid` 内：无会话优先返回 unauthenticated；越界/非字符串返回 invalid_nickname。
 */
export async function renameProfile(id: string, nickname: string): Promise<ActionResult<void>> {
  return withUid(async (uid) => {
    const trimmed = typeof nickname === "string" ? nickname.trim() : "";
    if (trimmed.length < 1 || trimmed.length > 24) throw new ActionError("invalid_nickname");
    await sql()`update profiles set nickname = ${trimmed} where id = ${id} and user_id = ${uid}`;
  });
}
