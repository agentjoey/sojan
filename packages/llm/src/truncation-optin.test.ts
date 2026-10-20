import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeUnifiedChart, BirthInputSchema } from "@sojan/core";
import type { LlmConfig } from "./provider";

/**
 * 最终评审 I1(c)：截断即失败（failOnTruncation）只给整篇解读开。
 * 解梦/掷筊/灵聊天的 maxTokens 是刻意压的小上限，撞上属预期，不能因此整轮报错。
 */
const streamSpy = vi.fn(async function* () {
  yield "## a\nok\n";
});
vi.mock("./client", () => ({
  chat: vi.fn(),
  chatStream: (...a: unknown[]) => streamSpy(...(a as [])),
}));

const { streamReading } = await import("./reading");
const { generateDreamReply, continueDreamReply } = await import("./dream");
const { generateJiaoReply, continueJiaoReply } = await import("./jiao");
const { streamSpiritChat } = await import("./spirit");

const chart = computeUnifiedChart(
  BirthInputSchema.parse({ date: "1991-03-15", time: "14:30", gender: "male", latitude: 31.23, longitude: 121.47 }),
);
const config = { provider: "minimax", wire: "anthropic", baseUrl: "https://x/anthropic", model: "MiniMax-M3", apiKey: "sk-test", supportsJsonSchema: false } as LlmConfig;

const lastOpts = () => (streamSpy.mock.calls.at(-1) as unknown as [unknown, unknown, { failOnTruncation?: boolean }])[2];
const drain = async (g: AsyncGenerator<string>) => {
  for await (const _ of g) {
    // 排空
  }
};

beforeEach(() => streamSpy.mockClear());

describe("failOnTruncation 只在整篇解读打开", () => {
  it("streamReading → failOnTruncation: true", async () => {
    await drain(streamReading(chart, { language: "zh", config }));
    expect(lastOpts().failOnTruncation).toBe(true);
  });

  it("解梦 / 掷筊 / 灵聊天 → 不开", async () => {
    await generateDreamReply(chart, "梦见水", { language: "zh", config });
    expect(lastOpts().failOnTruncation).toBeFalsy();
    await continueDreamReply(chart, "梦见水", [], "再说说", { language: "zh", config });
    expect(lastOpts().failOnTruncation).toBeFalsy();
    await generateJiaoReply(chart, "该不该搬家", "圣筊", { language: "zh", config });
    expect(lastOpts().failOnTruncation).toBeFalsy();
    await continueJiaoReply(chart, undefined, [{ role: "spirit", content: "上一轮" }], "再问一句", { language: "zh", config });
    expect(lastOpts().failOnTruncation).toBeFalsy();
    await drain(streamSpiritChat(chart, [{ role: "user", content: "你好" }], { language: "zh", config }));
    expect(lastOpts().failOnTruncation).toBeFalsy();
  });
});
