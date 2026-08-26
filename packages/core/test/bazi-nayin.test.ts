import { describe, it, expect } from "vitest";
import { deriveNayinZodiac } from "../src/bazi/nayin";

describe("deriveNayinZodiac", () => {
  it("从年柱反查纳音与生肖（对上设计包示例档案 1993-12-22 → 癸酉）", () => {
    expect(deriveNayinZodiac("癸酉")).toEqual({ nayin: "剑锋金", zodiac: "鸡" });
  });

  it("换一个年柱得到不同结果（防写死返回示例值）", () => {
    expect(deriveNayinZodiac("庚申")).toEqual({ nayin: "石榴木", zodiac: "猴" });
  });

  it("非法输入返回 null，不抛", () => {
    expect(deriveNayinZodiac("")).toBeNull();
    expect(deriveNayinZodiac("不是干支")).toBeNull();
    expect(deriveNayinZodiac("癸")).toBeNull();
  });

  it("干支长度正确但不在60甲子里的无效干支返回 null（覆盖 nayin 查表守卫）", () => {
    expect(deriveNayinZodiac("甲丑")).toBeNull();
  });
});
