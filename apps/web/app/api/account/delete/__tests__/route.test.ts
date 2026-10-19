// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUidMock = vi.fn();
vi.mock("@/lib/account/uid", () => ({ getUid: () => getUidMock() }));

const purgeMock = vi.fn();
vi.mock("@/lib/data/delete-account", () => ({ purgeUserData: (...a: unknown[]) => purgeMock(...a) }));

const { POST } = await import("../route");
const { NEON_AUTH_COOKIE_NAMES } = await import("@/lib/account/neon-auth-cookies");

const req = (body: unknown = { confirm: true }, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/account/delete", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  purgeMock.mockResolvedValue(undefined);
});

describe("POST /api/account/delete", () => {
  it("Origin 与 Host 不一致 → 403，且未调用 purgeUserData", async () => {
    getUidMock.mockResolvedValue("u1");
    const res = await POST(req({ confirm: true }, { host: "sojan.app", origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(purgeMock).not.toHaveBeenCalled();
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("Origin 非法值 → 403", async () => {
    getUidMock.mockResolvedValue("u1");
    const res = await POST(req({ confirm: true }, { host: "sojan.app", origin: "null" }));
    expect(res.status).toBe(403);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it("Origin 与 Host 一致 → 正常处理", async () => {
    getUidMock.mockResolvedValue("u1");
    const res = await POST(req({ confirm: true }, { host: "sojan.app", origin: "https://sojan.app" }));
    expect(res.status).toBe(200);
    expect(purgeMock).toHaveBeenCalledWith("u1");
  });

  it("缺少 confirm → 400，不清数据", async () => {
    getUidMock.mockResolvedValue("u1");
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it("无会话 → 401，且未调用 purgeUserData", async () => {
    getUidMock.mockResolvedValue(null);
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it("正常 → purgeUserData(uid)、200 { ok: true }，且每个 Neon Auth cookie 都被置为过期", async () => {
    getUidMock.mockResolvedValue("u1");
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(purgeMock).toHaveBeenCalledWith("u1");

    const setCookies = res.headers.getSetCookie();
    // 名字抄自 SDK 源码；这里写死字面量，防常量被手滑改错
    expect(NEON_AUTH_COOKIE_NAMES).toEqual(
      expect.arrayContaining([
        "__Secure-neon-auth.session_token",
        "__Secure-neon-auth.local.session_data",
        "__Secure-neon-auth.session_challenge",
      ]),
    );
    for (const name of NEON_AUTH_COOKIE_NAMES) {
      const line = setCookies.find((c) => c.startsWith(`${name}=`));
      expect(line, name).toBeTruthy();
      expect(line).toMatch(/Max-Age=0/i);
      expect(line).toMatch(/Path=\//i);
      // 注意：行首的 cookie 名自带 "__Secure-"，必须匹配属性段，否则永远为真
      expect(line).toMatch(/;\s*Secure(;|$)/i);
      expect(line).toMatch(/;\s*HttpOnly(;|$)/i);
      expect(line).toMatch(/;\s*SameSite=Lax(;|$)/i);
    }
  });

  it("请求里带着其他 __Secure-neon-auth.* cookie 也一并清掉", async () => {
    getUidMock.mockResolvedValue("u1");
    const res = await POST(req({ confirm: true }, { cookie: "__Secure-neon-auth.dont_remember=true; unrelated=1" }));
    const setCookies = res.headers.getSetCookie();
    expect(setCookies.some((c) => c.startsWith("__Secure-neon-auth.dont_remember=") && /Max-Age=0/i.test(c))).toBe(true);
    expect(setCookies.some((c) => c.startsWith("unrelated="))).toBe(false);
  });

  it("purgeUserData reject → 500，不清 cookie", async () => {
    getUidMock.mockResolvedValue("u1");
    purgeMock.mockRejectedValue(new Error("db down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req());
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.headers.getSetCookie()).toEqual([]);
  });
});
