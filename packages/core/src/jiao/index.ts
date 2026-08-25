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
  // 前缀不变量：settled/exhausted 一旦出现就该结束这一轮，调用方不该在那之后
  // 又掷一次还来问 phaseAfter——所以除最后一掷外，前面每一掷都必须是笑筊。
  // `packages/core/test/` 不过类型检查（tsconfig `include` 只有 `src`），这类
  // 不变量因此只能靠运行时断言守住：写错测试用例（或调用方状态机出 bug）时
  // 第一时间炸出来，而不是被静默放过、算出一个看似合理实则无意义的结果。
  if (!throws.slice(0, -1).every((o) => o === "笑筊")) {
    throw new Error("phaseAfter：非法的掷筊序列——settled/exhausted 之后不该再有更多掷");
  }
  if (last !== "笑筊") return { kind: "settled", omen: last };
  return throws.length >= MAX_THROWS ? { kind: "exhausted" } : { kind: "rethrow" };
}
