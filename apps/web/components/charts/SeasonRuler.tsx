/**
 * 七十二候标尺（UI v3，06-desktop §4）：一条 72 道刻度的时间尺，
 * 朱砂竖线标出当年走到第几候。数据只消费 core `getCurrentSolarHou()`
 * 派生的 `index`（1–72，见 `packages/core/src/daily/season.ts`），
 * 本组件不做任何推算——接到页面上是后续子项目的事。
 *
 * - 按 index 等分定位（`(index - 1) / 71 * 100%`），不按日期比例：候是等分的离散刻度。
 * - 刻度层用 `repeating-linear-gradient` 画 72 道，不生成 72 个 DOM 节点；
 *   移动端间距 4.55px、桌面（`md:` 起）8.6px，用 Tailwind 响应式类切换，不写 JS 判断视口。
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
          className="absolute inset-0 [background-image:repeating-linear-gradient(90deg,var(--color-line-strong)_0_1px,transparent_1px_4.55px)] md:[background-image:repeating-linear-gradient(90deg,var(--color-line-strong)_0_1px,transparent_1px_8.6px)]"
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
