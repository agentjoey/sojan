# EP-jiao 掷筊问事 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **给人工开发者（kimi）的说明**：本计划的开发方是没有参与过设计讨论的外部实施者，完成后交回 claude（原会话）验收。请严格按任务顺序实施；每个任务自带失败测试→实现→通过→提交的完整循环，不要跳步骤，也不要在任务范围外顺手改动其它文件。
>
> **仓库刚改过名**：本地目录是 `~/Playground/codespace/sojan`，包名是 `@sojan/core` / `@sojan/llm` / `@sojan/web`。所有 import 与命令都用新名。

**Goal:** 把「灵」的主入口 `/spirit` 从「随便聊」收缩为「先对一件具体的事掷筊」，掷完由灵结合命盘把筊象当心理投射面引导反思，之后可自由追问；最近 10 次问卦可回看并续追问。

**Architecture:** 分四层。① `@sojan/core` 加纯函数层（筊象判定 + 三掷规则，零随机、可单测）；② `apps/web/lib/jiao.ts` 持有唯一的真随机点（`crypto.getRandomValues`，架构例外）；③ `@sojan/llm` 加 `jiao.ts`（prompt + 后置筊象校验），结构照抄 `dream.ts`；④ web 层 `/spirit` 加掷筊闸门 + `SpiritPanel` 加一个 `seedTurns` prop 承接对话开场。历史表 `jiao_history` 照抄 `dream_history`。

**Tech Stack:** Next.js 16 App Router + React 19 + Tailwind 4 + TypeScript；Vitest + `@testing-library/react`（jsdom）；Supabase（RLS）。动画纯 CSS（**本仓零动画库，不要引入任何动画依赖**）。

## Global Constraints

- **筊象三词闭集**：`"圣筊" | "笑筊" | "阴筊"`。类型定义只有一处（`packages/core/src/jiao/index.ts`），llm 与 web 都从 `@sojan/core` import，不得各自重新声明字面量联合。
- **真随机只允许出现在 `apps/web/lib/jiao.ts` 一个文件里**，且必须用 `crypto.getRandomValues`（不是 `Math.random`）。该文件必须带注释说明这是「全仓零随机原则」的显式例外（原文见 Task 2）。`packages/core` 与 `packages/llm` 里**不得出现任何随机**。
- **灵的人格层不可删**：`buildSpiritSystemPrompt`（`packages/llm/src/spirit.ts:38`）是解梦的 system prompt 底座（`packages/llm/src/dream.ts:103` 直接拼它），`deriveSpirit` 还被 TG 分享卡（`api/tg/card/route.ts:164`）和 `SpiritSigil` 消费。本次只改灵自己的**对话 UI 与入口语义**，不动人格层。
- **不存问题原文**：`jiao_history` 只存 `omen` + `summary`（第三人称摘要）+ `full_text`（灵的回复全文）。与解梦「梦原文不落库」同一条红线。
- **复用现有 flag `NEXT_PUBLIC_SPIRIT_ENABLED`**，不新建 flag（这是收缩现有功能，不是全新功能）。
- **i18n 键必须 zh/en 同步新增**：`apps/web/lib/i18n/messages/{zh,en}.ts` 有键路径结构一致性测试（在 `apps/web/components/__tests__/AppShell.test.tsx`），任一侧缺键即红。英文侧**文案质量**不在本次范围（spec 明确「英文侧不做」），但**键必须齐全**。
- **新增 localStorage 键一律用 `sojan.` 前缀**。（既有的 `zhaojian.` 前缀是为兼容存量用户数据刻意保留的，见 `apps/web/app/calendar/page.tsx` 注释；新键不存在这个包袱。）
- **动画结果揭晓必须挂 `onAnimationEnd`，不得用 `setTimeout` 计时**。理由：`globals.css:141-149` 的全局 `prefers-reduced-motion` 把 `animation-duration` 压到 `0.001ms !important`，`animationend` 会立刻触发 → 无障碍降级天然成立；用 `setTimeout` 则必须额外判 `matchMedia`，多一条会漏测的分支。
- **验收标准**：`pnpm --filter @sojan/web test` / `@sojan/core` / `@sojan/llm` 全绿；`pnpm run typecheck` 不得**新增**类型错误（`apps/web` 已有 7 处既存无关错误，见 BACKLOG `EP-web-typecheck-debt`）；迁移文件写好但**不要 apply 生产**（按本仓惯例，apply 需 owner 显式确认）。

---

### Task 1: `@sojan/core` 筊象纯函数层

**Files:**
- Create: `packages/core/src/jiao/index.ts`
- Modify: `packages/core/src/index.ts`（加导出）
- Test: `packages/core/test/jiao.test.ts`

**Interfaces:**
- Consumes: 无前置依赖。
- Produces: `type Omen = "圣筊" | "笑筊" | "阴筊"`；`type BlockFace = "仰" | "俯"`；`omenOf(blocks: [BlockFace, BlockFace]): Omen`；`type JiaoPhase`；`phaseAfter(throws: Omen[]): JiaoPhase`；`const MAX_THROWS = 3`。Task 2/3/4/6 全部消费这些。

#### Step 1: 写失败测试

创建 `packages/core/test/jiao.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { omenOf, phaseAfter, MAX_THROWS, type Omen } from "../src/jiao";

describe("omenOf：两枚筊的正反组合 → 筊象", () => {
  it("一俯一仰 = 圣筊（允）", () => {
    expect(omenOf(["仰", "俯"])).toBe("圣筊");
    expect(omenOf(["俯", "仰"])).toBe("圣筊");
  });
  it("双仰 = 笑筊（问得不清楚）", () => {
    expect(omenOf(["仰", "仰"])).toBe("笑筊");
  });
  it("双俯 = 阴筊（不允）", () => {
    expect(omenOf(["俯", "俯"])).toBe("阴筊");
  });
});

describe("phaseAfter：三掷规则", () => {
  it("圣筊落定，不可重掷", () => {
    expect(phaseAfter(["圣筊"])).toEqual({ kind: "settled", omen: "圣筊" });
  });
  it("阴筊同样落定（不允也是答复，不是重问的理由）", () => {
    expect(phaseAfter(["阴筊"])).toEqual({ kind: "settled", omen: "阴筊" });
  });
  it("笑筊未到上限 → 可重掷", () => {
    expect(phaseAfter(["笑筊"])).toEqual({ kind: "rethrow" });
    expect(phaseAfter(["笑筊", "笑筊"])).toEqual({ kind: "rethrow" });
  });
  it("第三次仍笑筊 → exhausted（改为拆解问题本身，不再解筊象）", () => {
    expect(phaseAfter(["笑筊", "笑筊", "笑筊"])).toEqual({ kind: "exhausted" });
  });
  it("笑筊之后掷出圣筊 → 仍是落定（只看最后一掷）", () => {
    expect(phaseAfter(["笑筊", "圣筊"])).toEqual({ kind: "settled", omen: "圣筊" });
  });
  it("空数组 → 抛错（尚未掷筊，调用方不该问 phase）", () => {
    expect(() => phaseAfter([])).toThrow();
  });
  it("MAX_THROWS 是 3", () => {
    expect(MAX_THROWS).toBe(3);
  });
});

describe("类型闭集不变量", () => {
  it("三个筊象名互不相同、且恰好三个", () => {
    const all: Omen[] = ["圣筊", "笑筊", "阴筊"];
    expect(new Set(all).size).toBe(3);
  });
});
```

#### Step 2: 跑测试确认失败

```bash
pnpm --filter @sojan/core exec vitest run test/jiao.test.ts
```
预期：FAIL —— `Failed to resolve import "../src/jiao"`（模块还不存在）。

#### Step 3: 实现

创建 `packages/core/src/jiao/index.ts`：

```ts
/**
 * 掷筊（EP-jiao）纯函数层：筊象判定 + 三掷规则。
 *
 * ⚠️ 本文件**零随机**——真随机（掷的动作本身）在 `apps/web/lib/jiao.ts`，那是全仓
 * 唯一允许出现随机的地方。core 这一层只做「给定两枚筊的正反 → 是什么筊象」和
 * 「给定已掷序列 → 这一轮该继续还是落定」，两者都是确定性映射，可完整单测。
 */

/** 一枚筊的落地面。仰 = 平面朝上，俯 = 弧面朝上。 */
export type BlockFace = "仰" | "俯";

/** 筊象三词闭集。全仓唯一定义处——llm 与 web 都从 `@sojan/core` import，不得各自重声明。 */
export type Omen = "圣筊" | "笑筊" | "阴筊";

/** 一轮问卦最多掷三次（防无限循环，同时把每轮 LLM 额度消耗压到最多 1 次）。 */
export const MAX_THROWS = 3;

/**
 * 两枚筊的组合 → 筊象。
 * 一俯一仰 = 圣筊（允）；双仰 = 笑筊（神明发笑：问得不清楚）；双俯 = 阴筊（不允）。
 */
export function omenOf(blocks: [BlockFace, BlockFace]): Omen {
  const [a, b] = blocks;
  if (a !== b) return "圣筊";
  return a === "仰" ? "笑筊" : "阴筊";
}

/**
 * 这一轮掷完之后该怎么走。
 * - `settled`：圣筊或阴筊 → 落定，走灵解（消耗 1 额度）
 * - `rethrow`：笑筊且未到上限 → 可重掷（**不走 LLM、不消耗额度**，只给固定提示）
 * - `exhausted`：三次仍笑筊 → 灵介入拆解问题本身（消耗 1 额度），本轮结束
 */
export type JiaoPhase =
  | { kind: "settled"; omen: Omen }
  | { kind: "rethrow" }
  | { kind: "exhausted" };

export function phaseAfter(throws: Omen[]): JiaoPhase {
  const last = throws.at(-1);
  if (!last) throw new Error("尚未掷筊");
  if (last !== "笑筊") return { kind: "settled", omen: last };
  return throws.length >= MAX_THROWS ? { kind: "exhausted" } : { kind: "rethrow" };
}
```

