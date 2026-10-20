import { describe, it, expect } from "vitest";
import { sanitizeReading } from "@sojan/llm";
import { isCompleteReading, splitSections, READING_SECTION_COUNT } from "../reading-sections";

const ZH = "## 概览\n一句。\n## 命理 · 紫微/八字\n二。\n## 心理 · 心理占星\n三。\n## 成长建议\n四。";
const EN = "## Overview\none.\n## 命理 — Fate Structure\ntwo.\n## 心理 — Psychology\nthree.\n## Growth\nfour.";

describe("reading-sections（路由与命盘页共用的分节规则）", () => {
  it("输出契约是四个 H2 分节", () => {
    expect(READING_SECTION_COUNT).toBe(4);
  });

  it("splitSections：按 ## 切节，标题/正文/accent 与命盘页原规则一致", () => {
    expect(splitSections(ZH)).toEqual([
      { key: "0-概览", title: "概览", body: "一句。", accent: undefined },
      { key: "1-命理 · 紫微/八字", title: "命理 · 紫微/八字", body: "二。", accent: "fire" },
      { key: "2-心理 · 心理占星", title: "心理 · 心理占星", body: "三。", accent: "water" },
      { key: "3-成长建议", title: "成长建议", body: "四。", accent: "metal" },
    ]);
  });

  it("isCompleteReading：中英文四分节齐全为 true", () => {
    expect(isCompleteReading(ZH)).toBe(true);
    expect(isCompleteReading(EN)).toBe(true);
  });

  it("isCompleteReading：缺节 / 末节只有标题没有正文 → false", () => {
    expect(isCompleteReading("## 概览\n一句。\n## 命理\n二。\n## 心理\n三。")).toBe(false);
    expect(isCompleteReading("## 概览\n一句。\n## 命理\n二。\n## 心理\n三。\n## 成长建议\n")).toBe(false);
    expect(isCompleteReading("")).toBe(false);
  });

  it("isCompleteReading：首个 ## 之前的前言不算一节", () => {
    expect(isCompleteReading("前言一行\n前言第二行\n## 概览\n一。\n## 命理\n二。\n## 心理\n三。")).toBe(false);
  });

  it("降级路径（western=null，sanitizeReading 把心理节换成固定提示）仍算完整，中英文皆然", () => {
    const fabricated = (md: string) => md.replace(/(心理[^\n]*\n)[^\n]*/, "$1太阳双鱼、月亮天蝎。");
    expect(isCompleteReading(sanitizeReading(fabricated(ZH), "zh", false))).toBe(true);
    expect(isCompleteReading(sanitizeReading(fabricated(EN), "en", false))).toBe(true);
  });
});
