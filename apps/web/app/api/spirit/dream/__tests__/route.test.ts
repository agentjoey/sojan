// @vitest-environment node
//
// 测法：直接 import 路由处理函数、
// 拿 Node 原生 Request 调用，不经过 Next 的开发/构建服务器。
//
// EP-dream-02：web 无状态解梦端点的 flag 门控（404）、入参校验（400）、LLM 未配置
// （503）、会话用户额度闸门（402）、生成失败（500）都在本文件覆盖。
// EP-account2-05：无会话或身份未识别的调用一律 401——原先 `if (userId)`
// 在未带 token 时静默跳过闸门，等于匿名无限免费。
// Neon 迁移（Task 8）：身份只取会话 cookie（`getUid()`），不再读 Authorization 头。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const resolveAccessMock = vi.fn(async (..._a: unknown[]): Promise<unknown> => ({ level: "identified", hasVerifiedEmail: true }));
vi.mock("@/lib/access", () => ({ resolveAccess: (...a: unknown[]) => resolveAccessMock(...a) }));
const getViewerMock = vi.fn(async (): Promise<unknown> => ({ uid: "u1", email: "a@x.com", emailVerified: true }));
const getUidMock = vi.fn(async (): Promise<string | null> => "u1");
vi.mock("@/lib/account/uid", () => ({ getViewer: () => getViewerMock(), getUid: () => getUidMock() }));
const consumeLlmMock = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
vi.mock("@/lib/entitlements", () => ({
  consumeLlm: (...a: unknown[]) => consumeLlmMock(...a),
}));
vi.mock("@/lib/i18n/server", () => ({ localeFromRequest: () => "zh" }));
const isLlmConfiguredMock = vi.fn(() => true);
const interpretDreamSpy = vi.fn(async function* () {
  yield "解读";
});
const continueDreamReplySpy = vi.fn(async (..._a: unknown[]) => ({ text: "追问的解读", stripped: [] }));
vi.mock("@sojan/llm", () => ({
  resolveLlmConfig: vi.fn(() => ({ provider: "minimax", model: "m" })),
  isLlmConfigured: () => isLlmConfiguredMock(),
  interpretDream: (...a: unknown[]) => interpretDreamSpy(...(a as [])),
  continueDreamReply: (...a: unknown[]) => continueDreamReplySpy(...(a as [])),
  DREAM_MAX_CHARS: 2000,
}));

import { SPIRIT_MAX_TURNS, SPIRIT_MEMORY_MAX_CHARS, SPIRIT_QUESTIONNAIRE_MAX_CHARS } from "@/lib/spirit-request";

const { POST } = await import("../route");

const CHART = { fake: true };

