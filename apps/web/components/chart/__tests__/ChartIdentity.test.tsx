import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { ChartIdentity } from "../ChartIdentity";
import type { UnifiedChart } from "@sojan/core";

// 生日未到的 fixture：出生 1993-12-22，而「当前」设为 2026-08-27 —— 周岁是 32、年差是 33。
// 这个 fixture 是本用例的关键：若取周岁，下面 33 岁那条断言必红。
// ⚠️ 用 normalizedSolarTime 取代 brief 里写死的 `birth.date`——UnifiedChartSchema 根本没有
// `birth` 字段（见 packages/core/src/types/chart.ts），只有 normalizedSolarTime/bazi/ziwei/western。
// ⚠️ 年柱用 { stem, branch } 而非 brief 里写的 `{ ganzhi }`——PillarSchema 没有 `.ganzhi`
// 字段（见 packages/core/src/types/chart.ts 的 PillarSchema），只有 stem/branch/element/...。
function fixture(over: Partial<UnifiedChart["bazi"]> = {}): UnifiedChart {
  return {
    normalizedSolarTime: "1993-12-22 21:47",
    bazi: {
      pillars: { year: { stem: "癸", branch: "酉" }, month: {}, day: {}, hour: {} },
      dayMaster: "庚",
      dayMasterElement: "金",
      dayMasterStrength: "weak",
      fiveElementCounts: {},
      luckPillars: [],
      ...over,
    },
  } as unknown as UnifiedChart;
}

function renderAt(chart: UnifiedChart, isoNow = "2026-08-27T10:00:00Z", locale: "zh" | "en" = "zh") {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(isoNow));
  const r = render(<I18nProvider locale={locale}><ChartIdentity chart={chart} /></I18nProvider>);
  vi.useRealTimers();
  return r;
}

describe("ChartIdentity", () => {
  it("日主行 = 日主干 + 五行 + 旺衰 tag", () => {
    renderAt(fixture());
    expect(screen.getByTestId("day-master-line").textContent).toBe("庚金日主 ·【偏弱型】");
  });

  it("旺衰 unknown 时不渲染 tag（不是渲染一个空【】）", () => {
    renderAt(fixture({ dayMasterStrength: "unknown" }));
    expect(screen.getByTestId("day-master-line").textContent).toBe("庚金日主");
  });

  it("三枚 chip = 纳音 / 生肖 / 年龄，年龄用年差不是周岁", () => {
    renderAt(fixture());
    const chips = screen.getAllByTestId("identity-chip").map((e) => e.textContent);
    // 1993 出生、2026-08-27「当前」，生日（12-22）未到：周岁 32、年差 33。取 33。
    expect(chips).toEqual(["剑锋金", "属鸡", "33 岁"]);
  });

  it("换一个年柱，纳音与生肖跟着变（防写死示例值）", () => {
    renderAt(fixture({ pillars: { year: { stem: "庚", branch: "申" }, month: {}, day: {}, hour: {} } as never }));
    const chips = screen.getAllByTestId("identity-chip").map((e) => e.textContent);
    expect(chips.slice(0, 2)).toEqual(["石榴木", "属猴"]);
  });

  it("en locale 下 chrome 翻译、命理术语仍是中文", () => {
    renderAt(fixture(), "2026-08-27T10:00:00Z", "en");
    expect(screen.getByTestId("day-master-line").textContent).toBe("Day Master 庚金 ·[Weak]");
    expect(screen.getAllByTestId("identity-chip")[1].textContent).toBe("Year of the 鸡");
  });

  it("年柱非法（不在 60 甲子里）时 deriveNayinZodiac 返回 null —— 只剩年龄一枚 chip，不渲染 null/undefined", () => {
    // 「甲丑」：地支合法、但干支阴阳不配对，不在 60 甲子里，LunarUtil.NAYIN['甲丑'] === undefined。
    // deriveNayinZodiac 对它返回 null（Task 1 已实测）。这条覆盖 `if (nz)` 守卫的假侧——
    // 之前五条用例的年柱永远合法，nz 恒为真，假侧从未被测到过。
    const { container } = renderAt(fixture({ pillars: { year: { stem: "甲", branch: "丑" }, month: {}, day: {}, hour: {} } as never }));
    const chips = screen.getAllByTestId("identity-chip");
    expect(chips.length).toBe(1);
    expect(chips[0].textContent).toBe("33 岁");
    expect(container.textContent).not.toMatch(/null|undefined/);
  });
});
