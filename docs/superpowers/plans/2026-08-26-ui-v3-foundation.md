# UI v3 · 子项目 A「地基与外壳」实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把全站外壳从「移动底栏 + 桌面竖栏」改成「移动顶部语境胶囊 + 菜单键 + 九宫格覆盖层 / 桌面竖栏」，并把导航项与 flag 门控收敛成单一事实源，同时补齐新设计需要的可复用原语。

**Architecture:** 新建 `apps/web/lib/nav.ts` 作为导航目录与 flag 门控的唯一来源，三个消费方（桌面竖栏 / 移动九宫格 / TG 首页）按 id 取子集。移动外壳与九宫格是 `AppShell` 内的新组件，整体位于既有 `{!tg && …}` 之内——**Telegram 一行不改**。原语层扩充 `components/ui.tsx`，并废弃与「唯一强调手法」冲突的 `Card.topAccent`。

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind 4 · vitest + @testing-library/react（jsdom）· 纯 CSS keyframes（本仓零动画库）

**Spec:** `docs/superpowers/specs/2026-08-26-ui-v3-foundation-design.md`

## Global Constraints

- **零阴影。** `--shadow-*` 令牌保持 `none`，层级只靠间距 / 色调 / 1px 细线。唯一例外是 `GanzhiBadge.highlight` 用 `box-shadow` 画描边（不是投影），保留并注释。
- **强调只有一种手法**：`border-left: 2px solid cinnabar` + `linear-gradient(90deg, rgba(168,70,56,.07), rgba(168,70,56,0) 78%)` + `padding-left: 12px; margin-left: -14px`，配 `cinnabar 600` 关键字。竖向版把 `90deg` 换 `180deg`、`border-left` 换 `border-top`。**不要色块、渐变按钮、投影。**
- **朱砂是唯一强调色**，面积 0–2%。五行五色只用于命理语义。
- **圆角上限 8px**（`--radius-chip/icon/seal 4px`、`--radius-button/card/panel 8px`），胶囊与圆钮用 `9999px`。
- **不新增裸十六进制**，一律用令牌名。
- **Telegram 冻结**：`app/page.tsx` 的 `TG_ENTRIES` 渲染结果逐项不变；`app/__tests__/page.test.tsx` 断言一条不许改。
- **动画必须挂 keyframes**，不要 JS 逐帧驱动——`globals.css` 既有的 `prefers-reduced-motion` 降级块才覆盖得到。
- **flag 求值在模块加载时**（与既有惯例一致）；测试切 flag 必须 `vi.stubEnv` + `vi.resetModules()` + 动态 `import`，且 `I18nProvider` 要来自**同一次**动态 import（context 身份匹配）。
- 每个任务结束跑 `pnpm --filter @sojan/web exec vitest run`。基线：**web 626/626 绿**、`tsc -p apps/web` **7 errors**（既有 `EP-web-typecheck-debt`）、`lint` **2 errors / 17 warnings**（2 个 error 在 `SpiritPanel.tsx:103`，既有）。这三个数字不许变差。

---

### Task 1: 导航单一事实源 `lib/nav.ts`（纯重构，零行为变更）

**Files:**
- Create: `apps/web/lib/nav.ts`
- Create: `apps/web/lib/__tests__/nav.test.ts`
- Modify: `apps/web/components/AppShell.tsx:11-28`（`NAV` 改为消费 `lib/nav`）
- Modify: `apps/web/app/page.tsx:34-56`（`TG_ENTRIES` 的 flag 判断改为消费 `lib/nav`）

**Interfaces:**
- Produces: `NavId`、`NAV_CATALOG`、`isNavEnabled(id)`、`RAIL_ORDER`、`GRID_ORDER`、`TG_ORDER`、`enabled(order)`
- Consumes: 无

> **本任务的判据是「什么都没变」**：`AppShell.test.tsx` 与 `app/__tests__/page.test.tsx` 全部现有用例**不改一个字**且全绿。项集变化留到 Task 2。

- [ ] **Step 1: 写失败测试**

`apps/web/lib/__tests__/nav.test.ts`：

```ts
import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** flag 在模块加载时求值，所以每个用例都要 resetModules + 动态 import。 */
async function loadNav(flags: { spirit?: string; fengshui?: string; dream?: string }) {
  vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", flags.spirit ?? "");
  vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", flags.fengshui ?? "");
  vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", flags.dream ?? "");
  return await import("../nav");
}

describe("lib/nav：导航目录与 flag 门控的单一事实源", () => {
  it("无 flag 门控的项恒可用", async () => {
    const nav = await loadNav({});
    expect(nav.isNavEnabled("calendar")).toBe(true);
    expect(nav.isNavEnabled("chart")).toBe(true);
    expect(nav.isNavEnabled("profiles")).toBe(true);
    expect(nav.isNavEnabled("reading")).toBe(true);
  });

  it("受门控的三项随 flag 开关", async () => {
    const off = await loadNav({});
    expect(off.isNavEnabled("spirit")).toBe(false);
    expect(off.isNavEnabled("fengshui")).toBe(false);
    expect(off.isNavEnabled("dream")).toBe(false);
    vi.resetModules();
    const on = await loadNav({ spirit: "1", fengshui: "1", dream: "1" });
    expect(on.isNavEnabled("spirit")).toBe(true);
    expect(on.isNavEnabled("fengshui")).toBe(true);
    expect(on.isNavEnabled("dream")).toBe(true);
  });

  it("flag 只认字面量 '1'（与全仓既有判据一致，'true'/'0' 都算关）", async () => {
    const nav = await loadNav({ spirit: "true", fengshui: "0", dream: "1" });
    expect(nav.isNavEnabled("spirit")).toBe(false);
    expect(nav.isNavEnabled("fengshui")).toBe(false);
    expect(nav.isNavEnabled("dream")).toBe(true);
  });

  it("enabled() 按给定顺序过滤，且保序", async () => {
    const nav = await loadNav({ fengshui: "1" });
    const ids = nav.enabled(["calendar", "spirit", "fengshui", "chart"]).map((i) => i.id);
    expect(ids).toEqual(["calendar", "fengshui", "chart"]);
  });

  it("目录里每一项都有 href / char / labelKey", async () => {
    const nav = await loadNav({});
    for (const [id, item] of Object.entries(nav.NAV_CATALOG)) {
      expect(item.href, id).toMatch(/^\//);
      expect(item.char, id).toHaveLength(1);
      expect(item.labelKey, id).toMatch(/^nav\./);
    }
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @sojan/web exec vitest run lib/__tests__/nav.test.ts`
Expected: FAIL — `Cannot find module '../nav'`

- [ ] **Step 3: 写 `apps/web/lib/nav.ts`**

