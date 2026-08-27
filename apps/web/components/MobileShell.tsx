"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { useT } from "@/lib/i18n/I18nProvider";
import { BellLogo } from "@/components/ui";
import { NAV_CATALOG, isActive } from "@/lib/nav";
import { useShellContextValue } from "@/components/ShellContext";

// 最终评审 C5：`NavGrid` 静态 import 会把它连带的 `@sojan/core`（lunar-typescript
// + iztro 常量表，实测单 chunk 2,055,484 字节）打进每条经 `AppShell` 挂载的路由
// 客户端包——包括 TG 里根本不渲染 `MobileShell` 的场景（在 `{!tg && …}` 内）。
// `NavGrid` 在 `open=false` 时本就返回 `null`、不参与首帧，`ssr: false` 安全。
//
// 复审二轮再证伪：`next/dynamic` 本质是 `React.lazy`，loader 在**元素首次被
// 渲染**时触发，与内部 `open` 判断无关。上一轮虽然接了 `dynamic()`，但下面
// 渲染处曾是无条件的 `<NavGrid open={open} .../>`——组件挂载后这个元素立刻
// 被渲染一次（哪怕 `open=false`、内部马上 return null），chunk 照样立刻下载，
// 只是从「打包进首屏」挪成了「hydration 后异步请求」，2MB 该下载还是下载。
// 真正的修法是让元素本身只在 `open=true` 时才被创建，见下方渲染处的
// `{open && <NavGrid .../>}`。
const NavGrid = dynamic(() => import("@/components/NavGrid").then((m) => m.NavGrid), {
  ssr: false,
});

/** 当前路由在 `NAV_CATALOG` 里对应的 `labelKey`，找不到就回退首页。 */
function labelKeyForPath(pathname: string): string {
  const entry = Object.values(NAV_CATALOG).find((item) => isActive(pathname, item.href));
  return entry?.labelKey ?? "nav.home";
}

/**
 * 移动端顶部外壳（Task 6）：左侧语境胶囊 + 右侧菜单键，点开
 * `NavGrid` 九宫格全屏覆盖层。自成一体（含 `open` 状态与 `NavGrid` 本身），
 * 因为焦点归还（关闭后回到菜单键）需要同一个 `useRef` 既挂在按钮上、
 * 又被 `close()` 读取——放在同一个组件里最直接，不必在 `AppShell` 与
 * 本组件之间转发 ref。
 *
 * 层叠顺序：`NavGrid` 的遮罩 `z-index: 40`，本组件顶栏必须压在其上——
 * 覆盖层打开时胶囊与菜单键仍需可见（菜单键原地变关闭键）。这里用 60。
 *
 * 焦点管理（评审 Critical + 控制器裁定必修）：
 * - 关闭：菜单键的 `onClick` 与 `NavGrid` 内部 Esc 都收敛到同一个 `close()`——
 *   此前菜单键 `onClick` 是裸 `setOpen((v) => !v)`，不经过 `close()`，导致点击
 *   关闭键这条路径完全不归还焦点。iOS Safari / WebView 点 `<button>` 默认不留
 *   焦点（跟桌面浏览器行为不同），这个组件又叫 MobileShell——移动端正是主场，
 *   所以这不是可以忽略的边角情况。归还焦点的目标是 `menuRef`，只有这个组件
 *   持有，所以留在这里。
 * - 打开：聚焦九宫格第一个导航格（而不是对话框容器本身）——这部分逻辑复审
 *   二轮起已经**挪进 `NavGrid.tsx` 自己的挂载 effect**，不再放在这里。原先
 *   放在本组件是因为「`NavGrid` 根节点没有 `tabIndex`，改可聚焦性不在当时的
 *   改动范围」；C5 把 `<NavGrid open={open} .../>` 改成 `{open && <NavGrid/>}`
 *   之后，`NavGrid` 的挂载时机本就等价于「刚打开」，聚焦第一格这件事天然属于
 *   它自己的挂载 effect，不需要外壳用 `MutationObserver` 猜它什么时候出现在
 *   DOM 里。「焦点管理留给外壳」这条边界其实已经被 `NavGrid.tsx` 里的
 *   `document` 级 Esc 监听打破——键盘/焦点管理本来就已经在那个组件里，聚焦
 *   第一格搬过去是保持一致，不是新开先例（详见 `NavGrid.tsx` 顶部注释）。
 * - 如实说明未做的部分：`aria-modal="true"` 通常意味着背景内容对辅助技术是
 *   惰性的，但这里**没有做完整的 Tab 焦点陷阱**——覆盖层打开后一路 Tab 下去，
 *   焦点仍会跑出覆盖层、落到背后页面的链接上。做完整陷阱需要枚举/监听覆盖层
 *   内的可聚焦元素并在首尾兜圈，这次先只保证「进入时落进对话框」+「关闭后归还
 *   菜单键」，把陷阱标记为已知缺口而不是假装做了。
 */
