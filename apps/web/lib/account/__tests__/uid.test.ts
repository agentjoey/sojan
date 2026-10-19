// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UnauthenticatedError } from "@/lib/errors";

const getSessionMock = vi.fn();
vi.mock("@/lib/auth/server", () => ({
  auth: { getSession: (...a: unknown[]) => getSessionMock(...a) },
}));

const { getViewer, getUid, requireUid } = await import("../uid");

beforeEach(() => vi.clearAllMocks());

const session = (emailVerified = true) => ({
  data: { session: { id: "s1" }, user: { id: "u1", email: "a@b.c", emailVerified } },
  error: null,
});

describe("getViewer", () => {
  it("无会话 → null", async () => {
    getSessionMock.mockResolvedValue({ data: null, error: null });
    expect(await getViewer()).toBeNull();
  });

  it("有会话 → { uid, email, emailVerified }", async () => {
    getSessionMock.mockResolvedValue(session());
    expect(await getViewer()).toEqual({ uid: "u1", email: "a@b.c", emailVerified: true });
  });

  it("邮箱未验证 → emailVerified:false 原样带出", async () => {
    getSessionMock.mockResolvedValue(session(false));
    expect((await getViewer())?.emailVerified).toBe(false);
  });

  it("getSession 返回 error → null", async () => {
    getSessionMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await getViewer()).toBeNull();
  });
});

describe("getViewer：getSession 抛异常时降级为匿名", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  it("getSession reject → null（不向上抛），并 console.error 留痕", async () => {
    const boom = new Error("upstream down");
    getSessionMock.mockRejectedValue(boom);
    await expect(getViewer()).resolves.toBeNull();
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith("[getViewer] getSession threw", boom);
  });

  it("getSession reject → getUid 为 null，requireUid 抛 UnauthenticatedError", async () => {
    getSessionMock.mockRejectedValue(new Error("cookies() set failed"));
    expect(await getUid()).toBeNull();
    await expect(requireUid()).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

describe("getUid / requireUid", () => {
  it("getUid 有会话 → uid；无会话 → null", async () => {
    getSessionMock.mockResolvedValue(session());
    expect(await getUid()).toBe("u1");
    getSessionMock.mockResolvedValue({ data: null, error: null });
    expect(await getUid()).toBeNull();
  });

  it("requireUid 有会话 → uid", async () => {
    getSessionMock.mockResolvedValue(session());
    expect(await requireUid()).toBe("u1");
  });

  it("requireUid 无会话 → 抛 UnauthenticatedError", async () => {
    getSessionMock.mockResolvedValue({ data: null, error: null });
    await expect(requireUid()).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});
