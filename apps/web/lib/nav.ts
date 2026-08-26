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

/**
 * 三个消费方各自的项集顺序常量。
 *
 * 裁定 R3：这些顺序常量定义在这里而不是 `AppShell.tsx`——后续任务的 `NavGrid`
 * 组件要取这些常量，而 `AppShell.tsx` 届时要 import `NavGrid`，放在
 * `AppShell.tsx` 会构成循环依赖。
 */

/** 桌面竖栏 / 移动底栏当前的项集（Task 2 会改成新项集）。「照」不在目录里，由铜铃承担。 */
export const RAIL_ORDER: readonly NavId[] = ["calendar", "chart", "spirit", "fengshui", "dream", "profiles"];

/** 预留给后续任务（如网格式导航）使用的项集，Task 1 暂与 RAIL_ORDER 一致。 */
export const GRID_ORDER: readonly NavId[] = RAIL_ORDER;

/** Telegram 首页入口的项集（不含「灵」——EP-jiao 最终评审 C1 内测期摘除）。 */
export const TG_ORDER: readonly NavId[] = ["calendar", "chart", "fengshui", "reading", "dream", "profiles"];
