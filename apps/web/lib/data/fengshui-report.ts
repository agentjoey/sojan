"use server";

import { getUid } from "@/lib/account/uid";
import { sql } from "@/lib/db";
import { withUid } from "@/lib/data/_shared";
import type { ActionResult } from "@/lib/errors";
import type { FengshuiSections } from "@/lib/fengshui-report";

/**
 * 风水报告缓存读写（EP-fs-16，Neon）。按 `(uid, input_fingerprint)` 唯一：
 * 读只看自己的行；写是 upsert，同指纹重生成覆盖 `sections`。
 */

export async function readFengshuiReport(fingerprint: string): Promise<FengshuiSections | null> {
  const uid = await getUid();
  if (!uid) return null;
  const rows = await sql()`
    select sections from fengshui_reports
    where uid = ${uid} and input_fingerprint = ${fingerprint}`;
  return (rows[0]?.sections as FengshuiSections | undefined) ?? null;
}

export async function saveFengshuiReport(args: {
  fingerprint: string;
  profileId: string;
  dwellingId: string | null;
  layer: number;
  locale: string;
  sections: FengshuiSections;
}): Promise<ActionResult<void>> {
  return withUid(async (uid) => {
    // dwelling_id 只认自己名下的居所：别人的（或不存在的）id 落成 null，而不是引用到他人的行。
    await sql()`
      insert into fengshui_reports (uid, input_fingerprint, profile_id, dwelling_id, layer, locale, sections)
      values (
        ${uid}, ${args.fingerprint}, ${args.profileId},
        (select id from dwellings where id = ${args.dwellingId} and uid = ${uid}),
        ${args.layer}, ${args.locale}, ${JSON.stringify(args.sections)}::jsonb
      )
      on conflict (uid, input_fingerprint) do update set
        profile_id = excluded.profile_id, dwelling_id = excluded.dwelling_id,
        layer = excluded.layer, locale = excluded.locale, sections = excluded.sections`;
  });
}
