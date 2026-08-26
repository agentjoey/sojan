import { describe, it, expect } from "vitest";
import { getCurrentSolarHou, parseSolarHouIndex } from "../src/daily/season";

/**
 * getCurrentSolarHou 不是纯转发第三方库：Date → Solar.fromYmd(year, month + 1, day)
 * 有一次字段换算（JS 的 getMonth() 是 0 起始，Solar.fromYmd 要 1 起始的月份）。
 * `getMonth() + 1` 这类换算 TS 抓不到、写错也不会报错，必须用已知日期的运行时断言钉住。
 *
 * 三个取值均为对 lunar-typescript 实测输出（2026-08-26 复核），不是猜测：
 *   2026-08-25 -> 处暑 初候 / 鹰乃祭鸟
 *   2026-09-01 -> 处暑 二候 / 天地始肃（月初边界：9 月 1 日，换算错一位会撞到 8 月内容）
 *   2026-02-04 -> 立春 初候 / 东风解冻（另一季节对照，避免只在处暑附近碰巧正确）
 */
describe("EP-nav-grid getCurrentSolarHou 七十二候换算", () => {
  it("2026-08-25 → 处暑 初候 / 鹰乃祭鸟", () => {
    const r = getCurrentSolarHou(new Date(2026, 7, 25));
    expect(r.hou).toContain("处暑");
    expect(r.hou).toContain("初候");
    expect(r.wuHou).toBe("鹰乃祭鸟");
  });

  it("月初边界 2026-09-01 → 处暑 二候 / 天地始肃（月份换算差一会撞到 8 月内容）", () => {
    const r = getCurrentSolarHou(new Date(2026, 8, 1));
    expect(r.hou).toBe("处暑 二候");
    expect(r.wuHou).toBe("天地始肃");
  });

  it("另一季节对照 2026-02-04 → 立春 初候 / 东风解冻", () => {
    const r = getCurrentSolarHou(new Date(2026, 1, 4));
    expect(r.hou).toBe("立春 初候");
    expect(r.wuHou).toBe("东风解冻");
  });
});

/**
 * 三条取值均对 lunar-typescript 实测输出核对过（本任务 2026-08-26 实跑）：
 *   2026-08-25 -> hou="处暑 初候"（处暑是第 14 个节气，0-based 13；初候=1 → 13*3+1=40）
 *   2026-02-04 -> hou="立春 初候"（立春 0-based 0，初候=1 → 0*3+1=1）
 *   2026-02-03 -> hou="大寒 三候"（大寒是 24 节气最后一个，0-based 23；三候=3 → 23*3+3=72）
 * 与 brief 给定的期望值一致，未调整。
 */
describe("getCurrentSolarHou：1–72 候序号", () => {
  it("2026-08-25 是第 40 候（处暑 初候）", () => {
    const r = getCurrentSolarHou(new Date(2026, 7, 25));
    expect(r.index).toBe(40);
    expect(r.term).toBe("处暑");
  });

  it("立春初候是第 1 候，大寒前一日（2026-02-03）是大寒三候即第 72 候", () => {
    expect(getCurrentSolarHou(new Date(2026, 1, 4)).index).toBe(1); // 立春 初候
    expect(getCurrentSolarHou(new Date(2026, 1, 3)).index).toBe(72); // 立春前一日 = 大寒 三候
  });

  it("同一节气内三候连号", () => {
    const a = getCurrentSolarHou(new Date(2026, 7, 25)).index; // 处暑 初候
    const b = getCurrentSolarHou(new Date(2026, 7, 30)).index; // 处暑 二候
    expect(b - a).toBe(1);
  });
});

/**
 * 解析防脆：parseSolarHouIndex 直接单测异常分支，不依赖 mock lunar-typescript
 * （mock 会连累本文件里其他真实断言，见函数注释）。格式一旦偏离「<节气> <候序>」
 * 就必须抛出可诊断错误，而不是悄悄给出一个错误序号。
 */
describe("parseSolarHouIndex：解析防脆", () => {
  it("空字符串抛出可诊断错误", () => {
    expect(() => parseSolarHouIndex("")).toThrow(/无法解析候序号/);
  });

  it("缺少候序（只有节气名）抛出错误", () => {
    expect(() => parseSolarHouIndex("处暑")).toThrow(/无法解析候序号/);
  });

  it("候序措辞不在「初候/二候/三候」内抛出错误", () => {
    expect(() => parseSolarHouIndex("处暑 四候")).toThrow(/无法解析候序号/);
  });

  it("节气名不在 24 节气表内抛出错误", () => {
    expect(() => parseSolarHouIndex("未知节气 初候")).toThrow(/无法解析候序号/);
  });

  it("正常输入解析出正确 index/term", () => {
    expect(parseSolarHouIndex("处暑 初候")).toEqual({ index: 40, term: "处暑" });
  });
});