```ts
/**
 * 导航目录与 flag 门控的**单一事实源**。
 *
 * 为什么要有这个文件：CLAUDE.md 的头号教训是「两处导航入口不同步」，本仓库已经
 * 踩过三次（风水在 Mini App 里入口数为零、居所编辑有实现无入口、掷筊的 bot CTA
 * 直指必 401 的页面）。此前 `AppShell.NAV` 与 `app/page.tsx` 的 `TG_ENTRIES` 是两份
 * 各自硬编码的列表，flag 判断也各写一遍，全靠人肉对齐。现在**门控只有这一处**。
 *
 * 三个消费方各取子集是**刻意的**（顺序、大字、TG 的配色都不同），但它们判断
 * 「这项开没开」必须走同一个 `isNavEnabled`。
 *
 * ⚠️ flag 在模块加载时求值（与全仓既有惯例一致，`NEXT_PUBLIC_*` 本就是构建期内联）。
 * 测试要切 flag 必须 `vi.stubEnv` + `vi.resetModules()` + 动态 import。
 */

export type NavId =
  | "calendar" | "chart" | "spirit" | "fengshui" | "dream" | "reading" | "profiles";

type FlagKey = "spirit" | "fengshui" | "dream";

export type NavCatalogEntry = {
  href: string;
  /** web 导航用的宋体大字 */
  char: string;
  /** i18n 键，形如 `nav.calendar` */
  labelKey: string;
  flag?: FlagKey;
};

const FLAGS: Record<FlagKey, boolean> = {
  spirit: process.env.NEXT_PUBLIC_SPIRIT_ENABLED === "1",
  fengshui: process.env.NEXT_PUBLIC_FENGSHUI_ENABLED === "1",
  dream: process.env.NEXT_PUBLIC_DREAM_ENABLED === "1",
};

export const NAV_CATALOG: Record<NavId, NavCatalogEntry> = {
  calendar: { href: "/calendar", char: "运", labelKey: "nav.calendar" },
  chart:    { href: "/chart",    char: "盘", labelKey: "nav.reading" },
  spirit:   { href: "/spirit",   char: "灵", labelKey: "nav.spirit",   flag: "spirit" },
  fengshui: { href: "/fengshui", char: "境", labelKey: "nav.fengshui", flag: "fengshui" },
  dream:    { href: "/dream",    char: "梦", labelKey: "nav.dream",    flag: "dream" },
  reading:  { href: "/reading",  char: "起", labelKey: "nav.reading" },
  profiles: { href: "/profiles", char: "我", labelKey: "nav.profiles" },
};

export function isNavEnabled(id: NavId): boolean {
  const flag = NAV_CATALOG[id].flag;
  return flag ? FLAGS[flag] : true;
}

export type NavItem = NavCatalogEntry & { id: NavId };

/** 按给定顺序过滤出已启用项，保序。 */
export function enabled(order: readonly NavId[]): NavItem[] {
  return order.filter(isNavEnabled).map((id) => ({ id, ...NAV_CATALOG[id] }));
}
```

> **注意 Task 1 不改标签**：`chart` 暂时仍用 `nav.reading`（现状就是这个键，值是「解读」），`reading` 也暂借同一个键——因为 Task 1 的判据是零行为变更，而 `reading` 此刻还没有任何消费方。两者都在 Task 2 修正。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @sojan/web exec vitest run lib/__tests__/nav.test.ts`
Expected: PASS 5/5

- [ ] **Step 5: `AppShell.tsx` 改为消费 `lib/nav`**

把 `apps/web/components/AppShell.tsx` 第 11–28 行的 `NAV` 常量替换为：

```tsx
import { enabled, type NavId } from "@/lib/nav";

/** 竖栏与底栏当前的项集（Task 2 会改成新项集）。「照」不在目录里，由铜铃承担。 */
const RAIL_ORDER: readonly NavId[] = ["calendar", "chart", "spirit", "fengshui", "dream", "profiles"];
const NAV = enabled(RAIL_ORDER);
```

⚠️ 现有代码里 `NAV` 首项是「照/首页」，桌面竖栏用 `NAV.slice(1)` 排除它、底栏用完整 `NAV`。改用 `enabled()` 后 `NAV` **不含**「照」，所以：
- 桌面竖栏的 `NAV.slice(1)` 改为 `NAV`
- 底栏需要「照」，改为在 JSX 里手写一个指向 `/` 的项，或临时保留一个本地常量

**本任务取后者**（改动最小、最容易证明零行为变更）：在 `AppShell.tsx` 内保留

```tsx
const HOME_ITEM = { id: "home" as const, href: "/", char: "照", labelKey: "nav.home" };
const BOTTOM_NAV = [HOME_ITEM, ...NAV, { id: "account" as const, href: "/account", char: "账", labelKey: "nav.account" }];
```

并把底栏的 `NAV.map` 改为 `BOTTOM_NAV.map`、竖栏的 `NAV.slice(1).map` 改为 `[...NAV, ACCOUNT_ITEM].map`。
`NAV_COMPACT` 改为 `BOTTOM_NAV.length >= 6`——**必须与改动前的 `NAV.length` 语义等价**（改动前 NAV 含照与账，共 4–8 项；`BOTTOM_NAV` 同样含照与账）。

- [ ] **Step 6: `app/page.tsx` 的 flag 判断改为消费 `lib/nav`**

`TG_ENTRIES` 的两处 `process.env.NEXT_PUBLIC_*_ENABLED === "1"` 改为 `isNavEnabled("fengshui")` / `isNavEnabled("dream")`。
**`icon`/`accent`/`key`/`path` 四个字段与顺序一字不动**——TG 的配色与顺序是它自己的事，这里只统一门控判断。文件顶部那段关于「两处入口必须同步」的长注释保留，并补一句指向 `lib/nav.ts`。

- [ ] **Step 7: 跑全量回归，确认零行为变更**

Run: `pnpm --filter @sojan/web exec vitest run`
Expected: **626/626 PASS**，且 `AppShell.test.tsx`、`app/__tests__/page.test.tsx` 的断言**一个字都没改过**。

- [ ] **Step 8: mutation 复验（证明新测试有判别力）**

把 `lib/nav.ts` 的 `isNavEnabled` 改成恒 `true`，跑 `vitest run lib/__tests__/nav.test.ts`，确认「受门控的三项随 flag 开关」与「只认字面量 '1'」两条变红；改回。

- [ ] **Step 9: 提交**

```bash
git add apps/web/lib/nav.ts apps/web/lib/__tests__/nav.test.ts apps/web/components/AppShell.tsx apps/web/app/page.tsx
git commit -m "refactor(nav): 导航项与 flag 门控收敛到 lib/nav.ts 单一事实源

