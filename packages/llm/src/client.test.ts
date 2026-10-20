import { describe, it, expect, vi, afterEach } from "vitest";
import { chatStream } from "./client";
import type { LlmConfig } from "./provider";

/**
 * 最终评审 I1：chatStream 不得把上游失败吞成「正常结束」。
 * - 上游中途 error 事件（anthropic `type:"error"`，如 529 overloaded；openai `{error}` 块）→ throw
 * - 流结束却没见到终止符（message_stop / [DONE] / 非空 finish_reason）→ throw
 * - failOnTruncation 打开时，stop_reason=max_tokens / finish_reason=length → throw
 */
const anthropic: LlmConfig = { provider: "minimax", wire: "anthropic", baseUrl: "https://x/anthropic", model: "MiniMax-M3", apiKey: "k", supportsJsonSchema: false };
const openai: LlmConfig = { provider: "deepseek", wire: "openai", baseUrl: "https://x/v1", model: "deepseek-chat", apiKey: "k", supportsJsonSchema: true };

function sse(lines: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const l of lines) c.enqueue(enc.encode(l));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}
const a = (obj: unknown) => `event: x\ndata: ${JSON.stringify(obj)}\n\n`;
const o = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
const aText = (t: string) => a({ type: "content_block_delta", delta: { type: "text_delta", text: t } });
const oText = (t: string, finish: string | null = null) => o({ choices: [{ delta: { content: t }, finish_reason: finish }] });

async function drain(cfg: LlmConfig, lines: string[], opts = {}): Promise<string> {
  vi.stubGlobal("fetch", vi.fn(async () => sse(lines)));
  let acc = "";
  for await (const c of chatStream(cfg, [{ role: "user", content: "hi" }], opts)) acc += c;
  return acc;
}

afterEach(() => vi.unstubAllGlobals());

describe("chatStream · anthropic 线", () => {
  it("正常流（message_delta end_turn + message_stop）→ 不抛，原样拼接", async () => {
    const out = await drain(anthropic, [aText("he"), aText("llo"), a({ type: "message_delta", delta: { stop_reason: "end_turn" } }), a({ type: "message_stop" })], { failOnTruncation: true });
    expect(out).toBe("hello");
  });

  it("流结束但没有 message_stop → 抛错（函数被杀/连接断）", async () => {
    await expect(drain(anthropic, [aText("half a read")])).rejects.toThrow(/terminat|ended/i);
  });

  it("中途 error 事件（529 overloaded）→ 抛错，即使后面还有 message_stop", async () => {
    await expect(
      drain(anthropic, [aText("x"), `event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } })}\n\n`, a({ type: "message_stop" })]),
    ).rejects.toThrow(/Overloaded/);
  });

  it("stop_reason=max_tokens + failOnTruncation → 抛错", async () => {
    await expect(
      drain(anthropic, [aText("x"), a({ type: "message_delta", delta: { stop_reason: "max_tokens" } }), a({ type: "message_stop" })], { failOnTruncation: true }),
    ).rejects.toThrow(/max_tokens|truncat/i);
  });

  it("stop_reason=max_tokens 但未开 failOnTruncation（解梦/掷筊/聊天按设计撞小上限）→ 不抛", async () => {
    const out = await drain(anthropic, [aText("x"), a({ type: "message_delta", delta: { stop_reason: "max_tokens" } }), a({ type: "message_stop" })]);
    expect(out).toBe("x");
  });
});

describe("chatStream · openai 线", () => {
  it("正常流（finish_reason=stop + [DONE]）→ 不抛", async () => {
    const out = await drain(openai, [oText("he"), oText("llo", "stop"), "data: [DONE]\n\n"], { failOnTruncation: true });
    expect(out).toBe("hello");
  });

  it("只有非空 finish_reason、没有 [DONE] 也算正常终止", async () => {
    expect(await drain(openai, [oText("he"), oText("llo", "stop")])).toBe("hello");
  });

  it("流结束但没有 [DONE] / finish_reason → 抛错", async () => {
    await expect(drain(openai, [oText("half")])).rejects.toThrow(/terminat|ended/i);
  });

  it("{error} 块 → 抛错", async () => {
    await expect(drain(openai, [oText("x"), o({ error: { message: "upstream exploded" } }), "data: [DONE]\n\n"])).rejects.toThrow(/upstream exploded/);
  });

  it("finish_reason=length + failOnTruncation → 抛错", async () => {
    await expect(drain(openai, [oText("x", "length"), "data: [DONE]\n\n"], { failOnTruncation: true })).rejects.toThrow(/length|truncat/i);
  });

  it("finish_reason=length 未开 failOnTruncation → 不抛", async () => {
    expect(await drain(openai, [oText("x", "length"), "data: [DONE]\n\n"])).toBe("x");
  });
});
