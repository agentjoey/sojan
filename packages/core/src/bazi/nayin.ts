import { LunarUtil } from "lunar-typescript";

/**
 * 纳音 + 生肖：**派生事实，不进冻结命盘**。
 *
 * 设计包 5b 的三枚 chip 要「纳音 / 生肖 / 年龄」，而这两项都不在
 * `BaziChartSchema` 里。按 CLAUDE.md 的既定约定，派生事实在 facts 层从既有
 * `UnifiedChart` 算，**不改冻结结构**——因此这里只吃一个已经存在于任何时期
 * 冻结命盘里的年柱字符串（`PillarSchema` 没有 `.ganzhi` 字段，由调用方拼出
 * `chart.bazi.pillars.year.stem + .branch`），新旧命盘通吃、零迁移。
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
  // 不可达守卫：能过上面 `LunarUtil.NAYIN[gz]` 查找的 gz 必是 60 甲子里的合法
  // 干支组合，其地支字符必在 `LunarUtil.ZHI` 里、indexOf 不可能返回 -1 或 0
  // （[0] 是占位空串）；保留为防御，不为它硬凑测试用例。
  if (zhiIndex < 1) return null;
  const zodiac = LunarUtil.SHENGXIAO[zhiIndex];
  // 不可达守卫：zhiIndex 已通过上面的 `>= 1` 检查，`LunarUtil.SHENGXIAO` 与
  // `LunarUtil.ZHI` 同长同序 1-indexed，该下标必有对应生肖；保留为防御。
  if (!zodiac) return null;
  return { nayin, zodiac };
}
