"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BellLogo, cn } from "@/components/ui";
import { useIsTelegram } from "@/lib/tg/ui";
import { isTelegram } from "@/lib/tg/client";
import { useT } from "@/lib/i18n/I18nProvider";
import { enabled, isActive, RAIL_ORDER } from "@/lib/nav";
import { ShellProvider } from "@/components/ShellContext";
import { MobileShell } from "@/components/MobileShell";

// Task 2：项集改为 RAIL_ORDER（运/盘/灵/境/梦/起/我）。「照」由顶部铜铃承担、不占项；
// 「账」已并入「我的」（/profiles），不再作为独立导航项常驻。
const RAIL = enabled(RAIL_ORDER);

// spec §10：导航项内边距只在「≥6 项」时收紧（52px→48px 触控目标，仍高于 44px 下限）。
// 三个 flag 都关闭时 RAIL.length=4（运/盘/起/我），绝不能被这条收紧规则波及——那会是
// 本分支对自己「flag 关闭时产品行为完全不变」这条约束的字面违反（最终评审 Blocking 4）。
const NAV_COMPACT = RAIL.length >= 6;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const t = useT();
  const tg = useIsTelegram();
  // EP-motion-bell：桌面栏 Logo 是高频常驻元素，不用持续晃动（zj-bell-idle）打扰阅读；
  // 只在挂载时敲响一次，点击（哪怕停在首页原地不跳转）再敲一次作反馈。
  const [bellRing, setBellRing] = useState(0);

  // EP-account2-fix：web widget 登录路径（zj_tg_hint 标记的 TG web 会话）此前唯一的
  // 续期点是 /account 页——30 天不开 /account 就被静默登出（spec §4 要消灭的故障）。
  // 这里在全局挂载点对「非 TG 环境 + hint 存在」的会话 fire-and-forget 调一次
  // GET /api/tg/session（服务端按需滑动续期 / 失效清理）；失败静默、不阻塞首屏。
  // TG 环境内不需要——Mini App 每次操作都经 ensureTgSession 重签。
  useEffect(() => {
    if (isTelegram() || !document.cookie.includes("zj_tg_hint=1")) return;
    void fetch("/api/tg/session", { credentials: "include" }).catch(() => {});
  }, []);

  return (
    <ShellProvider>
      <div className={tg ? "min-h-screen" : "min-h-screen md:pl-[82px]"}>
        {!tg && (
          <>
            {/* 桌面：左侧素白图标栏 */}
            <nav
              className="fixed inset-y-0 left-0 z-30 hidden w-[82px] flex-col items-center gap-2 py-6 md:flex"
              style={{ background: "var(--color-rail)", borderRight: "1px solid var(--color-line)" }}
            >
              <Link href="/" className="mb-5" aria-label={t("nav.home")} onClick={() => setBellRing((n) => n + 1)}>
                <BellLogo size={30} motion="ring" ringKey={bellRing} />
              </Link>
              {RAIL.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  char={item.char}
                  label={t(item.labelKey)}
                  active={isActive(pathname, item.href)}
                  compact={NAV_COMPACT}
                  style={item.id === "profiles" ? { marginTop: "auto" } : undefined}
                />
              ))}
            </nav>

            {/* 移动：Task 6——顶部语境胶囊 + 菜单键 + 九宫格覆盖层，取代旧底栏。 */}
            <MobileShell currentPath={pathname} />
          </>
        )}

        <div className={tg ? "" : "pb-0"}>{children}</div>
      </div>
    </ShellProvider>
  );
}

function NavItem({
  href,
  char,
  label,
  active,
  compact,
  style,
}: {
  href: string;
  char: string;
  label: string;
  active: boolean;
  compact: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <Link
      href={href}
      data-testid="nav-item"
      className={cn(
        "zj-nav flex flex-col items-center gap-1 py-1.5 zj-wheel-focus",
        compact ? "px-1.5" : "px-2",
      )}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      style={style}
    >
      <span
        key={active ? "on" : "off"}
        className="inline-flex items-center justify-center font-semibold"
        style={{
          width: 36,
          height: 36,
          borderRadius: "var(--radius-icon)",
          fontFamily: "var(--font-serif)",
          fontSize: 18,
          background: active ? "var(--color-ink)" : "transparent",
          color: active ? "var(--color-on-ink)" : "var(--color-muted)",
          transition: "background .25s, color .25s",
        }}
      >
        {char}
      </span>
      <span className="text-[10px]" style={{ color: active ? "var(--color-ink)" : "var(--color-muted)", transition: "color .25s" }}>
        {label}
      </span>
      <span
        style={{
          width: 4, height: 4, borderRadius: "50%", background: "var(--color-cinnabar)",
          opacity: active ? 1 : 0, transform: `scale(${active ? 1 : 0})`, transition: "opacity .25s, transform .25s",
        }}
      />
    </Link>
  );
}
