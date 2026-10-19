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

  it("制表符/换行/回车会被 WHATWG URL 解析器剥掉，/\t/evil.com 实际解析成外域，必须拒绝", () => {
    expect(safeNext("/\t/evil.com")).toBe("/account");
    expect(safeNext("/\n/evil.com")).toBe("/account");
    expect(safeNext("/\r/evil.com")).toBe("/account");
  });

  it("URLSearchParams 解码后的形态（?next=%2F%09%2Fevil.com）同样被拒", () => {
    const raw = new URLSearchParams("next=%2F%09%2Fevil.com").get("next");
    expect(safeNext(raw)).toBe("/account");
  });

  it("正常路径中的合法字符不受影响", () => {
    expect(safeNext("/dream?id=a%20b#x")).toBe("/dream?id=a%20b#x");
  });
});
