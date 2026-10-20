// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Neon 迁移（Task 8）：身份只取会话 cookie（getUid），不再读 Authorization 头。
const getUidMock = vi.fn(async (): Promise<string | null> => "u1");
const resolveAccessMock = vi.fn(async (..._a: unknown[]): Promise<unknown> => ({ level: "identified", hasVerifiedEmail: true }));
vi.mock("@/lib/access", () => ({ resolveAccess: (...a: unknown[]) => resolveAccessMock(...a) }));
const getViewerMock = vi.fn(async (): Promise<unknown> => ({ uid: "u1", email: "a@x.com", emailVerified: true }));
vi.mock("@/lib/account/uid", () => ({ getViewer: () => getViewerMock(), getUid: () => getUidMock() }));
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

import { SPIRIT_MAX_TURNS, SPIRIT_TURN_MAX_CHARS, SPIRIT_MEMORY_MAX_CHARS, SPIRIT_QUESTIONNAIRE_MAX_CHARS } from "@/lib/spirit-request";

const { POST } = await import("../route");
const CHART = { fake: true };

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://x/api/spirit/jiao", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "1");
  getUidMock.mockReset();
  getUidMock.mockResolvedValue("u1");
  resolveAccessMock.mockClear();
  resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: true });
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
  it("followUp + priorTurns → 走 continueJiaoReply，priorTurns 原样透传（最多 12 条）", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ role: "user" as const, content: `t${i}` }));
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
  it("无会话（getUid 为 null）→ 401，不消耗额度、不调 LLM", async () => {
    getUidMock.mockResolvedValue(null);
    const res = await POST(req({ chart: CHART, question: "问题", omen: "圣筊" }));
    expect(res.status).toBe(401);
    expect(consumeLlmMock).not.toHaveBeenCalled();
    expect(generateJiaoReplySpy).not.toHaveBeenCalled();
  });

  it("只带 Authorization 头、无会话 → 401（头不再被采信）", async () => {
    getUidMock.mockResolvedValue(null);
    const res = await POST(req({ chart: CHART, question: "问题", omen: "圣筊" }, { authorization: "Bearer tok" }));
    expect(res.status).toBe(401);
    expect(consumeLlmMock).not.toHaveBeenCalled();
  });

  it("额度闸门查的是会话 uid", async () => {
    getUidMock.mockResolvedValue("u-session");
    const res = await POST(req({ chart: CHART, question: "问题", omen: "圣筊" }));
    expect(res.status).toBe(200);
    expect(consumeLlmMock).toHaveBeenCalledWith("u-session");
  });

  it("anonymous 级 → 401", async () => {
    resolveAccessMock.mockResolvedValue({ level: "anonymous", hasVerifiedEmail: false });
    const res = await POST(req({ chart: CHART, question: "问题", omen: "圣筊" }));
    expect(res.status).toBe(401);
    expect(consumeLlmMock).not.toHaveBeenCalled();
  });
});

describe("入参限长与 role 校验（review #6）：先于鉴权/计量，非法 → 400 且不扣额度", () => {
  const base = { chart: CHART, question: "原问题", omen: "圣筊", followUp: "再问" };
  const turn = (i: number) => ({ role: i % 2 === 0 ? "spirit" : "user", content: `t${i}` });

  async function expect400(body: unknown) {
    const res = await POST(req(body));
    expect(res.status).toBe(400);
    expect(consumeLlmMock).not.toHaveBeenCalled();
    expect(getUidMock).not.toHaveBeenCalled();
    expect(generateJiaoReplySpy).not.toHaveBeenCalled();
    expect(continueJiaoReplySpy).not.toHaveBeenCalled();
  }

  it("单条 turn 超 4000 字符 → 400", async () => {
    await expect400({ ...base, priorTurns: [{ role: "spirit", content: "x".repeat(SPIRIT_TURN_MAX_CHARS + 1) }] });
  });
  it("非法 role → 400", async () => {
    await expect400({ ...base, priorTurns: [{ role: "assistant", content: "hi" }] });
  });
  it("turn 缺 content / content 非字符串 → 400", async () => {
    await expect400({ ...base, priorTurns: [{ role: "user" }] });
    await expect400({ ...base, priorTurns: [{ role: "user", content: 1 }] });
  });
  it("超过 12 条 → 400（显式拒绝，不再静默截断）", async () => {
    await expect400({ ...base, priorTurns: Array.from({ length: SPIRIT_MAX_TURNS + 1 }, (_, i) => turn(i)) });
  });
  it("memory 超 2000 → 400", async () => {
    await expect400({ ...base, memory: "m".repeat(SPIRIT_MEMORY_MAX_CHARS + 1) });
  });
  it("questionnaire 超 2000 → 400（首次问卦同样校验）", async () => {
    await expect400({ chart: CHART, question: "原问题", omen: "圣筊", questionnaire: "q".repeat(SPIRIT_QUESTIONNAIRE_MAX_CHARS + 1) });
  });
  it("priorTurns 不是数组 → 400", async () => {
    await expect400({ ...base, priorTurns: "oops" });
  });

  it("恰好在边界：12 条、content 4000、memory 2000、questionnaire 2000 → 200 并原样透传", async () => {
    const priorTurns = Array.from({ length: SPIRIT_MAX_TURNS }, (_, i) => ({ ...turn(i), content: "x".repeat(SPIRIT_TURN_MAX_CHARS) }));
    const memory = "m".repeat(SPIRIT_MEMORY_MAX_CHARS);
    const questionnaire = "q".repeat(SPIRIT_QUESTIONNAIRE_MAX_CHARS);
    const res = await POST(req({ ...base, priorTurns, memory, questionnaire }));
    expect(res.status).toBe(200);
    const args = continueJiaoReplySpy.mock.calls.at(-1)!;
    expect(args[2]).toEqual(priorTurns);
    expect(args[4]).toEqual(expect.objectContaining({ memory, questionnaire }));
    expect(consumeLlmMock).toHaveBeenCalledWith("u1");
  });
});
