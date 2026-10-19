// @vitest-environment node
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { sql } from "@/lib/db";
import { cleanupUsers, hasTestDb, newUid, useTestDb } from "@/test/db";
import { consumeLlm, getEntitlement, getLlmUsed, isMember } from "@/lib/entitlements";

// 每条用例多次 Neon HTTP 往返，默认 5s 不够。
describe.skipIf(!hasTestDb)("lib/entitlements（Neon）", { timeout: 30_000 }, () => {
  useTestDb();
  const uids: string[] = [];
  const fresh = () => {
    const uid = newUid();
    uids.push(uid);
    return uid;
  };
  afterAll(() => cleanupUsers(uids));
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("getEntitlement：无记录 = free；会员记录读出 tier / memberUntil（ISO）", async () => {
    const u = fresh();
    expect(await getEntitlement(u)).toEqual({ tier: "free", memberUntil: null });
    expect(isMember(await getEntitlement(u))).toBe(false);

    const until = new Date(Date.now() + 86_400_000);
    await sql()`insert into entitlements (user_id, tier, member_until) values (${u}, 'member', ${until.toISOString()})`;
    const e = await getEntitlement(u);
    expect(e).toEqual({ tier: "member", memberUntil: until.toISOString() });
    expect(isMember(e)).toBe(true);
  });

  it("过期会员不算会员", async () => {
    const u = fresh();
    await sql()`insert into entitlements (user_id, tier, member_until) values (${u}, 'member', ${new Date(Date.now() - 1000).toISOString()})`;
    expect(isMember(await getEntitlement(u))).toBe(false);
  });

  it("BILLING_ENABLED 未开：恒放行，不计数", async () => {
    vi.stubEnv("BILLING_ENABLED", "");
    const u = fresh();
    expect(await consumeLlm(u)).toEqual({ ok: true });
    expect(await getLlmUsed(u)).toBe(0);
  });

  it("BILLING_ENABLED=1、FREE_LLM_MONTHLY=2：第三次返回 paywall，用量停在 2", async () => {
    vi.stubEnv("BILLING_ENABLED", "1");
    vi.stubEnv("FREE_LLM_MONTHLY", "2");
    const u = fresh();
    expect(await consumeLlm(u)).toEqual({ ok: true });
    expect(await consumeLlm(u)).toEqual({ ok: true });
    expect(await consumeLlm(u)).toEqual({ ok: false, reason: "paywall" });
    expect(await getLlmUsed(u)).toBe(2);
  });

  it("有效会员连续调用 5 次都放行，且不占免费额度", async () => {
    vi.stubEnv("BILLING_ENABLED", "1");
    vi.stubEnv("FREE_LLM_MONTHLY", "2");
    const u = fresh();
    await sql()`insert into entitlements (user_id, tier, member_until) values (${u}, 'member', ${new Date(Date.now() + 86_400_000).toISOString()})`;
    for (let i = 0; i < 5; i++) expect(await consumeLlm(u)).toEqual({ ok: true });
    expect(await getLlmUsed(u)).toBe(0);
  });
});
