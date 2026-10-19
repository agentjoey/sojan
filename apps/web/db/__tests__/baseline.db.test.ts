// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "@/lib/db";
import { cleanupUsers, hasTestDb, newUid, useTestDb } from "@/test/db";

describe.skipIf(!hasTestDb)("Neon baseline schema", () => {
  useTestDb();
  const uids: string[] = [];
  const fresh = () => {
    const uid = newUid();
    uids.push(uid);
    return uid;
  };
  afterAll(() => cleanupUsers(uids));

  async function insertProfile(uid: string): Promise<string> {
    const rows = await sql()`
      insert into profiles (user_id, birth_input, chart)
      values (${uid}, '{"a":1}'::jsonb, '{"b":2}'::jsonb)
      returning id`;
    return rows[0].id as string;
  }

  it("profiles_freeze 拒绝改 chart", async () => {
    const id = await insertProfile(fresh());
    await expect(
      sql()`update profiles set chart = '{}'::jsonb where id = ${id}`,
    ).rejects.toThrow(/命盘已冻结/);
  });

  it("consume_llm_credit_account 第 p_free+1 次返回 false", async () => {
    const uid = fresh();
    const call = async () => {
      const rows = await sql()`select consume_llm_credit_account(${uid}::uuid, 2) as ok`;
      return rows[0].ok as boolean;
    };
    expect([await call(), await call(), await call()]).toEqual([true, true, false]);
  });

  it("删 profile 级联删 dream_history 与 jiao_history", async () => {
    const uid = fresh();
    const id = await insertProfile(uid);
    await sql()`insert into dream_history (user_id, profile_id, summary) values (${uid}, ${id}, 's')`;
    await sql()`insert into jiao_history (user_id, profile_id, omen, summary) values (${uid}, ${id}, '圣筊', 's')`;
    await sql()`delete from profiles where id = ${id}`;
    const dream = await sql()`select 1 from dream_history where profile_id = ${id}`;
    const jiao = await sql()`select 1 from jiao_history where profile_id = ${id}`;
    expect(dream).toHaveLength(0);
    expect(jiao).toHaveLength(0);
  });
});
