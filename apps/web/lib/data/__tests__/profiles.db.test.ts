// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BirthInput, UnifiedChart } from "@sojan/core";
import { sql } from "@/lib/db";
import { cleanupUsers, hasTestDb, newUid, useTestDb } from "@/test/db";

/** 可切换的「当前会话」：null = 无会话。 */
const { session } = vi.hoisted(() => ({ session: { uid: null as string | null } }));
vi.mock("@/lib/account/uid", () => ({
  getUid: async () => session.uid,
  getViewer: async () => (session.uid ? { uid: session.uid, email: "t@example.com", emailVerified: true } : null),
}));

/**
 * 权益查询仍走 Supabase（Task 7 才改 Neon）；db 测试不能连外部 Supabase，
 * 这里只替换 `getEntitlement`，`isMember` 用真实实现。
 */
const { entitlement } = vi.hoisted(() => ({
  entitlement: { tier: "free", memberUntil: null as string | null },
}));
vi.mock("@/lib/entitlements", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/entitlements")>()),
  getEntitlement: async () => ({ ...entitlement }),
}));

const {
  listProfiles,
  getProfile,
  createProfile,
  saveReading,
  deleteProfile,
  renameProfile,
  getSpiritMemory,
  saveSpiritMemory,
  getQuestionnaire,
  saveQuestionnaire,
} = await import("../profiles");

const birthInput = { date: "1991-03-15", time: "14:30", gender: "male" } as unknown as BirthInput;
const chart = { bazi: { dayMaster: "甲" } } as unknown as UnifiedChart;

