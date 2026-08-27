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
 * ⚠️ `dateNote`：日期旁的补充说明——卷首与运势页均传农历日（`fortune.lunarDate`）。
 * 历史上卷首传的是**星期**（prop 因此从 `lunar` 改名 `dateNote`）：彼时卷首卡
 * 是静态文案、农历需客户端调 lunar-typescript 才能算，会把 ~2MB chunk 拖回 `/`
 * 路由。owner 打磨批指令 2 之后卷首改走 `dailyFortuneAction` server action
 * 取数（lunar 留在服务端），农历日由 fortune 数据自带，两处语义重新一致。
 */
/**
 * ⚠️ I3（复审 Important）：`href`/`expandLabel` 此前是两个各自独立的可选
 * 字段——传 `href` 不传 `expandLabel`（或反过来）会渲染出一个 `<a href>`
 * 但文本为空：读屏报一个无名链接，视觉上是分隔线下一条空白行。这恰好是
 * I2(c) 那条死链回归测不出来的同一种失效形态（两个缺陷会互相掩护）。
 * 改成判别联合：要么两者都不传（不渲染卡脚），要么两者都传——「只传一个」
 * 在类型层面就不可能构造出来，不必靠测试或运行时兜底。
 */
type TodayCardFooter = { href: string; expandLabel: string } | { href?: never; expandLabel?: never };

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
  /** 风铃图的 alt 文案，调用方经 i18n 传入并插值 `verdict`（见 WindBell.tsx）。 */
  bellAlt: string;
} & TodayCardFooter) {
  return (
    <div
      data-testid="today-card"
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
