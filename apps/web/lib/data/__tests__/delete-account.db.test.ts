// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "@/lib/db";
import { cleanupUsers, hasTestDb, newUid, useTestDb } from "@/test/db";
import { purgeUserData } from "@/lib/data/delete-account";

/** 业务表 → 归属列（dwellings / fengshui_reports 叫 uid，其余叫 user_id）。 */
const OWNED: ReadonlyArray<readonly [string, string]> = [
  ["jiao_history", "user_id"],
  ["dream_history", "user_id"],
  ["fengshui_reports", "uid"],
  ["dwellings", "uid"],
  ["profiles", "user_id"],
  ["llm_usage", "user_id"],
  ["entitlements", "user_id"],
  ["user_consents", "user_id"],
];

// 每条用例多次 Neon HTTP 往返，默认 5s 不够。
describe.skipIf(!hasTestDb)("purgeUserData（Neon）", { timeout: 60_000 }, () => {
  useTestDb();
  const uids: string[] = [];
  const fresh = () => {
    const uid = newUid();
    uids.push(uid);
    return uid;
  };

  afterAll(async () => {
    await cleanupUsers(uids);
    // 只清本测试插入的 neon_auth."user" 行（正常路径下 u1 已被 purge 删掉，u2 在这里清）
    await sql()`delete from neon_auth."user" where id = any(${uids}::uuid[])`;
  });

  async function seedUser(uid: string): Promise<void> {
    const db = sql();
    await db`insert into neon_auth."user" (id, email, "emailVerified", name)
             values (${uid}, ${`${uid}@purge-test.local`}, true, 'purge test')`;
    const profileId = newUid();
    const dwellingId = newUid();
    await db`insert into profiles (id, user_id, birth_input, chart) values (${profileId}, ${uid}, '{}'::jsonb, '{}'::jsonb)`;
    await db`insert into dwellings (id, uid, name) values (${dwellingId}, ${uid}, 'home')`;
    await db`insert into fengshui_reports (uid, dwelling_id, profile_id, layer, locale, input_fingerprint, sections)
             values (${uid}, ${dwellingId}, ${profileId}, 1, 'zh', ${`fp-${uid}`}, '{}'::jsonb)`;
    await db`insert into dream_history (user_id, profile_id, summary) values (${uid}, ${profileId}, 's')`;
    await db`insert into jiao_history (user_id, profile_id, omen, summary) values (${uid}, ${profileId}, '圣筊', 's')`;
    await db`insert into entitlements (user_id, tier) values (${uid}, 'free')`;
    await db`insert into llm_usage (user_id, period, uses) values (${uid}, '2026-10', 1)`;
    await db`insert into user_consents (user_id, document, version) values (${uid}, 'terms', 'v-test')`;
  }

  async function counts(uid: string): Promise<{ tables: Record<string, number>; authUser: number }> {
    const db = sql();
    const tables: Record<string, number> = {};
    for (const [table, col] of OWNED) {
      const rows = await db.query(`select count(*)::int as n from ${table} where ${col} = $1`, [uid]);
      tables[table] = rows[0].n as number;
    }
    const au = await db`select count(*)::int as n from neon_auth."user" where id = ${uid}`;
    return { tables, authUser: au[0].n as number };
  }

  it("删光该用户 8 张业务表与 neon_auth.user，不动其他用户", async () => {
    const u1 = fresh();
    const u2 = fresh();
    await seedUser(u1);
    await seedUser(u2);

    const before1 = await counts(u1);
    const before2 = await counts(u2);
    for (const [table] of OWNED) expect(before1.tables[table], table).toBe(1);
    expect(before1.authUser).toBe(1);

    await purgeUserData(u1);

    const after1 = await counts(u1);
    for (const [table] of OWNED) expect(after1.tables[table], `${table}（u1）`).toBe(0);
    expect(after1.authUser).toBe(0);
    expect(await counts(u2)).toEqual(before2);
  });

  it("账号级联：删 neon_auth.user 后其 session / account 行随之消失", async () => {
    const u = fresh();
    await seedUser(u);
    const db = sql();
    const sid = newUid();
    const aid = newUid();
    await db`insert into neon_auth.session (id, "userId", token, "expiresAt", "createdAt", "updatedAt")
             values (${sid}, ${u}, ${`tok-${sid}`}, now() + interval '1 hour', now(), now())`;
    await db`insert into neon_auth.account (id, "userId", "accountId", "providerId", "createdAt", "updatedAt")
             values (${aid}, ${u}, ${u}, 'credential', now(), now())`;

    await purgeUserData(u);

    const s = await db`select count(*)::int as n from neon_auth.session where "userId" = ${u}`;
    const a = await db`select count(*)::int as n from neon_auth.account where "userId" = ${u}`;
    expect(s[0].n).toBe(0);
    expect(a[0].n).toBe(0);
  });

  it("没有任何数据的 uid 也不报错（幂等）", async () => {
    await expect(purgeUserData(newUid())).resolves.toBeUndefined();
  });
});
