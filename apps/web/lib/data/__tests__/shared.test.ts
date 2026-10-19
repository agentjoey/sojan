// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthenticatedError, unwrap } from "@/lib/errors";

const getSessionMock = vi.fn();
vi.mock("@/lib/auth/server", () => ({
  auth: { getSession: (...a: unknown[]) => getSessionMock(...a) },
}));

const { withUid, ActionError } = await import("../_shared");

const signedIn = () =>
  getSessionMock.mockResolvedValue({
    data: { session: {}, user: { id: "u1", email: "a@b.c", emailVerified: true } },
    error: null,
  });

beforeEach(() => {
  vi.clearAllMocks();
  signedIn();
});

describe("withUid", () => {
  it("无会话 → unauthenticated，且 fn 未被调用", async () => {
    getSessionMock.mockResolvedValue({ data: null, error: null });
    const fn = vi.fn();
    expect(await withUid(fn)).toEqual({ ok: false, code: "unauthenticated" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("有会话 → 把 uid 交给 fn，返回 { ok:true, value }", async () => {
    const fn = vi.fn(async (uid: string) => `hi ${uid}`);
    expect(await withUid(fn)).toEqual({ ok: true, value: "hi u1" });
  });

  it("fn 抛 ActionError → 返回对应 code", async () => {
    const r = await withUid(async () => {
      throw new ActionError("profile_limit");
    });
    expect(r).toEqual({ ok: false, code: "profile_limit" });
  });

  it("fn 抛普通 Error → reject", async () => {
    await expect(
      withUid(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});

describe("unwrap", () => {
  it("ok → value", () => {
    expect(unwrap({ ok: true, value: 7 })).toBe(7);
  });

  it("unauthenticated → 抛 UnauthenticatedError", () => {
    expect(() => unwrap({ ok: false, code: "unauthenticated" })).toThrow(UnauthenticatedError);
  });

  it("profile_limit → 抛 message 为 profile_limit 的 Error", () => {
    expect(() => unwrap({ ok: false, code: "profile_limit" })).toThrow(
      expect.objectContaining({ message: "profile_limit" }),
    );
  });
});
