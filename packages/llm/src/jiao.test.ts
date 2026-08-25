import { describe, it, expect, vi } from "vitest";
import type { LlmConfig } from "./provider";

const streamSpy = vi.fn(async function* () {
  yield "这一掷是圣筊。注意你看到它时最初的那一下反应。";
});
const chatSpy = vi.fn(async () => "一个关于职业选择的问卦");
vi.mock("./client", () => ({
  chat: (...a: unknown[]) => chatSpy(...(a as [])),
  chatStream: (...a: unknown[]) => streamSpy(...(a as [])),
}));

const { correctOmen, generateJiaoReply, continueJiaoReply, JIAO_MAX_CHARS } = await import("./jiao");
const { computeUnifiedChart, BirthInputSchema } = await import("@sojan/core");

const chart = computeUnifiedChart(
  BirthInputSchema.parse({ date: "1991-03-15", time: "14:30", gender: "male", trueSolarTime: false }),
);
const config = { provider: "minimax", wire: "anthropic", baseUrl: "https://x/anthropic", model: "MiniMax-M3", apiKey: "sk-test", supportsJsonSchema: false } as LlmConfig;

describe("correctOmen：筊象是既成事实，模型不得改写", () => {
  it("模型写错筊象 → 替换成实际筊象（不是删除——删了会切坏句子）", () => {
    const r = correctOmen("你掷出了圣筊，这说明……", "阴筊");
    expect(r.text).toBe("你掷出了阴筊，这说明……");
    expect(r.fixed).toEqual(["圣筊"]);
  });

  it("模型写对了 → 原样不动，fixed 为空", () => {
    const r = correctOmen("你掷出了阴筊。", "阴筊");
    expect(r.text).toBe("你掷出了阴筊。");
    expect(r.fixed).toEqual([]);
  });

  // 最终评审 I3：这条此前把机械替换后的病句形状（"先是阴筊，后来又是阴筊。"）
  // 当成了「正确」的期望值——但那本身就是自相矛盾的句子，还凭空断言了「阴筊=允」，
  // 反幻觉链自己制造了幻觉。correctOmen 是无条件全量替换、天生不管上下文是否
  // 通顺，这一层「不产生病句」的责任移交给了 prompt 硬规则（JIAO_RULES_*：
  // 只允许提到被告知的那一个筊象名，不得提另外两个）——一旦模型真的遵守规则，
  // 输出里根本不会出现另外两个筊象名，correctOmen 也就没有东西可替换。
  // 这里只断言这道机械安全网本身的行为（替换、不删除、fixed 记录了哪些被替换），
  // 不再断言替换后的具体病句形状是「期望产出」。
  it("一段里混着两个错筊象 → 全部替换成实际的（不断言替换后的病句形状，只断言安全网属性）", () => {
    const r = correctOmen("先是笑筊，后来又是圣筊。", "阴筊");
    expect(r.text).not.toContain("笑筊");
    expect(r.text).not.toContain("圣筊");
    expect(r.text).toContain("阴筊");
    expect(r.fixed.sort()).toEqual(["圣筊", "笑筊"]);
  });

  it("文本里没提任何筊象 → 不动（不强行插入）", () => {
    const r = correctOmen("你可以先把这件事拆成两个问题。", "圣筊");
    expect(r.text).toBe("你可以先把这件事拆成两个问题。");
    expect(r.fixed).toEqual([]);
  });
});