function req(body: unknown) {
  return new Request("http://x/api/spirit/dream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/spirit/dream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUidMock.mockResolvedValue("u1");
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1");
    resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: true });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("正常解读（已识别会话用户）：200 + 文本；memory/questionnaire 透传；收一次额度", async () => {
    const res = await POST(
      req({ chart: CHART, dream: "我梦见坠落", memory: "旧记忆", questionnaire: "问卷" }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("解读");
    expect(interpretDreamSpy).toHaveBeenCalledWith(
      CHART,
      "我梦见坠落",
      expect.objectContaining({ language: "zh", memory: "旧记忆", questionnaire: "问卷" }),
    );
    expect(consumeLlmMock).toHaveBeenCalledWith("u1");
  });

  it("缺 chart → 400；缺 dream → 400；超长 → 400；均不调 LLM", async () => {
    expect((await POST(req({ dream: "我梦见坠落" }))).status).toBe(400);
    expect((await POST(req({ chart: CHART }))).status).toBe(400);
    expect((await POST(req({ chart: CHART, dream: "x".repeat(2001) }))).status).toBe(400);
    expect(interpretDreamSpy).not.toHaveBeenCalled();
  });

  it("LLM 未配置 → 503，不调 LLM", async () => {
    isLlmConfiguredMock.mockReturnValueOnce(false);
    const res = await POST(req({ chart: CHART, dream: "我梦见坠落" }));
    expect(res.status).toBe(503);
    expect(interpretDreamSpy).not.toHaveBeenCalled();
  });

  it("会话用户超额度 → 402，不调 LLM；闸门查的是会话 uid", async () => {
    getUidMock.mockResolvedValue("u-session");
    consumeLlmMock.mockResolvedValueOnce({ ok: false });
    const res = await POST(req({ chart: CHART, dream: "我梦见坠落" }));
    expect(res.status).toBe(402);
    expect(consumeLlmMock).toHaveBeenCalledWith("u-session");
    expect(interpretDreamSpy).not.toHaveBeenCalled();
  });

  it("会话用户额度充足 → 200", async () => {
    const res = await POST(req({ chart: CHART, dream: "我梦见坠落" }));
    expect(res.status).toBe(200);
    expect(consumeLlmMock).toHaveBeenCalledWith("u1");
  });

  it("flag 关闭（NEXT_PUBLIC_DREAM_ENABLED≠1）→ 404", async () => {
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "0");
    const res = await POST(req({ chart: CHART, dream: "我梦见坠落" }));
    expect(res.status).toBe(404);
    expect(interpretDreamSpy).not.toHaveBeenCalled();
  });

  it("生成抛错 → 500", async () => {
    interpretDreamSpy.mockImplementationOnce(async function* () {
      throw new Error("llm down");
    });
    const res = await POST(req({ chart: CHART, dream: "我梦见坠落" }));
    expect(res.status).toBe(500);
  });
});

describe("EP-dream-history 追问：followUp/priorTurns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUidMock.mockResolvedValue("u1");
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1");
    resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: true });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("带 followUp → 走 continueDreamReply（不走 interpretDream），priorTurns 原样透传（最多 12 条）", async () => {
    const priorTurns = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 === 0 ? "spirit" : "user", content: `t${i}` }));
    const res = await POST(
      req({ chart: CHART, dream: "我梦见坠落", followUp: "还有别的解读吗？", priorTurns }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("追问的解读");
    expect(interpretDreamSpy).not.toHaveBeenCalled();
    expect(continueDreamReplySpy).toHaveBeenCalledWith(
      CHART,
      "我梦见坠落",
      priorTurns,
      "还有别的解读吗？",
      expect.objectContaining({ language: "zh" }),
    );
  });

  it("followUp 超长 → 400，不调用任何生成函数", async () => {
    const res = await POST(req({ chart: CHART, dream: "我梦见坠落", followUp: "x".repeat(2001) }));
    expect(res.status).toBe(400);
    expect(interpretDreamSpy).not.toHaveBeenCalled();
    expect(continueDreamReplySpy).not.toHaveBeenCalled();
  });

  it("EP-dream-history-2 续接历史：不带 dream，只带 followUp+priorTurns → continueDreamReply 收到 dreamText=undefined", async () => {
    const priorTurns = [{ role: "spirit", content: "这个梦在处理坠落感（历史里存的解读全文）。" }];
    const res = await POST(req({ chart: CHART, followUp: "会不会跟换工作有关？", priorTurns }));
    expect(res.status).toBe(200);
    expect(continueDreamReplySpy).toHaveBeenCalledWith(
      CHART,
      undefined,
      priorTurns,
      "会不会跟换工作有关？",
      expect.objectContaining({ language: "zh" }),
    );
  });

  it("不带 dream、也不带 followUp → 400（首次解读必须有梦原文）", async () => {
    const res = await POST(req({ chart: CHART }));
    expect(res.status).toBe(400);
    expect(interpretDreamSpy).not.toHaveBeenCalled();
    expect(continueDreamReplySpy).not.toHaveBeenCalled();
  });
});

