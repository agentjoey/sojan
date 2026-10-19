"use server";

import type { Direction } from "@sojan/core";
import { getUid } from "@/lib/account/uid";
import { sql } from "@/lib/db";
import { withUid } from "@/lib/data/_shared";
import type { Dwelling } from "@/lib/dwellings";
import type { ActionResult } from "@/lib/errors";

/**
 * 居所 CRUD（EP-fs-14，Neon）。归属列是 `uid`（不是 user_id），所有查询都带 `uid = <会话 uid>`：
 * 拿别人的 id 读返回空、写影响 0 行（仍回 `{ ok:true }`，不泄露该 id 是否存在）。
 */

type Row = {
  id: string;
  name: string;
  kind: string;
  tenancy: string;
  facing: string | null;
  member_profile_ids: string[] | null;
};

// DB 的 kind/tenancy/facing 都是无约束的 text 列：脏值收敛成保守默认（home / rent）。
const toDwelling = (r: Row): Dwelling => ({
  id: r.id,
  name: r.name,
  kind: r.kind === "office" ? "office" : "home",
  tenancy: r.tenancy === "own" ? "own" : "rent",
  facing: (r.facing as Direction | null) ?? null,
  memberProfileIds: r.member_profile_ids ?? [],
});

export async function listDwellings(): Promise<Dwelling[]> {
  const uid = await getUid();
  if (!uid) return [];
  const rows = await sql()`
    select id, name, kind, tenancy, facing, member_profile_ids from dwellings
    where uid = ${uid} order by created_at asc`;
  return (rows as Row[]).map(toDwelling);
}

export async function createDwelling(d: Omit<Dwelling, "id">): Promise<ActionResult<Dwelling>> {
  return withUid(async (uid) => {
    const rows = await sql()`
      insert into dwellings (uid, name, kind, tenancy, facing, member_profile_ids)
      values (${uid}, ${d.name}, ${d.kind}, ${d.tenancy}, ${d.facing}, ${d.memberProfileIds}::uuid[])
      returning id, name, kind, tenancy, facing, member_profile_ids`;
    return toDwelling(rows[0] as Row);
  });
}

/** 只改 patch 里出现的字段（`facing: null` 是合法值 = 改成「不确定」），并刷新 `updated_at`。 */
export async function updateDwelling(
  id: string,
  patch: Partial<Omit<Dwelling, "id">>,
): Promise<ActionResult<void>> {
  return withUid(async (uid) => {
    await sql()`
      update dwellings set
        name = case when ${patch.name !== undefined} then ${patch.name ?? null} else name end,
        kind = case when ${patch.kind !== undefined} then ${patch.kind ?? null} else kind end,
        tenancy = case when ${patch.tenancy !== undefined} then ${patch.tenancy ?? null} else tenancy end,
        facing = case when ${patch.facing !== undefined} then ${patch.facing ?? null} else facing end,
        member_profile_ids = case when ${patch.memberProfileIds !== undefined}
          then ${patch.memberProfileIds ?? null}::uuid[] else member_profile_ids end,
        updated_at = now()
      where id = ${id} and uid = ${uid}`;
  });
}

/** 删居所（该居所下的报告由外键级联删除）。 */
export async function deleteDwelling(id: string): Promise<ActionResult<void>> {
  return withUid(async (uid) => {
    await sql()`delete from dwellings where id = ${id} and uid = ${uid}`;
  });
}
