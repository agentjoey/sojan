import { describe, it, expect } from "vitest";
import { ELEMENT_COLORS, ELEMENT_MATERIALS } from "../src/fengshui/directions";
import { COLOR_EN, MATERIAL_EN, STAR_LABEL_EN, DIRECTION_LABEL_EN } from "../src/fengshui/en";

describe("EP-fs-en 英文词表与中文表同步", () => {
  it("每种颜色、材质都有英文", () => {
    for (const c of Object.values(ELEMENT_COLORS).flat()) expect(COLOR_EN[c], c).toBeTruthy();
    for (const m of Object.values(ELEMENT_MATERIALS).flat()) expect(MATERIAL_EN[m], m).toBeTruthy();
  });

  it("星名拼音、方位英文名两两不同（对拍按它们反查，不能撞）", () => {
    expect(new Set(Object.values(STAR_LABEL_EN)).size).toBe(8);
    expect(new Set(Object.values(DIRECTION_LABEL_EN)).size).toBe(8);
  });
});
