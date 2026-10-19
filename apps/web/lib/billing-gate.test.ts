// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveAccessMock = vi.fn();
vi.mock("@/lib/access", () => ({ resolveAccess: (...a: unknown[]) => resolveAccessMock(...a) }));

const getViewerMock = vi.fn();
vi.mock("@/lib/account/uid", () => ({ getViewer: () => getViewerMock() }));

const { requireVerifiedEmailForPayment } = await import("./billing-gate");

beforeEach(() => {
  vi.clearAllMocks();
  getViewerMock.mockResolvedValue({ uid: "u1", email: "a@x.com", emailVerified: true });
});

describe("requireVerifiedEmailForPayment（EP-account2-05，供未来 checkout 路由调用）", () => {
  it("anonymous → not_identified", async () => {
    resolveAccessMock.mockResolvedValue({ level: "anonymous", hasVerifiedEmail: false });
    expect(await requireVerifiedEmailForPayment()).toEqual({ ok: false, reason: "not_identified" });
  });

  it("identified 且 hasVerifiedEmail → ok", async () => {
    resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: true });
    expect(await requireVerifiedEmailForPayment()).toEqual({ ok: true });
    expect(resolveAccessMock).toHaveBeenCalledWith({ uid: "u1", email: "a@x.com", emailVerified: true });
  });

  it("已经是 member（自然蕴含 hasVerifiedEmail，见 resolveAccess 定义）→ ok", async () => {
    resolveAccessMock.mockResolvedValue({ level: "member", hasVerifiedEmail: true });
    expect(await requireVerifiedEmailForPayment()).toEqual({ ok: true });
  });
});