describe("generateJiaoReply", () => {
  it("筊象作为既成事实进 prompt——user 消息里必须出现实际筊象名", async () => {
    streamSpy.mockClear();
    await generateJiaoReply(chart, "该不该接这个offer", "阴筊", { language: "zh", config });
    const [, messages] = streamSpy.mock.calls.at(-1) as unknown as [unknown, { role: string; content: string }[]];
    expect(messages[1]!.content).toContain("阴筊");
    expect(messages[1]!.content).toContain("该不该接这个offer");
  });

  it("system 里含掷筊硬规则（不给方向性结论）", async () => {
    streamSpy.mockClear();
    await generateJiaoReply(chart, "该不该搬家", "圣筊", { language: "zh", config });
    const [, messages] = streamSpy.mock.calls.at(-1) as unknown as [unknown, { role: string; content: string }[]];
    expect(messages[0]!.content).toContain("不给方向性结论");
  });

  // 最终评审 I1：灵的人格底座（buildSpiritSystemPrompt）里「正面回答，先给立场」
  // 与掷筊规则「绝不给方向性结论」在同一个 system prompt 里正面冲突——底座在前、
  // 拼在后面的掷筊规则若不显式声明覆盖关系，两条指令谁赢并不确定。这里钉住：
  // 覆盖声明真的拼进了 system，且确实出现在「绝不给方向性结论」这条规则之前
  // （顺序本身也是覆盖生效的一部分——模型读到冲突点之前就先看到了「以下为准」）。
  it("system 显式声明掷筊规则覆盖人格底座的「正面回答，先给立场」（I1）", async () => {
    streamSpy.mockClear();
    await generateJiaoReply(chart, "该不该搬家", "圣筊", { language: "zh", config });
    const [, messages] = streamSpy.mock.calls.at(-1) as unknown as [unknown, { role: string; content: string }[]];
    const system = messages[0]!.content;
    expect(system).toContain("正面回答，先给立场"); // 底座原句仍在（不改 spirit.ts）
    expect(system).toContain("本节规则覆盖"); // 掷筊规则显式声明覆盖关系
    const overrideIdx = system.indexOf("本节规则覆盖");
    const banIdx = system.indexOf("绝不给方向性结论");
    expect(overrideIdx).toBeGreaterThan(-1);
    expect(banIdx).toBeGreaterThan(overrideIdx); // 覆盖声明在冲突规则之前，不是事后追加
  });

  // 最终评审 I3：correctOmen 是无条件全量替换，模型若在一句话里同时提另外两个
  // 筊象名（哪怕是做对比），替换后必然是自相矛盾的病句。这里钉住 prompt 层面的
  // 根治：硬规则要求只提被告知的那一个筊象名，不得提另外两个——前提假设成立了，
  // correctOmen 的机械替换才不会有病句可制造。
  it("system 硬规则要求只提被告知的那一个筊象名，不得提另外两个（I3）", async () => {
    streamSpy.mockClear();
    await generateJiaoReply(chart, "该不该搬家", "圣筊", { language: "zh", config });
    const [, messages] = streamSpy.mock.calls.at(-1) as unknown as [unknown, { role: string; content: string }[]];
    expect(messages[0]!.content).toContain("只能出现你被告知的那一个筊象名");
  });

  // UAT③修复：①拍此前只要求「点出筊象」，模型可以点完名字就转去讲一段与筊象
  // 语义无关的泛泛反思。改为要求①拍同时带出筊象的传统含义、②拍必须扣着这个具体
  // 含义展开（换成另一个筊象就说不通），而不是任何筊象都能套用的模板句。
  it("system 规则要求①拍复述筊象并带出传统含义、②拍扣紧这一具体筊象（不是套话）", async () => {
    streamSpy.mockClear();
    await generateJiaoReply(chart, "该不该搬家", "圣筊", { language: "zh", config });
    const [, messages] = streamSpy.mock.calls.at(-1) as unknown as [unknown, { role: string; content: string }[]];
    expect(messages[0]!.content).toContain("开口先复述掷出的是什么筊象");
    expect(messages[0]!.content).toContain("圣筊=允，阴筊=不允，笑筊=神明发笑、问得不清楚");
    expect(messages[0]!.content).toContain("换成另一个筊象就说不通");
  });

  it("模型输出的筊象与实际不符 → 被后置校验纠正，并记进 fixedOmens", async () => {
    streamSpy.mockClear();
    streamSpy.mockImplementationOnce(async function* () {
      yield "你掷出了圣筊。留意你此刻的反应。";
    });
    const r = await generateJiaoReply(chart, "该不该辞职", "阴筊", { language: "zh", config });
    expect(r.text).toContain("阴筊");
    expect(r.text).not.toContain("圣筊");
    expect(r.fixedOmens).toEqual(["圣筊"]);
  });

  it("exhausted（三次笑筊）走另一套规则：拆解问题本身，不解筊象", async () => {
    streamSpy.mockClear();
    await generateJiaoReply(chart, "我该怎么办", "笑筊", { language: "zh", config, exhausted: true });
    const [, messages] = streamSpy.mock.calls.at(-1) as unknown as [unknown, { role: string; content: string }[]];
    expect(messages[0]!.content).toContain("拆解");
    // I1/I3 同样要在 exhausted 分支生效——它复用同一份人格底座，同样会拼出
    // 「正面回答，先给立场」，同样需要覆盖声明；后续追问也可能提到「笑筊」以外
    // 的筊象名，同样需要「只提这一个」的硬规则兜底。
    expect(messages[0]!.content).toContain("本节同样覆盖");
    expect(messages[0]!.content).toContain("只可能提到「笑筊」这一个筊象名");
  });

  it("问题为空 → 抛错，不进 LLM", async () => {
    streamSpy.mockClear();
    await expect(generateJiaoReply(chart, "   ", "圣筊", { language: "zh", config })).rejects.toThrow();
    expect(streamSpy).not.toHaveBeenCalled();
  });

  it("问题超长 → 抛错，不进 LLM", async () => {
    streamSpy.mockClear();
    await expect(
      generateJiaoReply(chart, "长".repeat(JIAO_MAX_CHARS + 1), "圣筊", { language: "zh", config }),
    ).rejects.toThrow();
    expect(streamSpy).not.toHaveBeenCalled();
  });
});

