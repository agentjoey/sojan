// @vitest-environment node
//
// 刻意不 mock next/headers——resolveUid 只依赖 req.headers，
// 用手搓 Request 直接验证（同 api/fengshui/reading route 测试的既有理由：
// 这个仓库的 route 测试统一走「直接 import handler + Request」，不经过
// Next 真实分发，next/headers 的 cookies() 在这种调用方式下不可靠）。
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: () => ({ auth: { getUser: (...a: unknown[]) => getUserMock(...a) } }),
}));

const { resolveUid } = await import("../uid");

beforeEach(() => vi.clearAllMocks());

describe("resolveUid：不依赖 next/headers，只读 Request 本身", () => {
  it("有 Bearer → via=web", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u2" } } });
    const req = new Request("http://x/api/whatever", { headers: { authorization: "Bearer tok" } });
    const r = await resolveUid(req);
    expect(r).toEqual({ uid: "u2", via: "web" });
  });

  it("没有 Bearer → null", async () => {
    const r = await resolveUid(new Request("http://x/api/whatever"));
    expect(r).toBeNull();
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("zj_tg cookie 不再被识别（TG 已下线）：只有 cookie、没有 Bearer → null", async () => {
    const req = new Request("http://x/api/whatever", { headers: { cookie: "zj_tg=anything" } });
    expect(await resolveUid(req)).toBeNull();
  });

  it("Bearer 无效（getUser 无用户）→ null", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const req = new Request("http://x/api/whatever", { headers: { authorization: "Bearer bad" } });
    expect(await resolveUid(req)).toBeNull();
  });
});
