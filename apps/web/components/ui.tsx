import type { ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// —— 五行映射（天干/地支 → 木火土金水）——
const STEM: Record<string, Element> = { 甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth", 己: "earth", 庚: "metal", 辛: "metal", 壬: "water", 癸: "water" };
const BRANCH: Record<string, Element> = { 子: "water", 丑: "earth", 寅: "wood", 卯: "wood", 辰: "earth", 巳: "fire", 午: "fire", 未: "earth", 申: "metal", 酉: "metal", 戌: "earth", 亥: "water" };
export type Element = "wood" | "fire" | "earth" | "metal" | "water";
export const ELEMENT_LABEL: Record<Element, string> = { wood: "木", fire: "火", earth: "土", metal: "金", water: "水" };
export const WUXING_LABEL_TO_KEY: Record<string, Element> = { 木: "wood", 火: "fire", 土: "earth", 金: "metal", 水: "water" };
export function elementOf(ganzhi: string): Element | null {
  return STEM[ganzhi] ?? BRANCH[ganzhi] ?? null;
}

// —— 铜铃 logo（品牌 · 风过则动）——
export function BellLogo({
  size = 26,
  motion = "idle",
  detail = "compact",
  ringKey,
}: {
  size?: number;
  /**
   * "idle"（默认）＝常驻循环微摆；
   * "ring"＝敲响式摆动，播完即停，供导航/卷首这类高频常驻位置用——持续
   * 晃动在那些位置是干扰而非提示；"cast"＝过场专属的完整阵风；"none"＝静止。
   */
  motion?: "idle" | "ring" | "cast" | "none";
  /** compact 保留小尺寸识别度；full 为过场的大尺寸版本增加铃面与横梁材质。 */
  detail?: "compact" | "full";
  /** motion="ring" 时变化则重放一次摆动（用于点击触发，如再次点 Logo）。 */
  ringKey?: number;
}) {
  const className = motion !== "none" ? `zj-bell-${motion}` : undefined;
  const bodyClassName = cn("zj-bell-body", motion !== "none" && `zj-bell-body-${motion}`);
  const clapperClassName = cn("zj-bell-clapper", motion !== "none" && `zj-bell-clapper-${motion}`);
  return (
    <svg viewBox="0 0 80 84" style={{ width: size, height: "auto" }} aria-hidden>
      <g key={motion === "ring" ? ringKey : undefined} className={className} style={{ transformOrigin: "40px 16px" }}>
        {/* 挂环与结扣：大尺寸有明确的穿绳关系，小尺寸仍保持一个干净的墨点。 */}
        <circle cx="40" cy="8" r="4" fill="none" stroke="var(--color-ink)" strokeWidth="2.2" />
        <path d="M40 12V16" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
        <path d="M40 14.5L44 18.5L40 22.5L36 18.5Z" fill="var(--color-ink)" />

        {/* 微弧横梁是品牌识别主轮廓。 */}
        <path d="M7 21.5C18 24 29 27 40 27S62 24 73 21.5" fill="none" stroke="var(--color-ink)" strokeWidth="5.5" strokeLinecap="round" />
        {detail === "full" && (
          <path className="zj-bell-detail" d="M12 22.6C22 25 31 27.2 40 27.2S58 25 68 22.6" fill="none" stroke="var(--color-paper)" strokeWidth="1" strokeLinecap="round" opacity=".22" />
        )}
        <path d="M40 27.5V40" stroke="var(--color-ink)" strokeWidth="1.6" strokeLinecap="round" />

        {/* 铃舌和尾坠独立于铜铃，动效时响应最晚。 */}
        <g className={clapperClassName} style={{ transformOrigin: "40px 48px" }}>
          <path d="M40 55V72" stroke="var(--color-ink)" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="40" cy="66" r="2.8" fill="var(--color-ink)" />
          <path d="M40 71L44 76L40 82L36 76Z" fill="var(--color-cinnabar)" />
        </g>

        {/* 铜铃：加厚下沿与暗面让大号过场不再像平面图标。 */}
        <g className={bodyClassName} style={{ transformOrigin: "40px 43px" }}>
          <path d="M40 39C33.8 39 30 46.1 29.5 54.5C29.2 60.1 27.6 63.3 25.5 66C29.8 68.8 34.6 70.2 40 70.2S50.2 68.8 54.5 66C52.4 63.3 50.8 60.1 50.5 54.5C50 46.1 46.2 39 40 39Z" fill="var(--color-cinnabar)" />
          <path d="M25.5 66C29.8 68.8 34.6 70.2 40 70.2S50.2 68.8 54.5 66C52.8 70 47.6 72.2 40 72.2S27.2 70 25.5 66Z" fill="var(--color-ink)" opacity=".84" />
          {detail === "full" && (
            <>
              <path className="zj-bell-detail" d="M35 43.5C32.5 47.3 32 52.8 31.8 57.4" fill="none" stroke="var(--color-paper)" strokeWidth="1.5" strokeLinecap="round" opacity=".3" />
              <path className="zj-bell-detail" d="M29 65.8C35.8 68.6 44.2 68.6 51 65.8" fill="none" stroke="var(--color-paper)" strokeWidth=".9" strokeLinecap="round" opacity=".24" />
            </>
          )}
        </g>
      </g>
    </svg>
  );
}

// —— 命盘环（hero 背景，缓慢自转）——
export function HeroWheel({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 320 320" className={className} style={style} aria-hidden>
      <g className="zj-spin-slow" style={{ transformOrigin: "160px 160px" }}>
        <circle cx="160" cy="160" r="150" fill="none" stroke="var(--color-ink)" strokeWidth="1.3" />
        <circle cx="160" cy="160" r="118" fill="none" stroke="var(--color-ink)" strokeWidth="1" />
        <circle cx="160" cy="160" r="64" fill="none" stroke="var(--color-ink)" strokeWidth="1" />
        <g stroke="var(--color-ink)" strokeWidth=".9">
          {Array.from({ length: 12 }, (_, i) => (
            <line key={i} x1="160" y1="10" x2="160" y2="42" style={{ transform: `rotate(${i * 30}deg)`, transformOrigin: "160px 160px" }} />
          ))}
        </g>
      </g>
    </svg>
  );
}

// —— 印章图标（方章，单字成标）——
//
// 三个 variant，各自对应一种「这是谁/处于什么状态」的判读，不是随手三种配色：
// - bai  白文＝朱底镂字：当前选中/激活项（如档案列表里的「当前档案」）
// - zhu  朱文＝纸底朱字+朱色描边：需要「引起注意但未选中」的项（如待确认的危险操作）
// - ink  墨文＝墨底白字：存在但未选中的普通项（档案列表里非当前的档案，见对照设计稿）
//   —— 此前只有 bai/zhu 两档，非当前档案被迫复用 zhu（朱色描边），与设计要的
//   「墨色实底」不是一回事：zhu 传达的是「需要注意」，ink 传达的只是「存在但非当前」，
//   两种语义不能用同一个 variant 兼任。
export function SealIcon({
  char,
  variant = "bai",
  size = 40,
  className,
}: {
  char: string;
  variant?: "bai" | "zhu" | "ink";
  size?: number;
  className?: string;
}) {
  const style: React.CSSProperties = { background: "var(--color-seal)", color: "var(--color-paper)" };
  if (variant === "zhu") {
    style.background = "var(--color-paper)";
    style.color = "var(--color-seal)";
    style.boxShadow = "inset 0 0 0 2px var(--color-seal)";
  } else if (variant === "ink") {
    style.background = "var(--color-ink)";
    style.color = "var(--color-on-ink)";
  }
  return (
    <span
      className={cn("inline-flex items-center justify-center font-bold select-none", className)}
      style={{
        width: size,
        height: size,
        borderRadius: "var(--radius-seal)",
        fontFamily: "var(--font-serif)",
        fontSize: size * 0.5,
        lineHeight: 1,
        ...style,
      }}
      aria-hidden
    >
      {char}
    </span>
  );
}

// —— 按钮 ——
export function Button({
  variant = "primary",
  className,
  children,
  ...rest
}: {
  variant?: "primary" | "secondary" | "text";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = "zj-btn inline-flex items-center justify-center gap-2 text-[15px] font-medium transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? "px-6 py-3 text-[var(--color-paper)] bg-[var(--color-cinnabar)] hover:bg-[var(--color-cinnabar-press)]"
      : variant === "secondary"
        ? "px-6 py-3 text-[var(--color-ink)] bg-transparent border border-[var(--color-line)] hover:border-[var(--color-line-strong)]"
        : "text-[var(--color-ink-2)] underline underline-offset-[5px] hover:text-[var(--color-ink)]";
  return (
    <button
      className={cn(base, styles, className)}
      style={variant === "primary" || variant === "secondary" ? { borderRadius: "var(--radius-button)" } : undefined}
      {...rest}
    >
      {children}
    </button>
  );
}

// —— 信息卡（细线描边，无阴影；可选顶边强调色：fire/water/metal/none）——
export function Card({
  topAccent,
  dark = false,
  className,
  children,
}: {
  topAccent?: Element | "cinnabar";
  dark?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const accentVar = topAccent ? (topAccent === "cinnabar" ? "var(--color-cinnabar)" : `var(--color-${topAccent})`) : undefined;
  return (
    <div
      className={cn("p-5", className)}
      style={{
        borderRadius: "var(--radius-card)",
        background: dark ? "var(--color-ink)" : "var(--color-surface)",
        color: dark ? "var(--color-on-ink)" : "var(--color-ink)",
        border: dark ? undefined : "1px solid var(--color-line)",
        borderTop: accentVar ? `2px solid ${accentVar}` : undefined,
      }}
    >
      {children}
    </div>
  );
}

// —— 标签（四化实心 / 宜忌描边）——
const MUTAGEN_ELEMENT: Record<string, Element> = { 禄: "wood", 权: "earth", 科: "water", 忌: "fire" };
export function MutagenTag({ kind }: { kind: "禄" | "权" | "科" | "忌" }) {
  const el = MUTAGEN_ELEMENT[kind]!;
  return (
    <span
      className="inline-flex h-[18px] min-w-[18px] items-center justify-center px-1 text-[11px] font-semibold"
      style={{ borderRadius: "var(--radius-chip)", background: `var(--color-${el})`, color: `var(--color-on-${el})` }}
    >
      {kind}
    </span>
  );
}

export function Tag({
  children,
  tone = "line",
}: {
  children: ReactNode;
  tone?: "line" | "ink" | "gold";
}) {
  const style =
    tone === "ink"
      ? { background: "var(--color-tint)", color: "var(--color-ink-2)" }
      : tone === "gold"
        ? { background: "transparent", color: "var(--color-gold)", border: "1px solid var(--color-gold)" }
        : { background: "transparent", color: "var(--color-ink-2)", border: "1px solid var(--color-line)" };
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-[12px]" style={{ borderRadius: "var(--radius-chip)", ...style }}>
      {children}
    </span>
  );
}

// —— 天干地支圆徽（墨底纸字；日主朱砂双描边）——
export function GanzhiBadge({
  char,
  highlight = false,
  size = 44,
}: {
  char: string;
  highlight?: boolean; // 日主双描边
  size?: number;
}) {
  return (
    <span
      className="inline-flex items-center justify-center font-semibold"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--color-ink)",
        color: "var(--color-paper)",
        fontFamily: "var(--font-serif)",
        fontSize: size * 0.46,
        boxShadow: highlight ? "0 0 0 2px var(--color-paper), 0 0 0 3px var(--color-cinnabar)" : undefined,
      }}
    >
      {char}
    </span>
  );
}
