import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { WuxingWheel } from "../WuxingWheel";

afterEach(() => cleanup());

const counts = { 金: 3, 水: 3, 木: 1, 火: 1, 土: 0 };

// dayMasterElement 现收中文单字（I3：与 core BaziChart.dayMasterElement 同键空间）。
describe("WuxingWheel", () => {
  it("渲染五个扇区，按木火土金水定序", () => {
    render(<WuxingWheel counts={counts} dayMasterStem="庚" dayMasterElement="金" />);
    const sectors = screen.getAllByTestId("wuxing-sector");
    expect(sectors).toHaveLength(5);
    expect(sectors.map((s) => s.getAttribute("data-element"))).toEqual([
      "wood", "fire", "earth", "metal", "water",
    ]);
  });

  it("扇区起始角 −126°、步长 72°（把角度作为语义参数暴露，不断言 path 字符串）", () => {
    render(<WuxingWheel counts={counts} dayMasterStem="庚" dayMasterElement="金" />);
    const starts = screen.getAllByTestId("wuxing-sector").map((s) => Number(s.getAttribute("data-start-angle")));
    expect(starts).toEqual([-126, -54, 18, 90, 162]);
  });

  it("日主所属那一扇带朱砂描边，其余不带（中文 dayMasterElement 归一到英文键再比对）", () => {
    render(<WuxingWheel counts={counts} dayMasterStem="庚" dayMasterElement="金" />);
    const sectors = screen.getAllByTestId("wuxing-sector");
    const metal = sectors.find((s) => s.getAttribute("data-element") === "metal")!;
    const wood = sectors.find((s) => s.getAttribute("data-element") === "wood")!;
    expect(metal.getAttribute("stroke")).toContain("var(--color-cinnabar)");
    expect(metal.getAttribute("stroke-width")).toBe("2");
    expect(wood.getAttribute("stroke-width")).not.toBe("2");
  });

  it("中心显示日主天干", () => {
    render(<WuxingWheel counts={counts} dayMasterStem="庚" dayMasterElement="金" />);
    expect(screen.getByTestId("wuxing-center")).toHaveTextContent("庚");
  });

  it("纯展示用 role=img，aria-label 概括五行分布与日主", () => {
    render(<WuxingWheel counts={counts} dayMasterStem="庚" dayMasterElement="金" />);
    const svg = screen.getByRole("img");
    const label = svg.getAttribute("aria-label")!;
    expect(label).toContain("金 3");
    expect(label).toContain("土 0");
    expect(label).toContain("庚");
  });

  // I1：五行盘天干环 18° 系统性错位。扇区从 −126° 起、每 72° 一扇（木/火/土/金/水
  // 依次），十天干环若仍从 −90° 起、每 36° 一格，五个阴干会精确落在扇区边界上
  // （乙 −54/丁 +18/己 +90/辛 +162/癸 +234，逐一命中扇区分界角）。
  // 断言十个天干各自的环上角度都落在其五行扇区的**开区间**内——把 STEMS 角度
  // 公式改回 `(360/10)*i - 90` 必须让本条变红（已 mutation 复验，见报告）。
  it("十天干环上角度全部落在各自五行扇区的开区间内（I1：18° 错位修复）", () => {
    render(<WuxingWheel counts={counts} dayMasterStem="庚" dayMasterElement="金" />);

    // 与组件同构的扇区几何：起始 −126°、每 72° 一扇，木/火/土/金/水依次。
    const SECTOR_ORDER = ["wood", "fire", "earth", "metal", "water"] as const;
    const START = -126;
    const STEP = 72;
    const sectorOf = (el: (typeof SECTOR_ORDER)[number]) => {
      const i = SECTOR_ORDER.indexOf(el);
      const start = START + i * STEP;
      return [start, start + STEP] as const;
    };

    // 天干 → 五行英文键，取自 core STEM_ELEMENT（packages/core/src/utils/elements.ts）
    // 的中文值，本处直接给英文键，避免测试再引入一次中文→英文转换。
    const STEM_TO_ELEMENT: Record<string, (typeof SECTOR_ORDER)[number]> = {
      甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth",
      己: "earth", 庚: "metal", 辛: "metal", 壬: "water", 癸: "water",
    };

    const stems = screen.getAllByTestId("wuxing-stem");
    expect(stems).toHaveLength(10);

    let outOfBoundsCount = 0;
    for (const el of stems) {
      const stem = el.getAttribute("data-stem")!;
      const angle = Number(el.getAttribute("data-angle"));
      const [lo, hi] = sectorOf(STEM_TO_ELEMENT[stem]);
      const inOpenInterval = angle > lo && angle < hi;
      if (!inOpenInterval) outOfBoundsCount += 1;
      expect(inOpenInterval, `${stem} 的角度 ${angle}° 应落在 (${lo}, ${hi}) 开区间内`).toBe(true);
    }
    expect(outOfBoundsCount).toBe(0);
  });
});
