import { describe, it, expect } from "vitest";
import { safeNext } from "../next";

describe("safeNext", () => {
  it("缺省回 /account", () => {
    expect(safeNext(null)).toBe("/account");
    expect(safeNext("")).toBe("/account");
  });

  it("同源相对路径原样放行（含 query）", () => {
    expect(safeNext("/dream")).toBe("/dream");
    expect(safeNext("/fengshui?tab=2")).toBe("/fengshui?tab=2");
  });

  it("协议相对地址与绝对地址一律拒绝（防 open redirect）", () => {
    expect(safeNext("//evil.com")).toBe("/account");
    expect(safeNext("https://evil.com")).toBe("/account");
    expect(safeNext("javascript:alert(1)")).toBe("/account");
  });

  it("反斜杠被浏览器当成斜杠，/\\evil.com 等价于 //evil.com，也要拒绝", () => {
    expect(safeNext("/\\evil.com")).toBe("/account");
  });
});
