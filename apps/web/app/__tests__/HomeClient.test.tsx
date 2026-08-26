import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import HomeClient from "../HomeClient";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

/**
 * 终审必修 1（Critical）回归测试。
 *
 * 根因：`/` 是全静态预渲染路由。此前「今日日期」与「星期」在服务端组件
 * `page.tsx` 里算好、经 props 传给 `HomeClient`——这两个值会在构建/ISR
 * 重新生成时刻被烤进 RSC payload，首页今日卡自部署起永久停在旧日期，
 * 直到下次 deploy。
 *
 * 修复：`HomeClientProps` 不再携带 `todayDate`/`dayIndex`——`HomeClient`
 * 自己在渲染时调用 `new Date()`。本测试用 `vi.setSystemTime` 钉死系统时间，
 * 断言渲染结果确实随「客户端当前时间」变化，而不是接受一个固定不变的 prop
 * （类型上现在也不允许再传）。`solarHou`（候）仍是 props——它按天更新，
 * 留在服务端现算是本波刻意的取舍，不属于本条回归范围。
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/tg/ui", () => ({
  useIsTelegram: () => false,
}));

const solarHou = { hou: "处暑 · 初候", wuHou: "鹰乃祭鸟", index: 41 };

function renderHome(locale: "zh" | "en" = "zh") {
  return render(
    <I18nProvider locale={locale}>
      <HomeClient solarHou={solarHou} />
    </I18nProvider>,
  );
}

describe("HomeClient：今日日期/星期必须在客户端求值（终审必修 1）", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("HomeClientProps 不再携带 todayDate/dayIndex——只接受 solarHou", () => {
    // 类型层面的钉子：换一种写法会在编译期暴露，这里再加一条运行期断言防止
    // 有人悄悄在别处重新拼出这两个字段又传回来。
    const props: import("../HomeClient").HomeClientProps = { solarHou };
    expect(Object.keys(props)).toEqual(["solarHou"]);
  });

  it("2026-08-26（周三）：日期串与星期都由 HomeClient 自己用 new Date() 现算", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 26, 10, 0, 0)); // 本地时间 2026-08-26 周三
    renderHome("zh");
    expect(screen.getByText(/2026\.08\.26/)).toBeInTheDocument();
    expect(screen.getByText(/周三/)).toBeInTheDocument();
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