#### Step 4: 跑测试确认通过

```bash
pnpm --filter @sojan/core exec vitest run test/jiao.test.ts
```
预期：PASS（11 条）。

#### Step 5: 加导出

在 `packages/core/src/index.ts` 里找到现有的 `export ... from "./spirit"` 那一行，在它下面加一行：

```ts
export { omenOf, phaseAfter, MAX_THROWS, type Omen, type BlockFace, type JiaoPhase } from "./jiao";
```

#### Step 6: 全量回归 + 提交

```bash
pnpm --filter @sojan/core exec vitest run
pnpm --filter @sojan/core exec tsc --noEmit -p tsconfig.json
git add packages/core/src/jiao/index.ts packages/core/src/index.ts packages/core/test/jiao.test.ts
git commit -m "feat(jiao): core 筊象判定与三掷规则纯函数层（EP-jiao）"
```
预期：core 测试 162 → 173 全绿，typecheck 0 错误。

---

### Task 2: 真随机掷筊（全仓唯一随机点）

**Files:**
- Create: `apps/web/lib/jiao.ts`
- Test: `apps/web/lib/__tests__/jiao.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `omenOf` / `BlockFace` / `Omen`（from `@sojan/core`）。
- Produces: `throwJiao(): { blocks: [BlockFace, BlockFace]; omen: Omen }`。Task 6 消费。

#### Step 1: 写失败测试

创建 `apps/web/lib/__tests__/jiao.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { throwJiao } from "../jiao";
import { omenOf } from "@sojan/core";

describe("throwJiao：真随机掷两枚筊", () => {
  it("返回的 omen 与 blocks 自洽（omen 必须由 blocks 推出，不能各算各的）", () => {
    for (let i = 0; i < 50; i++) {
      const r = throwJiao();
      expect(r.omen).toBe(omenOf(r.blocks));
    }
  });

  it("blocks 恰好两枚，每枚都是合法落地面", () => {
    const r = throwJiao();
    expect(r.blocks).toHaveLength(2);
    for (const f of r.blocks) expect(["仰", "俯"]).toContain(f);
  });

  it("确实是随机的：200 次里三种筊象都出现过（确定性实现会让这条红）", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(throwJiao().omen);
    expect(seen.size).toBe(3);
  });

  it("圣筊出现率显著高于另两者（一俯一仰有两种组合，理论 50%）——200 次里圣筊应过 30%", () => {
    let sheng = 0;
    for (let i = 0; i < 200; i++) if (throwJiao().omen === "圣筊") sheng++;
    expect(sheng).toBeGreaterThan(60);
  });
});
```

> 关于最后两条的稳定性：`getRandomValues` 下，200 次里三种筊象全不出现某一种的概率约 `3 × 0.75^200`，量级 10⁻²⁵，实际不可能偶发变红；圣筊少于 60/200 的概率同样远小于 10⁻⁶。这两条是**用来钉住「必须真随机」这个需求**的（把实现换成任何确定性映射都会红），不是脆弱的统计断言。

#### Step 2: 跑测试确认失败

```bash
pnpm --filter @sojan/web exec vitest run lib/__tests__/jiao.test.ts
```
预期：FAIL —— `Failed to resolve import "../jiao"`。

#### Step 3: 实现

创建 `apps/web/lib/jiao.ts`：

```ts
import { omenOf, type BlockFace, type Omen } from "@sojan/core";

/**
 * 掷筊的随机源——**这是全仓唯一允许出现随机的地方**。
 *
 * ⚠️⚠️ 读到这里想「这违反了本仓库零随机原则、应该改成日期哈希」的人请停一下：
 * 这是刻意的、经 owner 决策的例外（spec `2026-08-25-jiao-divination-design.md` §0.1），
 * 不是漏改。
 *
 * 「零随机」这条原则真正约束的是**排盘计算的完整性**——命盘不能在两次刷新之间变，
 * 运势配图做成 `hashStr(dateStr)` 是为了「同一天看到的东西一致」。而掷筊不是计算，
 * 是仪式：现实里没人指望两次掷出同样的结果，传统做法本身就允许连掷（笑筊的本义
 * 就是「问得不清楚，重问」）。若同一个问题永远得到同一个答案，那不是掷筊，是查表。
 *
 * 产品上筊象被定位为**心理投射媒介而非答案**（价值在于用户看到结果时的第一反应），
 * 而可预测的答案无法充当投射面——所以随机性在这里不只是可接受，是必需。
 *
 * 用 `crypto.getRandomValues` 而非 `Math.random`：后者在全仓的出现次数是 0，保持
 * 这个数字为 0 能让「grep Math.random」继续作为一道有意义的架构检查。
 * 取模无偏：Uint8 值域 0–255 共 256 个，是 2 的倍数，`% 2` 不产生模偏差。
 */
export function throwJiao(): { blocks: [BlockFace, BlockFace]; omen: Omen } {
  const buf = new Uint8Array(2);
  crypto.getRandomValues(buf);
  const face = (n: number): BlockFace => (n % 2 === 0 ? "仰" : "俯");
  const blocks: [BlockFace, BlockFace] = [face(buf[0]!), face(buf[1]!)];
  return { blocks, omen: omenOf(blocks) };
}
```

#### Step 4: 跑测试确认通过

```bash
pnpm --filter @sojan/web exec vitest run lib/__tests__/jiao.test.ts
```
预期：PASS（4 条）。

#### Step 5: 提交

```bash
git add apps/web/lib/jiao.ts apps/web/lib/__tests__/jiao.test.ts
git commit -m "feat(jiao): 真随机掷筊（crypto.getRandomValues，全仓零随机原则的显式例外）"
```

---

### Task 3: `@sojan/llm` 掷筊解读层 + 筊象后置校验

**Files:**
- Create: `packages/llm/src/jiao.ts`
- Modify: `packages/llm/src/index.ts`（加导出）
- Test: `packages/llm/src/jiao.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `Omen`（from `@sojan/core`）；既有 `buildSpiritSystemPrompt` / `stripSpiritScaffolding` / `SpiritOptions` / `SpiritTurn`（from `./spirit`）；`extractFacts`、`sanitizeReading`、`correctMutagens`、`chat`/`chatStream`、`resolveLlmConfig`/`isLlmConfigured`。
- Produces: `JIAO_MAX_CHARS = 500`；`correctOmen(text, actual): { text: string; fixed: string[] }`；`generateJiaoReply(chart, question, omen, opts): Promise<{ text; stripped; fixedOmens }>`；`continueJiaoReply(chart, question | undefined, priorTurns, followUp, opts)`；`summarizeJiaoEntry(question, replyText, opts): Promise<string>`。Task 4 消费。

**关键差异（必读）**：既有的 `correctMutagens`（`packages/llm/src/correct.ts`）策略是「**只删不替**」——删掉错误的「化X」保留星名。**筊象不能照抄这个策略**：句子是「你掷出了圣筊」，删掉「圣筊」会切坏句子。筊象校验必须**替换成实际筊象**。

#### Step 1: 写失败测试

创建 `packages/llm/src/jiao.test.ts`：

```ts
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

  it("一段里混着两个错筊象 → 全部替换成实际的", () => {
    const r = correctOmen("先是笑筊，后来又是圣筊。", "阴筊");
    expect(r.text).toBe("先是阴筊，后来又是阴筊。");
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
```

#### Step 2: 跑测试确认失败

```bash
pnpm --filter @sojan/llm exec vitest run src/jiao.test.ts
```
预期：FAIL —— `Failed to resolve import "./jiao"`。

#### Step 3: 实现

创建 `packages/llm/src/jiao.ts`：

```ts
import type { ReadingLanguage } from "./prompt";
import type { UnifiedChart, Omen } from "@sojan/core";
import { deriveSpirit } from "@sojan/core";
import { extractFacts } from "./facts";
import { sanitizeReading } from "./prompt";
import { correctMutagens } from "./correct";
import { chat, chatStream, type ChatMessage } from "./client";
import { resolveLlmConfig, isLlmConfigured } from "./provider";
import { buildSpiritSystemPrompt, stripSpiritScaffolding, type SpiritOptions, type SpiritTurn } from "./spirit";

// ─── 掷筊问事（EP-jiao）────────────────────────────────────────────
// 结构与 dream.ts 同构（buffered 一次性产出——后置校验需要完整文本）。
// 与解梦的唯一实质差异：多一道 correctOmen（筊象是客户端掷出的既成事实，
// 模型不得改写），且该校验是「替换」不是「删除」，见下方注释。

export const JIAO_MAX_CHARS = 500;

const ALL_OMENS: readonly Omen[] = ["圣筊", "笑筊", "阴筊"];

/**
 * 筊象后置机械校验（EP-jiao）——与 correctMutagens 同层，但策略相反。
 *
 * `correctMutagens` 对错配的四化是「只删不替」（删掉「化X」保留星名，不注入新声明）。
 * 筊象不能这么做：句子形如「你掷出了圣筊」，把「圣筊」删掉会切出病句。筊象是客户端
 * 掷出、随请求传入的**既成事实**，实际值唯一且已知，所以这里**替换**成实际筊象是安全的
 * ——不是在猜一个新事实，是在用已知事实覆盖模型的口误。
 *
 * 三词闭集，逐个扫，成本可忽略。
 */
export function correctOmen(text: string, actual: Omen): { text: string; fixed: string[] } {
  const fixed: string[] = [];
  let out = text;
  for (const o of ALL_OMENS) {
    if (o === actual) continue;
    if (out.includes(o)) {
      out = out.split(o).join(actual);
      fixed.push(o);
    }
  }
  return { text: out, fixed };
}

const JIAO_RULES_ZH = `

