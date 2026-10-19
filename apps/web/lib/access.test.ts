// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const getEntitlementMock = vi.fn();
vi.mock("@/lib/entitlements", () => ({
  getEntitlement: (...a: unknown[]) => getEntitlementMock(...a),
  isMember: (e: { tier: string; memberUntil: string | null }) =>
    e.tier === "member" && !!e.memberUntil && new Date(e.memberUntil).getTime() > Date.now(),
}));

const { resolveAccess } = await import("./access");

const viewer = (emailVerified: boolean) => ({ uid: "u1", email: "a@x.com", emailVerified });

beforeEach(() => {
  vi.clearAllMocks();
  getEntitlementMock.mockResolvedValue({ tier: "free", memberUntil: null });
});

describe("resolveAccess(viewer)", () => {
  it("null（无会话）→ anonymous，不查 entitlements", async () => {
    const r = await resolveAccess(null);
    expect(r.level).toBe("anonymous");
    expect(r).toEqual({ level: "anonymous", hasVerifiedEmail: false });
    expect(getEntitlementMock).not.toHaveBeenCalled();
  });

  it("emailVerified:false → anonymous（即使有有效订阅也不抬升）", async () => {
    getEntitlementMock.mockResolvedValue({ tier: "member", memberUntil: "2099-01-01T00:00:00Z" });
    const r = await resolveAccess(viewer(false));
    expect(r).toEqual({ level: "anonymous", hasVerifiedEmail: false });
    expect(getEntitlementMock).not.toHaveBeenCalled();
  });

  it("已验证邮箱、无订阅 → identified", async () => {
    const r = await resolveAccess(viewer(true));
    expect(r).toEqual({ level: "identified", hasVerifiedEmail: true });
    expect(getEntitlementMock).toHaveBeenCalledWith("u1");
  });

  it("已验证邮箱 + member_until 在未来 → member", async () => {
    getEntitlementMock.mockResolvedValue({ tier: "member", memberUntil: "2099-01-01T00:00:00Z" });
    const r = await resolveAccess(viewer(true));
    expect(r).toEqual({ level: "member", hasVerifiedEmail: true });
  });

  it("已验证邮箱但订阅过期 → identified 不是 member", async () => {
    getEntitlementMock.mockResolvedValue({ tier: "member", memberUntil: "2020-01-01T00:00:00Z" });
    const r = await resolveAccess(viewer(true));
    expect(r.level).toBe("identified");
  });
});
