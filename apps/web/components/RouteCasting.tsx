"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CastingOverlay } from "@/components/CastingOverlay";
import { useT } from "@/lib/i18n/I18nProvider";

/**
 * 路由切换过场（owner 打磨批指令 7）：每次客户端路由切换播一次 1.2s 短版
 * 风铃过场（`CastingOverlay` mode="route"）。挂在 `AppShell` 的 `{!tg && …}`
 * 内——TG 冻结，Mini App 里不播。
 *
 * - 首次挂载不播：首屏的等待由各地页面的 pending 过场（或静态内容）承担，
 *   再叠一层路由过场是双播。
 * - 「渲染期按 prop 变化调整 state」与 MobileShell 的 C1 同款写法（存 prevPath
 *   渲染期比对），不用 effect 检测——effect 会晚一轮、先闪一帧新页面再盖过场。
 * - 卸载定时器 1200ms 与 globals.css 的 `zjCastingRoute 1.2s` 一体动画同步
 *   （与 brief 模式 2.1s 的既有约定一致）。
 */
export function RouteCasting() {
  const pathname = usePathname();
  const t = useT();
  const [casting, setCasting] = useState(false);
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setCasting(true);
  }

  useEffect(() => {
    if (!casting) return;
    const timer = setTimeout(() => setCasting(false), 1200);
    return () => clearTimeout(timer);
  }, [casting]);

  return casting ? <CastingOverlay title={t("common.brand")} mode="route" /> : null;
}
