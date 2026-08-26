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
  const age = Number.isFinite(birthYear) ? new Date().getFullYear() - birthYear : null;

  const chips: string[] = [];
  if (nz) chips.push(nz.nayin, t("chart.zodiacChip", { animal: nz.zodiac }));
  if (age !== null) chips.push(t("chart.ageChip", { age }));

  return (
    <div className="text-center">
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
