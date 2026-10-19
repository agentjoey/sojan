// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthenticatedError } from "@/lib/errors";

const getSessionMock = vi.fn();
vi.mock("@/lib/auth/server", () => ({
  auth: { getSession: (...a: unknown[]) => getSessionMock(...a) },
}));

const getUserMock = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: () => ({ auth: { getUser: (...a: unknown[]) => getUserMock(...a) } }),
}));

const { getViewer, getUid, requireUid, resolveUid } = await import("../uid");

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
  it("getSession reject → null（不向上抛）", async () => {
    getSessionMock.mockRejectedValue(new Error("upstream down"));
    await expect(getViewer()).resolves.toBeNull();
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

// 旧 Bearer 路径（@deprecated，Task 10 删除）——删除前保持行为不变。
describe("resolveUid（deprecated）：只读 Request 本身", () => {
  it("有 Bearer → via=web", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u2" } } });
    const req = new Request("http://x/api/whatever", { headers: { authorization: "Bearer tok" } });
    expect(await resolveUid(req)).toEqual({ uid: "u2", via: "web" });
  });

  it("没有 Bearer → null", async () => {
    expect(await resolveUid(new Request("http://x/api/whatever"))).toBeNull();
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("Bearer 无效（getUser 无用户）→ null", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const req = new Request("http://x/api/whatever", { headers: { authorization: "Bearer bad" } });
    expect(await resolveUid(req)).toBeNull();
  });
});
