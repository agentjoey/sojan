/**
 * 五行盘 WuxingWheel（EP-ui-v3 子项目 B Task 1）——纯展示可视化，将来取代
 * `WuxingRadar`（换线不在本轮：`WuxingRadar` 仍被 `app/chart/page.tsx:215` 使用，
 * 本文件不改它）。
 *
 * 几何锁定自设计包 `02-components.md` §5，与 `BaguaWheel` 同坐标系
 * （viewBox 320×320，圆心 160,160），便于将来并置：
 * - 五扇形 r=118，起始 −126°、每 72° 一扇，五扇中心依次落在
 *   −90°(上)/−18°(右上)/54°(右下)/126°(左下)/198°(左上)，对应 木/火/土/金/水；
 * - 十天干环 r=138，十个天干沿环等分排布；
 * - 中心圆 r=50，放日主大字。
 * 这些数值由设计包给死，不在本组件里推导或调整。
 *
 * 展示层零推算：五行归属（`counts` 的 key）与日主天干/五行均由调用方传入，
 * 本组件只画，不判断旺衰、不定日主、不排盘。
 *
 * 角度作为语义参数（`data-start-angle` 等）暴露给测试断言，不依赖 path
 * 字符串——path 字符串一改就红且毫无诊断力（同 `BaguaWheel` 踩过的教训）。
 *
 * 本组件纯展示、无可交互子元素，根 `<svg>` 用 `role="img"` 是对的
 * （ARIA 1.2：`role="img"` 的子树对辅助技术不可见，可交互元素不能嵌在里面——
 * `BaguaWheel` 可交互时因此换成 `role="group"`，但本组件没有这个问题）。
 */

const ORDER = [
  { element: "wood", cn: "木" },
  { element: "fire", cn: "火" },
  { element: "earth", cn: "土" },
  { element: "metal", cn: "金" },
  { element: "water", cn: "水" },
] as const;

export type WuxingElement = (typeof ORDER)[number]["element"];

/** 十天干，环上等分排布的固定字面量顺序——纯展示常量，不是推算。 */
const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];

const CX = 160;
const CY = 160;
const R_SECTOR = 118;
const R_RING = 138;
const R_CENTER = 50;
const START = -126;
const STEP = 72;

/** 极坐标 → 直角坐标。0° 指向右（东），负角逆时针向上，与方位描述一致。 */
function pt(angleDeg: number, r: number) {
  const a = (angleDeg * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const;
}

/** 整块扇形（从圆心出发）。中心圆随后覆盖上去形成环心。 */
function sectorPath(start: number, sweep: number, r: number): string {
  const [x1, y1] = pt(start, r);
  const [x2, y2] = pt(start + sweep, r);
  const large = sweep > 180 ? 1 : 0;
  return `M ${CX} ${CY} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

/**
 * 计数 → 扇区不透明度。计数为 0 的五行仍要画出扇区（五行缺失本身是命理
 * 信息，不能不画），只是落在下限、接近全透明；计数越高越接近上限。
 * 五行全零（理论上不应发生，但防御一下）时统一落在下限。
 */
function sectorOpacity(count: number, maxCount: number): number {
  const FLOOR = 0.08;
  const CEIL = 0.8;
  if (maxCount <= 0) return FLOOR;
  return FLOOR + (count / maxCount) * (CEIL - FLOOR);
}

export interface WuxingWheelProps {
  /** 五行计数，key 为中文单字（木/火/土/金/水）。展示层零推算，由调用方给定。 */
  counts: Record<string, number>;
  /** 日主天干，中心大字与十天干环高亮项。 */
  dayMasterStem: string;
  /** 日主所属五行，决定哪一扇带朱砂描边。由调用方判定，本组件不算。 */
  dayMasterElement: WuxingElement;
  size?: number;
}

export function WuxingWheel({ counts, dayMasterStem, dayMasterElement, size = 280 }: WuxingWheelProps) {
  const maxCount = Math.max(0, ...ORDER.map(({ cn }) => counts[cn] ?? 0));

  const summary = ORDER.map(({ cn }) => `${cn} ${counts[cn] ?? 0}`).join("、");
  const ariaLabel = `五行盘：${summary}；日主 ${dayMasterStem}`;

  return (
    <svg viewBox="0 0 320 320" width={size} height={size} role="img" aria-label={ariaLabel}>
      {ORDER.map(({ element, cn }, i) => {
        const start = START + i * STEP;
        const isDayMaster = element === dayMasterElement;
        const count = counts[cn] ?? 0;
        const opacity = sectorOpacity(count, maxCount);
        const d = sectorPath(start, STEP, R_SECTOR);
        return (
          <g key={element}>
            <path
              data-testid="wuxing-sector"
              data-element={element}
              data-start-angle={start}
              d={d}
              fill={`var(--color-${element})`}
              fillOpacity={opacity}
              stroke={isDayMaster ? "var(--color-cinnabar)" : "none"}
              strokeWidth={isDayMaster ? 2 : 0}
            />
            {/* 日主所属扇区额外叠加朱砂淡染层——唯一允许的裸十六进制来源色值
                （CSS 变量无法参与 rgba 计算，设计包给定此字面量）。 */}
            {isDayMaster && <path data-testid="wuxing-daymaster-tint" d={d} fill="rgba(168,70,56,.08)" />}
          </g>
        );
      })}

      {/* 十天干环：等分排布，日主天干朱砂，其余 muted。 */}
      {STEMS.map((stem, i) => {
        const angle = (360 / STEMS.length) * i - 90;
        const [x, y] = pt(angle, R_RING);
        const isDayMasterStem = stem === dayMasterStem;
        return (
          <text
            key={stem}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            className="font-serif"
            style={{ fontSize: 14, fill: isDayMasterStem ? "var(--color-cinnabar)" : "var(--color-muted)" }}
          >
            {stem}
          </text>
        );
      })}

      <circle cx={CX} cy={CY} r={R_CENTER} fill="var(--color-paper)" stroke="var(--color-line)" />
      <text
        data-testid="wuxing-center"
        x={CX}
        y={CY + 10}
        textAnchor="middle"
        className="font-serif"
        style={{ fontSize: 32, fill: "var(--color-ink)" }}
      >
        {dayMasterStem}
      </text>
    </svg>
  );
}
