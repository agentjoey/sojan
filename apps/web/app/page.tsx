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
 * 是「压根不下载」）。七十二候是纯计算、不依赖浏览器 API，因此在此处（服务端）现算
 * 一次，把结果作为 props 传给 `HomeClient`。
 *
 * ⚠️ 终审必修 1（Critical）：`/` 是全静态预渲染路由，`getCurrentSolarHou()` 与
 * 「今日日期」若都在本文件（服务端组件）求值，会在**构建时**烤进 RSC payload，
 * `prerender-manifest.json` 对 `/` 的 `initialRevalidateSeconds` 若是 `false`
 * （默认全静态、永不重新生成），首页今日卡的日期/星期/候标尺就会自部署起
 * 永久冻结，直到下次 deploy——一个卖点是「今日运势」的产品，门面上却是陈旧日期。
 *
 * 两步修复：
 * 1. 本文件加 `export const revalidate = 3600`——候的粒度是天，一小时的 ISR
 *    窗口足够让候按天推进，不需要更激进的重新生成频率。
 * 2. 「今日日期」与「星期」**不在此处算**，改由 `HomeClient` 在客户端算——
 *    服务端算的是部署/ISR 重新生成所在机器的 UTC 时刻，跨午夜时区本来就会算错一档；
 *    候（`solarHou`）仍留在此处（服务端），因为它只需要按天更新、ISR 一小时足够，
 *    且这是保住「`@sojan/core` 不进客户端 bundle」这条收益的关键——千万别把
 *    `getCurrentSolarHou()` 也搬回 `HomeClient`，那会把 2MB 的排盘依赖链 chunk
 *    重新拖进 `/` 路由，前功尽弃。
 */
export const revalidate = 3600;

export default function Home() {
  // 七十二候：由 core 现算，卷首与运势页各自取值时机不同，故本页在此自取一次
  // （`TodayCard`/`SeasonRuler` 均不自己调 `getCurrentSolarHou()`，见两组件文档）。
  const solarHou = getCurrentSolarHou();

  return <HomeClient solarHou={solarHou} />;
}