# 掷筊问事规则
- **你不是在回答「是」或「否」。** 筊象是一面镜子，不是答案——它的价值在于对方看到它时的第一反应。
- 按三拍走，一段自然口语走完，不用标题、不分节、不列表：① 先点出筊象（一句，必须用给定的筊象名，不得改写成别的筊象）；② 把筊象当投射面——请对方留意自己看到这个结果时最初的那一下反应（松了口气？失望？想再掷一次？），结合你已知的这个人（命盘倾向/记忆/自陈）判断该往哪个方向问，而不是替他决定该怎么做；③ 一个邀请（一句，具体可执行）。
- **绝不给方向性结论**：不说「应该/不应该」「适合/不适合」「时机对/不对」「可以放心去做」。对方问的事你不替他决定，也不暗示倾向。
- 不预测结果、不谈吉凶应期。涉及医疗、法律、财务、生死的问题一律转向：这类事需要专业人士，你能陪他看的是他自己怎么想。
- 长度：不超过 10 句、400 字。命盘事实至多引一处，且要真正融进②的判断依据里，不是贴标签。默认不以问句结尾。`;

const JIAO_RULES_EXHAUSTED_ZH = `

# 掷筊问事规则（连续三次笑筊）
- 对方连掷三次都是笑筊。传统里笑筊的意思是「问得不清楚」——**不要再解筊象**，改为帮对方**拆解这个问题本身**。
- 一段自然口语走完：这个问题里可能藏着几个不同的问题？他真正想知道的那一个是什么？给一到两句具体的重问方向。
- 同样**绝不给方向性结论**，不替他决定该怎么做。
- 长度：不超过 8 句、300 字。`;

const JIAO_RULES_EN = `

# Divination-reading rules
- **You are NOT answering yes or no.** The omen is a mirror, not an answer — its value lies in the asker's first reaction to it.
- Three beats in ONE natural spoken paragraph — no headings, no sections, no lists: ① name the omen (one sentence, using EXACTLY the omen given; never substitute a different one); ② read the omen as a projection surface — invite them to notice their very first reaction to this result (relief? disappointment? an urge to throw again?), and use what you know of them (chart tendencies/memory/self-report) to judge WHICH direction to ask in, rather than deciding for them; ③ one invitation (one concrete sentence).
- **Never give a directional conclusion**: no "should"/"shouldn't", "suitable"/"unsuitable", "the timing is right/wrong", "go ahead with confidence". You do not decide their question for them, nor hint at a leaning.
- No predicting outcomes, no auspicious/inauspicious timing. For medical, legal, financial, or life-and-death questions, redirect: those need a professional; what you can sit with them on is how they themselves feel.
- Length: at most 10 sentences / 260 words. At most ONE chart fact, and it must actually drive beat ②. Do not end with a question by default.`;

const JIAO_RULES_EXHAUSTED_EN = `

# Divination-reading rules (three consecutive 笑筊)
- They have thrown 笑筊 three times. Traditionally 笑筊 means the question itself is unclear — **stop reading the omen** and help them **take the question apart** instead.
- One natural spoken paragraph: how many different questions might be hiding inside this one? Which is the one they actually want answered? Give one or two concrete ways to re-ask.
- Still **never give a directional conclusion**; do not decide for them.
- Length: at most 8 sentences / 200 words.`;

type JiaoOptions = SpiritOptions & {
  /** 连续三次笑筊：换一套规则（拆解问题本身，不解筊象）。 */
  exhausted?: boolean;
};

/**
 * system 提示 + 首轮 user 消息——generateJiaoReply 与 continueJiaoReply 共用。
 *
 * `question` 为 `undefined`：续接历史场景（历史表只存灵的回复全文与摘要，不存问题
 * 原文，见迁移 0019），没有问题原文可以重建首轮 user 消息，但命盘事实仍必须喂给
 * 模型，因此并进 system 尾部；`firstUser` 返回 `undefined`，调用方据此跳过那条消息。
 * 这套重载分流与 `dream.ts` 的 `buildDreamPrompt` 完全同构。
 */
function buildJiaoPrompt(
  chart: UnifiedChart,
  question: string,
  omen: Omen,
  opts: JiaoOptions,
): { system: string; firstUser: string; language: ReadingLanguage; zh: boolean };
function buildJiaoPrompt(
  chart: UnifiedChart,
  question: undefined,
  omen: Omen | undefined,
  opts: JiaoOptions,
): { system: string; firstUser: undefined; language: ReadingLanguage; zh: boolean };
function buildJiaoPrompt(chart: UnifiedChart, question: string | undefined, omen: Omen | undefined, opts: JiaoOptions) {
  const language = opts.language ?? "en";
  const zh = language === "zh";
  const persona = deriveSpirit(chart);
  const facts = extractFacts(chart);
  const rules = opts.exhausted
    ? (zh ? JIAO_RULES_EXHAUSTED_ZH : JIAO_RULES_EXHAUSTED_EN)
    : (zh ? JIAO_RULES_ZH : JIAO_RULES_EN);
  const baseSystem = buildSpiritSystemPrompt(persona, chart, language, opts) + rules;
  const factsBlock = `\`\`\`json\n${JSON.stringify(facts, null, 2)}\n\`\`\``;

  if (question === undefined) {
    const factsNote = zh
      ? `\n\n以下是确定性算出的命盘事实（你只能引用这些）：\n\n${factsBlock}`
      : `\n\nHere are the deterministically computed chart facts (the ONLY facts you may use):\n\n${factsBlock}`;
    return { system: baseSystem + factsNote, firstUser: undefined, language, zh };
  }

  const firstUser = zh
    ? `以下是确定性算出的命盘事实（你只能引用这些）：\n\n${factsBlock}\n\n对方为一件具体的事掷了筊。\n\n他问的是：「${question}」\n\n掷出的筊象是：**${omen}**（这是已经掷出的既成事实，不得改写成别的筊象）\n\n请以「本命之灵」的身份、用简体中文、按掷筊问事规则回应。`
    : `Here are the deterministically computed chart facts (the ONLY facts you may use):\n\n${factsBlock}\n\nThey threw the divination blocks about a specific matter.\n\nTheir question: "${question}"\n\nThe omen thrown: **${omen}** (this already happened — never substitute a different omen)\n\nRespond as their 本命之灵, following the divination-reading rules.`;
  return { system: baseSystem, firstUser, language, zh };
}

/** 后置链共用：脚手架护栏 → sanitizeReading → correctOmen → correctMutagens → fallback。 */
function finalizeJiaoOutput(
  raw: string,
  language: ReadingLanguage,
  chart: UnifiedChart,
  actualOmen: Omen | undefined,
  fallbackText: string,
): { text: string; fixedOmens: string[] } {
  let out = stripSpiritScaffolding(raw);
  out = sanitizeReading(out, language, chart.western !== null);
  let fixedOmens: string[] = [];
  if (actualOmen) {
    const c = correctOmen(out, actualOmen);
    out = c.text;
    fixedOmens = c.fixed;
  }
  out = correctMutagens(out, chart.ziwei.birthMutagens).text;
  if (out.length < 6) out = fallbackText;
  return { text: out, fixedOmens };
}

/** 掷筊解读完整管线。buffered（后置校验需要完整文本）。 */
export async function generateJiaoReply(
  chart: UnifiedChart,
  question: string,
  omen: Omen,
  opts: JiaoOptions = {},
): Promise<{ text: string; fixedOmens: string[] }> {
  const cfg = opts.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置：请设置 LLM_API_KEY。");
  const q = question.trim();
  if (!q) throw new Error("问题内容为空");
  if (q.length > JIAO_MAX_CHARS) throw new Error(`问题过长（>${JIAO_MAX_CHARS} 字）`);

  const { system, firstUser, language, zh } = buildJiaoPrompt(chart, q, omen, opts);
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: firstUser },
  ];

  const stream = chatStream(cfg, messages, { signal: opts.signal, maxTokens: 900 });
  let all = "";
  for await (const chunk of stream) all += chunk;

  const result = finalizeJiaoOutput(
    all,
    language,
    chart,
    opts.exhausted ? undefined : omen,
    zh ? "我在。这一卦先放着——把你想问的那件事再说得具体些？" : "I'm here. Let's set this throw aside — could you say the matter more concretely?",
  );
  console.info(`[jiao] model=${cfg.model} omen=${omen} chars=${result.text.length} fixedOmens=${result.fixedOmens.length}`);
  return result;
}

/**
 * 掷筊追问：两种场景共用（与 continueDreamReply 同构）。
 * 1. 同一次问卦内的多轮追问：`question` 传原问题（重建首轮 prompt），`priorTurns` 从灵的第一条回应开始。
 * 2. 续接历史：`question` 传 `undefined`，`priorTurns[0]` 就是历史里存的回复全文。
 * 两种场景下 `priorTurns` 都只活在浏览器会话内、随请求即用即弃，服务端不落库。
 */