describe("EP-account2-05：/api/spirit/dream 同一处闸门漏洞", () => {
  // 身份只取会话：带 Bearer 头但无会话 cookie 仍是 401（头不再被采信）。
  beforeEach(() => {
    vi.clearAllMocks();
    getUidMock.mockResolvedValue("u1");
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1");
    resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: true });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("无会话（getUid 为 null）→ 401，不调用 interpretDream、不消耗额度（此前 if(userId) 会静默放行）", async () => {
    getUidMock.mockResolvedValue(null);
    const res = await POST(req({ chart: { fake: true }, dream: "我梦见坠落" }));
    expect(res.status).toBe(401);
    expect(interpretDreamSpy).not.toHaveBeenCalled();
    expect(consumeLlmMock).not.toHaveBeenCalled();
  });

  it("只带 Authorization 头、无会话 → 401（头不再被采信）", async () => {
    getUidMock.mockResolvedValue(null);
    const r = new Request("http://x/api/spirit/dream", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer tok" },
      body: JSON.stringify({ chart: CHART, dream: "我梦见坠落" }),
    });
    expect((await POST(r)).status).toBe(401);
    expect(consumeLlmMock).not.toHaveBeenCalled();
  });

  it("有会话 uid 但 resolveAccess 判定 anonymous → 401", async () => {
    resolveAccessMock.mockResolvedValue({ level: "anonymous", hasVerifiedEmail: false });
    const res = await POST(req({ chart: { fake: true }, dream: "我梦见坠落" }));
    expect(res.status).toBe(401);
    expect(interpretDreamSpy).not.toHaveBeenCalled();
  });
});

describe("入参限长与 role 校验（review #6）：先于鉴权/计量，非法 → 400 且不扣额度", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUidMock.mockResolvedValue("u1");
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1");
    resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: true });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const base = { chart: CHART, dream: "我梦见坠落", followUp: "还有别的解读吗？" };
  const turn = (i: number) => ({ role: i % 2 === 0 ? "spirit" : "user", content: `t${i}` });

  async function expect400(body: unknown) {
    const res = await POST(req(body));
    expect(res.status).toBe(400);
    expect(consumeLlmMock).not.toHaveBeenCalled();
    expect(getUidMock).not.toHaveBeenCalled();
    expect(interpretDreamSpy).not.toHaveBeenCalled();
    expect(continueDreamReplySpy).not.toHaveBeenCalled();
  }

  it("单条 turn 8001 字符 → 400", async () => {
    await expect400({ ...base, priorTurns: [{ role: "spirit", content: "x".repeat(8001) }] });
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
  it("questionnaire 超 2000 → 400（首次解读同样校验）", async () => {
    await expect400({ chart: CHART, dream: "我梦见坠落", questionnaire: "q".repeat(SPIRIT_QUESTIONNAIRE_MAX_CHARS + 1) });
  });
  it("priorTurns 不是数组 → 400", async () => {
    await expect400({ ...base, priorTurns: "oops" });
  });

  it("恰好在边界：12 条、content 8000、memory 2000、questionnaire 2000 → 200 并原样透传", async () => {
    const priorTurns = Array.from({ length: SPIRIT_MAX_TURNS }, (_, i) => ({ ...turn(i), content: "x".repeat(8000) }));
    const memory = "m".repeat(SPIRIT_MEMORY_MAX_CHARS);
    const questionnaire = "q".repeat(SPIRIT_QUESTIONNAIRE_MAX_CHARS);
    const res = await POST(req({ ...base, priorTurns, memory, questionnaire }));
    expect(res.status).toBe(200);
    expect(continueDreamReplySpy).toHaveBeenCalledWith(
      CHART,
      "我梦见坠落",
      priorTurns,
      "还有别的解读吗？",
      expect.objectContaining({ memory, questionnaire }),
    );
    expect(consumeLlmMock).toHaveBeenCalledWith("u1");
  });
});
