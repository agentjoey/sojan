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

const { listDwellings, createDwelling, updateDwelling, deleteDwelling } = await import("../dwellings");
const { readFengshuiReport, saveFengshuiReport } = await import("../fengshui-report");

const sections = { situation: "甲", youAndSpace: "乙", actions: "- 丙" };
const mk = (name = "家") => ({
  name, kind: "home" as const, tenancy: "rent" as const, facing: "S" as const, memberProfileIds: [] as string[],
});

// 每条用例十几次 Neon HTTP 往返，默认 5s 不够。
describe.skipIf(!hasTestDb)("lib/data/dwellings + fengshui-report（Neon）", { timeout: 30_000 }, () => {
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

  async function createAs(uid: string, name = "家") {
    session.uid = uid;
    const r = await createDwelling(mk(name));
    if (!r.ok) throw new Error(`createDwelling failed: ${r.code}`);
    return r.value;
  }

  it("建居所：uid 落库，listDwellings 按创建时间升序", async () => {
    const u1 = fresh();
    const a = await createAs(u1, "先");
    const b = await createAs(u1, "后");
    expect(a).toMatchObject({ name: "先", kind: "home", tenancy: "rent", facing: "S", memberProfileIds: [] });
    expect((await listDwellings()).map((d) => d.id)).toEqual([a.id, b.id]);
    const rows = await sql()`select uid from dwellings where id = ${a.id}`;
    expect(rows[0]!.uid).toBe(u1);
  });

  it("u2 拿 u1 的 id：update / delete 影响 0 行，u1 的记录不变（Review Focus 2）", async () => {
    const u1 = fresh();
    const u2 = fresh();
    const d = await createAs(u1);
    await createAs(u2, "乙的家");

    session.uid = u2;
    expect(await updateDwelling(d.id, { name: "改掉", facing: "N" })).toEqual({ ok: true, value: undefined });
    expect(await deleteDwelling(d.id)).toEqual({ ok: true, value: undefined });
    expect((await listDwellings()).map((x) => x.name)).toEqual(["乙的家"]);

    session.uid = u1;
    expect(await listDwellings()).toEqual([d]);
  });

  it("本人 update：只改 patch 里的字段，facing:null 合法，updated_at 刷新，member_profile_ids 落成 uuid[]", async () => {
    const u1 = fresh();
    const d = await createAs(u1);
    const before = await sql()`select updated_at from dwellings where id = ${d.id}`;
    const m1 = crypto.randomUUID();
    const m2 = crypto.randomUUID();

    expect((await updateDwelling(d.id, { name: "新名", memberProfileIds: [m1, m2] })).ok).toBe(true);
    let got = (await listDwellings())[0]!;
    expect(got).toMatchObject({ name: "新名", kind: "home", tenancy: "rent", facing: "S", memberProfileIds: [m1, m2] });

    expect((await updateDwelling(d.id, { facing: null, tenancy: "own", kind: "office" })).ok).toBe(true);
    got = (await listDwellings())[0]!;
    expect(got).toMatchObject({ name: "新名", kind: "office", tenancy: "own", facing: null, memberProfileIds: [m1, m2] });

    const after = await sql()`select updated_at from dwellings where id = ${d.id}`;
    expect(new Date(after[0]!.updated_at).getTime()).toBeGreaterThan(new Date(before[0]!.updated_at).getTime());
  });

  it("本人 delete：居所下的报告级联删除", async () => {
    const u1 = fresh();
    const d = await createAs(u1);
    expect((await saveFengshuiReport({
      fingerprint: "fs-cascade", profileId: crypto.randomUUID(), dwellingId: d.id, layer: 1, locale: "zh", sections,
    })).ok).toBe(true);
    expect(await readFengshuiReport("fs-cascade")).toEqual(sections);

    expect((await deleteDwelling(d.id)).ok).toBe(true);
    expect(await listDwellings()).toEqual([]);
    expect(await readFengshuiReport("fs-cascade")).toBeNull();
  });

  it("无会话：listDwellings 返回 []；写操作 unauthenticated 且不落库", async () => {
    const u1 = fresh();
    await createAs(u1);
    session.uid = null;
    expect(await listDwellings()).toEqual([]);
    expect(await createDwelling(mk("游客的家"))).toEqual({ ok: false, code: "unauthenticated" });
    expect(await updateDwelling(crypto.randomUUID(), { name: "x" })).toEqual({ ok: false, code: "unauthenticated" });
    expect(await deleteDwelling(crypto.randomUUID())).toEqual({ ok: false, code: "unauthenticated" });
    const n = await sql()`select count(*)::int as n from dwellings where name = '游客的家'`;
    expect(n[0]!.n).toBe(0);
  });

  it("报告：u2 读不到 u1 同 fingerprint 的报告；无会话读返回 null", async () => {
    const u1 = fresh();
    const u2 = fresh();
    session.uid = u1;
    await saveFengshuiReport({ fingerprint: "fs-shared", profileId: crypto.randomUUID(), dwellingId: null, layer: 0, locale: "zh", sections });
    expect(await readFengshuiReport("fs-shared")).toEqual(sections);

    session.uid = u2;
    expect(await readFengshuiReport("fs-shared")).toBeNull();
    session.uid = null;
    expect(await readFengshuiReport("fs-shared")).toBeNull();
    expect(await saveFengshuiReport({
      fingerprint: "fs-shared", profileId: crypto.randomUUID(), dwellingId: null, layer: 0, locale: "zh", sections,
    })).toEqual({ ok: false, code: "unauthenticated" });
  });

  it("报告：同一 (uid, fingerprint) 再 save 覆盖 sections，行数仍是 1；不同 uid 同指纹各自一行", async () => {
    const u1 = fresh();
    const u2 = fresh();
    const args = { fingerprint: "fs-upsert", profileId: crypto.randomUUID(), dwellingId: null, layer: 0, locale: "zh" };
    session.uid = u1;
    await saveFengshuiReport({ ...args, sections });
    const next = { situation: "新甲", youAndSpace: "新乙", actions: "- 新丙" };
    expect((await saveFengshuiReport({ ...args, sections: next })).ok).toBe(true);
    expect(await readFengshuiReport("fs-upsert")).toEqual(next);
    const rows = await sql()`select count(*)::int as n from fengshui_reports where uid = ${u1} and input_fingerprint = 'fs-upsert'`;
    expect(rows[0]!.n).toBe(1);

    session.uid = u2;
    await saveFengshuiReport({ ...args, sections });
    expect(await readFengshuiReport("fs-upsert")).toEqual(sections);
    session.uid = u1;
    expect(await readFengshuiReport("fs-upsert")).toEqual(next);
  });

  it("报告：dwellingId 指向别人的居所时落成 null，不引用他人的行", async () => {
    const u1 = fresh();
    const u2 = fresh();
    const theirs = await createAs(u1);
    session.uid = u2;
    await saveFengshuiReport({
      fingerprint: "fs-foreign", profileId: crypto.randomUUID(), dwellingId: theirs.id, layer: 1, locale: "zh", sections,
    });
    const rows = await sql()`select dwelling_id from fengshui_reports where uid = ${u2} and input_fingerprint = 'fs-foreign'`;
    expect(rows[0]!.dwelling_id).toBeNull();
  });
});
