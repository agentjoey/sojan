import "server-only";
import type { UnifiedChart } from "@sojan/core";
import { sql } from "@/lib/db";

/**
 * `/api/reading` 专用的服务端内部读写（review #1）。不是 Server Action：
 * uid 由路由从会话（`getViewer()`）取得后传入，浏览器无法直接调用这里、也就无法伪造 uid。
 * 每条 SQL 都按 `user_id = uid` 过滤。
 */

export type ReadingTarget = { id: string; nickname: string; chart: UnifiedChart; reading: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 读本人档案（含冻结命盘）。不存在、不属于该 uid、或 id 不是 uuid → null。 */
export async function loadReadingTarget(uid: string, profileId: string): Promise<ReadingTarget | null> {
  if (!UUID.test(profileId)) return null; // 免得 Postgres 抛 uuid 类型错误变成 500
  const rows = await sql()`
    select id, nickname, chart, reading from profiles
    where id = ${profileId} and user_id = ${uid}`;
  const r = rows[0] as { id: string; nickname: string; chart: UnifiedChart; reading: string | null } | undefined;
  return r ? { id: r.id, nickname: r.nickname, chart: r.chart, reading: r.reading ?? null } : null;
}

/**
 * 写入解读（命盘冻结，只写 reading*）。仅在尚无解读时写：并发两次生成时先完成者为准，
 * 不互相覆盖。返回是否写入了一行。
 */
export async function storeReading(uid: string, profileId: string, markdown: string, model: string): Promise<boolean> {
  const rows = await sql()`
    update profiles set reading = ${markdown}, reading_model = ${model}, reading_at = now()
    where id = ${profileId} and user_id = ${uid} and reading is null
    returning id`;
  return rows.length > 0;
}
