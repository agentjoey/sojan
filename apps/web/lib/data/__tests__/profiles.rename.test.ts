// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/** 可切换的「当前会话」：null = 无会话。校验类用例不触达数据库，故不需要 TEST_DATABASE_URL。 */
const { session, sqlMock } = vi.hoisted(() => ({
  session: { uid: null as string | null },
  sqlMock: vi.fn(async () => []),
}));
vi.mock("@/lib/account/uid", () => ({
  getUid: async () => session.uid,
  getViewer: async () => null,
}));
vi.mock("@/lib/db", () => ({ sql: () => sqlMock }));

const { renameProfile } = await import("../profiles");

beforeEach(() => {
  vi.clearAllMocks();
  session.uid = null;
});

describe("renameProfile：校验在 withUid 内（不抛异常，返回 ActionResult）", () => {
  it("无会话 → unauthenticated（即便昵称本身也不合法），不碰数据库", async () => {
    expect(await renameProfile("p1", "x".repeat(25))).toEqual({ ok: false, code: "unauthenticated" });
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("有会话 + 25 字符昵称 → invalid_nickname，不碰数据库", async () => {
    session.uid = "u1";
    expect(await renameProfile("p1", "x".repeat(25))).toEqual({ ok: false, code: "invalid_nickname" });
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("有会话 + 空白昵称 → invalid_nickname", async () => {
    session.uid = "u1";
    expect(await renameProfile("p1", "   ")).toEqual({ ok: false, code: "invalid_nickname" });
  });

  it("有会话 + 非字符串输入 → invalid_nickname（不抛 TypeError）", async () => {
    session.uid = "u1";
    expect(await renameProfile("p1", undefined as unknown as string)).toEqual({ ok: false, code: "invalid_nickname" });
    expect(await renameProfile("p1", 42 as unknown as string)).toEqual({ ok: false, code: "invalid_nickname" });
  });

  it("有会话 + 合法昵称 → ok，且去首尾空白后写库", async () => {
    session.uid = "u1";
    expect(await renameProfile("p1", "  新名  ")).toEqual({ ok: true, value: undefined });
    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(sqlMock.mock.calls[0]).toContain("新名");
  });
});
