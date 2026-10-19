import { describe, it, expect } from "vitest";
import { computeBaziChart, normalizeBirth, BirthInputSchema } from "../src/index";
import { computeWesternChart } from "../src/western/index";
import type { BirthInput } from "../src/index";

const mk = (over: Partial<BirthInput>): BirthInput =>
  BirthInputSchema.parse({ date: "1991-03-15", time: "12:00", gender: "male", ...over });

/** 归一后时刻相对输入墙钟的位移（分钟）= 真太阳时校正量。 */
function shiftMin(n: ReturnType<typeof normalizeBirth>, wall: [number, number, number, number, number]): number {
  const [y, mo, d, h, mi] = wall;
  return (Date.UTC(n.year, n.month - 1, n.day, n.hour, n.minute) - Date.UTC(y, mo - 1, d, h, mi)) / 60000;
}

/**
 * review #2：UTC 偏移须在出生的「真实时刻」取值，而不是把墙钟当 UTC 瞬时去取。
 * 中国 1988 夏令时（IANA tzdata：Apr Sun>=11 02:00 → 1988-04-17 起；Sep Sun>=11 02:00 → 1988-09-11 止）。
 * 经度取 120°E（东八区标准经线），则校正量 = (120 − 标准经线)×4 + EoT：+8 时仅剩 EoT（|·|<16），+9 时约 −60。
 */
describe("review #2 · 时区偏移按真实时刻取值（DST 切换边界）", () => {
  const sh = (date: string, time: string) =>
    normalizeBirth(mk({ date, time, timezone: "Asia/Shanghai", longitude: 120, latitude: 31, trueSolarTime: true }));

  it("夏令时开始前数小时（1988-04-17 00:30，仍为 +8）：校正只含均时差", () => {
    const n = sh("1988-04-17", "00:30");
    expect(Math.abs(shiftMin(n, [1988, 4, 17, 0, 30]))).toBeLessThan(16);
  });
  it("夏令时生效后（1988-04-17 06:00，+9）：校正约 −60min", () => {
    const n = sh("1988-04-17", "06:00");
    const s = shiftMin(n, [1988, 4, 17, 6, 0]);
    expect(s).toBeGreaterThan(-76);
    expect(s).toBeLessThan(-44);
  });
  it("夏令时结束前数小时（1988-09-10 20:00，仍为 +9）：校正约 −60min", () => {
    const n = sh("1988-09-10", "20:00");
    const s = shiftMin(n, [1988, 9, 10, 20, 0]);
    expect(s).toBeGreaterThan(-76);
    expect(s).toBeLessThan(-44);
  });
  it("夏令时结束后（1988-09-11 06:00，+8）：校正只含均时差", () => {
    const n = sh("1988-09-11", "06:00");
    expect(Math.abs(shiftMin(n, [1988, 9, 11, 6, 0]))).toBeLessThan(16);
  });
});

/**
 * review #3：circular-natal-horoscope-js 的 Origin 把输入当「当地民用时」（自行按经纬度查时区再转 UTC），
 * 真太阳时是八字/紫微概念 → 西方盘必须用钟表时间，不受 trueSolarTime 开关影响。
 */
describe("review #3 · 西方盘用钟表时间，八字仍随真太阳时开关", () => {
  const cases: Array<[string, Partial<BirthInput>]> = [
    ["乌鲁木齐", { date: "1990-06-15", time: "12:00", latitude: 43.8, longitude: 87.6, timezone: "Asia/Shanghai" }],
    ["马德里", { date: "1990-06-15", time: "12:00", latitude: 40.4, longitude: -3.7, timezone: "Europe/Madrid" }],
  ];
  for (const [name, over] of cases) {
    it(`${name}：trueSolarTime 开/关 西方盘完全一致`, () => {
      const on = mk({ ...over, trueSolarTime: true });
      const off = mk({ ...over, trueSolarTime: false });
      const wOn = computeWesternChart(on)!;
      const wOff = computeWesternChart(off)!;
      expect(wOn).not.toBeNull();
      expect(wOn.ascendant).toEqual(wOff.ascendant);
      expect(wOn.midheaven).toEqual(wOff.midheaven);
      expect(wOn.planets).toEqual(wOff.planets);
    });
    it(`${name}：八字时柱 / normalizedSolarTime 仍随开关变化`, () => {
      const on = mk({ ...over, trueSolarTime: true });
      const off = mk({ ...over, trueSolarTime: false });
      expect(normalizeBirth(on).normalizedSolarTime).not.toBe(normalizeBirth(off).normalizedSolarTime);
      const hOn = computeBaziChart(on).pillars.hour!;
      const hOff = computeBaziChart(off).pillars.hour!;
      expect(hOn.stem + hOn.branch).not.toBe(hOff.stem + hOff.branch);
    });
  }
  it("civil 记录未经真太阳时校正的钟表时刻", () => {
    const n = normalizeBirth(mk({ ...cases[0]![1], trueSolarTime: true }));
    expect(n.civil).toEqual({ year: 1990, month: 6, day: 15, hour: 12, minute: 0 });
    expect(n.hour).not.toBe(12);
  });
});
