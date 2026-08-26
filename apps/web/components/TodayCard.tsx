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
 *
 * ⚠️ 本组件不调用 `useT()`（与 `PageHeader` 同一约定：共用展示组件只认
 * props，不自己碰 i18n context）——`label`/`expandLabel`/`bellAlt` 全部由
 * 调用方翻译好传入（终审必修 5：此前卡头「今 日」与卡脚「展开今日日签 →」
 * 是写死的中文，绕过了全站 i18n；`WindBell` 的 alt 同理）。
 *
 * ⚠️ `dateNote`（终审必修 6）：此前这个位置叫 `lunar`，但卷首传的其实是
 * **星期**（如「周三」），运势页传的才是**农历日**——同一个 prop 名在两个
 * 消费方语义不同，是「同名不同义」的隐患本身。没有直接把农历补给卷首：
 * 卷首 `page.tsx` 是服务端组件按 `export const revalidate = 3600` 做 ISR，
 * 而「今日日期」（终审必修 1）必须按访客本地时钟在客户端算，不能再服务端
 * 冻结——若农历也在服务端算，会跟客户端算的公历日期在时区边界上对不上；
 * 若改成客户端算，`lunar-typescript` 那条依赖链会把刚从 `/` 路由移出去的
 * ~2MB chunk 重新拖回来（见 `app/page.tsx` 顶部注释），两条都不可接受。
 * 所以退一步把 prop 改成诚实的名字：`dateNote`——「日期旁边的补充说明」，
 * 卷首传星期、运势页传农历，各自消费方心里有数，字面上不再暗示两处同义。
 */
export function TodayCard({
  label,
  date,
  dateNote,
  term,
  wuHou,
  polish,
  meta,
  href,
  expandLabel,
  bellAlt,
}: {
  /** 卡头左侧的短标签（如「今 日」/"Today"），调用方经 i18n 传入。 */
  label: string;
  date: string;
  /** 日期旁的补充说明——卷首传星期，运势页传农历（见上方文档，语义不保证一致）。 */
  dateNote: string;
  term: string;
  wuHou: string;
  polish: string;
  meta: string;
  /** 卡脚链接，可选（终审必修 7）：运势页复用本组件时卡脚会指向当前页、
   * 点了原地不动，是死链——不传 `href` 时卡脚整体不渲染。 */
  href?: string;
  /** 卡脚文案（如「展开今日日签 →"），只在 `href` 存在时使用/渲染。 */
  expandLabel?: string;
  /** 风铃图的 alt 文案，调用方经 i18n 传入并插值 `verdict`（见 WindBell.tsx）。 */
  bellAlt: string;
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
          {label}
        </span>
        <span className="font-latin" style={{ fontSize: 13, color: "var(--color-muted)" }}>
          {date} · {dateNote}
        </span>
      </div>

      {/* 双栏正文 */}
      <div className="mt-3 flex gap-4 px-5 pb-4">
        <div
          data-testid="today-card-left"
          style={{ width: "124px", borderRight: "1px solid var(--color-line)", paddingRight: 16 }}
        >
          <WindBell alt={bellAlt} />
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

      {/* 卡脚：可选（终审必修 7），运势页不传 href 时整块不渲染 */}
      {href && (
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
          {expandLabel}
        </a>
      )}
    </div>
  );
}
