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
 * 2. 「今日日期」与「星期索引」**仍在此处（服务端）算一次**，作为 `HomeClient`
 *    的 **useState 初值**传下去——不是最终显示值。原因见下方「三段式」。
 *
 * ⚠️ 三段式收口（本文件另一处遗留 Critical：常态性 hydration mismatch）：
 * `HomeClient` 虽是 client component，但 `/` 是全静态预渲染路由，它照样会被
 * 服务端预渲染进静态 HTML（`grep -o "2026\.0[0-9]\.[0-9][0-9]" .next/server/app/index.html`
 * 能看到烤死的日期）。此前的方案让 `HomeClient` 在渲染时直接 `new Date()`，
 * 服务端用的是部署/ISR 机器的 UTC 时刻、客户端用访客本地时钟——两者不一致的
 * 时长等于时区偏移量（华裔用户本地 00:00–07:59、美西用户本地 17:00–23:59 皆为
 * 常态性不一致，不是「边界时刻」），React 会把它当 recoverable hydration error
 * 处理并报 console 错误，不是「静默换值」。
 *
 * 正确做法（不冻结 + 无 mismatch + 最终以访客本地时钟为准，三者都要）：
 * 1）本文件算一次「ISR 重新生成时刻」的日期/星期索引，当 **初值** props 传下去；
 * 2）`HomeClient` 用这个 prop 作 `useState` 初值——服务端渲染与客户端首次渲染
 *    逐字节一致，mismatch 从根上不存在；
 * 3）`HomeClient` 随后在 `useEffect`（只在挂载后跑，服务端不执行）里用访客本地
 *    时钟重算、`setState` 覆盖——挂载后立刻纠偏成访客本地时间。
 * 有 `revalidate = 3600` 兜着，这个初值最多陈旧 1 小时，不会回到「永久冻结」。
 *
 * 候（`solarHou`）仍留在此处（服务端）现算，因为它只需要按天更新、ISR 一小时
 * 足够，且这是保住「`@sojan/core` 不进客户端 bundle」这条收益的关键——千万别把
 * `getCurrentSolarHou()` 也搬进 `HomeClient`，那会把 2MB 的排盘依赖链 chunk
 * 重新拖进 `/` 路由，前功尽弃。日期/星期是纯 `Date` 运算，与 core 无关，不受此限。
 */
export const revalidate = 3600;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export default function Home() {
  // 七十二候：由 core 现算，卷首与运势页各自取值时机不同，故本页在此自取一次
  // （`TodayCard`/`SeasonRuler` 均不自己调 `getCurrentSolarHou()`，见两组件文档）。
  //
  // ⚠️ 复审 Minor M7：`solarHou` 用的是**服务端**日历日（`getCurrentSolarHou()`
  // 内部对 `new Date()` 取 `getFullYear/getMonth/getDate`，Vercel serverless
  // 运行时默认 `TZ=UTC`、本仓未设 `TZ` 覆写，故实为 UTC 日历日），而 `today`
  // 传给 `HomeClient` 后，挂载态的 `useEffect` 会把它纠偏成**访客本地时钟**的
  // 日历日（见 `HomeClient.tsx`）——首页的候与日期从此来自两个不同的「今天」，
  // 跨日窗口内可能不属于同一天。这是本文件从「候留服务端」这个既有取舍衍生
  // 出的新问题，此前的长注释没提过。
  //
  // 量化（不是定性猜测）：`getCurrentSolarHou` 按 5 天一候切分，一年 72 个候
  // 边界，即约 72/365 ≈ 19.7% 的日历日本身就是「候刚切换」的边界日。对 UTC+8
  // 的访客（本产品海外华裔用户的主要时区），本地日历日比 UTC 日历日提前
  // 8 小时进入下一天——即每天 UTC 16:00–24:00（本地 00:00–08:00）这 8 小时，
  // 访客本地日历日已经是 D+1，而服务端当时用的还是 D 那天算出的候。只有当
  // D→D+1 恰好是候边界日时，这 8 小时窗口内访客才会看到「候」与自己本地日期
  // 错位一档（候名/物候名整体错成前一候，通常代表相差 1–5 天的时序描述，不
  // 影响命理排盘本身）。综合概率：8/24 × 72/365 ≈ 6.6%（一年里约 24 天、每天
  // 8 小时）——对 UTC+8 访客而言，这不是可以四舍五入成 0 的边角情况；UTC 附近
  // 时区访客的实际暴露窗口趋近于 0，UTC+12~+14 时区访客的暴露窗口可到
  // 12–14/24 × 72/365 ≈ 9.9%–11.5%。`revalidate = 3600` 的 ISR 陈旧度另外
  // 叠加最多 ±1 小时的抖动，量级上是这条之外的次要因素。
  //
  // 治本（owner 打磨批指令 2）：`HomeClient` 挂载后调 `solarHouAction(todayIso)`
  // （app/actions.ts，入参是访客本地日历日），用返回值覆盖这里的初值——候从此
  // 与访客本地「今天」同源，上述 6.6% 的错位窗口消除。本处的服务端初值仍然
  // 必要：它是 SSR 首帧（防 hydration mismatch）与 action 失败时的兜底。
  const solarHou = getCurrentSolarHou();

  // 「今日日期」与「星期索引」：只作为 HomeClient 的 useState 初值（防 hydration
  // mismatch），不是最终显示值——HomeClient 挂载后会用访客本地时钟纠偏，见上方文档。
  const now = new Date();
  const today = {
    date: `${now.getFullYear()}.${pad2(now.getMonth() + 1)}.${pad2(now.getDate())}`,
    dayIndex: now.getDay(),
  };

  return <HomeClient solarHou={solarHou} today={today} />;
}