export async function continueJiaoReply(
  chart: UnifiedChart,
  question: string | undefined,
  priorTurns: SpiritTurn[],
  followUp: string,
  opts: JiaoOptions = {},
): Promise<{ text: string; fixedOmens: string[] }> {
  const cfg = opts.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置：请设置 LLM_API_KEY。");
  const q = question?.trim();
  if (question !== undefined && !q) throw new Error("问题内容为空");
  if (question === undefined && priorTurns.length === 0) throw new Error("没有可续接的历史问卦");
  const f = followUp.trim();
  if (!f) throw new Error("追问内容为空");
  if (f.length > JIAO_MAX_CHARS) throw new Error(`追问内容过长（>${JIAO_MAX_CHARS} 字）`);

  // 三元而非直接传 `q`：buildJiaoPrompt 用重载对 question 是否 undefined 做了返回类型
  // 分流（firstUser 是 string 还是 undefined），三元的每个分支里 TS 才能把类型收窄到
  // 对应重载。与 dream.ts 的 continueDreamReply 同一处理，理由见那边注释。
  const { system, firstUser, language, zh } = q !== undefined
    ? buildJiaoPrompt(chart, q, opts.omenForFollowUp ?? "圣筊", opts)
    : buildJiaoPrompt(chart, undefined, undefined, opts);
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...(firstUser !== undefined ? [{ role: "user", content: firstUser } as ChatMessage] : []),
    ...priorTurns.map((t): ChatMessage => ({ role: t.role === "user" ? "user" : "assistant", content: t.content })),
    { role: "user", content: f },
  ];

  const stream = chatStream(cfg, messages, { signal: opts.signal, maxTokens: 900 });
  let all = "";
  for await (const chunk of stream) all += chunk;

  const result = finalizeJiaoOutput(
    all,
    language,
    chart,
    opts.omenForFollowUp,
    zh ? "我在。想接着问哪一部分？" : "I'm here. Which part would you like to go into?",
  );
  console.info(`[jiao:follow-up] model=${cfg.model} chars=${result.text.length}`);
  return result;
}

/**
 * 问卦历史条目摘要（EP-jiao）——与 summarizeDreamEntry 同一条隐私红线：
 * 不逐字复述问题原文，只给第三人称的主题标签，供历史列表辨认。
 */
const JIAO_SUMMARY_MAX_CHARS = 160;

export async function summarizeJiaoEntry(
  question: string,
  replyText: string,
  opts: SpiritOptions = {},
): Promise<string> {
  const cfg = opts.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置：请设置 LLM_API_KEY。");
  const zh = (opts.language ?? "en") === "zh";

  const system = zh
    ? `你在为一次「掷筊问事」生成一句极简标签，供用户以后在历史列表里认出这是哪一卦。规则：不超过 30 字；只能是第三人称转述的主题（例如「一个关于职业选择的问卦」），绝不逐字复述用户问的原话或引用具体细节（不出现具体的人名、公司、地点、金额）；不含姓名、生日、坐标等个人信息；不做吉凶判断、不透露筊象结果；只输出这一句话，不要引号、不要前缀。`
    : `Write one ultra-short label (English, at most 15 words) so the user can later recognize this divination session in a history list. Rules: third-person paraphrase of the THEME only (e.g. "a question about a career choice") — never quote their question verbatim or repeat specifics (no names, companies, places, amounts); no personal identifiers; no fortune-telling verdict and do not reveal the omen; output only that one sentence — no quotes, no prefix.`;
  const user = zh
    ? `他问的事（仅供你概括主题，不要逐字复述）：${question.slice(0, 400)}\n\n灵的回应要点：${replyText.slice(0, 400)}`
    : `Their question (summarize the theme only, do not quote it back): ${question.slice(0, 400)}\n\nKey point from the reading: ${replyText.slice(0, 400)}`;

  const raw = await chat(cfg, [{ role: "system", content: system }, { role: "user", content: user }], { signal: opts.signal, maxTokens: 80 });
  return raw.trim().replace(/^["「『]|["」』]$/g, "").slice(0, JIAO_SUMMARY_MAX_CHARS);
}
```

**注意**：上面 `continueJiaoReply` 里用到了 `opts.omenForFollowUp`——需要在 `JiaoOptions` 类型里补上这个字段。把 `JiaoOptions` 的定义改成：

```ts
type JiaoOptions = SpiritOptions & {
  /** 连续三次笑筊：换一套规则（拆解问题本身，不解筊象）。 */
  exhausted?: boolean;
  /** 同一次问卦内追问时传入当轮筊象，让后置校验继续生效；续接历史时不传。 */
  omenForFollowUp?: Omen;
};
```

#### Step 4: 跑测试确认通过

```bash
pnpm --filter @sojan/llm exec vitest run src/jiao.test.ts
```
预期：PASS（13 条）。若 `omenForFollowUp` 忘了加到类型里，这里会是 typecheck 错误而不是测试失败——两者都要修干净。

#### Step 5: 加导出

在 `packages/llm/src/index.ts` 里找到导出 dream 的那一行（形如 `export * from "./dream";` 或具名导出），照同样风格加：

```ts
export { correctOmen, generateJiaoReply, continueJiaoReply, summarizeJiaoEntry, JIAO_MAX_CHARS } from "./jiao";
```

#### Step 6: 全量回归 + 提交

```bash
pnpm --filter @sojan/llm exec vitest run
pnpm --filter @sojan/llm exec tsc --noEmit
git add packages/llm/src/jiao.ts packages/llm/src/jiao.test.ts packages/llm/src/index.ts
git commit -m "feat(jiao): llm 掷筊解读层 + 筊象后置校验（替换而非删除）"
```
预期：llm 测试 262 → 275 全绿。

---

### Task 4: `jiao_history` 表 + 数据层

**Files:**
- Create: `supabase/migrations/0019_jiao_history.sql`
- Create: `apps/web/lib/jiao-history.ts`
- Test: 无独立单测（数据层是 Supabase 薄封装，与 `dream-history.ts` 同样不单测；行为由 Task 6 的页面测试覆盖）

**Interfaces:**
- Consumes: Task 1 的 `Omen`。
- Produces: `type JiaoHistoryEntry = { id: string; omen: Omen; summary: string; fullText: string | null; createdAt: string }`；`listJiaoHistory(profileId): Promise<JiaoHistoryEntry[]>`；`appendJiaoHistory(profileId, omen, summary, fullText): Promise<void>`。Task 6 消费。

#### Step 1: 写迁移文件

创建 `supabase/migrations/0019_jiao_history.sql`：

```sql
-- EP-jiao · 掷筊问事历史（最近 10 条）
-- 结构与 RLS 照抄 dream_history（0017 + 0018 的 full_text 列），差异只在多一列 omen。
--
-- **不存问题原文**——与 dream_history「梦原文不落库」同一条红线（owner 2026-08-25 决策）：
-- 「该不该离职/分手/做手术」这类原话的敏感度不比梦低。summary 由 summarizeJiaoEntry()
-- 在应用层生成（明确禁止逐字复述提问）后才写入；full_text 是灵自己生成、已过
-- sanitizeReading/correctOmen/correctMutagens 全套后置链的输出，不是用户的原始陈述。
--
-- 续接追问时用 full_text 当锚点喂回模型，因此不需要问题原文（同 0018 的思路）。
--
-- 「最近 10 条」的裁剪在应用层做（写入后删掉超出的旧行），不做成 DB 触发器/RPC——
-- 本仓库已因 security definer RPC 忘记收权限出过两次生产漏洞（0012/0015），裁剪这种
-- 非特权操作没必要再开一个新的 RPC 面。

create table if not exists public.jiao_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  omen        text not null check (omen in ('圣筊', '笑筊', '阴筊')),
  summary     text not null,
  full_text   text,
  created_at  timestamptz not null default now()
);

create index if not exists jiao_history_profile_created_idx
  on public.jiao_history (profile_id, created_at);

alter table public.jiao_history enable row level security;

create policy own_select on public.jiao_history for select using (auth.uid() = user_id);
create policy own_insert on public.jiao_history for insert with check (auth.uid() = user_id);
create policy own_delete on public.jiao_history for delete using (auth.uid() = user_id);
```

> ⚠️ **不要 apply 到生产**。按本仓惯例，迁移由 owner 显式确认后才 apply。交付说明里要注明「0019 待 apply」。

#### Step 2: 写数据层

创建 `apps/web/lib/jiao-history.ts`：

```ts
"use client";

import type { Omen } from "@sojan/core";
import { supabase, ensureSession } from "./supabase";

/**
 * 掷筊问事历史（EP-jiao）——存 omen（筊象）+ summary（第三人称主题摘要，供列表展示）
 * + fullText（灵的回复全文，供点击续追问用）。**不存问题原文**（迁移 0019 的注释）。
 */
export type JiaoHistoryEntry = {
  id: string;
  omen: Omen;
  summary: string;
  fullText: string | null;
  createdAt: string;
};

type Row = { id: string; omen: Omen; summary: string; full_text: string | null; created_at: string };
const toEntry = (r: Row): JiaoHistoryEntry => ({
  id: r.id,
  omen: r.omen,
  summary: r.summary,
  fullText: r.full_text,
  createdAt: r.created_at,
});

const MAX_JIAO_HISTORY = 10;

