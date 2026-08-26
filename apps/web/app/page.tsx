import HomeClient from "./HomeClient";
import { getCurrentSolarHou } from "@sojan/core";

/**
 * 卷首入口——**服务端组件**（无 `"use client"`）。
 *
 * 为什么拆成 `page.tsx`（server）+ `HomeClient.tsx`（client）两个文件：
 * `getCurrentSolarHou()` 来自 `@sojan/core` 的单一 barrel（`packages/core/src/index.ts`），
 * 该 barrel 把 iztro/circular-natal-horoscope-js 等整条排盘依赖链一并重导出，
 * **没有子路径 `exports`**——任何对 `@sojan/core` 的静态 import，哪怕只要一个函数，
 * 都会把整条依赖链打进消费它的客户端 chunk。而 `/` 正是 Telegram Mini App 的入口路由，
 * 这条 chunk 因此白白多背了 ~2MB（详见
 * `.superpowers/sdd/2026-08-26-ui-v3-c1-daily/bundle-fix-report.md`）。
 *
 * 服务端组件的 import **完全不进客户端 bundle**（比 `next/dynamic` 的「延后下载」更彻底，
 * 是「压根不下载」）。七十二候与「今日日期」都是纯计算、不依赖浏览器 API，因此在此处
 * （服务端）现算一次，把结果作为 props 传给 `HomeClient`；`HomeClient` 保留全部
 * 原有的 `"use client"` 交互实现（TG/web 双分支、hooks 等）。
 */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export default function Home() {
  // 七十二候：由 core 现算，卷首与运势页各自取值时机不同，故本页在此自取一次
  // （`TodayCard`/`SeasonRuler` 均不自己调 `getCurrentSolarHou()`，见两组件文档）。
  const solarHou = getCurrentSolarHou();
  const now = new Date();
  const todayDate = `${now.getFullYear()}.${pad2(now.getMonth() + 1)}.${pad2(now.getDate())}`;

  return <HomeClient solarHou={solarHou} todayDate={todayDate} dayIndex={now.getDay()} />;
}
