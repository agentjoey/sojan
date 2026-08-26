import { LunarUtil } from "lunar-typescript";

/**
 * 纳音 + 生肖：**派生事实，不进冻结命盘**。
 *
 * 设计包 5b 的三枚 chip 要「纳音 / 生肖 / 年龄」，而这两项都不在
 * `BaziChartSchema` 里。按 CLAUDE.md 的既定约定，派生事实在 facts 层从既有
 * `UnifiedChart` 算，**不改冻结结构**——因此这里只吃一个已经存在于任何时期
 * 冻结命盘里的年柱字符串（`chart.bazi.pillars.year.ganzhi`），新旧命盘通吃、零迁移。
 *
 * ⚠️ `ZiweiChartSchema` 里那个 `zodiac` 字段是**西洋盘的 tropical/sidereal 设置**，
 * 与生肖无关，别误用。
 */
export function deriveNayinZodiac(yearPillar: string): { nayin: string; zodiac: string } | null {
  const gz = (yearPillar ?? "").trim();
  if (gz.length !== 2) return null;
  const nayin = LunarUtil.NAYIN[gz];
  if (!nayin) return null;
  // LunarUtil.ZHI / SHENGXIAO 都是 1-indexed（[0] 为空串），indexOf 找不到时返回 -1
  const zhiIndex = LunarUtil.ZHI.indexOf(gz[1]);
  if (zhiIndex < 1) return null;
  const zodiac = LunarUtil.SHENGXIAO[zhiIndex];
  if (!zodiac) return null;
  return { nayin, zodiac };
}
