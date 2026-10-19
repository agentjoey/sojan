// review #4：七个辅助 LLM server action 要求登录。
// 无会话 / anonymous（邮箱未验证）一律返回 null（调用方已把 null 当"无 LLM、静默降级"），
// 且绝不触达对应的 @sojan/llm 函数——否则未登录请求也能烧 LLM 额度。
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BirthInput, DailyFortune, UnifiedChart } from "@sojan/core";

const getViewerMock = vi.fn(async (): Promise<unknown> => ({ uid: "u1", email: "a@x.com", emailVerified: true }));
vi.mock("@/lib/account/uid", () => ({ getViewer: () => getViewerMock() }));
const resolveAccessMock = vi.fn(async (..._a: unknown[]): Promise<unknown> => ({ level: "identified", hasVerifiedEmail: true }));
vi.mock("@/lib/access", () => ({ resolveAccess: (...a: unknown[]) => resolveAccessMock(...a) }));

const llm = {
  polishDailyFortune: vi.fn(async (..._a: unknown[]) => "polished"),
  dailyBehaviorAdvice: vi.fn(async (..._a: unknown[]) => ({ do: ["a"], dont: ["b"] })),
  generateTimeline: vi.fn(async (..._a: unknown[]) => "timeline"),
  summarizeSpiritMemory: vi.fn(async (..._a: unknown[]) => "memory"),
  summarizeDreamEntry: vi.fn(async (..._a: unknown[]) => "dream"),
  summarizeJiaoEntry: vi.fn(async (..._a: unknown[]) => "jiao"),
  generateDailySpiritGreeting: vi.fn(async (..._a: unknown[]) => ({ text: "greeting" })),
};
vi.mock("@sojan/llm", () => ({
  ...Object.fromEntries(Object.entries(llm).map(([k, v]) => [k, (...a: unknown[]) => v(...a)])),
  resolveLlmConfig: () => ({}),
  isLlmConfigured: () => true,
}));
// timelineAction 内部先算紫微大限，这里只关心鉴权，换成确定值
vi.mock("@sojan/core", async (orig) => ({
  ...(await orig<typeof import("@sojan/core")>()),
  computeZiweiHoroscope: () => ({ fake: "horoscope" }),
}));

const actions = await import("../actions");

const fortune = {} as DailyFortune;
const chart = {} as UnifiedChart;
const birth = { nickname: "甲" } as BirthInput;

const cases: [string, () => Promise<unknown>, keyof typeof llm, unknown][] = [
  ["dailyPolishAction", () => actions.dailyPolishAction(fortune, "甲"), "polishDailyFortune", "polished"],
  ["dailyBehaviorAction", () => actions.dailyBehaviorAction(fortune, "甲"), "dailyBehaviorAdvice", { do: ["a"], dont: ["b"] }],
  ["timelineAction", () => actions.timelineAction(birth, chart, "2026-10-20"), "generateTimeline", "timeline"],
  ["spiritMemoryAction", () => actions.spiritMemoryAction([{ role: "user", content: "hi" }]), "summarizeSpiritMemory", "memory"],
  ["dreamSummaryAction", () => actions.dreamSummaryAction("梦", "答", "zh"), "summarizeDreamEntry", "dream"],
  ["jiaoSummaryAction", () => actions.jiaoSummaryAction("问", "答", "zh"), "summarizeJiaoEntry", "jiao"],
  ["dailySpiritGreetingAction", () => actions.dailySpiritGreetingAction(chart, fortune, "2026-10-20"), "generateDailySpiritGreeting", "greeting"],
];

describe.each(cases)("%s：登录守卫", (_name, call, llmFn, okValue) => {
  beforeEach(() => {
    vi.clearAllMocks();
    getViewerMock.mockResolvedValue({ uid: "u1", email: "a@x.com", emailVerified: true });
    resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: true });
  });

  it("无会话 → null，不调 LLM", async () => {
    getViewerMock.mockResolvedValue(null);
    resolveAccessMock.mockResolvedValue({ level: "anonymous", hasVerifiedEmail: false });
    expect(await call()).toBeNull();
    expect(llm[llmFn]).not.toHaveBeenCalled();
  });

  it("有会话但 anonymous（邮箱未验证）→ null，不调 LLM", async () => {
    getViewerMock.mockResolvedValue({ uid: "u1", email: "a@x.com", emailVerified: false });
    resolveAccessMock.mockResolvedValue({ level: "anonymous", hasVerifiedEmail: false });
    expect(await call()).toBeNull();
    expect(llm[llmFn]).not.toHaveBeenCalled();
  });

  it("已验证登录用户 → 照常调 LLM 并返回结果", async () => {
    expect(await call()).toEqual(okValue);
    expect(llm[llmFn]).toHaveBeenCalledTimes(1);
  });
});
