// @vitest-environment node
//
// review #1 #4：解读改服务端保存。路由按会话 uid 读档案、扣额度、流式输出；
// 流正常结束且四分节齐全才落库，出错/缺节一律不存，并以约定标记收尾供客户端识别。
// 测法同 spirit/dream：直接 import 路由处理函数，拿 Node 原生 Request 调用。
import { describe, it, expect, vi, beforeEach } from "vitest";
import { READING_ERROR_MARKER, READING_SAVED_MARKER } from "@/lib/reading-sections";

const getViewerMock = vi.fn(async (): Promise<unknown> => ({ uid: "u1", email: "a@x.com", emailVerified: true }));
const getUidMock = vi.fn(async (): Promise<string | null> => "u1");
vi.mock("@/lib/account/uid", () => ({ getViewer: () => getViewerMock(), getUid: () => getUidMock() }));
const resolveAccessMock = vi.fn(async (..._a: unknown[]): Promise<unknown> => ({ level: "identified", hasVerifiedEmail: true }));
vi.mock("@/lib/access", () => ({ resolveAccess: (...a: unknown[]) => resolveAccessMock(...a) }));
const consumeLlmMock = vi.fn(async (..._a: unknown[]): Promise<{ ok: boolean }> => ({ ok: true }));
vi.mock("@/lib/entitlements", () => ({ consumeLlm: (...a: unknown[]) => consumeLlmMock(...a) }));
vi.mock("@/lib/i18n/server", () => ({ localeFromRequest: () => "zh" }));

const CHART = { fake: "frozen-chart" };
type Target = { id: string; nickname: string; chart: unknown; reading: string | null };
const loadMock = vi.fn(async (..._a: unknown[]): Promise<Target | null> => ({ id: "p1", nickname: "阿甲", chart: CHART, reading: null }));
const storeMock = vi.fn(async (..._a: unknown[]): Promise<boolean> => true);
vi.mock("@/lib/data/reading", () => ({
  loadReadingTarget: (...a: unknown[]) => loadMock(...a),
  storeReading: (...a: unknown[]) => storeMock(...a),
}));

const FULL = "## 概览\n一句。\n## 命理 · 紫微/八字\n二。\n## 心理 · 心理占星\n三。\n## 成长建议\n四。\n";
let chunks: string[] = [];
let failAfter: Error | null = null;
const streamReadingSpy = vi.fn(async function* (..._a: unknown[]) {
  for (const c of chunks) yield c;
  if (failAfter) throw failAfter;
});
const isLlmConfiguredMock = vi.fn(() => true);
vi.mock("@sojan/llm", () => ({
  resolveLlmConfig: () => ({ provider: "minimax", model: "MiniMax-M3" }),
  isLlmConfigured: () => isLlmConfiguredMock(),
  streamReading: (...a: unknown[]) => streamReadingSpy(...a),
}));

const { POST } = await import("../route");

