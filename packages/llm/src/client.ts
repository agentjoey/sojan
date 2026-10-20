import type { LlmConfig } from "./provider";
import { withRetry, isRetryableError } from "./retry";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type ChatOptions = {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /**
   * 流式专用：上游以 max_tokens(anthropic) / length(openai) 停止时抛错。
   * 只给整篇解读（streamReading）开——解梦/掷筊/灵聊天的小上限是刻意的，撞上属预期。
   */
  failOnTruncation?: boolean;
};

const ANTHROPIC_VERSION = "2023-06-01";

function endpoint(cfg: LlmConfig): string {
  const base = cfg.baseUrl.replace(/\/$/, "");
  return cfg.wire === "anthropic" ? `${base}/v1/messages` : `${base}/chat/completions`;
}

function headers(cfg: LlmConfig): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` };
  if (cfg.wire === "anthropic") h["anthropic-version"] = ANTHROPIC_VERSION;
  return h;
}

/** Anthropic 把 system 提到顶层，messages 仅 user/assistant。 */
function splitForAnthropic(messages: ChatMessage[]): { system: string; messages: { role: "user" | "assistant"; content: string }[] } {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  return { system, messages: rest };
}

function body(cfg: LlmConfig, messages: ChatMessage[], opts: ChatOptions, stream: boolean): string {
  const temperature = opts.temperature ?? 0.6;
  const max_tokens = opts.maxTokens ?? 4096;
  if (cfg.wire === "anthropic") {
    const { system, messages: msgs } = splitForAnthropic(messages);
    // EP-511：冻结 system 作 cache_control 块（MiniMax-M3 支持，命中走 cache_read）
    const sys = cfg.cache !== false && system
      ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
      : system;
    const body: Record<string, unknown> = { model: cfg.model, system: sys, messages: msgs, max_tokens, temperature, stream };
    if (cfg.thinking) body.thinking = { type: cfg.thinking };
    return JSON.stringify(body);
  }
  return JSON.stringify({ model: cfg.model, messages, temperature, max_tokens, stream });
}

const TIMEOUT_MS = 60_000;

async function post(cfg: LlmConfig, messages: ChatMessage[], opts: ChatOptions, stream: boolean): Promise<Response> {
  const payload = body(cfg, messages, opts, stream);
  return withRetry(
    async () => {
      // 超时仅对非流式生效（流式 abort 会中断 body 读取）
      const signals = [opts.signal, stream ? undefined : AbortSignal.timeout(TIMEOUT_MS)].filter(Boolean) as AbortSignal[];
      const signal = signals.length ? AbortSignal.any(signals) : undefined;
      const res = await fetch(endpoint(cfg), { method: "POST", headers: headers(cfg), signal, body: payload });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw Object.assign(new Error(`LLM ${cfg.provider}/${cfg.wire} HTTP ${res.status}: ${text}`), { status: res.status });
      }
      return res;
    },
    // 调用方主动取消则不重试；否则按 5xx/429/网络错误重试
    { retryable: (e) => !opts.signal?.aborted && isRetryableError(e) },
  );
}

// ── 非流式 ───────────────────────────────────────────────
export async function chat(cfg: LlmConfig, messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const res = await post(cfg, messages, opts, false);
  const data = (await res.json()) as Record<string, unknown>;
  if (cfg.wire === "anthropic") {
    const err = data.error as { message?: string } | undefined;
    if (err) throw new Error(`LLM ${cfg.provider} error: ${err.message}`);
    const content = (data.content as { type?: string; text?: string }[] | undefined) ?? [];
    const text = content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    if (!text) throw new Error(`LLM ${cfg.provider}: empty response`);
    return text;
  }
  const base = data.base_resp as { status_code?: number; status_msg?: string } | undefined;
  if (base?.status_code) throw new Error(`LLM ${cfg.provider} error ${base.status_code}: ${base.status_msg}`);
  const choices = data.choices as { message?: { content?: string } }[] | undefined;
  const content = choices?.[0]?.message?.content;
  if (!content) throw new Error(`LLM ${cfg.provider}: empty response`);
  return content;
}

// ── 流式 ─────────────────────────────────────────────────
/**
 * 上游失败一律抛错，不吞成「正常结束」（最终评审 I1）：
 * - error 事件（anthropic `type:"error"`，如 529 overloaded；openai `{error}` 块）→ 抛
 * - 流结束却没见到终止符（message_stop / [DONE] / 非空 finish_reason）→ 抛
 * - failOnTruncation 且 stop_reason=max_tokens / finish_reason=length → 抛
 * 重试（withRetry）只包初次 fetch+状态码；流一旦开始产出，中途失败不重试（否则会重复已吐出的文本）。
 */
export async function* chatStream(cfg: LlmConfig, messages: ChatMessage[], opts: ChatOptions = {}): AsyncGenerator<string, void, unknown> {
  const res = await post(cfg, messages, opts, true);
  if (!res.body) throw new Error(`LLM ${cfg.provider}: no response body`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const tag = `LLM ${cfg.provider}/${cfg.wire}`;
  let buffer = "";
  let terminated = false; // 见到终止符（message_stop / [DONE] / 非空 finish_reason）
  let stopped = false; // 见到硬终止（message_stop / [DONE]），不再读
  let stopReason: string | null = null;

  try {
    while (!stopped) {
      const { done, value } = await reader.read();
      if (done) {
        if (!buffer.trim()) break;
        buffer += "\n"; // 末行没换行（如结尾 `data: [DONE]`）也要处理
      } else {
        buffer += decoder.decode(value, { stream: true });
      }
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue; // 忽略 anthropic 的 `event:` 行
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") {
          // openai 终止
          terminated = stopped = true;
          break;
        }
        let json: Record<string, any>;
        try {
          json = JSON.parse(payload) as Record<string, any>;
        } catch {
          continue; // 跨块截断的 JSON 留待下轮
        }
        // ⚠️ 以下 throw 必须在 JSON.parse 的 try/catch 之外，否则会被当作坏块吞掉
        if (cfg.wire === "anthropic") {
          if (json.type === "error") throw new Error(`${tag} stream error: ${json.error?.message ?? JSON.stringify(json.error ?? json)}`);
          if (json.type === "message_delta" && json.delta?.stop_reason) stopReason = json.delta.stop_reason as string;
          if (json.type === "message_stop") {
            terminated = stopped = true;
            break;
          }
          if (json.type === "content_block_delta" && json.delta?.type === "text_delta" && json.delta.text) {
            yield json.delta.text as string;
          }
        } else {
          if (json.error) throw new Error(`${tag} stream error: ${json.error?.message ?? JSON.stringify(json.error)}`);
          const choice = json.choices?.[0];
          const delta = choice?.delta?.content;
          if (delta) yield delta as string;
          if (choice?.finish_reason) {
            stopReason = choice.finish_reason as string;
            terminated = true; // 继续读到 [DONE]/流结束，以便捕获之后的 error 块
          }
        }
      }
      if (done) break;
    }
  } finally {
    // 正常结束、抛错、或消费方提前 return 都释放上游连接
    await reader.cancel().catch(() => {});
  }
  if (!terminated) throw new Error(`${tag}: stream ended without a terminator (upstream cut off)`);
  if (opts.failOnTruncation && (stopReason === "max_tokens" || stopReason === "length")) {
    throw new Error(`${tag}: output truncated (stop reason ${stopReason})`);
  }
}
