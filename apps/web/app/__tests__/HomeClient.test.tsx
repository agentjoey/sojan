import React, { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import HomeClient from "../HomeClient";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

/**
 * 终审必修 1（Critical）回归测试——收口版。
 *
 * 根因（第一版遗留缺口）：`/` 是全静态预渲染路由，但 `HomeClient` 虽是
 * `"use client"`，照样会被服务端预渲染进静态 HTML（`.next/server/app/index.html`
 * 里能 grep 到烤死的日期）。第一版方案让 `HomeClient` 直接在渲染时调用
 * `new Date()`，服务端预渲染用的是部署/ISR 机器的 UTC 时刻、客户端 hydrate 用
 * 访客本地时钟——两者不一致的时长等于时区偏移量（华裔用户每天本地 00:00–07:59、
 * 美西用户每天本地 17:00–23:59 都会踩到），是**常态性** hydration mismatch，
 * 不是「边界时刻」；React 19 会把它当 recoverable error 处理、报 console 错误，
 * 不是「静默换值」。
 *
 * 收口后的三段式：
 * 1）`page.tsx` 服务端算一次「ISR 重新生成时刻」的日期/星期索引，当 **初值**
 *    props（`today`）传给 `HomeClient`；
 * 2）`HomeClient` 用这个 prop 作 `useState` 初值——服务端渲染与客户端首次渲染
 *    逐字节一致，mismatch 从根上不存在；
 * 3）挂载后的 `useEffect`（服务端不执行）用访客本地时钟重算、`setState` 覆盖。
 *
 * 本文件因此钉两件事：
 * - 「首次渲染值 = 服务端传入的 prop」（防 mismatch 的关键点，见下面第一组 it）；
 * - 「最终显示值以访客本地时钟为准」（挂载后 effect 纠偏，第二组 it，语义沿用
 *   第一版就有的断言，只是底层实现从「直接 new Date()」改成「prop 初值 + effect
 *   覆盖」，所以要把 `today` 初值特意设成一个陈旧占位值，证明是 effect 把它
 *   纠正过来的，而不是 prop 本身碰巧等于系统时间）。
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/tg/ui", () => ({
  useIsTelegram: () => false,
}));

const solarHou = { hou: "处暑 · 初候", wuHou: "鹰乃祭鸟", index: 41 };

// 刻意设成一个陈旧占位值（模拟「ISR 上次重新生成时刻」早已过去）——
// 用它而不是「恰好等于系统时间」的值，才能证明后续测试里显示值的变化
// 确实来自 useEffect 的纠偏，而不是 prop 本身就对。
const staleToday = { date: "2000.01.01", dayIndex: 6 };

function renderHome(locale: "zh" | "en" = "zh", today = staleToday) {
  return render(
    <I18nProvider locale={locale}>
      <HomeClient solarHou={solarHou} today={today} />
    </I18nProvider>,
  );
}

describe("HomeClient：今日日期/星期（终审必修 1，收口版）", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("HomeClientProps 携带 solarHou 与 today（服务端算好的初值，用于防 hydration mismatch）", () => {
    const props: import("../HomeClient").HomeClientProps = { solarHou, today: staleToday };
    expect(Object.keys(props).sort()).toEqual(["solarHou", "today"]);
  });

  describe("首次渲染值 = 服务端传入的 today prop（防 mismatch 的关键点）", () => {
    it("用 renderToString 模拟服务端预渲染的 HTML，再用不同系统时间 hydrate 同一份 prop：不触发 React hydration mismatch，首帧文本 = prop", () => {
      // 三个时刻刻意互不相同，才能真正区分「读 prop」与「读 new Date()」：
      // - prerenderClock：模拟 ISR 重新生成机器当时的系统时钟
      // - staleToday（date: 2000.01.01）：那一刻服务端算出来、传给 HomeClient 的 prop
      // - hydrateClock：访客本地时钟，跟前两者都不同
      // 若组件首次渲染（无论服务端还是客户端 hydrate 的第一帧）不是读这份 prop
      // 而是各自读当时的 new Date()，两次渲染的文本就会对不上，React 会在
      // hydrate 阶段报 hydration mismatch 错误——这正是本测试要抓的。
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        vi.setSystemTime(new Date(2010, 4, 5, 8, 0, 0)); // prerenderClock：与 prop、hydrateClock 均不同
        const jsx = (
          <I18nProvider locale="zh">
            <HomeClient solarHou={solarHou} today={staleToday} />
          </I18nProvider>
        );
        // 用 `renderToString`（不是 `renderToStaticMarkup`）——后者不带 hydration
        // 标记（给纯静态、不会被 hydrate 的页面用），拿它生成的 HTML 去 hydrateRoot
        // 会因为缺标记而在无关的地方假警报（本测试第一版踩过：TodayCard 里
        // `{date} · {dateNote}` 两个相邻文本表达式，`renderToStaticMarkup` 合并
        // 成一个文本节点，`renderToString` 会保留 hydration 所需的节点边界）。
        const html = renderToString(jsx);
        expect(html).toContain("2000.01.01"); // 服务端这一帧确实是 prop，不是 prerenderClock

        const container = document.createElement("div");
        container.innerHTML = html;
        document.body.appendChild(container);

        vi.setSystemTime(new Date(2026, 7, 26, 10, 0, 0)); // hydrateClock：访客本地时钟

        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
          act(() => {
            hydrateRoot(container, jsx);
          });
          const mismatchLogged = consoleError.mock.calls.some((args) =>
            args.some((a) => typeof a === "string" && /hydrat/i.test(a)),
          );
          expect(mismatchLogged).toBe(false);
          // act() 内部会把 hydrate 之后的 useEffect 也同步 flush 掉，所以这里已经是
          // effect 纠偏后的下一帧——正确顺序应是「先跟服务端 HTML 一致地 hydrate
          // （上面 mismatchLogged 断言证明了这一点），再用访客本地时钟（hydrateClock）
          // 覆盖」，最终文本是 hydrateClock 对应的日期，不再是 prop 的 2000.01.01。
          expect(container.textContent).toContain("2026.08.26");
          expect(container.textContent).not.toContain("2000.01.01");
        } finally {
          consoleError.mockRestore();
          container.remove();
        }
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("挂载后：最终显示值以访客本地时钟为准（useEffect 纠偏）", () => {
    it("2026-08-26（周三）：挂载后 effect 用系统时钟覆盖了陈旧的 prop 初值", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 26, 10, 0, 0)); // 本地时间 2026-08-26 周三
      renderHome("zh");
      expect(screen.getByText(/2026\.08\.26/)).toBeInTheDocument();
      expect(screen.getByText(/周三/)).toBeInTheDocument();
      expect(screen.queryByText(/2000\.01\.01/)).toBeNull();
    });

    it("换一个系统时间（次日周四），渲染结果跟着变——证明不是从固定 prop 读的", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 27, 10, 0, 0)); // 2026-08-27 周四
      renderHome("zh");
      expect(screen.getByText(/2026\.08\.27/)).toBeInTheDocument();
      expect(screen.getByText(/周四/)).toBeInTheDocument();
      expect(screen.queryByText(/2026\.08\.26/)).toBeNull();
    });

    it("en locale 下星期文案也随系统时间变化（Wed）", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 26, 10, 0, 0));
      renderHome("en");
      expect(screen.getByText(/2026\.08\.26/)).toBeInTheDocument();
      expect(screen.getByText(/Wed/)).toBeInTheDocument();
    });
  });
});
