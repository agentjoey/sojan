"use client";

import { useState, type CSSProperties } from "react";
import type { ZiweiChart, Palace, Star } from "@sojan/core";
import { deriveTriad } from "@sojan/core";
import { Emphasis, MutagenTag } from "@/components/ui";
import { useT } from "@/lib/i18n/I18nProvider";

/**
 * 照见 · 紫微星盘（presentational, data-driven, NO recomputation）
 *
 * 固定地支布局（4×4 细线格，中心 2×2 合并为命主信息格）：
 *   巳 午 未 申
 *   辰 ▦  ▦ 酉
 *   卯 ▦  ▦ 戌
 *   寅 丑 子 亥
 * 宫位按 palace.branch 落位（非数组顺序）。
 *
 * 细线格实现：容器只画上/左边线，每格只画右/下边线，
 * 相邻格共享一条 1px var(--color-line)，不再有小卡与圆角。
 *
 * 选中宫详情块（6b，本轮新增，棋盘布局本身未动）：每宫内层下沉一个
 * role="button" 的可交互 <div>（照 BaguaWheel 的既有契约：testid/tabIndex/
 * Enter+Space/aria-pressed/zj-wheel-focus 焦点环），外层格只保留几何与细线，
 * 不涉及 SVG 的 role="img" 陷阱。默认选中 soulPalaceBranch 对应宫（命宫），
 * 下方 Emphasis 详情块随选中切换；空宫时借星来自 core 的 deriveTriad（三方
 * 四正），不在本组件里算对宫。详情文案是确定性字符串拼装，不引入 LLM。
 */

// 地支 → 网格坐标（row/col，1-indexed）。
const BRANCH_CELL: Record<string, { row: number; col: number }> = {
  巳: { row: 1, col: 1 }, 午: { row: 1, col: 2 }, 未: { row: 1, col: 3 }, 申: { row: 1, col: 4 },
  辰: { row: 2, col: 1 },                                                  酉: { row: 2, col: 4 },
  卯: { row: 3, col: 1 },                                                  戌: { row: 3, col: 4 },
  寅: { row: 4, col: 1 }, 丑: { row: 4, col: 2 }, 子: { row: 4, col: 3 }, 亥: { row: 4, col: 4 },
};

const MUTAGEN_ORDER = ["禄", "权", "科", "忌"] as const;

// 每格只补右/下边线（容器已画上/左），避免相邻格线宽叠加。
const CELL_LINES: CSSProperties = {
  borderRight: "1px solid var(--color-line)",
  borderBottom: "1px solid var(--color-line)",
};

