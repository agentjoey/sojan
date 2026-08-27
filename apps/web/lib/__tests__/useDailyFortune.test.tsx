import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { BirthInputSchema, computeUnifiedChart, type DailyFortune } from "@sojan/core";

/**
 * `useDailyFortune`（owner 打磨批指令 2）：从 calendar/page.tsx 原样抽出的
 * 「流日 + LLM 轻润色（按 档案×日期 缓存）」取数逻辑，卷首今日卡与运势页共用。
 * 这里的用例钉住的是**行为契约**（什么时候取、缓存怎么命中），不是渲染。
 */

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const chart = computeUnifiedChart(birth);
const profile = { id: "p1", nickname: "阿甲", birthInput: birth, chart, createdAt: "", reading: null };

const fortune: DailyFortune = {
  date: "2026-08-28",
  dayGanZhi: "甲子",
  dayElement: "水",
  dayBranchElement: "水",
  masterElement: "木",
  relation: "印",
  scores: { overall: 7, career: 6, wealth: 5, love: 6, health: 7, travel: 5 },
  tone: "今日总评占位",
  auspicious: ["宜静心"],
  caution: ["忌争执"],
  almanacYi: [],
  almanacJi: [],
  lunarDate: "七月十六",
  interactions: [],
  favorableToday: true,
};

const dailyFortuneActionMock = vi.fn(async (..._a: unknown[]) => fortune);
const dailyPolishActionMock = vi.fn(async (..._a: unknown[]): Promise<string | null> => null);
vi.mock("@/app/actions", () => ({
  dailyFortuneAction: (...a: unknown[]) => dailyFortuneActionMock(...a),
  dailyPolishAction: (...a: unknown[]) => dailyPolishActionMock(...a),
}));

import { useDailyFortune } from "../useDailyFortune";

beforeEach(() => {
  localStorage.clear();
  dailyFortuneActionMock.mockClear();
  dailyPolishActionMock.mockClear();
});

describe("useDailyFortune：卷首/运势共用的流日取数", () => {
  it("无档案（null/undefined）不发起任何取数", () => {
    const { result } = renderHook(() => useDailyFortune(null, "2026-08-28"));
    expect(result.current.fortune).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(dailyFortuneActionMock).not.toHaveBeenCalled();
  });

  it("有档案：按 (八字, 日期) 取流日，到达后 loading 结束", async () => {
    const { result } = renderHook(() => useDailyFortune(profile, "2026-08-28"));
    await waitFor(() => expect(result.current.fortune).not.toBeNull());
    expect(dailyFortuneActionMock).toHaveBeenCalledWith({ bazi: profile.chart.bazi }, "2026-08-28");
    expect(result.current.loading).toBe(false);
  });

  it("polish 缓存未命中：调 LLM 润色并写入 localStorage 缓存", async () => {
    dailyPolishActionMock.mockResolvedValue("风从东来，宜收敛");
    const { result } = renderHook(() => useDailyFortune(profile, "2026-08-28"));
    await waitFor(() => expect(result.current.polish).toBe("风从东来，宜收敛"));
    expect(localStorage.getItem("zhaojian.polish.p1.2026-08-28")).toBe("风从东来，宜收敛");
  });

  it("polish 缓存命中：直接用缓存，不烧 LLM 额度", async () => {
    localStorage.setItem("zhaojian.polish.p1.2026-08-28", " cached ");
    const { result } = renderHook(() => useDailyFortune(profile, "2026-08-28"));
    await waitFor(() => expect(result.current.fortune).not.toBeNull());
    expect(result.current.polish).toBe(" cached ");
    expect(dailyPolishActionMock).not.toHaveBeenCalled();
  });

  it("换日期重新取（缓存键含日期，跨天自然失效）", async () => {
    const { result, rerender } = renderHook(({ d }) => useDailyFortune(profile, d), {
      initialProps: { d: "2026-08-28" },
    });
    await waitFor(() => expect(dailyFortuneActionMock).toHaveBeenCalledTimes(1));
    rerender({ d: "2026-08-29" });
    await waitFor(() => expect(dailyFortuneActionMock).toHaveBeenCalledWith({ bazi: profile.chart.bazi }, "2026-08-29"));
  });
});
