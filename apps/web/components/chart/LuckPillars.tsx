"use client";

import type { UnifiedChart } from "@sojan/core";
import { Emphasis, PillChip } from "@/components/ui";
import { useT } from "@/lib/i18n/I18nProvider";

type Luck = { startAge: number; startYear: number; pillar: string };

/**
 * 大运三格 + 流年 chip 行（设计包 5b 第 5 条）。
 *
 * ⚠️ `luckPillars` 在 `BaziChartSchema` 里是 `.default([])`——**早期冻结的命盘
 * 可能没有这个字段，解析后是空数组**。为空时整块不渲染，而不是渲染三个空格
 * （渲染空格会让用户以为数据坏了，且看不出是历史命盘的结构差异）。
 * 生产库抽查（2026-08-27，41 条 profiles）：total=41 / has_luck=41，实际影响面为 0，
 * 但兜底按要求照做——抽查只用来评估影响面，不作为是否写兜底的依据。
 *
 * ⚠️ 流年年份序列是**展示层算术**（现行运的 10 年跨度），不是命理推算，可以在这里算；
 * 但**四化不许在展示层算**——那是 `computeZiweiHoroscope` 的活，本组件不碰。
 *
 * 强调手法：现行运整行走 `Emphasis`（全站唯一强调手法）；当前流年走 `PillChip`
 * 的 `emphasis` prop（同一枚 chip 的状态色，与 `Chip` 既有 API 对齐）——
 * `PillChip` 的 `style` 被 `Omit` 掉，不能从这里传内联 style 覆盖朱砂描边。
 */
export function LuckPillars({ bazi }: { bazi: UnifiedChart["bazi"] }) {
  const t = useT();
  const list = (bazi.luckPillars ?? []) as Luck[];
  // 与下方 idx<0 守卫（对空数组必然生效）逐字重复，为提前退出与可读性保留，
  // 不是可删的死代码——黑盒测试杀不死这行，但删掉会让读者误以为空数组会往
  // 下走到 idx 逻辑里再算一遍。
  if (list.length === 0) return null;

  const thisYear = new Date().getFullYear();
  let idx = bazi.currentLuckPillar ? list.findIndex((l) => l.pillar === bazi.currentLuckPillar) : -1;
  if (idx < 0) {
    // 退路：最后一个 startYear <= 今年的那格（含 currentLuckPillar 存在但在
    // list 里找不到——即 findIndex 落空——的情况，两者共用同一条退路）。
    for (let i = 0; i < list.length; i++) if (list[i].startYear <= thisYear) idx = i;
  }
  if (idx < 0) return null; // 命主尚未起运（所有 startYear 都晚于当前年）

  const rows: Array<{ luck: Luck; label: string; current: boolean }> = [];
  if (list[idx - 1]) rows.push({ luck: list[idx - 1], label: t("chart.luckPrev"), current: false });
  rows.push({ luck: list[idx], label: t("chart.luckCurrent"), current: true });
  if (list[idx + 1]) rows.push({ luck: list[idx + 1], label: t("chart.luckNext"), current: false });

  const start = list[idx].startYear;
  const years = Array.from({ length: 10 }, (_, i) => start + i);

  return (
    // mt-10 + border-top + pt-8（I4）：与 ChartBlock 的块级节奏对齐——此前根是
    // 裸 <div>，上游 BaziPillars 末行只有 py-4，「大运」标题因此被吸进了
    // 四柱块里（同款 11px/.3em 字号进一步加剧误读）。
    <div className="mt-10 border-t border-[var(--color-line)] pt-8">
      <h3 className="text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)" }}>
        {t("chart.luckTitle")}
      </h3>
      <div className="mt-4 flex flex-col gap-2">
        {rows.map(({ luck, label, current }) => {
          const body = (
            <div className="flex items-baseline justify-between gap-3 py-2">
              <span className="font-serif text-[19px]">{luck.pillar}</span>
              <span className="text-[11.5px]" style={{ color: "var(--color-muted)" }}>
                {label} · {t("chart.luckRange", { startAge: luck.startAge, startYear: luck.startYear })}
              </span>
            </div>
          );
          return current ? (
            <Emphasis key={luck.pillar} data-testid="luck-row">
              {body}
            </Emphasis>
          ) : (
            <div key={luck.pillar} data-testid="luck-row">
              {body}
            </div>
          );
        })}
      </div>

      <h3 className="mt-6 text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)" }}>
        {t("chart.flowYearTitle")}
      </h3>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {years.map((y) => (
          <PillChip key={y} data-testid="flow-year-chip" emphasis={y === thisYear}>
            {y}
          </PillChip>
        ))}
      </div>
    </div>
  );
}
