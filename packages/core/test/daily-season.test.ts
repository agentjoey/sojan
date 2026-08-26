import { describe, it, expect } from "vitest";
import { getCurrentSolarHou } from "../src/daily/season";

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