function PalaceCell({
  palace,
  selected,
  onSelect,
}: {
  palace: Palace;
  selected: boolean;
  onSelect: (name: string) => void;
}) {
  const t = useT();
  const pos = BRANCH_CELL[palace.branch];
  if (!pos) return null;

  // 收集本宫所有四化（去重、固定顺序），用于右上角标签。
  const allStars: Star[] = [...palace.majorStars, ...palace.minorStars, ...palace.adjectiveStars];
  const mutagens = MUTAGEN_ORDER.filter((k) => allStars.some((s) => s.mutagen === k));

  const select = () => onSelect(palace.name);

  return (
    // 外层格：只负责棋盘几何（网格定位/细线/最小高），position:relative 供地支小标锚定。
    // 交互态下沉到内层 <div role="button">——不是 SVG，无 role="img" 的 ARIA 陷阱，
    // 但仍照 BaguaWheel 的既有交互契约（testid/role/tabIndex/Enter+Space/aria-pressed/焦点环）来做。
    <div
      data-testid={`ziwei-palace-${palace.branch}`}
      className="relative"
      style={{
        gridRow: pos.row,
        gridColumn: pos.col,
        minHeight: 78,
        ...CELL_LINES,
      }}
    >
      <div
        data-testid={`palace-cell-${palace.name}`}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={select}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            select();
          }
        }}
        className="zj-wheel-focus flex h-full flex-col"
        style={{ padding: 8, cursor: "pointer" }}
      >
        {/* 顶部：宫名（左上，muted 小字）+ 四化标签（右）*/}
        <div className="flex items-start justify-between gap-1">
          <span className="text-muted leading-tight" style={{ fontSize: 10 }}>
            {palace.name}
            {palace.isBodyPalace && (
              <span
                className="ml-1 align-middle"
                style={{ color: "var(--color-cinnabar)", fontSize: 10 }}
              >
                {t("chart.bodyPalaceSuffix")}
              </span>
            )}
          </span>
          {mutagens.length > 0 && (
            <span className="flex shrink-0 flex-wrap justify-end gap-0.5">
              {mutagens.map((k) => (
                <MutagenTag key={k} kind={k} />
              ))}
            </span>
          )}
        </div>

        {/* 主星：宋体 12-13px 墨色 */}
        <div className="mt-1.5 flex flex-wrap gap-x-1.5 gap-y-0.5">
          {palace.majorStars.map((s, i) => (
            <span
              key={`maj-${i}`}
              className="text-ink leading-snug"
              style={{ fontSize: "clamp(12px, 2.8vw, 13px)" }}
            >
              {s.name}
              {s.brightness && (
                <span className="text-muted" style={{ fontSize: "0.78em" }}>
                  {s.brightness}
                </span>
              )}
            </span>
          ))}
        </div>

        {/* 辅星 / 杂曜（弱化）*/}
        {(palace.minorStars.length > 0 || palace.adjectiveStars.length > 0) && (
          <div
            className="mt-1 flex flex-wrap gap-x-1 gap-y-0 text-muted leading-snug"
            style={{ fontSize: "clamp(9px, 2.2vw, 10px)" }}
          >
            {palace.minorStars.map((s, i) => (
              <span key={`min-${i}`}>{s.name}</span>
            ))}
            {palace.adjectiveStars.map((s, i) => (
              <span key={`adj-${i}`} style={{ opacity: 0.8 }}>
                {s.name}
              </span>
            ))}
          </div>
        )}

        {/* 地支（右下，拉丁小标气质）*/}
        <span
          className="latin-label absolute text-muted"
          style={{ right: 8, bottom: 6, fontSize: "clamp(10px, 2.4vw, 11px)", letterSpacing: "0.12em" }}
        >
          {palace.branch}
        </span>
      </div>
    </div>
  );
}

/** 星曜显示标签：星名 + 亮度（庙旺得利平不陷），确定性拼装。 */
function starLabel(s: Star): string {
  return s.brightness ? `${s.name}(${s.brightness})` : s.name;
}

/**
 * 选中宫详情块（6b）：宫名 + 主星（星名/亮度/四化）+ 一段确定性说明文字。
 * 空宫时改由 core 的 deriveTriad 给出的借星（三方四正）作说明——不在本组件里算对宫。
 * 文案是纯字符串拼装，不引入 LLM：LLM 挂掉时盘图与详情块必须完整可用。
 */
function PalaceDetail({ palace, palaces }: { palace: Palace; palaces: Palace[] }) {
  const t = useT();
  const triad = deriveTriad(palaces, palace.name);

  return (
    <Emphasis data-testid="palace-detail" className="flex flex-col gap-1.5 py-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-ink" style={{ fontSize: 15, fontWeight: 600 }}>
          {palace.name}
        </span>
        {palace.majorStars.map((s, i) => (
          <span key={`detail-maj-${i}`} className="inline-flex items-center gap-1">
            <span className="text-ink" style={{ fontSize: 13 }}>
              {starLabel(s)}
            </span>
            {s.mutagen && <MutagenTag kind={s.mutagen} />}
          </span>
        ))}
      </div>
      <p className="text-muted" style={{ fontSize: 12 }}>
        {triad.isEmpty
          ? t("chart.palaceDetailEmpty", {
              palaces: triad.borrowedFrom.join("、"),
              stars: triad.stars.join("、") || "—",
            })
          : t("chart.palaceDetailStars", { stars: palace.majorStars.map(starLabel).join("、") || "—" })}
      </p>
    </Emphasis>
  );
}