// 每条用例十几次 Neon HTTP 往返，默认 5s 不够。
describe.skipIf(!hasTestDb)("lib/data/profiles（Neon）", { timeout: 30_000 }, () => {
  useTestDb();
  const uids: string[] = [];
  const fresh = () => {
    const uid = newUid();
    uids.push(uid);
    return uid;
  };
  afterAll(() => cleanupUsers(uids));

  beforeEach(() => {
    session.uid = null;
    entitlement.tier = "free";
    entitlement.memberUntil = null;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function createAs(uid: string, nickname = "阿甲") {
    session.uid = uid;
    const r = await createProfile({ nickname, birthInput, chart });
    if (!r.ok) throw new Error(`createProfile failed: ${r.code}`);
    return r.value;
  }

  it("u1 建档后 listProfiles 返回 1 条，user_id 是 u1", async () => {
    const u1 = fresh();
    const p = await createAs(u1);
    expect(p).toMatchObject({ nickname: "阿甲", birthInput, chart, reading: null });

    const list = await listProfiles();
    expect(list.map((x) => x.id)).toEqual([p.id]);
    const rows = await sql()`select user_id from profiles where id = ${p.id}`;
    expect(rows[0]!.user_id).toBe(u1);
  });

  it("u2 拿 u1 的 id：读返回 null，写影响 0 行（Review Focus 2）", async () => {
    const u1 = fresh();
    const u2 = fresh();
    const p = await createAs(u1);
    await createAs(u2, "乙");

    session.uid = u2;
    expect(await getProfile(p.id)).toBeNull();
    expect(await getSpiritMemory(p.id)).toBeNull();
    expect(await getQuestionnaire(p.id)).toBeNull();
    expect(await saveReading(p.id, "# 别人的解读", "m")).toEqual({ ok: true, value: undefined });
    expect(await saveSpiritMemory(p.id, "别人的记忆")).toEqual({ ok: true, value: undefined });
    expect(await saveQuestionnaire(p.id, { q1: "a" })).toEqual({ ok: true, value: undefined });
    expect(await renameProfile(p.id, "改掉")).toEqual({ ok: true, value: undefined });
    expect(await deleteProfile(p.id)).toEqual({ ok: true, value: undefined });
    expect((await listProfiles()).map((x) => x.nickname)).toEqual(["乙"]);

    session.uid = u1;
    const mine = await getProfile(p.id);
    expect(mine).not.toBeNull();
    expect(mine!.reading).toBeNull();
    expect(mine!.nickname).toBe("阿甲");
    expect(await getSpiritMemory(p.id)).toBeNull();
    expect(await getQuestionnaire(p.id)).toBeNull();
  });

  it("本人写：解读 / 关系记忆 / 问卷 / 改名 / 删除", async () => {
    const u1 = fresh();
    const p = await createAs(u1);

    expect((await saveReading(p.id, "# 解读", "MiniMax-M3")).ok).toBe(true);
    expect((await saveSpiritMemory(p.id, "记得他怕水")).ok).toBe(true);
    expect((await saveQuestionnaire(p.id, { q1: "a", q2: "b" })).ok).toBe(true);
    expect((await renameProfile(p.id, "  新名  ")).ok).toBe(true);

    const got = await getProfile(p.id);
    expect(got).toMatchObject({ reading: "# 解读", nickname: "新名" });
    expect(await getSpiritMemory(p.id)).toBe("记得他怕水");
    expect(await getQuestionnaire(p.id)).toEqual({ q1: "a", q2: "b" });
    const rows = await sql()`select reading_model, reading_at from profiles where id = ${p.id}`;
    expect(rows[0]!.reading_model).toBe("MiniMax-M3");
    expect(rows[0]!.reading_at).not.toBeNull();

    expect((await deleteProfile(p.id)).ok).toBe(true);
    expect(await getProfile(p.id)).toBeNull();
  });

  it("listProfiles 按建档时间倒序", async () => {
    const u1 = fresh();
    const a = await createAs(u1, "先");
    const b = await createAs(u1, "后");
    expect((await listProfiles()).map((x) => x.id)).toEqual([b.id, a.id]);
  });

  it("无会话：listProfiles 返回 []；createProfile 返回 unauthenticated 且不落库", async () => {
    const u1 = fresh();
    await createAs(u1);

    session.uid = null;
    expect(await listProfiles()).toEqual([]);
    const before = await sql()`select count(*)::int as n from profiles where nickname = '游客'`;
    expect(await createProfile({ nickname: "游客", birthInput, chart })).toEqual({ ok: false, code: "unauthenticated" });
    const after = await sql()`select count(*)::int as n from profiles where nickname = '游客'`;
    expect(after[0]!.n).toBe(before[0]!.n);
    expect(await saveReading("00000000-0000-0000-0000-000000000000", "x")).toEqual({ ok: false, code: "unauthenticated" });
  });

  it("BILLING_ENABLED=1、FREE_PROFILE_LIMIT=1：第二次 createProfile 返回 profile_limit", async () => {
    vi.stubEnv("BILLING_ENABLED", "1");
    vi.stubEnv("FREE_PROFILE_LIMIT", "1");
    const u1 = fresh();
    await createAs(u1);
    expect(await createProfile({ nickname: "二", birthInput, chart })).toEqual({ ok: false, code: "profile_limit" });
    expect(await listProfiles()).toHaveLength(1);
  });

  it("BILLING_ENABLED=1 但是会员：不受上限约束", async () => {
    vi.stubEnv("BILLING_ENABLED", "1");
    vi.stubEnv("FREE_PROFILE_LIMIT", "1");
    entitlement.tier = "member";
    entitlement.memberUntil = new Date(Date.now() + 86_400_000).toISOString();
    const u1 = fresh();
    await createAs(u1);
    expect((await createProfile({ nickname: "二", birthInput, chart })).ok).toBe(true);
  });

  it("BILLING_ENABLED 未开：不限档案数", async () => {
    vi.stubEnv("BILLING_ENABLED", "");
    vi.stubEnv("FREE_PROFILE_LIMIT", "1");
    const u1 = fresh();
    await createAs(u1);
    expect((await createProfile({ nickname: "二", birthInput, chart })).ok).toBe(true);
  });
});
