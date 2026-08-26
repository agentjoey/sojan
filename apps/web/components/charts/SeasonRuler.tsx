/**
 * 七十二候标尺（UI v3，06-desktop §4）：一条 72 道刻度的时间尺，
 * 朱砂竖线标出当年走到第几候。数据只消费 core `getCurrentSolarHou()`
 * 派生的 `index`（1–72，见 `packages/core/src/daily/season.ts`），
 * 本组件不做任何推算——接到页面上是后续子项目的事。
 *
 * - 按 index 等分定位（`(index - 1) / 71 * 100%`），不按日期比例：候是等分的离散刻度。
 * - 刻度层与朱砂 marker **同一坐标系**（I2 修复）：`repeating-linear-gradient` 画 72 道，
 *   周期用 `calc(100% / 71)`（百分比），不是绝对 px。
 *   ⚠️ 此前刻度层用绝对 px（移动 4.55px / 桌面 8.6px 两档 `md:` 断点），marker 用
 *   `left: (index-1)/71*100%`——两套坐标系只在容器恰好落在设计包假定的参考宽度
 *   （移动 71×4.55+1≈324px、桌面 71×8.6+1≈612px）时才对齐，任意其他宽度下朱砂线
 *   都会与它本该指向的刻度错开，且刻度实际道数也不再是 72（spec §4.2 明写「共 72 道」）。
 *   `calc(100% / 71)` 让周期本身随容器宽度缩放，天然与百分比 marker 同步、任意宽度
 *   下都严格 72 道；因此收敛为单一断点无关的表达式，原先的 `md:` 响应式切换随之删除
 *   （移动/桌面在百分比坐标下已是同一套数值，不需要在这层再区分视口）。
 * - `role="img"` + `aria-label` 承载序号与候名；刻度层纯装饰，`aria-hidden`。
 *   `role="img"` 子树对 AT 不可见，故本组件不含任何可交互子元素。
 */
export function SeasonRuler({ index, label }: { index: number; label: string }) {
  const pct = ((index - 1) / 71) * 100;

  return (
    <div role="img" aria-label={`第 ${index} 候 · ${label}`}>
      <div className="relative h-4">
        <div
          data-testid="season-ticks"
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, var(--color-line-strong) 0 1px, transparent 1px calc(100% / 71))",
          }}
        />
        <div
          data-testid="season-marker"
          aria-hidden="true"
          className="absolute inset-y-0"
          style={{ left: `${pct}%`, width: 1.6, background: "var(--color-cinnabar)" }}
        />
      </div>
      <div className="mt-1 flex justify-between" style={{ fontSize: "10.5px", color: "var(--color-muted)" }}>
        <span>立春 · 第 1 候</span>
        <span>大寒 · 第 72 候</span>
      </div>
    </div>
  );
}
