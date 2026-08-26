import type { CSSProperties } from "react";

/**
 * 罗盘水印（首页卷首背景装饰，EP-ui-v3 子项目 C Task 2）。
 *
 * 五层同心环，异速正反转，取代此前的单层 `HeroWheel`：
 *
 * | 层 | 内容 | 动画 | 时长 |
 * |---|---|---|---|
 * | compass-ticks    | 外圈刻度环             | zjSpinSlow | 150s |
 * | compass-branches | 十二地支环             | zjSpinRev  | 190s |
 * | compass-trigrams | 八卦爻画环             | zjSpinSlow | 110s |
 * | compass-palaces  | 十二宫环 + 十二角交角星 | zjSpinRev  | 84s  |
 * | compass-core     | 中心 8 线小盘          | zjSpinSlow | 80s  |
 *
 * 纯装饰：`aria-hidden`，不进无障碍树。动画一律走 CSS keyframes
 * （`globals.css` 的 `zjSpinSlow`/`zjSpinRev`），不做 JS 逐帧——
 * 既有的 `prefers-reduced-motion` 降级块（`*, *::before, *::after`
 * 通配）会把 `animation-duration` 压到 0.001ms，水印随之静止但仍可见。
 *
 * 配色一律走 CSS 变量令牌（`--color-ink` / `--color-line` /
 * `--color-line-strong` / `--color-cinnabar`），不裸写十六进制。
 */

const CX = 160;
const CY = 160;

/** 半径 r、角度 deg（顺时针，0° = 正上方）处的屏幕坐标。 */
function polar(r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

const EARTHLY_BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

/** 八卦爻画（各 3 爻，由下至上）：true=阳爻（实线），false=阴爻（断线）。 */
const TRIGRAMS: readonly (readonly [boolean, boolean, boolean])[] = [
  [true, true, true], // 乾 ☰
  [false, true, true], // 兑 ☱
  [true, false, true], // 离 ☲
  [false, false, true], // 震 ☳
  [true, true, false], // 巽 ☴
  [false, true, false], // 坎 ☵
  [true, false, false], // 艮 ☶
  [false, false, false], // 坤 ☷
];

/** 一层的动效样式：动画名 + 时长 + 统一的线性/无限循环/以圆心为轴。 */
function spinStyle(animationName: "zjSpinSlow" | "zjSpinRev", durationSeconds: number): CSSProperties {
  return {
    animationName,
    animationDuration: `${durationSeconds}s`,
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    transformOrigin: "160px 160px",
  };
}

export function CompassWatermark({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 320 320" className={className} style={style} aria-hidden="true">
      {/* 外圈刻度环：150s 正转 */}
      <g data-testid="compass-ticks" style={spinStyle("zjSpinSlow", 150)}>
        <circle cx={CX} cy={CY} r={152} fill="none" stroke="var(--color-line-strong)" strokeWidth={1} />
        {Array.from({ length: 60 }, (_, i) => {
          const deg = i * 6;
          const long = i % 5 === 0;
          const [x1, y1] = polar(long ? 138 : 144, deg);
          const [x2, y2] = polar(152, deg);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--color-ink)"
              strokeWidth={long ? 1.1 : 0.6}
            />
          );
        })}
      </g>

      {/* 十二地支环：190s 反转 */}
      <g data-testid="compass-branches" style={spinStyle("zjSpinRev", 190)}>
        <circle cx={CX} cy={CY} r={124} fill="none" stroke="var(--color-line)" strokeWidth={1} />
        {EARTHLY_BRANCHES.map((ch, i) => {
          const [x, y] = polar(124, i * 30);
          return (
            <text
              key={ch}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              style={{ fontFamily: "var(--font-serif)", fontSize: 11, fill: "var(--color-ink)" }}
            >
              {ch}
            </text>
          );
        })}
      </g>

      {/* 八卦爻画环：110s 正转 */}
      <g data-testid="compass-trigrams" style={spinStyle("zjSpinSlow", 110)}>
        <circle cx={CX} cy={CY} r={96} fill="none" stroke="var(--color-line)" strokeWidth={1} />
        {TRIGRAMS.map((yaos, i) => {
          const deg = i * 45;
          const [bx, by] = polar(96, deg);
          return (
            <g key={i} style={{ transform: `rotate(${deg}deg)`, transformOrigin: `${bx}px ${by}px` }}>
              {yaos.map((yang, row) => {
                const y = by - 6 - row * 5;
                return yang ? (
                  <line key={row} x1={bx - 7} y1={y} x2={bx + 7} y2={y} stroke="var(--color-ink)" strokeWidth={1.4} />
                ) : (
                  <g key={row}>
                    <line x1={bx - 7} y1={y} x2={bx - 2} y2={y} stroke="var(--color-ink)" strokeWidth={1.4} />
                    <line x1={bx + 2} y1={y} x2={bx + 7} y2={y} stroke="var(--color-ink)" strokeWidth={1.4} />
                  </g>
                );
              })}
            </g>
          );
        })}
      </g>

      {/* 十二宫环 + 十二角交角星：84s 反转 */}
      <g data-testid="compass-palaces" style={spinStyle("zjSpinRev", 84)}>
        <circle cx={CX} cy={CY} r={68} fill="none" stroke="var(--color-line-strong)" strokeWidth={1} />
        {Array.from({ length: 12 }, (_, i) => {
          const deg = i * 30;
          const [x1, y1] = polar(56, deg);
          const [x2, y2] = polar(68, deg);
          return <line key={`palace-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-ink)" strokeWidth={1} />;
        })}
        {/* 十二角交角星：相邻宫位尖点两两相连，形成十二角星轮廓 */}
        <polygon
          points={Array.from({ length: 12 }, (_, i) => polar(68, i * 30).join(",")).join(" ")}
          fill="none"
          stroke="var(--color-cinnabar)"
          strokeWidth={0.7}
          opacity={0.6}
        />
        <polygon
          points={Array.from({ length: 12 }, (_, i) => polar(56, i * 30 + 15).join(",")).join(" ")}
          fill="none"
          stroke="var(--color-cinnabar)"
          strokeWidth={0.7}
          opacity={0.6}
        />
      </g>

      {/* 中心 8 线小盘：80s 正转 */}
      <g data-testid="compass-core" style={spinStyle("zjSpinSlow", 80)}>
        <circle cx={CX} cy={CY} r={30} fill="none" stroke="var(--color-line-strong)" strokeWidth={1} />
        {Array.from({ length: 8 }, (_, i) => {
          const deg = i * 45;
          const [x1, y1] = polar(6, deg);
          const [x2, y2] = polar(30, deg);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-ink)" strokeWidth={1} />;
        })}
      </g>
    </svg>
  );
}
