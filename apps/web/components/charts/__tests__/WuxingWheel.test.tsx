import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { WuxingWheel } from "../WuxingWheel";

afterEach(() => cleanup());

const counts = { 金: 3, 水: 3, 木: 1, 火: 1, 土: 0 };

describe("WuxingWheel", () => {
  it("渲染五个扇区，按木火土金水定序", () => {
    render(<WuxingWheel counts={counts} dayMasterStem="庚" dayMasterElement="metal" />);
    const sectors = screen.getAllByTestId("wuxing-sector");
    expect(sectors).toHaveLength(5);
    expect(sectors.map((s) => s.getAttribute("data-element"))).toEqual([
      "wood", "fire", "earth", "metal", "water",
    ]);
  });

  it("扇区起始角 −126°、步长 72°（把角度作为语义参数暴露，不断言 path 字符串）", () => {
    render(<WuxingWheel counts={counts} dayMasterStem="庚" dayMasterElement="metal" />);
    const starts = screen.getAllByTestId("wuxing-sector").map((s) => Number(s.getAttribute("data-start-angle")));
    expect(starts).toEqual([-126, -54, 18, 90, 162]);
  });

  it("日主所属那一扇带朱砂描边，其余不带", () => {
    render(<WuxingWheel counts={counts} dayMasterStem="庚" dayMasterElement="metal" />);
    const sectors = screen.getAllByTestId("wuxing-sector");
    const metal = sectors.find((s) => s.getAttribute("data-element") === "metal")!;
    const wood = sectors.find((s) => s.getAttribute("data-element") === "wood")!;
    expect(metal.getAttribute("stroke")).toContain("var(--color-cinnabar)");
    expect(metal.getAttribute("stroke-width")).toBe("2");
    expect(wood.getAttribute("stroke-width")).not.toBe("2");
  });

  it("中心显示日主天干", () => {
    render(<WuxingWheel counts={counts} dayMasterStem="庚" dayMasterElement="metal" />);
    expect(screen.getByTestId("wuxing-center")).toHaveTextContent("庚");
  });

  it("纯展示用 role=img，aria-label 概括五行分布与日主", () => {
    render(<WuxingWheel counts={counts} dayMasterStem="庚" dayMasterElement="metal" />);
    const svg = screen.getByRole("img");
    const label = svg.getAttribute("aria-label")!;
    expect(label).toContain("金 3");
    expect(label).toContain("土 0");
    expect(label).toContain("庚");
  });
});
