"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/I18nProvider";
import { BellLogo } from "@/components/ui";
import { NAV_CATALOG, isActive } from "@/lib/nav";
import { useShellContextValue } from "@/components/ShellContext";

// 最终评审 C5：`NavGrid` 静态 import 会把它连带的 `@sojan/core`（lunar-typescript
// + iztro 常量表，实测单 chunk 2,055,484 字节）打进每条经 `AppShell` 挂载的路由
// 客户端包——包括 TG 里根本不渲染 `MobileShell` 的场景（在 `{!tg && …}` 内）。
// `NavGrid` 在 `open=false` 时本就返回 `null`、不参与首帧，`ssr: false` 安全。
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
 * 焦点管理（评审 Critical + 控制器裁定必修，`NavGrid.tsx` 的注释已明确写明
 * 这活留给外壳）：
 * - 关闭：菜单键的 `onClick` 与 `NavGrid` 内部 Esc 都收敛到同一个 `close()`——
 *   此前菜单键 `onClick` 是裸 `setOpen((v) => !v)`，不经过 `close()`，导致点击
 *   关闭键这条路径完全不归还焦点。iOS Safari / WebView 点 `<button>` 默认不留
 *   焦点（跟桌面浏览器行为不同），这个组件又叫 MobileShell——移动端正是主场，
 *   所以这不是可以忽略的边角情况。
 * - 打开：聚焦九宫格第一个导航格（而不是对话框容器本身）——`NavGrid` 根节点
 *   没有 `tabIndex`，本任务文件清单不含 `NavGrid.tsx`，改它的可聚焦性不在这次
 *   改动范围内；第一个导航格天然是 `<a href>`，本就可聚焦，键盘用户按 Tab 前
 *   焦点已经在覆盖层内部的真实交互元素上。
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
  const gridWrapRef = useRef<HTMLDivElement>(null);

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

  const contextLabel = label ?? t(labelKeyForPath(currentPath));

  function close() {
    setOpen(false);
    // 无障碍：关闭后焦点归还菜单键——两条关闭路径（点关闭键 / NavGrid 内 Esc）
    // 都必须走这个函数，见上方组件注释「评审 Critical」一节。
    menuRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const container = gridWrapRef.current;
    if (!container) return;
    // 无障碍：打开时把焦点移入对话框——聚焦九宫格第一个导航格（选择理由见
    // 组件顶部注释）。不在 SSR 水合比对范围内：这个 effect 只在 `open` 变为
    // `true`（用户点击之后）才跑，跟水合无关。
    // 在 `gridWrapRef` 容器内查询，而不是 `document` 全局查询——查询范围收敛
    // 到本组件渲染的子树；选择器用语义化的 `a[href]` 而非 `data-testid`，
    // 生产逻辑不依赖本该只服务测试的属性（`data-testid="nav-grid-cell"` 仍
    // 保留在 `NavGrid.tsx` 里给测试用，只是这里不再读它）。
    //
    // C5 引入 `next/dynamic(ssr:false)` 之后：`open` 变 `true` 的这一刻，`NavGrid`
    // 的异步 chunk 可能还没 resolve、子树里还没有任何 `<a href>`——直接查询会
    // 扑空。用 `MutationObserver` 等 chunk 到位后再聚焦一次，找到后立刻断开。
    const focusFirstCell = () => {
      const firstCell = container.querySelector<HTMLAnchorElement>("a[href]");
      if (firstCell) {
        firstCell.focus();
        return true;
      }
      return false;
    };
    if (focusFirstCell()) return;
    const observer = new MutationObserver(() => {
      if (focusFirstCell()) observer.disconnect();
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [open]);

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
          <BellLogo size={17} motion="ring" />
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
        `open` 是普通 `useState(false)`，服务端与客户端首帧永远一致地渲染
        `NavGrid open={false}` → 组件内部 `if (!open) return null`，七十二候那行
        依赖 `new Date()` 的代码根本不会在首帧（也就是水合校验会比对的那一帧）
        执行。之后 `open` 变 `true` 全部由用户点击驱动，属于普通客户端态更新，
        不再经过水合比对，因此结构上不存在「服务端候 A、客户端候 B」的分歧
        ——不需要额外的「挂载后再渲染」占位包装。验证见
        `AppShell.test.tsx`「打开前 nav-grid-seasons 不存在」用例。
      */}
      <div ref={gridWrapRef}>
        <NavGrid open={open} onClose={close} currentPath={currentPath} />
      </div>
    </>
  );
}
