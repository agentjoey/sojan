/**
 * 导航目录与 flag 门控的**单一事实源**。
 *
 * 为什么要有这个文件：此前导航入口分散在多份各自硬编码的列表里，flag 判断也各写
 * 一遍，全靠人肉对齐（TG 下线前，Mini App 首页的入口列表就因此踩过多次）。现在
 * **门控只有这一处**。
 *
 * 各消费方取子集是**刻意的**（顺序、大字不同），但它们判断「这项开没开」必须走
 * 同一个 `isNavEnabled`。
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
  chart:    { href: "/chart",    char: "盘", labelKey: "nav.chart" },
  spirit:   { href: "/spirit",   char: "灵", labelKey: "nav.spirit",   flag: "spirit" },
  fengshui: { href: "/fengshui", char: "境", labelKey: "nav.fengshui", flag: "fengshui" },
  dream:    { href: "/dream",    char: "梦", labelKey: "nav.dream",    flag: "dream" },
  reading:  { href: "/reading",  char: "起", labelKey: "nav.start" },
  profiles: { href: "/profiles", char: "我", labelKey: "nav.profiles" },
};

export function isNavEnabled(id: NavId): boolean {
  const flag = NAV_CATALOG[id].flag;
  return flag ? FLAGS[flag] : true;
}

/**
 * 「当前项」判定的唯一实现——原先在 `AppShell.tsx` 里私有定义，Task 5 的
 * `NavGrid` 也要同一套语义，故提到这里供两处共用（避免两份实现悄悄漂移）。
 */
export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
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

/** 桌面竖栏：7 项，「我的」沉底。「照」由顶部铜铃承担，不占项；「账」已并入「我的」。 */
export const RAIL_ORDER: readonly NavId[] = [
  "calendar", "chart", "spirit", "fengshui", "dream", "reading", "profiles",
];

/** 移动九宫格：与竖栏同源，但不含「我的」（owner 决定：移动端由顶部语境胶囊进我的）。 */
export const GRID_ORDER: readonly NavId[] = RAIL_ORDER.filter((id) => id !== "profiles");
