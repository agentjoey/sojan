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