export async function listJiaoHistory(profileId: string): Promise<JiaoHistoryEntry[]> {
  await ensureSession();
  const { data, error } = await supabase()
    .from("jiao_history")
    .select("id, omen, summary, full_text, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(MAX_JIAO_HISTORY);
  if (error) throw error;
  return (data as Row[] | null)?.map(toEntry) ?? [];
}

/** 追加一条历史，并把超出最近 10 条的旧行直接删除（不做归档）。 */
export async function appendJiaoHistory(profileId: string, omen: Omen, summary: string, fullText: string): Promise<void> {
  await ensureSession();
  const { error } = await supabase().from("jiao_history").insert({ profile_id: profileId, omen, summary, full_text: fullText });
  if (error) throw error;

  const { data: rows, error: listErr } = await supabase()
    .from("jiao_history")
    .select("id")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (listErr) throw listErr;
  const stale = ((rows as { id: string }[] | null) ?? []).slice(MAX_JIAO_HISTORY).map((r) => r.id);
  if (stale.length > 0) {
    const { error: delErr } = await supabase().from("jiao_history").delete().in("id", stale);
    if (delErr) throw delErr;
  }
}
```

#### Step 3: typecheck + 提交

```bash
pnpm --filter @sojan/web exec tsc --noEmit
git add supabase/migrations/0019_jiao_history.sql apps/web/lib/jiao-history.ts
git commit -m "feat(jiao): jiao_history 表与数据层（照抄 dream_history，不存问题原文）"
```
预期：无**新增**类型错误（既存 7 处不算）。

---

### Task 5: `/api/spirit/jiao` 路由

**Files:**
- Create: `apps/web/app/api/spirit/jiao/route.ts`
- Test: `apps/web/app/api/spirit/jiao/__tests__/route.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `generateJiaoReply` / `continueJiaoReply` / `JIAO_MAX_CHARS`；Task 1 的 `Omen`；既有 `resolveAccess` / `consumeLlm` / `localeFromRequest` / `supabaseAdmin`。
- Produces: `POST /api/spirit/jiao`，请求体 `{ chart, question?, omen?, exhausted?, followUp?, priorTurns?, memory?, questionnaire? }`，返回纯文本回复。Task 6 消费。

#### Step 1: 写失败测试

创建 `apps/web/app/api/spirit/jiao/__tests__/route.test.ts`：

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn(async (_token?: string) => ({ data: { user: { id: "u1" } } }));
vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({ auth: { getUser: (t: string) => getUserMock(t) } }),
}));
const resolveAccessMock = vi.fn(async (..._a: unknown[]): Promise<unknown> => ({ level: "identified", hasVerifiedEmail: false, hasTelegram: true }));
vi.mock("@/lib/access", () => ({ resolveAccess: (...a: unknown[]) => resolveAccessMock(...a) }));
const consumeLlmMock = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
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
```

#### Step 2: 跑测试确认失败

```bash
pnpm --filter @sojan/web exec vitest run app/api/spirit/jiao
```
预期：FAIL —— 找不到 `../route`。

#### Step 3: 实现

创建 `apps/web/app/api/spirit/jiao/route.ts`：

```ts
import { resolveLlmConfig, isLlmConfigured, generateJiaoReply, continueJiaoReply, JIAO_MAX_CHARS, type SpiritTurn } from "@sojan/llm";
import type { UnifiedChart, Omen } from "@sojan/core";
import { supabaseAdmin } from "@/lib/tg/admin";
import { consumeLlm } from "@/lib/entitlements";
import { resolveAccess } from "@/lib/access";
import { localeFromRequest } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_OMENS: readonly string[] = ["圣筊", "笑筊", "阴筊"];

/**
 * POST /api/spirit/jiao —— 掷筊问事。chart 与问题随 body 传来，回复不落库
 * （落库的只有 jiao_history 的摘要/回复全文，由客户端写）。
 *
 * ⚠️ `omen` 由**客户端**掷出后传入（掷是即时物理动作，服务端往返会毁掉手感，
 * 见 apps/web/lib/jiao.ts 的注释）。服务端只校验它在三词闭集内——不重新掷、
 * 也不替用户掷。筊象随后作为既成事实进 prompt，并由 correctOmen 后置兜底。
 */
