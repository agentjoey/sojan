import { describe, it, expect } from "vitest";
import {
  BirthInputSchema, normalizeBirth, computeBaziChart, computeWesternChart,
  recordedTimezoneChoices, defaultRecordedTimezone,
} from "../src/index";

/**
 * EP-tz-edge：tz-lookup 对新疆坐标返回 `Asia/Urumqi`（UTC+6），但当地出生时间普遍按
 * 北京时间（UTC+8）记录（户口、出生证明用的都是北京时间；也有人按新疆时间记）。
 * 地理时区 ≠ 记录时区时，必须让用户选「出生时间按哪个时区记录」，否则八字/紫微（真太阳时）
 * 与西方盘（钟表时）都会偏约 2 小时。
 */
describe("EP-tz-edge 记录时区选项", () => {
  it("Asia/Urumqi：北京时间（官方，默认）在前，新疆时间在后", () => {
    expect(recordedTimezoneChoices("Asia/Urumqi")).toEqual([
      { timezone: "Asia/Shanghai", kind: "official" },
      { timezone: "Asia/Urumqi", kind: "local" },
    ]);
    expect(defaultRecordedTimezone("Asia/Urumqi")).toBe("Asia/Shanghai");
  });

  it("Asia/Kashgar（tzdata 里 Urumqi 的别名）同样处理", () => {
    expect(recordedTimezoneChoices("Asia/Kashgar")?.map((c) => c.timezone)).toEqual(["Asia/Shanghai", "Asia/Kashgar"]);
    expect(defaultRecordedTimezone("Asia/Kashgar")).toBe("Asia/Shanghai");
  });

  it("其他时区没有歧义：无选项，默认就是地理时区本身", () => {
    for (const tz of ["Asia/Shanghai", "America/New_York", "Europe/London", "Asia/Tokyo"]) {
      expect(recordedTimezoneChoices(tz)).toBeNull();
      expect(defaultRecordedTimezone(tz)).toBe(tz);
    }
  });
});

describe("EP-tz-edge 记录时区确实改变排盘（乌鲁木齐 87.6°E）", () => {
  // 1985 年：避开 1986–1991 的中国夏令时，让差值干净地等于 2 小时
  const mk = (timezone: string) =>
    BirthInputSchema.parse({
      date: "1985-06-15", time: "14:30", gender: "male",
      timezone, longitude: 87.6, latitude: 43.8, trueSolarTime: true,
    });

  it("同一个钟表时间，按北京时间记录比按新疆时间记录早 2 小时（真太阳时与民用时刻都如此）", () => {
    const bj = normalizeBirth(mk("Asia/Shanghai"));
    const xj = normalizeBirth(mk("Asia/Urumqi"));
    const t = (n: typeof bj) => Date.UTC(n.year, n.month - 1, n.day, n.hour, n.minute);
    expect((t(xj) - t(bj)) / 60000).toBe(120);
    // 北京时间 14:30 → 真太阳时约 12:20（午时）；新疆时间 14:30 → 约 14:20（未时）
    expect(bj.hour).toBe(12);
    expect(xj.hour).toBe(14);
  });

  it("时柱因此不同（午 vs 未）——这就是需要让用户确认的原因", () => {
    const bj = computeBaziChart(mk("Asia/Shanghai"));
    const xj = computeBaziChart(mk("Asia/Urumqi"));
    expect(bj.pillars.hour?.branch).toBe("午");
    expect(xj.pillars.hour?.branch).toBe("未");
  });
});

describe("EP-tz-edge 西方盘同样按记录时区取真实时刻（评审 S3）", () => {
  // 西方盘库 Origin 自己按经纬度查时区（新疆 → Asia/Urumqi）把钟表时间转 UTC；
  // 记录时区若是北京时间，必须先换算成坐标时区的钟表时间再喂进去，否则上升/宫位偏 2 小时。
  const mk = (timezone: string, time = "14:30") =>
    BirthInputSchema.parse({
      date: "1985-06-15", time, gender: "male",
      timezone, longitude: 87.6, latitude: 43.8, trueSolarTime: true,
    });

  it("北京时间 14:30 与新疆时间 14:30 是不同时刻：西方盘不同", () => {
    const bj = computeWesternChart(mk("Asia/Shanghai"))!;
    const xj = computeWesternChart(mk("Asia/Urumqi"))!;
    expect(bj.ascendant).not.toEqual(xj.ascendant);
  });

  it("北京时间 14:30 == 新疆时间 12:30（同一真实时刻）：西方盘逐项相同", () => {
    expect(computeWesternChart(mk("Asia/Shanghai", "14:30"))).toEqual(computeWesternChart(mk("Asia/Urumqi", "12:30")));
  });
});