三个消费方（桌面竖栏/移动底栏/TG 首页）各取子集，但门控判断只有一处。
本次纯重构：AppShell.test.tsx 与 app/__tests__/page.test.tsx 断言一字未改且全绿。"
```

---

### Task 2: 新项集与 i18n 标签修正

**Files:**
- Modify: `apps/web/lib/nav.ts`（`chart` 与 `reading` 的 labelKey）
- Modify: `apps/web/lib/i18n/messages/zh.ts:17-27`、`apps/web/lib/i18n/messages/en.ts:19-29`
- Modify: `apps/web/components/AppShell.tsx`（`RAIL_ORDER` 定稿、`profiles` 沉底、删 `HOME_ITEM`/`ACCOUNT_ITEM`）
- Modify: `apps/web/components/__tests__/AppShell.test.tsx`（三条 `NAV_COMPACT` 边界用例重算）

**Interfaces:**
- Consumes: Task 1 的 `enabled()` / `NAV_CATALOG` / `NavId`
- Produces: `RAIL_ORDER`（含 profiles）、`GRID_ORDER`（不含 profiles），供 Task 5 的九宫格取用

**要修的三处标签问题**（均已查证）：

| 问题 | 现状 | 改为 |
|---|---|---|
| 「盘」指向 `/chart` 却用 `nav.reading`（值「解读」） | `nav.reading` | `nav.chart`（值「命盘」，键已存在但无人使用） |
| 「灵」小字 | `nav.spirit` = 「本命」 | 「问事」（设计包 2a′；en `"Spirit"` → `"Ask"`） |
| 「起」起盘缺键 | — | 新增 `nav.start` = 「起盘」 / `"New Chart"` |

- [ ] **Step 1: 写失败测试**

在 `apps/web/components/__tests__/AppShell.test.tsx` 新增：

```tsx
describe("UI v3：竖栏项集（7 项，「我的」沉底，无「照」无「账」）", () => {
  it("全 flag 开启时竖栏 7 项，顺序为 运/盘/灵/境/梦/起/我", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1");
    const { RAIL_ORDER } = await import("../AppShell");
    expect(RAIL_ORDER).toEqual(["calendar", "chart", "spirit", "fengshui", "dream", "reading", "profiles"]);
  });

  it("导航不再含「首页」与「账号」两项（照＝铜铃，账已并入我的）", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "1");
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    render(<AppShell><div /></AppShell>, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    expect(screen.getAllByLabelText("运势").length).toBeGreaterThan(0); // 先证明导航真的渲染了
    expect(screen.queryByLabelText("首页")).toBeNull();
    expect(screen.queryByLabelText("账号")).toBeNull();
  });

  it("「盘」的标签是「命盘」而不是「解读」", async () => {
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    render(<AppShell><div /></AppShell>, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    expect(screen.getAllByLabelText("命盘").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("解读")).toBeNull();
  });

  it("「起盘」入口存在且指向 /reading", async () => {
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    render(<AppShell><div /></AppShell>, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    const links = screen.getAllByLabelText("起盘");
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]!.getAttribute("href")).toBe("/reading");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @sojan/web exec vitest run components/__tests__/AppShell.test.tsx`
Expected: FAIL —— `RAIL_ORDER` 未导出、「命盘」找不到、「首页」仍存在

- [ ] **Step 3: 改 i18n**

`zh.ts` 的 `nav` 命名空间：`spirit: "本命"` → `spirit: "问事"`，新增 `start: "起盘"`。
`en.ts` 的 `nav`：`spirit: "Spirit"` → `spirit: "Ask"`，新增 `start: "New Chart"`。
`nav.home` / `nav.account` **保留不删**（`/account` 页面自身与其他文案仍在用）。

- [ ] **Step 4: 改 `lib/nav.ts` 的两个 labelKey**

```ts
  chart:    { href: "/chart",    char: "盘", labelKey: "nav.chart" },
  reading:  { href: "/reading",  char: "起", labelKey: "nav.start" },
```

- [ ] **Step 5: 改 `AppShell.tsx` 项集**

```tsx
/** 桌面竖栏：7 项，「我的」沉底。「照」由顶部铜铃承担，不占项；「账」已并入「我的」。 */
export const RAIL_ORDER: readonly NavId[] = [
  "calendar", "chart", "spirit", "fengshui", "dream", "reading", "profiles",
];
/** 移动九宫格：与竖栏同源，但不含「我的」（owner 决定：移动端由顶部语境胶囊进我的）。 */
export const GRID_ORDER: readonly NavId[] = RAIL_ORDER.filter((id) => id !== "profiles");

const RAIL = enabled(RAIL_ORDER);
const NAV_COMPACT = RAIL.length >= 6;
```

删除 Task 1 临时加的 `HOME_ITEM` / `ACCOUNT_ITEM` / `BOTTOM_NAV`；竖栏与底栏都改为 `RAIL.map`。
竖栏里 `profiles` 那一项加 `style={{ marginTop: "auto" }}`（`06-desktop` §1：与功能项分开）——实现为渲染时判断 `item.id === "profiles"`。

- [ ] **Step 6: 重算三条 `NAV_COMPACT` 边界用例**

新基数（`RAIL` 含 profiles、不含 home/account）：

| flag 组合 | 项 | 数量 | 期望 |
|---|---|---|---|
| 三个全关 | 运/盘/起/我 | 4 | `px-2`，不收紧 |
| 只开境 | 运/盘/境/起/我 | 5 | `px-2`，**仍不收紧**（改动前这一档是收紧的，基数变了） |
| 境+灵 开、梦关 | 运/盘/灵/境/起/我 | 6 | `px-1.5`，收紧 |

把现有三条用例的 flag 组合与注释按上表改写，**边界语义（<6 用 `px-2`，≥6 用 `px-1.5`）不变**。同时更新用例名里的项集说明，别留下「照/运/盘/我/账」这种已经不成立的描述。

⚠️ 「全 flag 关时不得被收紧规则波及」这条原始不变量（风水波1 最终评审 Blocking 4）继续成立：4 < 6。

- [ ] **Step 7: 跑测试确认通过**

Run: `pnpm --filter @sojan/web exec vitest run components/__tests__/AppShell.test.tsx`
Expected: PASS

- [ ] **Step 8: 跑全量 + TG 回归**

Run: `pnpm --filter @sojan/web exec vitest run`
Expected: 全绿。**`app/__tests__/page.test.tsx` 断言仍未改**——TG 侧不受项集变化影响（它走 `TG_ORDER` 自己的顺序，且不含 profiles 之外的新项）。若这里红了，说明 Task 1 的重构泄漏到了 TG，必须回头修而不是改断言。

- [ ] **Step 9: mutation 复验**

① 把 `GRID_ORDER` 的 filter 去掉（让 profiles 混进九宫格）→ 确认「竖栏项集」用例仍绿而 Task 5 的九宫格用例将来会红（此时先记录，Task 5 补）。
② 把 `chart` 的 labelKey 改回 `nav.reading` → 确认「盘的标签是命盘」变红。改回。

- [ ] **Step 10: 提交**

```bash
git add apps/web/lib/nav.ts apps/web/lib/i18n/messages/zh.ts apps/web/lib/i18n/messages/en.ts \
        apps/web/components/AppShell.tsx apps/web/components/__tests__/AppShell.test.tsx
git commit -m "feat(nav): 项集改为竖栏 7 项、九宫格 6 项，修正两处标签

「照」移出项集由铜铃承担、「账」并入「我的」、新增「起」起盘。
修 /chart 一直用 nav.reading（值「解读」）的标签错误，改用既有但无人使用的
nav.chart；「灵」小字按设计包 2a′ 改「问事」；新增 nav.start。
NAV_COMPACT 三条边界按新基数重算，边界语义不变。"
```

---

### Task 3: 设计原语层

**Files:**
- Modify: `apps/web/components/ui.tsx`
- Create: `apps/web/components/__tests__/primitives.test.tsx`
- Modify: `apps/web/app/calendar/AskToday.tsx:58,67`、`apps/web/app/chart/page.tsx:273`、`apps/web/app/chart/SelfPortrait.tsx:103`（去掉 `topAccent`）

**Interfaces:**
- Produces: `Emphasis`、`Chip`、`PillChip`、`Button variant="action"`、`GanzhiBadge size="sm"|"md"|"lg"`
- Consumes: 无

**已查证的前提**：`Tag` 全仓**零消费方**（死代码），可自由改造；`Card.topAccent` 有 **4 处消费方**，全在 C 块会重建的页面里，本任务只做「去掉这个 prop」的最小改动。

- [ ] **Step 1: 写失败测试**

`apps/web/components/__tests__/primitives.test.tsx`：

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Emphasis, Chip, PillChip, GanzhiBadge, Button } from "../ui";

afterEach(() => cleanup());

describe("Emphasis：全站唯一的强调手法", () => {
  it("横向版＝2px 朱砂左线 + 向右淡出底", () => {
    render(<Emphasis data-testid="e">当前候</Emphasis>);
    const el = screen.getByTestId("e");
    expect(el.style.borderLeft).toContain("var(--color-cinnabar)");
    expect(el.style.backgroundImage).toContain("90deg");
  });

  it("竖向版改用上边线与 180deg（用于日柱、命宫这类竖排）", () => {
    render(<Emphasis axis="vertical" data-testid="e">日柱</Emphasis>);
    const el = screen.getByTestId("e");
    expect(el.style.borderTop).toContain("var(--color-cinnabar)");
    expect(el.style.borderLeft).toBe("");
    expect(el.style.backgroundImage).toContain("180deg");
  });
});

describe("Chip / PillChip", () => {
  it("Chip 默认 tint 底、ink-2 字；强调态换朱砂描边与朱砂字", () => {
    const { rerender } = render(<Chip data-testid="c">纳音</Chip>);
    expect(screen.getByTestId("c").style.background).toContain("--color-tint");
    rerender(<Chip data-testid="c" emphasis>纳音</Chip>);
    const el = screen.getByTestId("c");
    expect(el.style.border).toContain("var(--color-cinnabar)");
    expect(el.style.color).toContain("var(--color-cinnabar)");
  });

  it("PillChip 是全圆角细线小件", () => {
    render(<PillChip data-testid="p">属鸡</PillChip>);
    expect(screen.getByTestId("p").style.borderRadius).toBe("9999px");
  });
});

describe("GanzhiBadge 三档尺寸", () => {
  it("sm/md/lg 分别是 26/34/46px，默认 md", () => {
    const { rerender } = render(<GanzhiBadge char="庚" />);
    expect(screen.getByText("庚").style.width).toBe("34px");
    rerender(<GanzhiBadge char="庚" size="sm" />);
    expect(screen.getByText("庚").style.width).toBe("26px");
    rerender(<GanzhiBadge char="庚" size="lg" />);
    expect(screen.getByText("庚").style.width).toBe("46px");
  });
});

describe("Button variant=action：一屏最多一个的唯一动作", () => {
  it("满宽、朱砂底、纸色字、带字距", () => {
    render(<Button variant="action">解 这 个 梦</Button>);
    const el = screen.getByRole("button");
    expect(el.className).toContain("w-full");
    expect(el.style.letterSpacing).toBe("0.16em");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @sojan/web exec vitest run components/__tests__/primitives.test.tsx`
Expected: FAIL — `Emphasis` / `Chip` / `PillChip` 未导出

- [ ] **Step 3: 实现原语**

在 `apps/web/components/ui.tsx` 增加：

```tsx
/**
 * 全站**唯一**的强调手法（设计包 02-components §2）：2px 朱砂线 + 向对侧淡出的
 * 极浅朱砂底 + 朱砂粗字（关键字由调用方用 `text-cinnabar font-semibold` 标）。
 *
 * ⚠️ 不要为「强调」再发明第二种表达（色块 / 渐变按钮 / 投影 / 顶边彩条）。
 * `Card.topAccent` 就是被这条规则废掉的——一旦有先例，后面 8 屏就守不住。
 *
 * 用于：当前候、现行大运、当前流年、当前档案、命宫、生气方、危险区、选中筊象。
 */
export function Emphasis({
  axis = "horizontal",
  className,
  children,
  ...rest
}: { axis?: "horizontal" | "vertical" } & React.HTMLAttributes<HTMLDivElement>) {
  const horizontal = axis === "horizontal";
  return (
    <div
      className={cn(horizontal ? "pl-3 -ml-3.5" : "pt-3 -mt-3.5", className)}
      style={{
        [horizontal ? "borderLeft" : "borderTop"]: "2px solid var(--color-cinnabar)",
        backgroundImage: `linear-gradient(${horizontal ? "90deg" : "180deg"}, rgba(168,70,56,.07), rgba(168,70,56,0) 78%)`,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

/** 方角小 chip（设计包 §4）：padding 4px 11px / radius 4px。 */
export function Chip({
  emphasis = false,
  className,
  children,
  ...rest
}: { emphasis?: boolean } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("inline-flex items-center text-[12px]", className)}
      style={{
        padding: "4px 11px",
        borderRadius: "var(--radius-chip)",
        background: emphasis ? "transparent" : "var(--color-tint)",
        color: emphasis ? "var(--color-cinnabar)" : "var(--color-ink-2)",
        border: emphasis ? "1px solid var(--color-cinnabar)" : undefined,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}

/** 胶囊 chip（生肖 / 纳音 / 年龄 / 流年）：radius 9999px / 1px 细线 / 11.5px。 */
export function PillChip({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("inline-flex items-center text-[11.5px]", className)}
      style={{
        padding: "5px 12px",
        borderRadius: "9999px",
        border: "1px solid var(--color-line)",
        color: "var(--color-ink-2)",
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
```

`GanzhiBadge` 的 `size` 由 `number` 改为三档。⚠️ **有两个既有调用方传的是数字**（`apps/web/app/calendar/page.tsx:218,219` 各一处 `size={36}`），改签名会打破它们——本步骤必须同时把它们改成 `size="md"`（34px）。这会让运势页的干支徽小 2px，属可接受的对齐设计包，且该页 C 块会整体重建。

```tsx
const GANZHI_SIZE = { sm: 26, md: 34, lg: 46 } as const;

export function GanzhiBadge({
  char,
  highlight = false,
  size = "md",
}: {
  char: string;
  /** 日主双描边。⚠️ 这里的 box-shadow 是**描边**不是投影，与「零阴影」不冲突，勿误删。 */
  highlight?: boolean;
  size?: keyof typeof GANZHI_SIZE;
}) {
  const px = GANZHI_SIZE[size];
  // …其余同现有实现，把 size 换成 px
}
```

`Button` 增加 `action` variant：

```tsx
  variant?: "primary" | "secondary" | "text" | "action";
```
```tsx
    : variant === "action"
      ? "w-full py-4 text-[16px] font-medium text-[var(--color-paper)] bg-[var(--color-cinnabar)] hover:bg-[var(--color-cinnabar-press)]"
      : /* 其余分支不变 */
```
`action` 分支的 `style` 加 `letterSpacing: "0.16em"` 与 `borderRadius: "var(--radius-button)"`。

删除死代码 `Tag`（零消费方，其角色由 `Chip` 承担）。

- [ ] **Step 4: 废弃 `Card.topAccent`**

从 `Card` 的 props 与实现里删掉 `topAccent`（连同 `accentVar` 与 `borderTop`）。四处消费方逐一去掉该 prop：
- `apps/web/app/calendar/AskToday.tsx:58` `<Card topAccent={spirit.dominantElement}>` → `<Card>`
- `apps/web/app/calendar/AskToday.tsx:67` 同上
- `apps/web/app/chart/page.tsx:273` `<Card topAccent="metal">` → `<Card>`
- `apps/web/app/chart/SelfPortrait.tsx:103` `<Card className="mb-6" topAccent={…}>` → `<Card className="mb-6">`

顺带删掉因此不再使用的 import / 类型断言（`SelfPortrait.tsx` 那处的 `as "wood" | …` 断言可整体删除）。

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @sojan/web exec vitest run`
Expected: 全绿（原语测试新增；四处 `Card` 改动不影响既有断言）

- [ ] **Step 6: 确认 `topAccent` 全仓零残留**

Run: `grep -rn "topAccent" apps/web --include='*.tsx' --include='*.ts'`
Expected: 无输出

- [ ] **Step 7: mutation 复验**

把 `Emphasis` 竖向分支的 `180deg` 改成 `90deg` → 确认「竖向版」用例变红；改回。
把 `GANZHI_SIZE.md` 改成 44 → 确认三档用例变红；改回。

- [ ] **Step 8: 提交**

```bash
git add apps/web/components/ui.tsx apps/web/components/__tests__/primitives.test.tsx \
        apps/web/app/calendar/AskToday.tsx apps/web/app/calendar/page.tsx \
        apps/web/app/chart/page.tsx apps/web/app/chart/SelfPortrait.tsx
git commit -m "feat(ui): 新增 Emphasis/Chip/PillChip 原语，废弃 Card.topAccent

Emphasis 是设计包定的全站唯一强调手法（含横竖两向）。Card.topAccent 的 2px
顶边彩条是同一目的的第二种表达，与「唯一强调手法」硬约束冲突，连同 4 处消费方
一并移除。Tag 全仓零消费方，由 Chip 取代后删除。GanzhiBadge 尺寸收敛为三档。"
```

---

### Task 4: 页首范式 `PageHeader`

**Files:**
- Modify: `apps/web/components/PageHeader.tsx`
- Create: `apps/web/components/__tests__/PageHeader.test.tsx`

**Interfaces:**
- Consumes: Task 3 的原语（不直接依赖，但共用令牌）
- Produces: `PageHeader` 新签名 —— props 不变（`kicker` / `title` / `annotation` / `action`），只改版式

设计包 03-screens 通用规格：**朱砂 22px 短横 + 眉标 10.5px/.42em + serif 大标题 + 11.5px 说明行**。现状是「— X X —」破折号包裹 + 11px/.3em + 28px 标题 + 底部细线。

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PageHeader } from "../PageHeader";

afterEach(() => cleanup());

describe("PageHeader（UI v3 页首范式）", () => {
  it("眉标是 10.5px / .42em 且不再用破折号包裹", () => {
    render(<PageHeader kicker="解 梦" title="说说你的梦" />);
    const kicker = screen.getByText("解 梦");
    expect(kicker.style.fontSize).toBe("10.5px");
    expect(kicker.style.letterSpacing).toBe("0.42em");
    expect(kicker.textContent).not.toContain("—");
  });

  it("眉标前有一段朱砂短横（装饰，对无障碍隐藏）", () => {
    const { container } = render(<PageHeader kicker="解 梦" title="说说你的梦" />);
    const rule = container.querySelector('[data-testid="header-rule"]');
    expect(rule).not.toBeNull();
    expect(rule!.getAttribute("aria-hidden")).toBe("true");
    expect((rule as HTMLElement).style.background).toContain("var(--color-cinnabar)");
    expect((rule as HTMLElement).style.width).toBe("22px");
  });

  it("标题仍是 h1，说明行 11.5px", () => {
    render(<PageHeader kicker="解 梦" title="说说你的梦" annotation="梦是潜意识的信" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("说说你的梦");
    expect(screen.getByText("梦是潜意识的信").style.fontSize).toBe("11.5px");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @sojan/web exec vitest run components/__tests__/PageHeader.test.tsx`
Expected: FAIL —— 眉标仍是 11px 且含 `—`

- [ ] **Step 3: 改实现**

```tsx
      <div className="flex items-start justify-between gap-4">
        <div>
          <div
            data-testid="header-rule"
            aria-hidden="true"
            style={{ width: 22, height: 2, background: "var(--color-cinnabar)", marginBottom: 14 }}
          />
          <p style={{ fontSize: "10.5px", letterSpacing: "0.42em", color: "var(--color-muted)" }}>{kicker}</p>
          <h1 className="mt-3 font-serif font-bold leading-[1.2]" style={{ fontSize: 32 }}>{title}</h1>
          {annotation && (
            <p className="mt-2" style={{ fontSize: "11.5px", color: "var(--color-muted)" }}>{annotation}</p>
          )}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2 pt-8">{action}</div>}
      </div>
```
底部那条 `mt-6 h-px` 细线**删除**——设计包的页首靠短横与间距分隔，不再压一条通栏线（`06-desktop` §3 的桌面页头另有 `border-bottom: 1px solid line-strong`，那是桌面两栏布局的事，归 C）。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @sojan/web exec vitest run components/__tests__/PageHeader.test.tsx`
Expected: PASS 3/3

- [ ] **Step 5: 跑全量，修因页首改版而红的既有断言**

Run: `pnpm --filter @sojan/web exec vitest run`
若有页面测试断言了旧页首文本（如查找 `— 解 梦 —`），**改断言以匹配新范式**——这是版式变更的正当后果，不是掩盖回归。逐条记录改了哪几处。

- [ ] **Step 6: 提交**

```bash
git add apps/web/components/PageHeader.tsx apps/web/components/__tests__/PageHeader.test.tsx
git commit -m "feat(ui): PageHeader 改为 UI v3 页首范式（朱砂短横 + 10.5px/.42em 眉标）"
```

---

### Task 5: 九宫格导航覆盖层 `NavGrid`

**Files:**
- Create: `apps/web/components/NavGrid.tsx`
- Create: `apps/web/components/__tests__/NavGrid.test.tsx`

**Interfaces:**
- Consumes: Task 2 的 `GRID_ORDER`、Task 1 的 `enabled()`
- Produces: `<NavGrid open onClose currentPath />`，供 Task 6 的外壳接入

设计包 02 §1：4 列网格 `gap 8px`，格子 `padding 16px 0; radius 8px`，当前项墨底纸字、其余白底细线；格内 serif 23px 单字 + 10.5px 标签。下方接七十二候列表。

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.resetModules(); });

async function renderGrid(flags: Record<string, string>, path = "/calendar", onClose = vi.fn()) {
  for (const [k, v] of Object.entries(flags)) vi.stubEnv(k, v);
  const { NavGrid } = await import("../NavGrid");
  const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
  render(<NavGrid open onClose={onClose} currentPath={path} />, {
    wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
  });
  return onClose;
}

describe("NavGrid 九宫格导航", () => {
  it("全 flag 开启时 6 格，且**不含**「我的」（移动端由顶部胶囊进）", async () => {
    await renderGrid({
      NEXT_PUBLIC_SPIRIT_ENABLED: "1",
      NEXT_PUBLIC_FENGSHUI_ENABLED: "1",
      NEXT_PUBLIC_DREAM_ENABLED: "1",
    });
    expect(screen.getAllByTestId("nav-grid-cell")).toHaveLength(6);
    expect(screen.queryByLabelText("我的")).toBeNull();
  });

  it("全 flag 关闭时 3 格（运/盘/起）", async () => {
    await renderGrid({
      NEXT_PUBLIC_SPIRIT_ENABLED: "",
      NEXT_PUBLIC_FENGSHUI_ENABLED: "",
      NEXT_PUBLIC_DREAM_ENABLED: "",
    });
    const cells = screen.getAllByTestId("nav-grid-cell");
    expect(cells).toHaveLength(3);
    expect(cells.map((c) => c.getAttribute("href"))).toEqual(["/calendar", "/chart", "/reading"]);
  });

  it("当前项标 aria-current=page", async () => {
    await renderGrid({ NEXT_PUBLIC_FENGSHUI_ENABLED: "1" }, "/fengshui");
    const current = screen.getByLabelText("风水");
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(screen.getByLabelText("运势").getAttribute("aria-current")).toBeNull();
  });

  it("是模态对话框，Esc 关闭", async () => {
    const onClose = await renderGrid({});
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("open=false 时不渲染任何格子", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "1");
    const { NavGrid } = await import("../NavGrid");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    render(<NavGrid open={false} onClose={vi.fn()} currentPath="/" />, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    expect(screen.queryAllByTestId("nav-grid-cell")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @sojan/web exec vitest run components/__tests__/NavGrid.test.tsx`
Expected: FAIL — `Cannot find module '../NavGrid'`

- [ ] **Step 3: 实现 `NavGrid.tsx`**

要点（不给完整逐行代码的部分一律按此写）：
- 根元素 `role="dialog" aria-modal="true"`，`onKeyDown` 捕获 `Escape` 调 `onClose`
- 覆盖层底 `var(--color-paper)`，`position: fixed; inset: 0; z-index: 40`，`overflow-y: auto`
- 容器 `padding: 56px 16px 0`（与外壳同一口径，实现时用 `max(56px, env(safe-area-inset-top) + 12px)`）
- 网格 `display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px`
- 每格是 `next/link` 的 `<Link data-testid="nav-grid-cell" aria-label={t(labelKey)} aria-current={active ? "page" : undefined}>`，`padding: 16px 0; border-radius: var(--radius-card)`；当前项 `background: var(--color-ink); color: var(--color-on-ink)`，其余 `background: var(--color-surface); border: 1px solid var(--color-line)`
- 格内：`font-serif 23px` 单字（`item.char`）+ `10.5px` 标签
- 进出动画用既有 `.zj-fade`（挂 keyframes，`prefers-reduced-motion` 降级块自动覆盖）
- 当前项判定复用 `AppShell` 的 `isActive` 语义：`href === "/" ? path === "/" : path.startsWith(href)` —— 把该函数从 `AppShell.tsx` 提出到 `lib/nav.ts` 并在两处共用
- 网格下方留 `<section data-testid="nav-grid-seasons" />` 占位容器：**本任务只渲染标题「七 十 二 候」与当前候一行文字**（用 `lunar-typescript` 的 `getHou()` / `getWuHou()`，已实测可用：2026-08-25 → 「处暑 初候」/「鹰乃祭鸟」）。完整的候列表与标尺可视化归 B 块，此处不要提前实现

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @sojan/web exec vitest run components/__tests__/NavGrid.test.tsx`
Expected: PASS 5/5

- [ ] **Step 5: mutation 复验**

把 `GRID_ORDER` 换成 `RAIL_ORDER`（让「我的」混进来）→ 确认「6 格且不含我的」变红；改回。
把 `aria-current` 改成恒 `undefined` → 确认当前项用例变红；改回。

- [ ] **Step 6: 提交**

```bash
git add apps/web/components/NavGrid.tsx apps/web/components/__tests__/NavGrid.test.tsx apps/web/lib/nav.ts
git commit -m "feat(nav): 九宫格全屏导航覆盖层 NavGrid

6 格（不含「我的」，移动端由顶部胶囊进）、当前项 aria-current、role=dialog +
Esc 关闭。七十二候区块本轮只出当前候一行，完整标尺归 B 块。"
```

---

### Task 6: 移动外壳（语境胶囊 + 菜单键 + 删底栏）

**Files:**
- Create: `apps/web/components/ShellContext.tsx`
- Create: `apps/web/components/MobileShell.tsx`
- Modify: `apps/web/components/AppShell.tsx`
- Modify: `apps/web/components/__tests__/AppShell.test.tsx`

**Interfaces:**
- Consumes: Task 5 的 `NavGrid`、Task 2 的 `RAIL_ORDER`
- Produces: `useShellContext(label)` —— 页面声明当前语境词；`MobileShell`

- [ ] **Step 1: 写失败测试**

在 `AppShell.test.tsx` 新增：

```tsx
describe("UI v3 移动外壳", () => {
  it("底栏已删除（全站不再有 fixed bottom 导航）", async () => {
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    const { container } = render(<AppShell><div /></AppShell>, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    expect(container.querySelector("nav.fixed.bottom-0")).toBeNull();
  });

  it("语境胶囊默认取当前路由的 nav 标签，且链到 /profiles", async () => {
    vi.doMock("next/navigation", () => ({ usePathname: () => "/chart" }));
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    render(<AppShell><div /></AppShell>, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    const capsule = screen.getByTestId("shell-capsule");
    expect(capsule.getAttribute("href")).toBe("/profiles");
    expect(capsule).toHaveTextContent("命盘");
  });

  it("页面声明语境词时优先用声明值", async () => {
    const { AppShell } = await import("../AppShell");
    const { useShellContext } = await import("../ShellContext");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    function Page() { useShellContext("圣筊"); return <div />; }
    render(<AppShell><Page /></AppShell>, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    expect(screen.getByTestId("shell-capsule")).toHaveTextContent("圣筊");
  });

  it("菜单键打开九宫格；覆盖层里同位换成关闭键，尺寸不变", async () => {
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    render(<AppShell><div /></AppShell>, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByTestId("shell-menu"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const close = screen.getByTestId("shell-menu");
    expect(close.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(close);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("关闭后焦点归还菜单键", async () => {
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    render(<AppShell><div /></AppShell>, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    const menu = screen.getByTestId("shell-menu");
    fireEvent.click(menu);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(document.activeElement).toBe(menu);
  });

  it("Telegram 环境内不渲染任何新外壳（冻结线）", async () => {
    vi.doMock("@/lib/tg/ui", () => ({ useIsTelegram: () => true }));
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    render(<AppShell><div /></AppShell>, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    expect(screen.queryByTestId("shell-capsule")).toBeNull();
    expect(screen.queryByTestId("shell-menu")).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @sojan/web exec vitest run components/__tests__/AppShell.test.tsx`
Expected: FAIL —— 底栏仍在、`shell-capsule` 不存在

- [ ] **Step 3: 实现 `ShellContext.tsx`**

React context + provider：`{ label: string | null, setLabel }`。`useShellContext(label)` 在 `useEffect` 里 `setLabel(label)`、卸载时 `setLabel(null)`。**不要在 render 期间 setState**（仓库 lint 有 `react-hooks/set-state-in-effect` 规则，写在 effect 里并给正确依赖）。

- [ ] **Step 4: 实现 `MobileShell.tsx`**

- 容器 `padding: max(56px, calc(env(safe-area-inset-top) + 12px)) 16px 0`，`display:flex; align-items:center; justify-content:space-between; gap:12px`，`md:hidden`
- 左：`<Link data-testid="shell-capsule" href="/profiles">`，`padding: 7px 14px 7px 11px; border-radius: 9999px; background: var(--color-surface); border: 1px solid var(--color-line)`，内含 `<BellLogo size={17} motion="ring" />` + `font-serif 14px/600` 语境词
- 右：`<button data-testid="shell-menu" aria-expanded={open} aria-label={open ? t("nav.close") : t("nav.menu")}>`，`44×44; border-radius: 9999px`，底/描边同胶囊；未展开时画三道横线（`height:1.5px; gap:4px; padding:0 11px`，宽 100%/100%/60%，第三道 `var(--color-cinnabar)`），展开时画 `✕`（**外框尺寸/底/描边不变**）
- 语境词取值：`useContext(ShellContext).label ?? t(NAV_CATALOG[idOf(pathname)]?.labelKey ?? "nav.home")`

新增 i18n 键 `nav.menu` = 「菜单」/`"Menu"`、`nav.close` = 「关闭」/`"Close"`。

- [ ] **Step 5: 改 `AppShell.tsx`**

- 用 `ShellProvider` 包住整棵树（在 `{!tg && …}` 之外也无妨，但 `MobileShell` 只在 `!tg` 内渲染）
- `{!tg && (…)}` 内：保留桌面竖栏 `<nav className="… md:flex">`；**删除整个 `md:hidden` 底栏 `<nav>`**；新增 `<MobileShell />` 与 `<NavGrid open={navOpen} onClose={…} currentPath={pathname} />`
- `children` 容器 `pb-24 md:pb-0` 改为 `pb-0`（底部不再有遮挡）
- 关闭后焦点归还：`MobileShell` 内用 `useRef` 存菜单键，`onClose` 里 `menuRef.current?.focus()`

- [ ] **Step 6: 跑测试确认通过**

Run: `pnpm --filter @sojan/web exec vitest run components/__tests__/AppShell.test.tsx`
Expected: PASS

- [ ] **Step 7: 跑全量 + TG 冻结验证**

Run: `pnpm --filter @sojan/web exec vitest run`
Expected: 全绿，且 `app/__tests__/page.test.tsx` 断言仍未改。

- [ ] **Step 8: mutation 复验**

把胶囊的 `href` 改成 `/` → 确认「链到 /profiles」变红；改回。
删掉 `onClose` 里的 `menuRef.current?.focus()` → 确认焦点归还用例变红；改回。
把 `MobileShell` 挪到 `{!tg && …}` 之外 → 确认「TG 内不渲染」变红；改回。

- [ ] **Step 9: 提交**

```bash
git add apps/web/components/ShellContext.tsx apps/web/components/MobileShell.tsx \
        apps/web/components/AppShell.tsx apps/web/components/__tests__/AppShell.test.tsx \
        apps/web/lib/i18n/messages/zh.ts apps/web/lib/i18n/messages/en.ts
git commit -m "feat(shell): 移动端改顶部语境胶囊 + 菜单键 + 九宫格，删除底栏

胶囊左、菜单键右，点开九宫格覆盖层（同位换关闭键，尺寸不变），关闭后焦点归还。
语境词由页面用 useShellContext 声明，未声明时回退该路由的 nav 标签。
胶囊链到 /profiles（owner 决定：移动端由此进「我的」）。
新外壳整体位于既有 {!tg && …} 之内，Telegram 一行未改。"
```

---

### Task 7: 「我的 / 账号」可达性桥接 + 收尾回归

**Files:**
- Modify: `apps/web/app/profiles/page.tsx:96-106`（页头 action 槽里的「账号」按钮）
- Modify: `apps/web/app/profiles/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: Task 4 的 `PageHeader`、Task 3 的原语
- Produces: 无

**为什么 A 就要管这件事**：Task 2 移除了常驻「账」项，`/profiles` 就成了通往 `/account` 的唯一路径。`EP-account-login`（2026-08-21 owner 实测「换设备登不进账号」）的根因正是 `/account` 缺少直接入口。

**⚠️ 前提更正（查证后）**：spec §7.2 说现状是「嵌在正文里的文字链接」，**不准确**——`/profiles/page.tsx:98-106` 现在是 `PageHeader` 的 `action` 槽里一枚描边按钮，文案取 `t("nav.account")`。所以 `/account` 今天是可达的。本任务做的是**把它从页头小按钮提升为一条独立的分节行**（贴合 6c「账号是『我的』页里的一个分节」的结构），并给它加上此前没有的测试保护。真正的 6c 合并屏归 C 块。

- [ ] **Step 1: 写失败测试**

在 `apps/web/app/profiles/__tests__/page.test.tsx` 末尾追加（该文件顶部已 mock 好 `@/lib/profiles`、`@/lib/tg/client`、`@/lib/tg/ui`、`@/lib/supabase`、`next/navigation`，直接沿用）：

```tsx
describe("UI v3：账号入口（Task 2 移除常驻「账」项后，这里是唯一路径）", () => {
  it("有一条独立的账号分节行，指向 /account", async () => {
    const Page = (await import("../page")).default;
    render(<Page />);
    await waitFor(() => expect(screen.getByTestId("account-entry")).toBeInTheDocument());
    const entry = screen.getByTestId("account-entry");
    expect(entry.getAttribute("href")).toBe("/account");
  });

  it("页头 action 槽里不再重复一个账号按钮（同页只留一个入口）", async () => {
    const Page = (await import("../page")).default;
    render(<Page />);
    await waitFor(() => expect(screen.getByTestId("account-entry")).toBeInTheDocument());
    expect(screen.getAllByRole("link", { name: /账号/ })).toHaveLength(1);
  });
});
```

> 该测试文件用的是 `I18nProvider` 的默认 zh 文案还是自带 wrapper，按文件既有惯例照做；若既有用例是裸 `render(<Page />)`，说明 `useT` 在无 Provider 时回退 zh，沿用即可。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @sojan/web exec vitest run app/profiles`
Expected: FAIL — `account-entry` 不存在

- [ ] **Step 3: 实现**

在 `/profiles` 页首之下、档案列表之上加一条独立的细线行：

```tsx
<Link
  data-testid="account-entry"
  href="/account"
  className="flex items-center justify-between py-4"
  style={{ borderTop: "1px solid var(--color-line)", borderBottom: "1px solid var(--color-line)" }}
>
  <span className="font-serif text-[17px]">{t("account.entry")}</span>
  <span style={{ color: "var(--color-muted)" }}>→</span>
</Link>
```

新增 i18n `account.entry` = 「账号与登录」/`"Account & Sign-in"`。

**同时删掉 `PageHeader` `action` 槽里那枚旧的「账号」按钮**（`page.tsx:98-106` 的第一个 `<Link href="/account">`），只保留 `action` 里的「起盘建档」按钮——否则同页两个入口，第二条测试会红。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @sojan/web exec vitest run app/profiles`
Expected: PASS

- [ ] **Step 5: 全量收尾验证**

逐条跑并记录实际输出：

```bash
pnpm --filter @sojan/web exec vitest run                 # 期望：全绿，条数 ≥ 626 + 本轮新增
pnpm --filter @sojan/web run lint                        # 期望：2 errors / 17 warnings，不变差
pnpm exec tsc -p apps/web/tsconfig.json --noEmit 2>&1 | grep -c "error TS"   # 期望：7
pnpm --filter @sojan/web build                           # 期望：构建通过
```

- [ ] **Step 6: 人工核对验收标准**

对照 spec §11 逐条打勾，尤其：
- 移动端底栏消失、胶囊 + 菜单键在**全部 web 路由**上出现（逐个路由手工过）
- **TG 内手工过一遍**首页与任一功能页，确认外观与行为与改动前一致
- `grep -rn "topAccent" apps/web` 无输出
- `prefers-reduced-motion` 下打开九宫格无动画且功能完整（浏览器 DevTools 模拟）

- [ ] **Step 7: 提交**

```bash
git add apps/web/app/profiles apps/web/lib/i18n/messages/zh.ts apps/web/lib/i18n/messages/en.ts
git commit -m "feat(profiles): 补账号入口，堵住移除常驻「账」项带来的可达性缺口

Task 2 把常驻「账」项移出导航后，/account 会重新变成只能靠页头文字链接抵达
——那正是 EP-account-login（owner 2026-08-21 实测「换设备登不进账号」）的根因。
本条在 /profiles 加一条独立细线行作显眼入口。6c 的完整合并屏归 C 块。"
```

---

## 遗留给后续块

- **七十二候完整列表与标尺可视化** → B 块（`NavGrid` 本轮只出当前候一行）
- **`/profiles` + `/account` 的 6c 合并屏** → C 块
- **各页语境词的完整清单** → C 块逐屏用 `useShellContext` 落实（A 只建机制与回退）
- **桌面两栏「左定右动」布局** → C 块（`06-desktop` §3）

## 待 owner 拍板（不阻塞前 6 个任务）

1. **移动端怎么回卷首 `/`？** 九宫格 6 项不含首页，胶囊已指给「我的」。建议：覆盖层里的胶囊显示「照见」并链到 `/`（普通页面显示语境词、链到「我的」）。**在 Task 5/6 落地前需要答案**，否则移动端无路径回首页。
2. **「灵」的小字**按设计包 2a′ 定为「问事」，与 owner 2026-08-25 在 `EP-nav-label-2` 里提的「掷筊」不同。计划按设计包写，若要「掷筊」在 Task 2 改一个字符串即可。
