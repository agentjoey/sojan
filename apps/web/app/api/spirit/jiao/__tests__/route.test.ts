// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn(async (_token?: string) => ({ data: { user: { id: "u1" } } }));
vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({ auth: { getUser: (t: string) => getUserMock(t) } }),
}));
const resolveAccessMock = vi.fn(async (..._a: unknown[]): Promise<unknown> => ({ level: "identified", hasVerifiedEmail: false, hasTelegram: true }));
vi.mock("@/lib/access", () => ({ resolveAccess: (...a: unknown[]) => resolveAccessMock(...a) }));
// 类型显式标注为 `{ ok: boolean; reason?: "paywall" }`（与 lib/entitlements.ts 的
// consumeLlm 真实返回类型一致）：若省略，vi.fn 会从初始返回值 `{ ok: true }` 推出
// 更窄的 `{ ok: boolean }`，导致下面 `mockResolvedValue({ ok: false, reason: "paywall" })`
// 因多余属性检查报 TS2353。
const consumeLlmMock = vi.fn(async (..._a: unknown[]): Promise<{ ok: boolean; reason?: "paywall" }> => ({ ok: true }));
vi.mock("@/lib/entitlements", () => ({ consumeLlm: (...a: unknown[]) => consumeLlmMock(...a) }));
vi.mock("@/lib/i18n/server", () => ({ localeFromRequest: () => "zh" }));
const isLlmConfiguredMock = vi.fn(() => true);
const generateJiaoReplySpy = vi.fn(async (..._a: unknown[]) => ({ text: "这一掷是圣筊。", fixedOmens: [] }));
const continueJiaoReplySpy = vi.fn(async (..._a: unknown[]) => ({ text: "追问的回应", fixedOmens: [] }));
vi.mock("@sojan/llm", () => ({
  resolveLlmConfig: vi.fn(() => ({ provider: "minimax", model: "m" })),
  isLlmConfigured: () => isLlmConfiguredMock(),
  generateJiaoReply: (...a: unknown[]) => generateJiaoReplySpy(...(a as [])),
  continueJiaoReply: (...a: unknown[]) => continueJiaoReplySpy(...(a as [])),
  JIAO_MAX_CHARS: 500,
}));

const { POST } = await import("../route");
const CHART = { fake: true };

function req(body: unknown, token = "tok") {
  return new Request("http://x/api/spirit/jiao", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "1");
  getUserMock.mockClear();
  getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
  resolveAccessMock.mockClear();
  resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: false, hasTelegram: true });
  consumeLlmMock.mockClear();
  consumeLlmMock.mockResolvedValue({ ok: true });
  generateJiaoReplySpy.mockClear();
  continueJiaoReplySpy.mockClear();
  isLlmConfiguredMock.mockReturnValue(true);
});

describe("POST /api/spirit/jiao 主流程", () => {
  it("首次问卦：question + omen 透传给 generateJiaoReply，返回纯文本", async () => {
    const res = await POST(req({ chart: CHART, question: "该不该接这个offer", omen: "圣筊" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("这一掷是圣筊。");
    const args = generateJiaoReplySpy.mock.calls.at(-1)!;
    expect(args[1]).toBe("该不该接这个offer");
    expect(args[2]).toBe("圣筊");
  });

  it("flag 关闭 → 404（页面级之外的第二道闸门）", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "");
    const res = await POST(req({ chart: CHART, question: "问题", omen: "圣筊" }));
    expect(res.status).toBe(404);
  });

  it("缺 chart → 400", async () => {
    const res = await POST(req({ question: "问题", omen: "圣筊" }));
    expect(res.status).toBe(400);
  });

  it("首次问卦缺 omen → 400（筊象是必需的既成事实，不能让服务端替用户掷）", async () => {
    const res = await POST(req({ chart: CHART, question: "问题" }));
    expect(res.status).toBe(400);
  });

  it("omen 不在三词闭集内 → 400（拒绝伪造筊象）", async () => {
    const res = await POST(req({ chart: CHART, question: "问题", omen: "大吉筊" }));
    expect(res.status).toBe(400);
    expect(generateJiaoReplySpy).not.toHaveBeenCalled();
  });

  it("问题超长 → 400", async () => {
    const res = await POST(req({ chart: CHART, question: "长".repeat(501), omen: "圣筊" }));
    expect(res.status).toBe(400);
  });

  it("LLM 未配置 → 503", async () => {
    isLlmConfiguredMock.mockReturnValue(false);
    const res = await POST(req({ chart: CHART, question: "问题", omen: "圣筊" }));
    expect(res.status).toBe(503);
  });

  it("额度用尽 → 402 paywall", async () => {
    consumeLlmMock.mockResolvedValue({ ok: false, reason: "paywall" });
    const res = await POST(req({ chart: CHART, question: "问题", omen: "圣筊" }));
    expect(res.status).toBe(402);
  });

  it("LLM 抛错 → 500", async () => {
    generateJiaoReplySpy.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(req({ chart: CHART, question: "问题", omen: "圣筊" }));
    expect(res.status).toBe(500);
  });
});

describe("追问分支", () => {
  it("followUp + priorTurns → 走 continueJiaoReply，priorTurns 裁到最近 12 条", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ role: "user" as const, content: `t${i}` }));
    const res = await POST(req({ chart: CHART, question: "原问题", omen: "圣筊", followUp: "再问", priorTurns: many }));
    expect(res.status).toBe(200);
    expect(generateJiaoReplySpy).not.toHaveBeenCalled();
    const args = continueJiaoReplySpy.mock.calls.at(-1)!;
    expect((args[2] as unknown[]).length).toBe(12);
    expect(args[3]).toBe("再问");
  });

  it("续接历史：不传 question → continueJiaoReply 收到 undefined", async () => {
    const res = await POST(req({
      chart: CHART,
      followUp: "还有别的角度吗",
      priorTurns: [{ role: "spirit", content: "历史回复全文" }],
    }));
    expect(res.status).toBe(200);
    expect(continueJiaoReplySpy.mock.calls.at(-1)![1]).toBeUndefined();
  });
});

describe("鉴权闸门（与 /api/spirit/dream 同一套）", () => {
  it("无 Bearer → 401，不消耗额度", async () => {
    const res = await POST(req({ chart: CHART, question: "问题", omen: "圣筊" }, ""));
    expect(res.status).toBe(401);
    expect(consumeLlmMock).not.toHaveBeenCalled();
  });

  it("anonymous 级 → 401", async () => {
    resolveAccessMock.mockResolvedValue({ level: "anonymous", hasVerifiedEmail: false, hasTelegram: false });
    const res = await POST(req({ chart: CHART, question: "问题", omen: "圣筊" }));
    expect(res.status).toBe(401);
    expect(consumeLlmMock).not.toHaveBeenCalled();
  });
});