export function MobileShell({ currentPath }: { currentPath: string }) {
  const t = useT();
  const { label } = useShellContextValue();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);

  // 最终评审 C1（Critical）：App Router 客户端跳转不重挂 root layout，`open`
  // 状态跨路由存活——点九宫格任意格子后路由确实切换了，但覆盖层原地不动，
  // 只是当前项高亮换了一格。这是 react.dev「渲染期按 prop 变化调整 state」
  // 的标准写法（存一份 `prevPath` 在 state 里，渲染期比对、不一致就同步纠正），
  // 特意不用 `useEffect`——`react-hooks/set-state-in-effect` 会警告 effect 里
  // 无条件调用 setState，且渲染期纠正比 effect 早一轮、不会先闪一帧旧覆盖层。
  // ⚠️ 不能调 `close()`——`close()` 里 `menuRef.current?.focus()` 会在每次
  // 路由跳转后都抢走焦点（例如跳去 /calendar 后焦点应留在页面本身，不该被
  // 拽回菜单键），这里直接 `setOpen(false)`。
  const [prevPath, setPrevPath] = useState(currentPath);
  if (currentPath !== prevPath) {
    setPrevPath(currentPath);
    setOpen(false);
  }

  // owner 打磨批指令 3：首页路由下胶囊不再显示「首页」，改显品牌词「照见」
  // （卷首 Hero 里独立的 logo+「照见」行同批移除，品牌词由胶囊承担）。
  const contextLabel = label ?? (currentPath === "/" ? t("common.brand") : t(labelKeyForPath(currentPath)));

  function close() {
    setOpen(false);
    // 无障碍：关闭后焦点归还菜单键——两条关闭路径（点关闭键 / NavGrid 内 Esc）
    // 都必须走这个函数，见上方组件注释「评审 Critical」一节。
    menuRef.current?.focus();
  }

  return (
    <>
      <div
        className="flex items-center justify-between gap-3 md:hidden"
        style={{
          position: "relative",
          zIndex: 60,
          padding: "max(56px, calc(env(safe-area-inset-top) + 12px)) 16px 0",
        }}
      >
        {/*
          裁定 R1（控制器裁定，非随手加的分支）：胶囊在两种状态下文字与去向都不同。
          关闭时：显示当前语境词，链到 /profiles —— owner 明确决定移动端由胶囊进
          「我的」。打开时：改显示品牌词「照见」，链到 / —— 九宫格只有 6 格且不含
          首页，胶囊又被指给了「我的」，若不补这条，移动端将没有任何路径回到卷首。
          两种状态文字本就不同（语境词 vs 照见），所以链接目标不同也是可读的，
          不是隐藏的魔法分支。
        */}
        <Link
          data-testid="shell-capsule"
          href={open ? "/" : "/profiles"}
          onClick={() => {
            // 随手项 3：覆盖层打开、且当前已经在首页时点胶囊——pathname 不会
            // 变化，下面 C1 那套按 pathname 变化触发的复位逻辑不会跑，覆盖层
            // 会原地不关（正是 R1 自己的场景：在 / 打开覆盖层后点「照见」回
            // 首页）。这里显式兜底关闭。调用 `close()` 而不是裸 `setOpen(false)`
            // 是刻意的：这条分支只在「点击后不会发生真实路由跳转」时触发，
            // 不会撞上 C1 注释里警惕的「每次真实跳转都抢焦点」问题——反而因为
            // 胶囊本身即将失去意义（覆盖层关闭、用户视觉焦点回到已经看过的
            // 首页），把键盘焦点归还菜单键是合理的收尾，与「点击关闭键」那条
            // 路径语义一致。
            if (open && currentPath === "/") close();
          }}
          className="font-serif inline-flex items-center gap-1.5 zj-wheel-focus"
          style={{
            padding: "7px 14px 7px 11px",
            borderRadius: 9999,
            background: "var(--color-surface)",
            border: "1px solid var(--color-line)",
            fontSize: 14,
            fontWeight: 600,
            minHeight: 44,
          }}
        >
          <BellLogo size={17} motion="idle" />
          <span>{open ? t("common.brand") : contextLabel}</span>
        </Link>

        <button
          ref={menuRef}
          type="button"
          data-testid="shell-menu"
          className="zj-wheel-focus"
          aria-expanded={open}
          aria-label={open ? t("nav.close") : t("nav.menu")}
          onClick={() => (open ? close() : setOpen(true))}
          style={{
            width: 44,
            height: 44,
            borderRadius: 9999,
            background: "var(--color-surface)",
            border: "1px solid var(--color-line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {open ? (
            <span aria-hidden style={{ fontSize: 17, lineHeight: 1 }}>
              ✕
            </span>
          ) : (
            <span
              aria-hidden
              className="flex flex-col"
              style={{ width: "100%", gap: 4, padding: "0 11px" }}
            >
              <span style={{ height: 1.5, width: "100%", background: "var(--color-ink)" }} />
              <span style={{ height: 1.5, width: "100%", background: "var(--color-ink)" }} />
              <span style={{ height: 1.5, width: "60%", background: "var(--color-cinnabar)" }} />
            </span>
          )}
        </button>
      </div>

      {/*
        水合安全（CLAUDE.md 已有一次 hydration error #418 的教训，此处不重蹈）：
        服务端与客户端首帧永远一致地渲染 `open=false` → `{open && <NavGrid/>}`
        求值为 `false`，`NavGrid` 元素在首帧根本不被创建，七十二候那行依赖
        `new Date()` 的代码自然不会在首帧（也就是水合校验会比对的那一帧）执行。
        之后 `open` 变 `true` 全部由用户点击驱动，属于普通客户端态更新，不再
        经过水合比对，因此结构上不存在「服务端候 A、客户端候 B」的分歧——不
        需要额外的「挂载后再渲染」占位包装。验证见 `AppShell.test.tsx`「打开前
        nav-grid-seasons 不存在」用例。
      */}
      {/*
        复审二轮 C5：这里从「无条件渲染 `<NavGrid open={open} .../>`」改成
        `{open && <NavGrid .../>}`——前者会让 `NavGrid` 元素在组件挂载后立刻
        被创建（哪怕 `open=false`），`next/dynamic` 的 loader 在**元素首次被
        渲染**时就触发，与内部 `if (!open) return null` 无关，2MB 的
        `@sojan/core` chunk 照样立刻下载。改成条件渲染后，只有真正点开菜单
        那一刻才创建这个元素，loader 才第一次被触发。见 `AppShell.test.tsx`
        「未打开时不求值，点开菜单后才求值」的探针用例。
      */}
      {open && <NavGrid open={open} onClose={close} currentPath={currentPath} />}
    </>
  );
}
