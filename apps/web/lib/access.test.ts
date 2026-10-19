// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserByIdMock = vi.fn();
const getEntitlementMock = vi.fn();

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: () => ({
    auth: { admin: { getUserById: (...a: unknown[]) => getUserByIdMock(...a) } },
    from: (table: string) => {
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));
vi.mock("@/lib/entitlements", () => ({
  getEntitlement: (...a: unknown[]) => getEntitlementMock(...a),
  isMember: (e: { tier: string; memberUntil: string | null }) =>
    e.tier === "member" && !!e.memberUntil && new Date(e.memberUntil).getTime() > Date.now(),
}));

const { resolveAccess, SYNTHETIC_EMAIL_DOMAIN } = await import("./access");

function user(email: string | null, confirmed: boolean) {
  return { data: { user: email ? { email, email_confirmed_at: confirmed ? "2026-01-01T00:00:00Z" : null } : null } };
}

beforeEach(() => {
  vi.clearAllMocks();
  getEntitlementMock.mockResolvedValue({ tier: "free", memberUntil: null });
});

describe("resolveAccess", () => {
  it("无邮箱 → anonymous", async () => {
    getUserByIdMock.mockResolvedValue(user(null, false));
    const r = await resolveAccess("u1");
    expect(r).toEqual({ level: "anonymous", hasVerifiedEmail: false });
  });

  it(`影子邮箱（@${SYNTHETIC_EMAIL_DOMAIN}）即使 email_confirmed_at 有值也不算 hasVerifiedEmail`, async () => {
    getUserByIdMock.mockResolvedValue(user(`tg_123@${SYNTHETIC_EMAIL_DOMAIN}`, true));
    const r = await resolveAccess("u1");
    expect(r.hasVerifiedEmail).toBe(false);
  });

  it("真实邮箱但未验证（email_confirmed_at 为空）→ 不算 hasVerifiedEmail", async () => {
    getUserByIdMock.mockResolvedValue(user("a@x.com", false));
    const r = await resolveAccess("u1");
    expect(r.hasVerifiedEmail).toBe(false);
    expect(r.level).toBe("anonymous");
  });

  it("真实已验证邮箱 → identified，hasVerifiedEmail=true", async () => {
    getUserByIdMock.mockResolvedValue(user("a@x.com", true));
    const r = await resolveAccess("u1");
    expect(r).toEqual({ level: "identified", hasVerifiedEmail: true });
  });

  it("残留的 tg_users 映射不再抬升层级：无邮箱即 anonymous（TG 已下线，identified 只认真实已验证邮箱）", async () => {
    getUserByIdMock.mockResolvedValue(user(null, false));
    const r = await resolveAccess("u1");
    expect(r.level).toBe("anonymous");
    expect(r).not.toHaveProperty("hasTelegram");
  });

  it("影子邮箱用户 + entitlements 里有效订阅 → 仍是 anonymous（member 要求真实已验证邮箱）", async () => {
    getUserByIdMock.mockResolvedValue(user(`tg_123@${SYNTHETIC_EMAIL_DOMAIN}`, true));
    getEntitlementMock.mockResolvedValue({ tier: "member", memberUntil: "2099-01-01T00:00:00Z" });
    const r = await resolveAccess("u1");
    expect(r.level).toBe("anonymous");
  });

  it("已验证邮箱 + entitlements 里有效订阅 → member", async () => {
    getUserByIdMock.mockResolvedValue(user("a@x.com", true));
    getEntitlementMock.mockResolvedValue({ tier: "member", memberUntil: "2099-01-01T00:00:00Z" });
    const r = await resolveAccess("u1");
    expect(r.level).toBe("member");
  });

  it("已验证邮箱但订阅过期 → identified 不是 member", async () => {
    getUserByIdMock.mockResolvedValue(user("a@x.com", true));
    getEntitlementMock.mockResolvedValue({ tier: "member", memberUntil: "2020-01-01T00:00:00Z" });
    const r = await resolveAccess("u1");
    expect(r.level).toBe("identified");
  });
});
