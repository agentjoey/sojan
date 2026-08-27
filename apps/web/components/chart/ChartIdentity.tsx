"use client";

import { deriveNayinZodiac, type UnifiedChart } from "@sojan/core";
import { PillChip } from "@/components/ui";
import { useT } from "@/lib/i18n/I18nProvider";

const STRENGTH_TAG_KEY = {
  strong: "chart.strengthTagStrong",
  weak: "chart.strengthTagWeak",
  balanced: "chart.strengthTagBalanced",
} as const;

/**
 * 命盘身份行（设计包 5b 第 1–2 条）：居中日主行 + 三枚胶囊 chip。
 *
 * ⚠️ 出生年取自 `chart.normalizedSolarTime`（`YYYY-MM-DD HH:mm...`，见
 * `packages/core/src/normalize.ts`），**不是** brief 原稿写的 `chart.birth.date`——
 * `UnifiedChartSchema` 根本没有 `birth` 字段，只有
 * `normalizedSolarTime`/`bazi`/`ziwei`/`western` 四个顶层字段
 * （见 `packages/core/src/types/chart.ts`）。用归一后的真太阳时取年份，
 * 农历生日在 1–2 月出生的档案也不会因为「原始输入日期」而年份算错。
 *
 * ⚠️ 年龄用**简单年差**（当前年 − 出生年），不是周岁——依据设计包自洽示例
 * 「1993-12-22 生 · 33 岁」，而 2026-08 其生日未到、周岁应为 32。稿子取的就是年差。
 * ⚠️ 纳音/生肖来自 core 的 `deriveNayinZodiac`（派生事实、不进冻结命盘），
 * **不在这里查表**——展示层零推算。
 */
export function ChartIdentity({ chart }: { chart: UnifiedChart }) {
  const t = useT();
  const { dayMaster, dayMasterElement, dayMasterStrength } = chart.bazi;

  const tagKey = STRENGTH_TAG_KEY[dayMasterStrength as keyof typeof STRENGTH_TAG_KEY];
  const line = t("chart.dayMasterLine", { stem: dayMaster, element: dayMasterElement });

  // ⚠️ PillarSchema 没有 `.ganzhi` 字段（只有 stem/branch/element/...），
  // 与 Task 1 doc 注释里写的 `chart.bazi.pillars.year.ganzhi` 不符——按
  // `packages/core/src/fengshui/ming-gua.ts:41` 的既有写法拼出干支字符串。
  const nz = deriveNayinZodiac(chart.bazi.pillars.year.stem + chart.bazi.pillars.year.branch);
  const birthYear = Number(String(chart.normalizedSolarTime).slice(0, 4));
  // 不可达守卫（假侧）：`normalizedSolarTime` 由 `packages/core/src/normalize.ts`
  // 保证 `YYYY-MM-DD HH:mm` 前缀，前 4 位恒为数字字符，`Number(...)` 恒为
  // finite；保留为防御，不为它硬凑测试用例。
  const age = Number.isFinite(birthYear) ? new Date().getFullYear() - birthYear : null;

  const chips: string[] = [];
  if (nz) chips.push(nz.nayin, t("chart.zodiacChip", { animal: nz.zodiac }));
  if (age !== null) chips.push(t("chart.ageChip", { age }));

  return (
    // mt-8/xl:mt-6（I2）：页头与本组件之间此前是 0 间距（页头无下外边距、
    // TwoColumn header 槽只在 xl 有 pb-6、grid 无 row-gap）——补回原
    // ChartBlock 的 mt-10 pt-8 节奏留下的间距缺口。本组件只被 /chart 消费，
    // 改这里不影响 /calendar。
    <div className="mt-8 text-center xl:mt-6">
      <p data-testid="day-master-line" className="font-serif text-[17px]">
        <span className="text-cinnabar">{line}</span>
        {tagKey && <> ·{t(tagKey)}</>}
      </p>
      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {chips.map((c, i) => (
            <PillChip key={i} data-testid="identity-chip">{c}</PillChip>
          ))}
        </div>
      )}
    </div>
  );
}
