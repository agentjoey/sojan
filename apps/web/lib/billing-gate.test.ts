// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveAccessMock = vi.fn();
vi.mock("@/lib/access", () => ({ resolveAccess: (...a: unknown[]) => resolveAccessMock(...a) }));

const { requireVerifiedEmailForPayment } = await import("./billing-gate");

beforeEach(() => vi.clearAllMocks());

describe("requireVerifiedEmailForPayment（EP-account2-05，供未来 checkout 路由调用）", () => {
  it("anonymous → not_identified", async () => {
    resolveAccessMock.mockResolvedValue({ level: "anonymous", hasVerifiedEmail: false });
    expect(await requireVerifiedEmailForPayment("u1")).toEqual({ ok: false, reason: "not_identified" });
  });

  it("防御：identified 但 hasVerifiedEmail=false → no_verified_email（TG 下线后 resolveAccess 不再产出这个组合，守卫保留作纵深防御）", async () => {
    resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: false });
    expect(await requireVerifiedEmailForPayment("u1")).toEqual({ ok: false, reason: "no_verified_email" });
  });

  it("identified 且 hasVerifiedEmail → ok", async () => {
    resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: true });
    expect(await requireVerifiedEmailForPayment("u1")).toEqual({ ok: true });
  });

  it("已经是 member（自然蕴含 hasVerifiedEmail，见 resolveAccess 定义）→ ok", async () => {
    resolveAccessMock.mockResolvedValue({ level: "member", hasVerifiedEmail: true });
    expect(await requireVerifiedEmailForPayment("u1")).toEqual({ ok: true });
  });
});
