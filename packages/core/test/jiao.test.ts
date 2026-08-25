import { describe, it, expect } from "vitest";
import { omenOf, phaseAfter, MAX_THROWS, type Omen } from "../src/jiao";

describe("omenOf：两枚筊的正反组合 → 筊象", () => {
  it("一俯一仰 = 圣筊（允）", () => {
    expect(omenOf(["仰", "俯"])).toBe("圣筊");
    expect(omenOf(["俯", "仰"])).toBe("圣筊");
  });
  it("双仰 = 笑筊（问得不清楚）", () => {
    expect(omenOf(["仰", "仰"])).toBe("笑筊");
  });
  it("双俯 = 阴筊（不允）", () => {
    expect(omenOf(["俯", "俯"])).toBe("阴筊");
  });
});

describe("phaseAfter：三掷规则", () => {
  it("圣筊落定，不可重掷", () => {
    expect(phaseAfter(["圣筊"])).toEqual({ kind: "settled", omen: "圣筊" });
  });
  it("阴筊同样落定（不允也是答复，不是重问的理由）", () => {
    expect(phaseAfter(["阴筊"])).toEqual({ kind: "settled", omen: "阴筊" });
  });
  it("笑筊未到上限 → 可重掷", () => {
    expect(phaseAfter(["笑筊"])).toEqual({ kind: "rethrow" });
    expect(phaseAfter(["笑筊", "笑筊"])).toEqual({ kind: "rethrow" });
  });
  it("第三次仍笑筊 → exhausted（改为拆解问题本身，不再解筊象）", () => {
    expect(phaseAfter(["笑筊", "笑筊", "笑筊"])).toEqual({ kind: "exhausted" });
  });
  it("第四次仍笑筊（异常序列，仍只看最后一掷）→ exhausted", () => {
    expect(phaseAfter(["笑筊", "笑筊", "笑筊", "笑筊"])).toEqual({ kind: "exhausted" });
  });
  it("settled 之后又混进一掷（非法前缀）→ 抛错——运行时不变量兜住", () => {
    // "圣筊" 落定之后不该再有更多掷；这类调用方状态机的错误只能靠运行时断言拦，
    // 见 phaseAfter 内的前缀不变量注释（packages/core/test 不过类型检查）。
    expect(() => phaseAfter(["圣筊", "笑筊"])).toThrow();
  });
  it("笑筊之后掷出圣筊 → 仍是落定（只看最后一掷）", () => {
    expect(phaseAfter(["笑筊", "圣筊"])).toEqual({ kind: "settled", omen: "圣筊" });
  });
  it("空数组 → 抛错（尚未掷筊，调用方不该问 phase）", () => {
    expect(() => phaseAfter([])).toThrow();
  });
  it("MAX_THROWS 是 3", () => {
    expect(MAX_THROWS).toBe(3);
  });
});

describe("类型闭集不变量", () => {
  it("三个筊象名互不相同、且恰好三个", () => {
    const all: Omen[] = ["圣筊", "笑筊", "阴筊"];
    expect(new Set(all).size).toBe(3);
  });
});
