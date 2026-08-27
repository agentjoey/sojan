import { BellLogo, cn } from "@/components/ui";

/**
 * 测算过场（风铃主角版）：纸底上只保留大号品牌风铃与状态文字。
 * 纯 CSS 动效（keyframes 见 globals.css），长等待时以低频阵风循环。
 */
export function CastingOverlay({
  title = "正在推算当日流日",
  hint,
  mode = "pending",
}: {
  title?: string;
  /** 底部小字提示；提供才渲染（文案由调用方按 locale 注入）。 */
  hint?: string;
  /** brief 与调用方的 2.1s 卸载同步淡出；route（owner 打磨批指令 7）是路由切换
   * 的 1.2s 短版，与 `RouteCasting` 的 1200ms 卸载同步；pending 供结束时间不定
   * 的请求持续展示。 */
  mode?: "brief" | "route" | "pending";
}) {
  return (
    <div
      className={cn("zj-casting-overlay fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden", `zj-casting-overlay-${mode}`)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="zj-casting-bell-stage relative" aria-hidden>
        <BellLogo size={132} motion="cast" detail="full" />
      </span>

      <div className="zj-casting-title mt-8 font-serif text-[20px] font-semibold">{title}</div>
      {hint && (
        <div className="zj-casting-hint mt-3 text-[11px] tracking-[0.28em]">{hint}</div>
      )}
    </div>
  );
}
