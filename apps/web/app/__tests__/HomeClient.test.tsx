import React, { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import HomeClient from "../HomeClient";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { BirthInputSchema, computeUnifiedChart, type DailyFortune } from "@sojan/core";

/**
 * 卷首「今日日期」纪律的回归测试（终审必修 1 / 复审 M6 的收口版，
 * owner 打磨批指令 2 后改写）。
 *
 * 指令 2 之前：今日卡是 SSR 静态卡，日期/星期直接渲染进首帧 HTML，
 * 所以本文件钉「首帧文本 = 服务端 prop（防 hydration mismatch）」。
 * 指令 2 之后：今日卡改为有档案才渲染、数据经 server action 异步到达，
 * **首帧 HTML 里根本没有日期文本**（首帧只有等待过场 + 静态 Hero），
 * 日期只在客户端数据落定后出现——hydration mismatch 的载体随之消失。
 *
 * 本文件现在钉三件事：
 * - SSR→hydrate 全程无 hydration 报错（首帧只剩静态内容 + 过场，仍要守住）；
 * - 卡上日期以**访客本地时钟**为准（effect 纠偏陈旧 prop，不是读死值）；
 * - 长驻标签页跨本地午夜自动纠偏（M6），且纠偏后取数日期也跟着变。
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/tg/ui", () => ({
  useIsTelegram: () => false,
}));

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const profile = { id: "p1", nickname: "阿甲", birthInput: birth, chart: computeUnifiedChart(birth), createdAt: "", reading: null };
const fortune: DailyFortune = {
  date: "2026-08-26",
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
  lunarDate: "七月十三",
  interactions: [],
  favorableToday: true,
};
const dailyFortuneActionMock = vi.fn(async (..._a: unknown[]) => fortune);
vi.mock("@/lib/profiles", () => ({
  getActiveProfile: vi.fn(async () => profile),
}));
vi.mock("@/app/actions", () => ({
  dailyFortuneAction: (...a: unknown[]) => dailyFortuneActionMock(...a),
  dailyPolishAction: async (): Promise<string | null> => null,
  solarHouAction: async () => ({ hou: "测试候", wuHou: "测试物候", index: 42, term: "测试节气" }),
}));

const solarHou = { hou: "处暑 · 初候", wuHou: "鹰乃祭鸟", index: 41 };

// 刻意设成陈旧占位值（模拟「ISR 上次重新生成时刻」早已过去）——证明显示值
// 来自挂载后的 effect 纠偏，而不是 prop 本身碰巧等于系统时间。
const staleToday = { date: "2000.01.01", dayIndex: 6 };

function renderHome(locale: "zh" | "en" = "zh", today = staleToday) {
  return render(
    <I18nProvider locale={locale}>
      <HomeClient solarHou={solarHou} today={today} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  dailyFortuneActionMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("HomeClient：今日日期（终审必修 1 / M6，指令 2 收口版）", () => {
  it("HomeClientProps 携带 solarHou 与 today（服务端算好的初值，用于防 hydration mismatch）", () => {
    const props: import("../HomeClient").HomeClientProps = { solarHou, today: staleToday };
    expect(Object.keys(props).sort()).toEqual(["solarHou", "today"]);
  });

  it("SSR→hydrate 全程无 hydration 报错（指令 2 后首帧只剩静态 Hero + 等待过场）", () => {
    // 三个时刻刻意互不相同（预渲染时钟 / prop / hydrate 时钟），若组件首帧
    // 偷偷读了 new Date()，SSR HTML 与 hydrate 首帧就会对不上而报错。
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(2010, 4, 5, 8, 0, 0)); // prerenderClock
      const jsx = (
        <I18nProvider locale="zh">
          <HomeClient solarHou={solarHou} today={staleToday} />
        </I18nProvider>
      );
      // 用 renderToString（不是 renderToStaticMarkup）——后者不带 hydration
      // 标记，拿它 hydrate 会在无关的地方假警报（本测试第一版踩过）。
      const html = renderToString(jsx);
      // 首帧不再含任何日期文本（卡未渲染）——这是指令 2 之后的结构前提。
      expect(html).not.toContain("2000.01.01");

      const container = document.createElement("div");
      container.innerHTML = html;
      document.body.appendChild(container);

      vi.setSystemTime(new Date(2026, 7, 26, 10, 0, 0)); // hydrateClock

      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        act(() => {
          hydrateRoot(container, jsx);
        });
        // ⚠️ I2(a)：React 把 hydration mismatch 诊断以单个 Error 对象传给
        // console.error（不是纯字符串参数），统一转文本再正则匹配。
        const asText = (a: unknown): string =>
          a instanceof Error ? a.message : typeof a === "string" ? a : String(a);
        const mismatchLogged = consoleError.mock.calls.some((args) =>
          args.some((a) => /hydrat/i.test(asText(a))),
        );
        expect(mismatchLogged).toBe(false);
      } finally {
        consoleError.mockRestore();
        container.remove();
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("挂载后卡上日期 = 访客本地时钟（effect 覆盖了陈旧的 prop 初值）", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 26, 10, 0, 0)); // 本地 2026-08-26
    renderHome("zh");
    await act(async () => {}); // flush getActiveProfile/dailyFortuneAction 的微任务
    // fake timers 下 findBy* 的轮询定时器也被冻结——微任务已 flush，直接同步取。
    const card = screen.getByTestId("today-card");
    expect(card.textContent).toContain("2026.08.26");
    expect(card.textContent).not.toContain("2000.01.01");
  });

  it("换一个系统时间（次日），卡上日期跟着变——证明不是从固定 prop 读的", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 27, 10, 0, 0)); // 2026-08-27
    renderHome("zh");
    await act(async () => {});
    const card = screen.getByTestId("today-card");
    expect(card.textContent).toContain("2026.08.27");
    expect(card.textContent).not.toContain("2026.08.26");
  });

  /**
   * 复审 Minor M6：长驻标签页跨过本地午夜后要自动纠偏，不需要手动刷新——
   * 指令 2 之后这条还要更进一步：日期纠偏会改变 `todayIso`，取数（流日/候）
   * 也必须跟着用新日期，否则卡面日期变了、内容还是昨天的。
   */
  it("长驻标签页跨过本地午夜后：卡日期与取数日期都自动纠偏（M6）", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 26, 23, 59, 50)); // 2026-08-26 23:59:50 本地
    renderHome("zh");
    await act(async () => {});
    expect(screen.getByTestId("today-card").textContent).toContain("2026.08.26");
    expect(dailyFortuneActionMock).toHaveBeenCalledWith({ bazi: profile.chart.bazi }, "2026-08-26");

    await act(async () => {
      vi.advanceTimersByTime(20_000); // 跨过午夜 + 5s 缓冲
    });

    const card = screen.getByTestId("today-card");
    expect(card.textContent).toContain("2026.08.27");
    expect(card.textContent).not.toContain("2026.08.26");
    expect(dailyFortuneActionMock).toHaveBeenCalledWith({ bazi: profile.chart.bazi }, "2026-08-27");
  });
});
