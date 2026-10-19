// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const getSessionMock = vi.fn();
vi.mock("@/lib/auth/server", () => ({
  auth: { getSession: (...a: unknown[]) => getSessionMock(...a) },
}));
const resolveAccessMock = vi.fn();
vi.mock("@/lib/access", () => ({ resolveAccess: (...a: unknown[]) => resolveAccessMock(...a) }));
const recordConsentOnceMock = vi.fn();
vi.mock("@/lib/consent", () => ({
  TERMS_VERSION: "2026-08-20",
  recordConsentOnce: (...a: unknown[]) => recordConsentOnceMock(...a),
}));

const { getAccountSummary, acceptTermsOnce } = await import("../account");

const signedIn = () =>
  getSessionMock.mockResolvedValue({
    data: { session: {}, user: { id: "u1", email: "me@example.com", emailVerified: true } },
    error: null,
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAccountSummary", () => {
  it("无会话 → null，不查 access", async () => {
    getSessionMock.mockResolvedValue({ data: null, error: null });
    expect(await getAccountSummary()).toBeNull();
    expect(resolveAccessMock).not.toHaveBeenCalled();
  });

  it("有会话 → { email, access }，access 由 resolveAccess(viewer) 给出", async () => {
    signedIn();
    resolveAccessMock.mockResolvedValue({ level: "member", hasVerifiedEmail: true });
    expect(await getAccountSummary()).toEqual({
      email: "me@example.com",
      access: { level: "member", hasVerifiedEmail: true },
    });
    expect(resolveAccessMock).toHaveBeenCalledWith({ uid: "u1", email: "me@example.com", emailVerified: true });
  });
});

describe("acceptTermsOnce", () => {
  it("有会话 → 以当前 uid 记一次 terms@TERMS_VERSION", async () => {
    signedIn();
    await acceptTermsOnce();
    expect(recordConsentOnceMock).toHaveBeenCalledWith("u1", "terms", "2026-08-20");
  });

  it("无会话 → 静默不记（不抛错、不写库）", async () => {
    getSessionMock.mockResolvedValue({ data: null, error: null });
    await expect(acceptTermsOnce()).resolves.toBeUndefined();
    expect(recordConsentOnceMock).not.toHaveBeenCalled();
  });
});
