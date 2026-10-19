// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUidMock = vi.fn();
vi.mock("@/lib/account/uid", () => ({ getUid: () => getUidMock() }));

const getEntitlementMock = vi.fn();
const getLlmUsedMock = vi.fn();
vi.mock("@/lib/entitlements", () => ({
  getEntitlement: (...a: unknown[]) => getEntitlementMock(...a),
  getLlmUsed: (...a: unknown[]) => getLlmUsedMock(...a),
  isMember: (e: { tier: string; memberUntil: string | null }) =>
    e.tier === "member" && !!e.memberUntil && new Date(e.memberUntil).getTime() > Date.now(),
}));
const { GET } = await import("../route");

beforeEach(() => {
  vi.clearAllMocks();
  getLlmUsedMock.mockResolvedValue(3);
  getEntitlementMock.mockResolvedValue({ tier: "free", memberUntil: null });
});

describe("GET /api/billing/status", () => {
  it("无会话 → free/未用量，不查 entitlements（未登录也要有响应，不是 401）", async () => {
    getUidMock.mockResolvedValue(null);
    const res = await GET();
    const json = await res.json();
    expect(json).toMatchObject({ tier: "free", memberUntil: null, used: 0 });
    expect(getEntitlementMock).not.toHaveBeenCalled();
    expect(getLlmUsedMock).not.toHaveBeenCalled();
  });

  it("有会话 uid → 查 entitlements 与本月用量", async () => {
    getUidMock.mockResolvedValue("u1");
    const res = await GET();
    const json = await res.json();
    expect(getEntitlementMock).toHaveBeenCalledWith("u1");
    expect(getLlmUsedMock).toHaveBeenCalledWith("u1");
    expect(json.used).toBe(3);
  });

  it("会员且未过期 → tier=member", async () => {
    getUidMock.mockResolvedValue("u1");
    getEntitlementMock.mockResolvedValue({ tier: "member", memberUntil: "2099-01-01T00:00:00Z" });
    const res = await GET();
    expect((await res.json()).tier).toBe("member");
  });
});
