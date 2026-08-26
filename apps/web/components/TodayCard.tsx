import { WindBell } from "./WindBell";

/**
 * 今日卡（UI v3，03-screens 5a §2）：卷首与运势页共用同一份实现——
 * 两处消费方渲染的必须是这同一个组件，不许各自复制一份。
 *
 * ⚠️ 候名/物候名（`term`/`wuHou`）由调用方传入，本组件不自己调
 * `getCurrentSolarHou()`：卷首与运势两处的取值时机、缓存策略不同
 * （运势页有按日期的 localStorage 缓存），组件自取会让两处行为不一致。
 *
 * 桌面与移动同一份实现，桌面只放宽内边距（06-desktop §4：「不要在桌面端
 * 换成花窗裱画那一套」）——因此本组件不做任何断点分支，尺寸/内边距由
 * 调用方通过外层容器控制。
 */
export function TodayCard({
  date,
  lunar,
  verdict,
  term,
  wuHou,
  polish,
  meta,
  href,
}: {
  date: string;
  lunar: string;
  verdict: string;
  term: string;
  wuHou: string;
  polish: string;
  meta: string;
  href: string;
}) {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-line)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
      }}
    >
      {/* 卡头 */}
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4">
        <span
          className="font-serif font-bold"
          style={{ color: "var(--color-cinnabar)", letterSpacing: "0.5em" }}
        >
          今 日
        </span>
        <span className="font-latin" style={{ fontSize: 13, color: "var(--color-muted)" }}>
          {date} · {lunar}
        </span>
      </div>

      {/* 双栏正文 */}
      <div className="mt-3 flex gap-4 px-5 pb-4">
        <div
          data-testid="today-card-left"
          style={{ width: "124px", borderRight: "1px solid var(--color-line)", paddingRight: 16 }}
        >
          <WindBell verdict={verdict} />
        </div>
        <div className="min-w-0 flex-1">
          <p style={{ fontSize: 11, letterSpacing: "0.28em", color: "var(--color-muted)" }}>{term}</p>
          <p
            className="font-serif font-bold"
            style={{ fontSize: 23, marginTop: 4, color: "var(--color-cinnabar)" }}
          >
            {wuHou}
          </p>
          <div style={{ borderTop: "1px solid var(--color-line)", margin: "10px 0" }} />
          <p className="font-serif" style={{ fontSize: 14.5, color: "var(--color-ink)" }}>
            {polish}
          </p>
          <p className="mt-2" style={{ fontSize: 11.5, color: "var(--color-muted)" }}>
            {meta}
          </p>
        </div>
      </div>

      {/* 卡脚 */}
      <a
        href={href}
        className="block"
        style={{
          borderTop: "1px solid var(--color-line)",
          padding: "10px 20px",
          fontSize: 12.5,
          color: "var(--color-ink-2)",
        }}
      >
        展开今日日签 →
      </a>
    </div>
  );
}
