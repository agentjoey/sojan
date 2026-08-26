"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { getCurrentSolarHou } from "@sojan/core";
import { useT } from "@/lib/i18n/I18nProvider";
import { enabled, isActive, GRID_ORDER } from "@/lib/nav";

/**
 * 九宫格全屏导航覆盖层（Task 5）。
 *
 * 边界（brief §边界划分）：本组件**只**画网格 + 七十二候一行。左上语境胶囊 /
 * 右上关闭键属于下一个任务的 `MobileShell`（层叠顺序更高、压在本组件之上），
 * 这里再画一套会重影。
 *
 * 项集取 `GRID_ORDER`（= `RAIL_ORDER` 去掉「我的」——移动端由顶部语境胶囊进
 * 「我的」，见 `lib/nav.ts` 注释），已按 flag 过滤、保序。
 *
 * 最终评审 C3：Esc 此前挂在 dialog 根 `<div>` 的 `onKeyDown` 上，全靠事件冒泡——
 * 而该 div 没有 `tabIndex`，一旦焦点落到非可聚焦处（七十二候文字、格子间空隙）
 * 或落到 `MobileShell` 里的 ✕（dialog 的兄弟节点，不在子树内），Esc 就静默失效。
 * 改成 `open` 时在 `document` 上挂一个真正的 keydown 监听，不再依赖事件冒泡路径。
 *
 * 最终评审 C2：内层顶距此前与 `MobileShell` 顶栏用同一个 56px 基准，被顶栏
 * （高 44px、z-index 60）整个盖住网格第一行。这里改成「安全区 + 顶栏高度 44px
 * + 26px 间隔」（design ref：bar `padding: 56px 16px 0`、网格 `padding: 26px 20px 0`
 * 是兄弟节点，网格本就该在 bar 下方 26px）。
 *
 * 最终评审 C5（复审二轮）：「进入时把焦点移入第一个格子」原来放在 `MobileShell`
 * 里，靠 `MutationObserver` 等 `next/dynamic` 异步 chunk 到位后再聚焦——那是
 * 因为彼时 `MobileShell` 无条件渲染 `<NavGrid open={open} .../>`，元素在
 * `open=false` 时也已创建，`NavGrid` 组件本身还不存在于 DOM 里，只能靠观察者
 * 等它出现。修复 C5 后 `MobileShell` 改成 `{open && <NavGrid .../>}`——只有真正
 * 打开时才创建这个元素，也就是只有这时组件才挂载。既然挂载时机就是「格子已经
 * 在 DOM 里」这一刻，聚焦直接放进本组件自己的挂载 effect 即可：确定性的，
 * 不需要观察也不需要轮询。
 * 顺带说明：「焦点管理留给外壳」这条边界本轮其实已经被打破了——上面 C3 那条
 * `document` 级 Esc 监听本身就是键盘/焦点管理，已经在这个组件里。所以把「进入
 * 时聚焦第一格」也放进来是一致的，不是新开先例。
 */
const GRID_TOP_OFFSET = "max(126px, calc(env(safe-area-inset-top) + 82px))";

export function NavGrid({
  open,
  onClose,
  currentPath,
}: {
  open: boolean;
  onClose: () => void;
  currentPath: string;
}) {
  const t = useT();
  const firstCellRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // 无障碍：挂载时把焦点移入对话框——聚焦第一个导航格而不是对话框容器本身
  // （选择理由见 `MobileShell.tsx` 顶部注释）。依赖数组为空：本组件只在
  // `open` 变 `true` 的那一刻由 `MobileShell` 的 `{open && <NavGrid/>}` 创建，
  // 所以「挂载」与「刚打开」是同一时刻，不需要响应 `open` 的变化。
  useEffect(() => {
    firstCellRef.current?.focus();
  }, []);

  if (!open) return null;

  const items = enabled(GRID_ORDER);
  const { hou, wuHou } = getCurrentSolarHou();

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="zj-fade"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        overflowY: "auto",
        background: "var(--color-paper)",
      }}
    >
      <div data-testid="nav-grid-content" style={{ padding: `${GRID_TOP_OFFSET} 20px 0` }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 8,
          }}
        >
          {items.map((item, index) => {
            const active = isActive(currentPath, item.href);
            return (
              <Link
                key={item.href}
                ref={index === 0 ? firstCellRef : undefined}
                href={item.href}
                data-testid="nav-grid-cell"
                aria-label={t(item.labelKey)}
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center justify-center gap-1 zj-wheel-focus"
                style={{
                  padding: "16px 0",
                  borderRadius: "var(--radius-card)",
                  background: active ? "var(--color-ink)" : "var(--color-surface)",
                  color: active ? "var(--color-on-ink)" : "var(--color-ink)",
                  border: active ? "none" : "1px solid var(--color-line)",
                }}
              >
                <span className="font-serif" style={{ fontSize: 23 }}>
                  {item.char}
                </span>
                <span style={{ fontSize: 10.5 }}>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </div>

        <section data-testid="nav-grid-seasons" className="mt-6">
          <p className="font-serif" style={{ letterSpacing: "0.3em" }}>
            七 十 二 候
          </p>
          <p style={{ color: "var(--color-muted)" }}>
            {hou} · {wuHou}
          </p>
        </section>
      </div>
    </div>
  );
}
