"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useT } from "@/lib/i18n/I18nProvider";
import { BellLogo } from "@/components/ui";
import { NavGrid } from "@/components/NavGrid";
import { NAV_CATALOG, isActive } from "@/lib/nav";
import { useShellContextValue } from "@/components/ShellContext";

/** 当前路由在 `NAV_CATALOG` 里对应的 `labelKey`，找不到就回退首页。 */
function labelKeyForPath(pathname: string): string {
  const entry = Object.values(NAV_CATALOG).find((item) => isActive(pathname, item.href));
  return entry?.labelKey ?? "nav.home";
}

/**
 * 移动端顶部外壳（Task 6）：左侧语境胶囊 + 右侧菜单键，点开
 * `NavGrid` 九宫格全屏覆盖层。自成一体（含 `open` 状态与 `NavGrid` 本身），
 * 因为焦点归还（关闭后回到菜单键）需要同一个 `useRef` 既挂在按钮上、
 * 又被 `onClose` 读取——放在同一个组件里最直接，不必在 `AppShell` 与
 * 本组件之间转发 ref。
 *
 * 层叠顺序：`NavGrid` 的遮罩 `z-index: 40`，本组件顶栏必须压在其上——
 * 覆盖层打开时胶囊与菜单键仍需可见（菜单键原地变关闭键）。这里用 60。
 */
export function MobileShell({ currentPath }: { currentPath: string }) {
  const t = useT();
  const { label } = useShellContextValue();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);

  const contextLabel = label ?? t(labelKeyForPath(currentPath));

  function close() {
    setOpen(false);
    // 无障碍：关闭后焦点归还菜单键（不管是点关闭键还是 NavGrid 内部 Esc 触发）。
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
          className="font-serif inline-flex items-center gap-1.5"
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
          aria-expanded={open}
          aria-label={open ? t("nav.close") : t("nav.menu")}
          onClick={() => setOpen((v) => !v)}
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
      <NavGrid open={open} onClose={close} currentPath={currentPath} />
    </>
  );
}