export async function POST(req: Request): Promise<Response> {
  if (process.env.NEXT_PUBLIC_SPIRIT_ENABLED !== "1") return new Response("未开启", { status: 404 });
  const cfg = resolveLlmConfig();
  if (!isLlmConfigured(cfg)) return new Response("LLM 未配置", { status: 503 });

  const body = await req.json().catch(() => ({}));
  const chart = body?.chart as UnifiedChart | undefined;
  const question = typeof body?.question === "string" ? body.question.trim() : undefined;
  const omenRaw = typeof body?.omen === "string" ? body.omen : undefined;
  const exhausted = body?.exhausted === true;
  const followUp = typeof body?.followUp === "string" ? body.followUp.trim() : "";
  const priorTurns = (Array.isArray(body?.priorTurns) ? body.priorTurns : []).slice(-12) as SpiritTurn[];

  if (!chart) return new Response("缺少命盘 chart", { status: 400 });
  if (!followUp) {
    // 首次问卦：问题与筊象都必需。追问（含续接历史）时两者都可省。
    if (!question) return new Response("缺少问题 question", { status: 400 });
    if (!omenRaw) return new Response("缺少筊象 omen", { status: 400 });
  }
  if (omenRaw !== undefined && !VALID_OMENS.includes(omenRaw)) {
    return new Response("筊象非法", { status: 400 });
  }
  const omen = omenRaw as Omen | undefined;
  if (question && question.length > JIAO_MAX_CHARS) return new Response("问题过长", { status: 400 });
  if (followUp && followUp.length > JIAO_MAX_CHARS) return new Response("追问过长", { status: 400 });

  // 鉴权闸门与 /api/spirit/dream 完全一致：必须解析出身份，且不能是 anonymous 级。
  // 顺序上先鉴权再计量——鉴权失败不该扣额度。
  const authHeader = req.headers.get("authorization");
  let userId: string | undefined;
  if (authHeader?.startsWith("Bearer ")) {
    const { data } = await supabaseAdmin().auth.getUser(authHeader.slice(7));
    userId = data.user?.id;
  }
  if (!userId) return new Response("未登录", { status: 401 });
  const access = await resolveAccess(userId);
  if (access.level === "anonymous") return new Response("未登录", { status: 401 });
  const gate = await consumeLlm(userId);
  if (!gate.ok) return Response.json({ error: "paywall" }, { status: 402 });

  const language = localeFromRequest(req);
  const opts = {
    language,
    exhausted,
    memory: typeof body?.memory === "string" ? body.memory : undefined,
    questionnaire: typeof body?.questionnaire === "string" ? body.questionnaire : undefined,
    ...(omen ? { omenForFollowUp: omen } : {}),
  };
  try {
    const out = followUp
      ? (await continueJiaoReply(chart, question, priorTurns, followUp, opts)).text
      : (await generateJiaoReply(chart, question as string, omen as Omen, opts)).text;
    return new Response(out, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response(`⚠️ ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
}
```

#### Step 4: 跑测试确认通过

```bash
pnpm --filter @sojan/web exec vitest run app/api/spirit/jiao
```
预期：PASS（13 条）。

#### Step 5: 提交

```bash
git add apps/web/app/api/spirit/jiao/
git commit -m "feat(jiao): /api/spirit/jiao 路由（鉴权与额度闸门照抄 dream 路由）"
```

---

### Task 6: 掷筊动画组件

**Files:**
- Create: `apps/web/components/JiaoThrow.tsx`
- Modify: `apps/web/app/globals.css`（加 keyframes）
- Test: `apps/web/components/__tests__/JiaoThrow.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 `BlockFace` / `Omen`。
- Produces: `<JiaoThrow blocks={[BlockFace, BlockFace]} onSettled={() => void} />`。Task 7 消费。

#### Step 1: 加 keyframes

在 `apps/web/app/globals.css` 的 `@keyframes zjGZ {...}` 那一行**之后**（约 129 行），追加：

```css
/* 掷筊（EP-jiao）：抛起 → 翻转 → 落地。两枚错峰用 inline animation-delay。
   注意上方 prefers-reduced-motion 区块会把 duration 压到 0.001ms，
   animationend 因此立刻触发 —— 结果揭晓挂在 onAnimationEnd 上即天然降级。 */
@keyframes zjJiaoToss {
  0%   { transform: translateY(0) rotate(0deg); }
  35%  { transform: translateY(-42px) rotate(220deg); }
  70%  { transform: translateY(-10px) rotate(400deg); }
  100% { transform: translateY(0) rotate(540deg); }
}
```

#### Step 2: 写失败测试

创建 `apps/web/components/__tests__/JiaoThrow.test.tsx`：

```tsx
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { JiaoThrow } from "../JiaoThrow";

afterEach(() => cleanup());

describe("JiaoThrow", () => {
  it("渲染两枚筊", () => {
    render(<JiaoThrow blocks={["仰", "俯"]} onSettled={vi.fn()} />);
    expect(screen.getAllByTestId("jiao-block")).toHaveLength(2);
  });

  it("每枚筊按落地面标注（供无障碍与测试判别）", () => {
    render(<JiaoThrow blocks={["仰", "俯"]} onSettled={vi.fn()} />);
    const [a, b] = screen.getAllByTestId("jiao-block");
    expect(a).toHaveAttribute("data-face", "仰");
    expect(b).toHaveAttribute("data-face", "俯");
  });

  it("动画结束触发 onSettled——挂 animationend 而非计时器，reduced-motion 下也能出结果", () => {
    const onSettled = vi.fn();
    render(<JiaoThrow blocks={["俯", "俯"]} onSettled={onSettled} />);
    const blocks = screen.getAllByTestId("jiao-block");
    fireEvent.animationEnd(blocks[1]!); // 第二枚（延迟更久的那枚）落定才算结束
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("第一枚落定不触发 onSettled（必须等两枚都停）", () => {
    const onSettled = vi.fn();
    render(<JiaoThrow blocks={["仰", "仰"]} onSettled={onSettled} />);
    fireEvent.animationEnd(screen.getAllByTestId("jiao-block")[0]!);
    expect(onSettled).not.toHaveBeenCalled();
  });
});
```

#### Step 3: 跑测试确认失败

```bash
pnpm --filter @sojan/web exec vitest run components/__tests__/JiaoThrow.test.tsx
```
预期：FAIL —— 找不到 `../JiaoThrow`。

#### Step 4: 实现

创建 `apps/web/components/JiaoThrow.tsx`：

```tsx
"use client";

import type { BlockFace } from "@sojan/core";

/**
 * 掷筊动画（EP-jiao）：两枚月牙形筊抛起、翻转、落地。
 *
 * 纯 CSS（本仓零动画库，同 CastingOverlay）。结果揭晓挂在**第二枚**筊的
 * `onAnimationEnd` 上——不用 setTimeout：`globals.css` 的全局
 * `prefers-reduced-motion` 会把 animation-duration 压到 0.001ms，animationend
 * 随即触发，无障碍降级因此天然成立，不需要额外判 matchMedia 的分支。
 *
 * 落地面用 data-face 暴露（供测试与无障碍判别），视觉上「仰」是平面朝上（浅色、
 * 平直边缘），「俯」是弧面朝上（深色、圆弧）。
 */
export function JiaoThrow({
  blocks,
  onSettled,
}: {
  blocks: [BlockFace, BlockFace];
  onSettled: () => void;
}) {
  return (
    <div className="flex items-end justify-center gap-6 py-8" aria-live="polite">
      {blocks.map((face, i) => (
        <div
          key={i}
          data-testid="jiao-block"
          data-face={face}
          onAnimationEnd={i === 1 ? onSettled : undefined}
          className="h-[56px] w-[38px]"
          style={{
            // 「仰」平面朝上：浅色、下缘平直；「俯」弧面朝上：墨色、整体圆弧。
            background: face === "仰" ? "var(--color-tint)" : "var(--color-ink)",
            border: "1px solid var(--color-line-strong)",
            borderRadius: face === "仰" ? "50% 50% 4px 4px" : "50%",
            animation: `zjJiaoToss .75s var(--ease-pop) ${i * 0.12}s both`,
          }}
        />
      ))}
    </div>
  );
}
```

#### Step 5: 跑测试确认通过 + 提交

```bash
pnpm --filter @sojan/web exec vitest run components/__tests__/JiaoThrow.test.tsx
git add apps/web/components/JiaoThrow.tsx apps/web/components/__tests__/JiaoThrow.test.tsx apps/web/app/globals.css
git commit -m "feat(jiao): 掷筊动画组件（纯 CSS，结果挂 animationend 天然支持 reduced-motion）"
```
预期：PASS（4 条）。

---

### Task 7: i18n 键 + `/spirit` 掷筊闸门 + `SpiritPanel` seedTurns

**Files:**
- Modify: `apps/web/lib/i18n/messages/zh.ts`（加 `jiao` 命名空间 + 改 `spirit.quickPrompts`）
- Modify: `apps/web/lib/i18n/messages/en.ts`（同上，键必须齐）
- Modify: `apps/web/app/chart/SpiritPanel.tsx`（加 `seedTurns` prop）
- Modify: `apps/web/app/spirit/page.tsx`（掷筊闸门 + 历史列表）
- Test: `apps/web/app/spirit/__tests__/page.test.tsx`（扩充）

**Interfaces:**
- Consumes: Task 1 `phaseAfter`/`MAX_THROWS`/`Omen`；Task 2 `throwJiao`；Task 4 `listJiaoHistory`/`appendJiaoHistory`；Task 5 `/api/spirit/jiao`；Task 6 `<JiaoThrow>`。
- Produces: `SpiritPanel` 新增可选 prop `seedTurns?: { role: "user" | "spirit"; content: string }[]`。

#### Step 1: 加 i18n 键（zh）

在 `apps/web/lib/i18n/messages/zh.ts` 的 `dream: {` 那一块**之后**追加：

```ts
  jiao: {
    kicker: "掷 筊",
    title: "为一件事问一卦",
    subtitle: "筊象是一面镜子，不是答案——留意你看到它时的第一反应。",
    placeholder: "比如：我该不该接这个 offer？（问一件具体的事）",
    throwCta: "掷筊",
    throwing: "掷筊中…",
    reading: "灵在看这一卦…",
    omenSheng: "圣筊",
    omenXiao: "笑筊",
    omenYin: "阴筊",
    xiaoHint: "笑筊——神明发笑，意思是这个问题还问得不够清楚。把它问得更具体些，再掷一次。",
    xiaoRethrow: "再掷一次",
    throwsLeft: "还可以掷 {n} 次",
    errorTooLong: "问题太长了，说得再具体简短些（500 字以内）。",
    noProfile: "尚无命盘档案——先起盘，灵才认得你。",
    needLogin: "问卦需要先确认身份——去账号页登录，或先绑定邮箱。",
    needLoginCta: "去登录",
    youAsked: "你问",
    followUpPlaceholder: "还想接着问点什么？",
    followUpSubmit: "接着问",
    historyTitle: "最近问过的",
    newThrow: "换一件事问",
  },
```

同时把 `spirit.quickPrompts`（`zh.ts:319`）从「随便聊」语境改成问事语境：

```ts
    quickPrompts: ["该不该换工作", "这段关系要不要继续", "现在适合搬家吗", "要不要开始这件事"],
```

#### Step 2: 加 i18n 键（en，键必须齐）

在 `apps/web/lib/i18n/messages/en.ts` 的 `dream: {` 那一块之后追加**同样键名**：

```ts
  jiao: {
    kicker: "Divination",
    title: "Ask about one matter",
    subtitle: "The omen is a mirror, not an answer — notice your first reaction to it.",
    placeholder: "e.g. Should I take this offer? (ask about one concrete matter)",
    throwCta: "Throw",
    throwing: "Throwing…",
    reading: "Reading this throw…",
    omenSheng: "圣筊 (Sheng — assent)",
    omenXiao: "笑筊 (Xiao — the question is unclear)",
    omenYin: "阴筊 (Yin — dissent)",
    xiaoHint: "笑筊 — the question isn't clear enough yet. Make it more concrete, then throw again.",
    xiaoRethrow: "Throw again",
    throwsLeft: "{n} throw(s) left",
    errorTooLong: "Too long — make it shorter and more concrete (under 500 chars).",
    noProfile: "No chart profile yet — cast your chart first.",
    needLogin: "Sign in first — head to Account to sign in or bind an email.",
    needLoginCta: "Sign in",
    youAsked: "You asked",
    followUpPlaceholder: "Anything else you'd like to ask?",
    followUpSubmit: "Ask more",
    historyTitle: "Recent questions",
    newThrow: "Ask about something else",
  },
```

同时改 `en.ts` 的 `spirit.quickPrompts`：

```ts
    quickPrompts: ["Should I change jobs", "Should this relationship continue", "Is now a good time to move", "Should I start this"],
```

#### Step 3: 验证 i18n 结构一致性

```bash
pnpm --filter @sojan/web exec vitest run components/__tests__/AppShell.test.tsx
```
预期：PASS。**若这里红了，说明 zh/en 两侧键不一致**——比对两个 `jiao` 块，补齐缺的键，不要改测试。

#### Step 4: `SpiritPanel` 加 `seedTurns` prop

修改 `apps/web/app/chart/SpiritPanel.tsx`。把组件签名（第 18 行）从：

```tsx
export function SpiritPanel({ profile, autoSend }: { profile: Profile; autoSend?: string }) {
```

改为：

```tsx
export function SpiritPanel({
  profile,
  autoSend,
  seedTurns,
}: {
  profile: Profile;
  autoSend?: string;
  /**
   * 对话开场（EP-jiao）：掷筊问事的「问题 + 灵解」由 /spirit 页注入，作为这次
   * 对话的头两条消息渲染。**不落 spirit_messages**——它们已经由 jiao_history
   * 单独存了摘要与回复全文，再写一份进消息表是重复存储。
   * 后续追问走正常的 /api/spirit/chat，seedTurns 会随历史一起发给模型。
   */
  seedTurns?: { role: "user" | "spirit"; content: string }[];
}) {
```

在 state 声明区（`const [messages, setMessages] = useState<SpiritMessage[]>([]);` 那一行之后）加一个派生值：

```tsx
  // seedTurns 拼成与 SpiritMessage 同形的伪消息（id 用固定前缀，不会与库里的 uuid 撞）
  const seeded: SpiritMessage[] = (seedTurns ?? []).map((t, i) => ({
    id: `seed-${i}`,
    role: t.role,
    content: t.content,
    createdAt: "",
  }));
  const allMessages = seeded.length > 0 ? [...seeded, ...messages] : messages;
```

然后把渲染区（原第 290 行 `{messages.map((m) => (`）改为 `{allMessages.map((m) => (`；把空态判断（原第 280 行 `{messages.length === 0 && isTelegram() && (`）改为 `{allMessages.length === 0 && isTelegram() && (`。

在 `sendToSpirit` 的调用处，把发给 API 的历史也带上 seed——找到 `submitText` 里构造 `historyForApi` 的地方，把它的来源从 `messages` 改为 `allMessages`（具体变量名以文件里实际为准；关键是**发给模型的历史必须包含 seedTurns**，否则追问时模型不知道刚才那一卦）。

#### Step 5: 改造 `/spirit` 页面

把 `apps/web/app/spirit/page.tsx` 整体替换为：

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { phaseAfter, formatQuestionnaire, MAX_THROWS, type Omen, type BlockFace } from "@sojan/core";
import { getActiveProfile, getSpiritMemory, getQuestionnaire, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile } from "@/lib/tg/client";
import { supabase } from "@/lib/supabase";
import { throwJiao } from "@/lib/jiao";
import { listJiaoHistory, appendJiaoHistory, type JiaoHistoryEntry } from "@/lib/jiao-history";
import { JiaoThrow } from "@/components/JiaoThrow";
import { SpiritPanel } from "@/app/chart/SpiritPanel";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui";
import { jiaoSummaryAction } from "@/app/actions";
import { useT, useLocale } from "@/lib/i18n/I18nProvider";

const ENABLED = process.env.NEXT_PUBLIC_SPIRIT_ENABLED === "1";

type Stage =
  | { kind: "asking" }                                            // 输入问题，尚未掷
  | { kind: "throwing"; blocks: [BlockFace, BlockFace]; omen: Omen }
  | { kind: "rethrow"; omen: Omen }                               // 笑筊，可重掷
  | { kind: "reading" }                                           // 落定，等灵解
  | { kind: "conversing"; seed: { role: "user" | "spirit"; content: string }[] };

export default function SpiritPage() {
  const t = useT();
  const { locale } = useLocale();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [question, setQuestion] = useState("");
  const [throws, setThrows] = useState<Omen[]>([]);
  const [stage, setStage] = useState<Stage>({ kind: "asking" });
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [memory, setMemory] = useState<string | null>(null);
  const [questionnaire, setQuestionnaire] = useState<string | undefined>(undefined);
  const [history, setHistory] = useState<JiaoHistoryEntry[]>([]);

  useEffect(() => {
    if (!ENABLED) return;
    (async () => {
      try {
        if (hasTgSession()) {
          setProfile(await tgGetProfile());
          return;
        }
        const p = await getActiveProfile();
        setProfile(p);
        if (p) {
          const [mem, qa] = await Promise.all([getSpiritMemory(p.id), getQuestionnaire(p.id)]);
          setMemory(mem);
          setQuestionnaire(qa ? formatQuestionnaire(qa) : undefined);
        }
      } catch {
        setProfile(null);
      }
    })();
  }, []);

  // 历史列表独立 effect + 独立 try/catch：加载失败只留空列表，不挡主流程（同 /dream）
  useEffect(() => {
    if (!profile) return;
    (async () => {
      try {
        setHistory(await listJiaoHistory(profile.id));
      } catch {
        /* 保持空列表 */
      }
    })();
  }, [profile]);

  const tooLong = question.trim().length > 500;
  const canThrow = !!profile && question.trim().length >= 4 && !tooLong;

  function doThrow() {
    if (!canThrow) return;
    setError(null);
    const r = throwJiao();
    setStage({ kind: "throwing", blocks: r.blocks, omen: r.omen });
  }

  /** 动画落定后按三掷规则分流。 */
  async function onSettled(omen: Omen) {
    const next = [...throws, omen];
    setThrows(next);
    const phase = phaseAfter(next);
    if (phase.kind === "rethrow") {
      setStage({ kind: "rethrow", omen });
      return;                       // 笑筊不走 LLM、不消耗额度
    }
    setStage({ kind: "reading" });
    await askSpirit(omen, phase.kind === "exhausted");
  }

  async function askSpirit(omen: Omen, exhausted: boolean) {
    if (!profile) return;
    const q = question.trim();
    try {
      const { data: sessionData } = await supabase().auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/spirit/jiao", {
        method: "POST",
        headers: { "content-type": "application/json", "x-zj-locale": locale, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ chart: profile.chart, question: q, omen, exhausted, memory: memory ?? undefined, questionnaire }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          setNeedLogin(true);
          setStage({ kind: "asking" });
          return;
        }
        throw new Error(await res.text());
      }
      const reply = await res.text();
      setStage({ kind: "conversing", seed: [{ role: "user", content: q }, { role: "spirit", content: reply }] });
      // 历史摘要 fire-and-forget（同 /dream 的处理）：失败不影响已经拿到的回应
      jiaoSummaryAction(q, reply, locale).then((summary) => {
        if (!summary) return;
        void appendJiaoHistory(profile.id, omen, summary, reply).then(() => listJiaoHistory(profile.id).then(setHistory));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage({ kind: "asking" });
    }
  }

  function reset() {
    setQuestion("");
    setThrows([]);
    setError(null);
    setStage({ kind: "asking" });
  }

  if (!ENABLED) return <Centered><p className="text-muted">{t("spirit.notEnabled")}</p></Centered>;
  if (profile === undefined) return <Centered>{t("spirit.loadingProfile")}</Centered>;
  if (profile === null)
    return (
      <Centered>
        <p className="text-ink-2">{t("jiao.noProfile")}</p>
        <Link href="/reading" className="mt-4 inline-block px-6 py-3 text-on-ink" style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)" }}>
          {t("spirit.goCast")}
        </Link>
      </Centered>
    );

  if (stage.kind === "conversing") {
    return (
      <main className="flex h-[100dvh] flex-col">
        <header className="flex h-[56px] shrink-0 items-center justify-between border-b border-[var(--color-line)] bg-surface px-4">
          <button type="button" onClick={reset} className="text-[14px] text-ink-2">← {t("jiao.newThrow")}</button>
        </header>
        <SpiritPanel profile={profile} seedTurns={stage.seed} />
        <p className="px-5 pb-2 pt-1 text-[11px] leading-relaxed text-muted">{t("spirit.disclaimer")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[720px] px-4 pb-8 pt-6">
      <PageHeader kicker={t("jiao.kicker")} title={t("jiao.title")} annotation={t("jiao.subtitle")} />

      {stage.kind === "asking" && (
        <div className="mt-6">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t("jiao.placeholder")}
            rows={3}
            className="w-full resize-none rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2.5 text-[14px] text-ink placeholder:text-muted focus:border-[var(--color-cinnabar)] focus:outline-none"
          />
          {tooLong && <p className="mt-2 text-[12px]" style={{ color: "var(--color-seal)" }}>{t("jiao.errorTooLong")}</p>}
          <Button onClick={doThrow} disabled={!canThrow}>{t("jiao.throwCta")}</Button>
        </div>
      )}

      {stage.kind === "throwing" && <JiaoThrow blocks={stage.blocks} onSettled={() => void onSettled(stage.omen)} />}

      {stage.kind === "rethrow" && (
        <div className="mt-6">
          <p className="text-[14px] leading-relaxed text-ink-2">{t("jiao.xiaoHint")}</p>
          <p className="mt-2 text-[12px] text-muted">{t("jiao.throwsLeft", { n: String(MAX_THROWS - throws.length) })}</p>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            className="mt-3 w-full resize-none rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2.5 text-[14px] text-ink focus:border-[var(--color-cinnabar)] focus:outline-none"
          />
          <Button onClick={doThrow} disabled={!canThrow}>{t("jiao.xiaoRethrow")}</Button>
        </div>
      )}

      {stage.kind === "reading" && <p className="mt-8 text-center text-[14px] text-muted">{t("jiao.reading")}</p>}

      {needLogin && (
        <div className="mt-4 px-4 py-3 text-[13px]" style={{ borderRadius: "var(--radius-card)", background: "var(--color-error-bg)", color: "var(--color-seal)", border: "1px solid var(--color-error-line)" }}>
          {t("jiao.needLogin")}
          <Link href="/account?next=/spirit" className="ml-2 underline underline-offset-4" style={{ color: "var(--color-cinnabar)" }}>
            {t("jiao.needLoginCta")} →
          </Link>
        </div>
      )}
      {error && (
        <div className="mt-4 px-4 py-3 text-[13px]" style={{ borderRadius: "var(--radius-card)", background: "var(--color-error-bg)", color: "var(--color-seal)", border: "1px solid var(--color-error-line)" }}>
          {error}
        </div>
      )}

      {stage.kind === "asking" && history.length > 0 && (
        <div className="mt-10 pt-6" style={{ borderTop: "1px solid var(--color-line)" }}>
          <div className="text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)" }}>{t("jiao.historyTitle")}</div>
          <ul className="mt-3 space-y-2.5">
            {history.map((h) =>
              h.fullText ? (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => setStage({ kind: "conversing", seed: [{ role: "spirit", content: h.fullText! }] })}
                    className="block w-full text-left text-[13px] leading-relaxed text-ink-2 underline decoration-[var(--color-line)] underline-offset-4 transition-colors hover:text-ink hover:decoration-[var(--color-cinnabar)]"
                  >
                    {h.summary}
                  </button>
                </li>
              ) : (
                <li key={h.id} className="text-[13px] leading-relaxed text-ink-2">{h.summary}</li>
              ),
            )}
          </ul>
        </div>
      )}
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
```

**注意**：上面用到了 `jiaoSummaryAction`，需要在 `apps/web/app/actions.ts` 里新增——照抄既有的 `dreamSummaryAction`，把内部调用换成 `summarizeJiaoEntry`：

```ts
export async function jiaoSummaryAction(question: string, replyText: string, locale: "zh" | "en"): Promise<string | null> {
  try {
    return await summarizeJiaoEntry(question, replyText, { language: locale });
  } catch {
    return null;
  }
}
```
（`summarizeJiaoEntry` 从 `@sojan/llm` import；具体错误处理与返回类型对齐同文件里 `dreamSummaryAction` 的现状写法。）

#### Step 6: 扩充页面测试

在 `apps/web/app/spirit/__tests__/page.test.tsx` 里追加（**mock 基础设施照抄 `app/dream/__tests__/page.test.tsx` 顶部的写法**——`vi.resetModules()` + 动态 import + `I18nProvider` 同一次 import + `vi.hoisted` 共享 supabase session，三个陷阱见那个文件的注释）：

```tsx
describe("EP-jiao 掷筊闸门", () => {
  it("未掷筊时不渲染对话面板，只有问题输入与掷筊按钮", async () => {
    const { container } = await renderSpiritPage();
    expect(screen.getByPlaceholderText(/该不该/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "掷筊" })).toBeInTheDocument();
    expect(container.querySelector("textarea[placeholder*='对话']")).toBeNull();
  });

  it("问题少于 4 字时掷筊按钮禁用", async () => {
    await renderSpiritPage();
    fireEvent.change(screen.getByPlaceholderText(/该不该/), { target: { value: "嗯" } });
    expect(screen.getByRole("button", { name: "掷筊" })).toBeDisabled();
  });

  it("笑筊 → 显示重掷提示，且不调用 /api/spirit/jiao（不烧额度）", async () => {
    // throwJiao mock 成固定返回笑筊
    throwJiaoMock.mockReturnValue({ blocks: ["仰", "仰"], omen: "笑筊" });
    await renderSpiritPage();
    fireEvent.change(screen.getByPlaceholderText(/该不该/), { target: { value: "该不该换工作" } });
    fireEvent.click(screen.getByRole("button", { name: "掷筊" }));
    fireEvent.animationEnd(screen.getAllByTestId("jiao-block")[1]!);
    await waitFor(() => expect(screen.getByText(/神明发笑/)).toBeInTheDocument());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("圣筊 → 调用 /api/spirit/jiao 并带上筊象", async () => {
    throwJiaoMock.mockReturnValue({ blocks: ["仰", "俯"], omen: "圣筊" });
    fetchSpy.mockResolvedValue(new Response("这一掷是圣筊。"));
    await renderSpiritPage();
    fireEvent.change(screen.getByPlaceholderText(/该不该/), { target: { value: "该不该换工作" } });
    fireEvent.click(screen.getByRole("button", { name: "掷筊" }));
    fireEvent.animationEnd(screen.getAllByTestId("jiao-block")[1]!);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.omen).toBe("圣筊");
    expect(body.question).toBe("该不该换工作");
  });
});
```

> `throwJiaoMock` / `fetchSpy` 的建立方式：`vi.mock("@/lib/jiao", () => ({ throwJiao: (...a) => throwJiaoMock(...a) }))`，`fetchSpy = vi.spyOn(globalThis, "fetch")`。

#### Step 7: 跑测试 + 提交

```bash
pnpm --filter @sojan/web exec vitest run app/spirit components/__tests__/AppShell.test.tsx
pnpm --filter @sojan/web exec vitest run
git add apps/web/lib/i18n/messages/ apps/web/app/spirit/ apps/web/app/chart/SpiritPanel.tsx apps/web/app/actions.ts
git commit -m "feat(jiao): /spirit 掷筊闸门 + SpiritPanel seedTurns + i18n 键"
```

---

### Task 8: 周边归属变更 + 死代码清理 + 收尾回归

**Files:**
- Modify: `apps/web/app/chart/page.tsx`（自我画像挪入）
- Delete: `apps/web/app/spirit/portrait/page.tsx`
- Modify: `apps/web/app/fengshui/page.tsx:609-621, 661-670`（两处入口改「就这条问一卦」）
- Modify: `apps/web/lib/i18n/messages/{zh,en}.ts`（`fengshui.askSojan` 文案改写）
- Delete: `apps/web/app/chart/SpiritPortrait.tsx`、`apps/web/app/chart/Questionnaire.tsx`
- Modify: `apps/web/app/chart/__tests__/SelfPortrait.test.tsx`（若因挪位置而失效则更新）

**Interfaces:** 无新增导出。

#### Step 1: 自我画像挪到 `/chart`

`/chart` 页是**线性 `ChartBlock` 序列**，无 tab 结构（`ChartBlock` 定义在 `apps/web/app/chart/page.tsx:264-272`）。在「三段式解读 `ReadingTabs`」那一块**之前**插入：

```tsx
      <ChartBlock label={t("chart.selfPortraitTitle")}>
        <SelfPortrait chart={chart} questionnaire={qAnswers ?? undefined} />
      </ChartBlock>
```

需要：
- 顶部加 `import { SelfPortrait } from "./SelfPortrait";`
- 新增 `qAnswers` state 与加载（`/chart` 页当前**没有**读 questionnaire）：
  ```tsx
  const [qAnswers, setQAnswers] = useState<Awaited<ReturnType<typeof getQuestionnaire>>>(null);
  useEffect(() => {
    if (!profile) return;
    getQuestionnaire(profile.id).then(setQAnswers).catch(() => setQAnswers(null));
  }, [profile]);
  ```
  （`getQuestionnaire` from `@/lib/profiles`。）
- **用 `fullPage={false}`（默认值，不传即可）**——那是 Card 包装的紧凑版，适合嵌在 ChartBlock 里；`fullPage` 是给已删除的独立页用的。
- **不传 `onTalk`**：原来它跳 `/spirit?topic=portrait` 开启自由聊，与收缩后的语义冲突。

#### Step 2: 删除画像独立页与死代码

```bash
git rm apps/web/app/spirit/portrait/page.tsx
git rm apps/web/app/chart/SpiritPortrait.tsx
git rm apps/web/app/chart/Questionnaire.tsx
```

删除后必须清理悬空引用：
- `apps/web/app/spirit/page.tsx` 里指向 `/spirit/portrait` 的「查看自我画像」链接——Task 7 的新版页面已经没有这个 header 了，确认无残留即可。
- 全仓搜索确认无引用：
  ```bash
  grep -rn "spirit/portrait\|SpiritPortrait\|chart/Questionnaire" apps/web --include="*.tsx" --include="*.ts" | grep -v node_modules
  ```
  预期输出为空。
- `apps/web/lib/i18n/messages/{zh,en}.ts` 里的 `spirit.viewPortrait`、`spirit.talkAboutPortrait`、`spirit.talkPortraitMessage`、`spirit.portraitPageTitle`、`spirit.share` 这几个键若确认零引用则**两侧同时删**（删之前逐个 grep 确认；`spirit.portraitNoteTitle` 被 `SelfPortrait.tsx` 用着，**不要删**）。

#### Step 3: 风水入口改「就这条问一卦」

`apps/web/app/fengshui/page.tsx` **两处** href 完全一致（609-621 行的 TG 原生臂、661-670 行的 web 编辑式清单），都要改。把 href 从：

```tsx
href={`/spirit?topic=fengshui&q=${encodeURIComponent(truncateForSpiritQuery(r.action))}`}
```

改为（改参数名，语义从「聊聊」变成「问一卦」）：

```tsx
href={`/spirit?ask=${encodeURIComponent(truncateForSpiritQuery(r.action))}`}
```

并在 Task 7 的 `/spirit` 页里消费这个参数——在 profile 加载的 effect 之后加：

```tsx
  // 风水页「就这条问一卦」带过来的预填问题（化解动作文本）。只预填，不自动掷——
  // 掷筊是用户自己的动作，不能替他掷。
  useEffect(() => {
    const ask = new URLSearchParams(window.location.search).get("ask");
    if (ask) setQuestion(ask);
  }, []);
```

i18n 文案 `fengshui.askSojan` 两侧同时改：
- `zh.ts`: `askSojan: "就这条问一卦"`
- `en.ts`: `askSojan: "Ask a divination on this"`

`apps/web/app/fengshui/__tests__/page.test.tsx:678,695,710,716` 有断言「和 Sojan 聊聊这条」的用例，按新文案更新（**只改文案断言，不要动 flag 门控那部分的逻辑断言**）。

#### Step 4: 全量回归

```bash
pnpm --filter @sojan/core exec vitest run
pnpm --filter @sojan/llm exec vitest run
pnpm --filter @sojan/web exec vitest run
pnpm run typecheck
pnpm --filter @sojan/web build
```
预期：三包全绿；typecheck 只剩既存 7 处（`account`/`dream`/`auth/callback`/`merge-anon` 测试文件）；build 通过。

#### Step 5: 提交

```bash
git add -A
git commit -m "refactor(spirit): 自我画像挪入命盘页、风水入口改问一卦、清理死代码（EP-jiao）"
```

#### Step 6: 交接说明模板

把下面填好实际数字后作为最终交付说明：

```
EP-jiao 实施完成，交回 claude 验收。

- Task 1-8 全部完成，共 N 次提交：<列出 commit hash>
- 测试：core <N> passed / llm <N> passed / web <N> passed（全绿）
- typecheck：<粘贴实际输出>，既存 7 处无关错误未变化、未新增
- build：通过
- ⚠️ 迁移 0019_jiao_history.sql **已写但未 apply 生产**（按仓库惯例待 owner 确认）
- 人工验收清单（需 claude 或 owner 过）：
  ① 掷筊动画在正常与 prefers-reduced-motion 两种设置下都能出结果
  ② 笑筊重掷不消耗额度（看服务端日志无 [jiao] 记录）
  ③ 三次笑筊后灵改为拆解问题、不再解筊象
  ④ 历史列表点进去能续追问
  ⑤ 风水页「就这条问一卦」预填了化解动作文本
```

---

## 计划自审

**Spec 覆盖检查**：spec §1 主流程与三掷规则 → Task 1（规则）+ Task 6（动画）+ Task 7（编排）；§2 数据与存储 → Task 4；§3 随机源 → Task 2；§4 反幻觉与安全 → Task 3（`correctOmen` + prompt 硬规则）+ Task 5（服务端筊象闭集校验）；§5 周边归属变更 → Task 8（自我画像/风水入口）+ Task 7（QuickPrompts 改写）；§6 门控与前置 → Task 5（路由 flag）+ Task 7（页面 flag、`?next=` 回跳）；§7 动画 → Task 6；§8 顺带清理 → Task 8；§10 验收标准 → Task 8 Step 4-6。

**未覆盖项（有意）**：spec §5「每日问今留在运势页」「TG bot 私聊内测期保留」两条是「不改动」，无对应任务，正确。

**占位符扫描**：无 TBD/TODO；每个代码步骤都给了完整代码。自审时改掉了两处自己写错的地方：`needLogin` 的登录链接原本写成 `/spirit?next=/spirit`（应为 `/account?next=/spirit`，复用 EP-auth-return 的回跳机制）；`Stage` 类型里的 `BlockFace` 原本用了 inline `import("@sojan/core")` 写法，已改为顶部具名 import。

**类型一致性检查**：`Omen`/`BlockFace`/`JiaoPhase` 在 Task 1 定义，Task 2/3/4/5/6/7 的用法与之一致；`JiaoOptions.omenForFollowUp` 在 Task 3 Step 3 的正文与补充说明里定义一致；`seedTurns` 的元素形状 `{ role: "user" | "spirit"; content: string }` 在 Task 7 Step 4（SpiritPanel prop）与 Step 5（页面传入）一致；`appendJiaoHistory(profileId, omen, summary, fullText)` 的四参数顺序在 Task 4 定义、Task 7 调用一致。