function req(body: unknown = { profileId: "p1" }) {
  return new Request("http://x/api/reading", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/reading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chunks = [FULL.slice(0, 20), FULL.slice(20)];
    failAfter = null;
    getViewerMock.mockResolvedValue({ uid: "u1", email: "a@x.com", emailVerified: true });
    getUidMock.mockResolvedValue("u1");
    resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: true });
    loadMock.mockResolvedValue({ id: "p1", nickname: "阿甲", chart: CHART, reading: null });
    consumeLlmMock.mockResolvedValue({ ok: true });
  });

  function expectNoLlm() {
    expect(streamReadingSpy).not.toHaveBeenCalled();
    expect(storeMock).not.toHaveBeenCalled();
  }

  it("无会话 → 401；不读档案、不扣额度、不调 LLM", async () => {
    getViewerMock.mockResolvedValue(null);
    getUidMock.mockResolvedValue(null);
    resolveAccessMock.mockResolvedValue({ level: "anonymous", hasVerifiedEmail: false });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(loadMock).not.toHaveBeenCalled();
    expect(consumeLlmMock).not.toHaveBeenCalled();
    expectNoLlm();
  });

  it("有会话但 anonymous（邮箱未验证）→ 401；不扣额度、不调 LLM", async () => {
    getViewerMock.mockResolvedValue({ uid: "u1", email: "a@x.com", emailVerified: false });
    resolveAccessMock.mockResolvedValue({ level: "anonymous", hasVerifiedEmail: false });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(consumeLlmMock).not.toHaveBeenCalled();
    expectNoLlm();
  });

  it("别人的 / 不存在的 profileId → 404；按 (会话 uid, profileId) 查；不扣额度、不调 LLM", async () => {
    loadMock.mockResolvedValue(null);
    const res = await POST(req({ profileId: "someone-elses" }));
    expect(res.status).toBe(404);
    expect(loadMock).toHaveBeenCalledWith("u1", "someone-elses");
    expect(consumeLlmMock).not.toHaveBeenCalled();
    expectNoLlm();
  });

  it("缺 profileId / 非字符串 → 400；不扣额度、不调 LLM", async () => {
    expect((await POST(req({}))).status).toBe(400);
    expect((await POST(req({ profileId: 42 }))).status).toBe(400);
    expect(consumeLlmMock).not.toHaveBeenCalled();
    expectNoLlm();
  });

  it("档案已有解读 → 409；不重复生成、不扣额度", async () => {
    loadMock.mockResolvedValue({ id: "p1", nickname: "阿甲", chart: CHART, reading: "## 旧解读" });
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect(consumeLlmMock).not.toHaveBeenCalled();
    expectNoLlm();
  });

  it("额度不足 → 402；扣的是会话 uid；不调 LLM", async () => {
    consumeLlmMock.mockResolvedValue({ ok: false });
    const res = await POST(req());
    expect(res.status).toBe(402);
    expect(consumeLlmMock).toHaveBeenCalledWith("u1");
    expectNoLlm();
  });

  it("LLM 未配置 → 503，不调 LLM", async () => {
    isLlmConfiguredMock.mockReturnValueOnce(false);
    const res = await POST(req());
    expect(res.status).toBe(503);
    expectNoLlm();
  });

  it("成功且四分节齐全 → 流出全文、服务端落库（会话 uid + 库里冻结的命盘 + 模型名）", async () => {
    const r = req();
    const res = await POST(r);
    expect(res.status).toBe(200);
    const text = await res.text();
    // final review M1：落库成功以显式的成功标记收尾——客户端只认这个，不再把「没有错误标记」当成功
    expect(text).toBe(FULL + READING_SAVED_MARKER);
    expect(text).not.toContain(READING_ERROR_MARKER);
    // 命盘取自库里的档案，而不是客户端传来的；客户端断开时经 signal 中止上游
    expect(streamReadingSpy).toHaveBeenCalledWith(CHART, expect.objectContaining({ nickname: "阿甲", language: "zh", signal: r.signal }));
    expect(consumeLlmMock).toHaveBeenCalledWith("u1");
    expect(storeMock).toHaveBeenCalledTimes(1);
    expect(storeMock).toHaveBeenCalledWith("u1", "p1", FULL, "MiniMax-M3");
  });

  it("流中抛错 → 不落库；错误文案不拼进正文，末尾是约定的错误标记", async () => {
    chunks = ["## 概览\n一句。\n## 命理\n半截"];
    failAfter = new Error("upstream 529 overloaded");
    const res = await POST(req());
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text.endsWith(READING_ERROR_MARKER)).toBe(true);
    expect(text).not.toContain("upstream 529");
    expect(text).not.toContain("⚠️");
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("流正常结束但缺分节（截断）→ 不落库，同样以错误标记收尾", async () => {
    chunks = ["## 概览\n一句。\n## 命理 · 紫微/八字\n二。\n## 心理 · 心理占星\n三。\n"];
    const res = await POST(req());
    const text = await res.text();
    expect(text.endsWith(READING_ERROR_MARKER)).toBe(true);
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("全文齐全但落库失败 → 以错误标记收尾（客户端据此提示重新生成）", async () => {
    storeMock.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(req());
    const text = await res.text();
    expect(text.endsWith(READING_ERROR_MARKER)).toBe(true);
    expect(text).not.toContain("db down");
    expect(text).not.toContain(READING_SAVED_MARKER);
  });

  it("全文齐全但 storeReading 返回 false（并发请求先写入 / 档案已删）→ 以错误标记收尾，不带成功标记", async () => {
    storeMock.mockResolvedValueOnce(false);
    const res = await POST(req());
    const text = await res.text();
    expect(storeMock).toHaveBeenCalledTimes(1);
    expect(text.endsWith(READING_ERROR_MARKER)).toBe(true);
    expect(text).not.toContain(READING_SAVED_MARKER);
  });
});