/** 四化图例：禄/权/科/忌四色齐，复用 MutagenTag（不自画色块）。 */
function MutagenLegend() {
  const t = useT();
  return (
    <div data-testid="mutagen-legend" className="flex flex-wrap items-center gap-3">
      <span className="text-muted" style={{ fontSize: 10 }}>
        {t("chart.mutagenLegendTitle")}
      </span>
      {MUTAGEN_ORDER.map((k) => (
        <MutagenTag key={k} kind={k} />
      ))}
    </div>
  );
}

function CenterCell({ ziwei }: { ziwei: ZiweiChart }) {
  const t = useT();
  const facts: { label: string; value: string }[] = [
    { label: t("chart.soulPalace"), value: ziwei.soulPalaceBranch },
    { label: t("chart.bodyPalace"), value: ziwei.bodyPalaceBranch },
    { label: t("chart.fiveElementBureau"), value: ziwei.fiveElementBureau },
  ];
  return (
    <div
      data-testid="ziwei-center"
      className="flex flex-col justify-center gap-3"
      style={{
        gridRow: "2 / span 2",
        gridColumn: "2 / span 2",
        padding: "clamp(10px, 2.4vw, 16px)",
        ...CELL_LINES,
      }}
    >
      {/* 命主 / 身主 / 五行局：宋体 15px + muted 小字（替代旧深墨锚点块） */}
      <div className="flex flex-wrap items-baseline justify-center gap-x-4 gap-y-1.5">
        {facts.map((f) => (
          <span key={f.label} className="inline-flex items-baseline gap-1">
            <span className="text-muted" style={{ fontSize: 10 }}>
              {f.label}
            </span>
            <span className="text-ink" style={{ fontSize: 15, fontWeight: 500 }}>
              {f.value}
            </span>
          </span>
        ))}
      </div>

      <div
        className="mx-auto"
        style={{ height: 1, width: "60%", background: "var(--color-line)" }}
      />

      {/* 生年四化 */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-muted" style={{ fontSize: 10 }}>
          {t("chart.birthMutagens")}
        </span>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {MUTAGEN_ORDER.map((k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <MutagenTag kind={k} />
              <span className="text-ink" style={{ fontSize: 12 }}>{ziwei.birthMutagens[k]}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ZiweiBoard({ ziwei }: { ziwei: ZiweiChart }) {
  // 默认选中命宫：即 branch === soulPalaceBranch 的那一宫；找不到则退回第一宫兜底。
  const defaultName =
    ziwei.palaces.find((p) => p.branch === ziwei.soulPalaceBranch)?.name ?? ziwei.palaces[0]?.name ?? "";
  const [selectedName, setSelectedName] = useState(defaultName);
  const selectedPalace = ziwei.palaces.find((p) => p.name === selectedName) ?? ziwei.palaces[0];

  return (
    <div className="flex flex-col gap-4">
      <div
        data-testid="ziwei-grid"
        className="grid w-full md:aspect-square"
        style={{
          gridTemplateColumns: "repeat(4, 1fr)",
          gridTemplateRows: "repeat(4, minmax(0, auto))",
          borderTop: "1px solid var(--color-line)",
          borderLeft: "1px solid var(--color-line)",
          fontFamily: "var(--font-serif)",
        }}
      >
        {ziwei.palaces.map((p, i) => (
          <PalaceCell
            key={`${p.branch}-${i}`}
            palace={p}
            selected={p.name === selectedName}
            onSelect={setSelectedName}
          />
        ))}
        <CenterCell ziwei={ziwei} />
      </div>

      {selectedPalace && <PalaceDetail palace={selectedPalace} palaces={ziwei.palaces} />}

      <MutagenLegend />
    </div>
  );
}
