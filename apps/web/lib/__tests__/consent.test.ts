// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const sqlMock = vi.fn();
vi.mock("@/lib/db", () => ({
  sql: () => (strings: TemplateStringsArray, ...values: unknown[]) => sqlMock(strings.join("?"), values),
}));

const { recordConsentOnce } = await import("../consent");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("recordConsentOnce", () => {
  it("正常插入：带 user_id/document/version，且用 on conflict do nothing 保证幂等", async () => {
    sqlMock.mockResolvedValue([]);
    await recordConsentOnce("u1", "terms", "2026-08-20");
    expect(sqlMock).toHaveBeenCalledTimes(1);
    const [text, values] = sqlMock.mock.calls[0];
    expect(text).toMatch(/insert into user_consents \(user_id, document, version\)/i);
    expect(text).toMatch(/on conflict \(user_id, document, version\) do nothing/i);
    expect(values).toEqual(["u1", "terms", "2026-08-20"]);
  });

  it("数据库抛错也不抛出——记录条款接受不该阻断调用方的主流程（best-effort），但要 console.error", async () => {
    sqlMock.mockRejectedValue(new Error("db down"));
    await expect(recordConsentOnce("u1", "terms", "2026-08-20")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
