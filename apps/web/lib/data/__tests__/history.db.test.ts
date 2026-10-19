// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "@/lib/db";
import { cleanupUsers, hasTestDb, newUid, useTestDb } from "@/test/db";

/** 可切换的「当前会话」：null = 无会话。 */
const { session } = vi.hoisted(() => ({ session: { uid: null as string | null } }));
vi.mock("@/lib/account/uid", () => ({
  getUid: async () => session.uid,
  getViewer: async () => (session.uid ? { uid: session.uid, email: "t@example.com", emailVerified: true } : null),
}));

const { listDreamHistory, appendDreamHistory } = await import("../dream-history");
const { listJiaoHistory, appendJiaoHistory } = await import("../jiao-history");

// 每条用例十几次 Neon HTTP 往返，默认 5s 不够。
describe.skipIf(!hasTestDb)("lib/data/{dream,jiao}-history（Neon）", { timeout: 60_000 }, () => {
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
  });

  /** 直接插一条档案（本文件只测历史，不走 createProfile 的会员/上限逻辑）。 */
  async function insertProfile(uid: string): Promise<string> {
    const rows = await sql()`
      insert into profiles (user_id, birth_input, chart) values (${uid}, '{}'::jsonb, '{}'::jsonb) returning id`;
    return rows[0]!.id as string;
  }

  const countOf = async (table: "dream_history" | "jiao_history", profileId: string) => {
    const rows =
      table === "dream_history"
        ? await sql()`select count(*)::int as n from dream_history where profile_id = ${profileId}`
        : await sql()`select count(*)::int as n from jiao_history where profile_id = ${profileId}`;
    return rows[0]!.n as number;
  };

  it("解梦：连续 append 12 条后 list 只剩最新 10 条（倒序），库里也只有 10 行", async () => {
    const u1 = fresh();
    session.uid = u1;
    const pid = await insertProfile(u1);
    for (let i = 1; i <= 12; i++) {
      expect(await appendDreamHistory(pid, `梦${i}`, `解读${i}`)).toEqual({ ok: true, value: undefined });
    }
    const list = await listDreamHistory(pid);
    expect(list.map((e) => e.summary)).toEqual(
      ["梦12", "梦11", "梦10", "梦9", "梦8", "梦7", "梦6", "梦5", "梦4", "梦3"],
    );
    expect(list[0]).toMatchObject({ fullText: "解读12" });
    expect(Number.isNaN(Date.parse(list[0]!.createdAt))).toBe(false);
    expect(await countOf("dream_history", pid)).toBe(10);
  });

  it("掷筊：连续 append 12 条后 list 只剩最新 10 条（倒序），omen 原样返回", async () => {
    const u1 = fresh();
    session.uid = u1;
    const pid = await insertProfile(u1);
    for (let i = 1; i <= 12; i++) {
      const omen = (["圣筊", "笑筊", "阴筊"] as const)[i % 3]!;
      expect(await appendJiaoHistory(pid, omen, `事${i}`, `回复${i}`)).toEqual({ ok: true, value: undefined });
    }
    const list = await listJiaoHistory(pid);
    expect(list.map((e) => e.summary)).toEqual(
      ["事12", "事11", "事10", "事9", "事8", "事7", "事6", "事5", "事4", "事3"],
    );
    expect(list[0]).toMatchObject({ omen: "圣筊", fullText: "回复12" }); // 12 % 3 = 0
    expect(await countOf("jiao_history", pid)).toBe(10);
  });

  it("裁剪只动本档案：同一用户另一档案的历史不受影响", async () => {
    const u1 = fresh();
    session.uid = u1;
    const a = await insertProfile(u1);
    const b = await insertProfile(u1);
    await appendDreamHistory(b, "乙的梦", "乙的解读");
    for (let i = 1; i <= 11; i++) await appendDreamHistory(a, `甲${i}`, "x");
    expect((await listDreamHistory(b)).map((e) => e.summary)).toEqual(["乙的梦"]);
    expect(await countOf("dream_history", a)).toBe(10);
  });

  it("u2 对 u1 的 profileId append 返回 profile_not_found，u1 的历史条数不变", async () => {
    const u1 = fresh();
    const u2 = fresh();
    session.uid = u1;
    const pid = await insertProfile(u1);
    await appendDreamHistory(pid, "我的梦", "我的解读");
    await appendJiaoHistory(pid, "圣筊", "我的事", "我的回复");

    session.uid = u2;
    expect(await appendDreamHistory(pid, "别人的梦", "x")).toEqual({ ok: false, code: "profile_not_found" });
    expect(await appendJiaoHistory(pid, "阴筊", "别人的事", "x")).toEqual({ ok: false, code: "profile_not_found" });

    expect(await countOf("dream_history", pid)).toBe(1);
    expect(await countOf("jiao_history", pid)).toBe(1);
  });

  it("u2 list u1 的 profileId 返回 []；u1 自己读得到", async () => {
    const u1 = fresh();
    const u2 = fresh();
    session.uid = u1;
    const pid = await insertProfile(u1);
    await appendDreamHistory(pid, "我的梦", "我的解读");
    await appendJiaoHistory(pid, "圣筊", "我的事", "我的回复");

    session.uid = u2;
    expect(await listDreamHistory(pid)).toEqual([]);
    expect(await listJiaoHistory(pid)).toEqual([]);

    session.uid = u1;
    expect(await listDreamHistory(pid)).toHaveLength(1);
    expect(await listJiaoHistory(pid)).toHaveLength(1);
  });

  it("无会话：list 返回 []；append 返回 unauthenticated 且不落库", async () => {
    const u1 = fresh();
    session.uid = u1;
    const pid = await insertProfile(u1);

    session.uid = null;
    expect(await listDreamHistory(pid)).toEqual([]);
    expect(await listJiaoHistory(pid)).toEqual([]);
    expect(await appendDreamHistory(pid, "梦", "x")).toEqual({ ok: false, code: "unauthenticated" });
    expect(await appendJiaoHistory(pid, "圣筊", "事", "x")).toEqual({ ok: false, code: "unauthenticated" });
    expect(await countOf("dream_history", pid)).toBe(0);
    expect(await countOf("jiao_history", pid)).toBe(0);
  });

  it("jiao_history.omen 传非三词值时被 check 约束拒绝，且不留残行", async () => {
    const u1 = fresh();
    session.uid = u1;
    const pid = await insertProfile(u1);
    await expect(appendJiaoHistory(pid, "大吉筊" as never, "事", "x")).rejects.toThrow();
    expect(await countOf("jiao_history", pid)).toBe(0);
  });

  it("档案删除时历史级联删除", async () => {
    const u1 = fresh();
    session.uid = u1;
    const pid = await insertProfile(u1);
    await appendDreamHistory(pid, "梦", "x");
    await appendJiaoHistory(pid, "圣筊", "事", "x");
    await sql()`delete from profiles where id = ${pid}`;
    expect(await countOf("dream_history", pid)).toBe(0);
    expect(await countOf("jiao_history", pid)).toBe(0);
  });
});
