import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { LuckPillars } from "../LuckPillars";

type Bazi = Parameters<typeof LuckPillars>[0]["bazi"];

const PILLARS = [
  { startAge: 3, startYear: 1996, pillar: "乙丑" },
  { startAge: 13, startYear: 2006, pillar: "丙寅" },
  { startAge: 23, startYear: 2016, pillar: "丁卯" },
  { startAge: 33, startYear: 2026, pillar: "丙申" },
  { startAge: 43, startYear: 2036, pillar: "己巳" },
];

function bazi(over: Record<string, unknown> = {}): Bazi {
  return { luckPillars: PILLARS, ...over } as unknown as Bazi;
}

function renderAt(b: Bazi, isoNow = "2026-08-27T10:00:00Z") {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(isoNow));
  return render(
    <I18nProvider locale="zh">
      <LuckPillars bazi={b} />
    </I18nProvider>,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("LuckPillars", () => {
  it("currentLuckPillar 存在时按它定位现行运，取出前/现/后三格", () => {
    renderAt(bazi({ currentLuckPillar: "丁卯" }));
    const rows = screen.getAllByTestId("luck-row").map((e) => e.textContent);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain("丙寅");
    expect(rows[1]).toContain("丁卯");
    expect(rows[2]).toContain("丙申");
  });

  it("三格的标签与年龄区间都正确（防标签互换与插值坏掉）", () => {
    renderAt(bazi({ currentLuckPillar: "丁卯" }));
    const rows = screen.getAllByTestId("luck-row").map((e) => e.textContent ?? "");
    expect(rows[0]).toContain("前一运");
    expect(rows[1]).toContain("现行");
    expect(rows[2]).toContain("下一运");
    // idx=2（丁卯，startAge 23 / startYear 2016）是 PILLARS fixture 里的现行运
    expect(rows[1]).toContain("23 岁起 · 2016");
    expect(rows.join("")).not.toContain("{startAge}");
  });

  it("currentLuckPillar 缺失时按 startYear 与当前年比对推出现行运", () => {
    renderAt(bazi()); // 无 currentLuckPillar，当前 2026 → 命中 startYear 2026 那格
    const rows = screen.getAllByTestId("luck-row").map((e) => e.textContent);
    expect(rows[1]).toContain("丙申");
    expect(rows[0]).toContain("丁卯");
    expect(rows[2]).toContain("己巳");
  });

  it("currentLuckPillar 指向的干支不在 list 里（findIndex 落空）时同样落到 startYear 退路", () => {
    renderAt(bazi({ currentLuckPillar: "壬子" })); // list 里不存在的干支
    const rows = screen.getAllByTestId("luck-row").map((e) => e.textContent);
    // 应与「缺失 currentLuckPillar」的退路结果一致：命中 2026 那格
    expect(rows[1]).toContain("丙申");
    expect(rows[0]).toContain("丁卯");
    expect(rows[2]).toContain("己巳");
  });

  it("命主尚未起运（所有 startYear 都晚于当前年）时整块不渲染", () => {
    // 当前年设为 1990，早于 PILLARS 里最早的 startYear(1996) → 退路循环后 idx 仍 < 0
    const { container } = renderAt(bazi(), "1990-01-01T00:00:00Z");
    expect(container.textContent).toBe("");
    expect(screen.queryByTestId("luck-row")).toBeNull();
  });

  it("现行运是首运时没有前一运格，只渲染现行+下一运两格", () => {
    renderAt(bazi({ currentLuckPillar: "乙丑" }));
    const rows = screen.getAllByTestId("luck-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("乙丑");
    expect(rows[1].textContent).toContain("丙寅");
    const emphasized = rows.filter((r) => (r.getAttribute("style") ?? "").includes("border-left"));
    expect(emphasized).toHaveLength(1);
    expect(emphasized[0].textContent).toContain("乙丑");
  });

  it("现行运是末运时没有下一运格，只渲染前一运+现行两格", () => {
    renderAt(bazi({ currentLuckPillar: "己巳" }));
    const rows = screen.getAllByTestId("luck-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("丙申");
    expect(rows[1].textContent).toContain("己巳");
    const emphasized = rows.filter((r) => (r.getAttribute("style") ?? "").includes("border-left"));
    expect(emphasized).toHaveLength(1);
    expect(emphasized[0].textContent).toContain("己巳");
  });

  it("只有现行运走强调手法，另两行不走", () => {
    renderAt(bazi({ currentLuckPillar: "丁卯" }));
    const rows = screen.getAllByTestId("luck-row");
    // Emphasis 的判别特征是 border-left 2px 朱砂（horizontal 轴），落在元素自身 style 上
    const emphasized = rows.filter((r) => (r.getAttribute("style") ?? "").includes("border-left"));
    expect(emphasized).toHaveLength(1);
    expect(emphasized[0].textContent).toContain("丁卯");
  });

  it("luckPillars 为空时整块不渲染（不是渲染三个空格）", () => {
    const { container } = renderAt(bazi({ luckPillars: [] }));
    expect(container.textContent).toBe("");
    expect(screen.queryByTestId("luck-row")).toBeNull();
    expect(screen.queryByTestId("flow-year-chip")).toBeNull();
  });

  it("流年 chip 覆盖现行运 10 年，当前流年朱砂描边且只有一个", () => {
    renderAt(bazi()); // 现行运 startYear 2026
    const chips = screen.getAllByTestId("flow-year-chip");
    expect(chips.map((c) => c.textContent)).toEqual([
      "2026", "2027", "2028", "2029", "2030", "2031", "2032", "2033", "2034", "2035",
    ]);
    const marked = chips.filter((c) => (c.getAttribute("style") ?? "").includes("var(--color-cinnabar)"));
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toBe("2026");
  });

  it("流年区间不覆盖当前年时（现行运在早年）没有被朱砂描边的 chip", () => {
    renderAt(bazi({ currentLuckPillar: "丁卯" })); // startYear 2016，10 年跨度 2016-2025，不含 2026
    const chips = screen.getAllByTestId("flow-year-chip");
    expect(chips.map((c) => c.textContent)).toEqual([
      "2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025",
    ]);
    const marked = chips.filter((c) => (c.getAttribute("style") ?? "").includes("var(--color-cinnabar)"));
    expect(marked).toHaveLength(0);
  });
});
