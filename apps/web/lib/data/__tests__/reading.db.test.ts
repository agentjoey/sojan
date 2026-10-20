// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "@/lib/db";
import { cleanupUsers, hasTestDb, newUid, useTestDb } from "@/test/db";
import { loadReadingTarget, storeReading } from "../reading";

/**
 * `/api/reading` 的服务端内部读写（非 action，uid 由路由从会话取来再传入）。
 * 守住：按 (uid, profileId) 隔离；已有解读不被覆盖；非法 id 不抛错。
 */
describe.skipIf(!hasTestDb)("lib/data/reading（Neon）", { timeout: 30_000 }, () => {
  useTestDb();
  const uids: string[] = [];
  const fresh = () => {
    const uid = newUid();
    uids.push(uid);
    return uid;
  };
  afterAll(() => cleanupUsers(uids));

  async function insertProfile(uid: string, nickname = "阿甲"): Promise<string> {
    const rows = await sql()`
      insert into profiles (user_id, nickname, birth_input, chart)
      values (${uid}, ${nickname}, ${JSON.stringify({ date: "1991-03-15" })}::jsonb, ${JSON.stringify({ bazi: { dayMaster: "甲" } })}::jsonb)
      returning id`;
    return rows[0]!.id as string;
  }

  it("本人：读到档案（含冻结命盘），写入 reading/reading_model/reading_at", async () => {
    const u1 = fresh();
    const id = await insertProfile(u1);
    expect(await loadReadingTarget(u1, id)).toEqual({ id, nickname: "阿甲", chart: { bazi: { dayMaster: "甲" } }, reading: null });

    expect(await storeReading(u1, id, "## 解读", "MiniMax-M3")).toBe(true);
    const rows = await sql()`select reading, reading_model, reading_at from profiles where id = ${id}`;
    expect(rows[0]).toMatchObject({ reading: "## 解读", reading_model: "MiniMax-M3" });
    expect(rows[0]!.reading_at).not.toBeNull();
    expect((await loadReadingTarget(u1, id))!.reading).toBe("## 解读");
  });

  it("别人的 profileId：读返回 null，写影响 0 行", async () => {
    const u1 = fresh();
    const u2 = fresh();
    const id = await insertProfile(u1);
    expect(await loadReadingTarget(u2, id)).toBeNull();
    expect(await storeReading(u2, id, "## 别人的解读", "m")).toBe(false);
    const rows = await sql()`select reading from profiles where id = ${id}`;
    expect(rows[0]!.reading).toBeNull();
  });

  it("已有解读不被覆盖（并发两次生成时先完成者为准）", async () => {
    const u1 = fresh();
    const id = await insertProfile(u1);
    expect(await storeReading(u1, id, "## 第一份", "m")).toBe(true);
    expect(await storeReading(u1, id, "## 第二份", "m")).toBe(false);
    expect((await loadReadingTarget(u1, id))!.reading).toBe("## 第一份");
  });

  it("非 uuid 的 profileId → null，不抛 SQL 类型错误", async () => {
    const u1 = fresh();
    expect(await loadReadingTarget(u1, "not-a-uuid")).toBeNull();
  });
});