describe("continueJiaoReply：续接历史（question=undefined）", () => {
  it("传了问题原文却没传筊象 → 抛错，不进 LLM（不许凭空编一个筊象喂给模型）", async () => {
    streamSpy.mockClear();
    await expect(
      continueJiaoReply(chart, "该不该辞职", [{ role: "spirit", content: "上一轮回应" }], "再问一句", { language: "zh", config }),
    ).rejects.toThrow();
    expect(streamSpy).not.toHaveBeenCalled();
  });

  it("传了问题原文且带上筊象 → 正常进 LLM，首轮 user 消息里是那个筊象", async () => {
    streamSpy.mockClear();
    await continueJiaoReply(chart, "该不该辞职", [{ role: "spirit", content: "上一轮回应" }], "再问一句", {
      language: "zh",
      config,
      omenForFollowUp: "阴筊",
    });
    const [, messages] = streamSpy.mock.calls.at(-1) as unknown as [unknown, { role: string; content: string }[]];
    expect(messages[1]!.content).toContain("阴筊");
    expect(messages[1]!.content).not.toContain("圣筊");
  });

  it("priorTurns 为空且无问题原文 → 抛错，不进 LLM", async () => {
    streamSpy.mockClear();
    await expect(
      continueJiaoReply(chart, undefined, [], "还有别的角度吗", { language: "zh", config }),
    ).rejects.toThrow();
    expect(streamSpy).not.toHaveBeenCalled();
  });

  it("不重建首轮 user 消息——system 之后直接是历史解读（assistant），命盘事实并进 system", async () => {
    streamSpy.mockClear();
    streamSpy.mockImplementationOnce(async function* () {
      yield "那份犹豫本身也是答案的一部分。";
    });
    const prior = [{ role: "spirit" as const, content: "这一掷是阴筊。你当时松了口气还是失望？" }];
    await continueJiaoReply(chart, undefined, prior, "我好像松了口气", { language: "zh", config });
    const [, messages] = streamSpy.mock.calls.at(-1) as unknown as [unknown, { role: string; content: string }[]];
    expect(messages[0]!.content).toContain("命盘事实");
    expect(messages[1]).toEqual({ role: "assistant", content: prior[0]!.content });
    expect(messages[2]).toEqual({ role: "user", content: "我好像松了口气" });
    expect(messages.length).toBe(3);
  });
});
