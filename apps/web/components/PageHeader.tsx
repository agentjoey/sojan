import type { ReactNode } from "react";

/**
 * 页头（UI v3）：朱砂短横 + 眉标（10.5px/.42em，无破折号包裹）+ 宋体大标题 + 说明行。
 * 全站统一入口。桌面两栏布局的 border-bottom 分隔线归 06-desktop §3，不在此实现。
 */
export function PageHeader({
  kicker,
  title,
  annotation,
  action,
  as: Tag = "header",
}: {
  kicker: string;
  title: ReactNode;
  annotation?: ReactNode;
  action?: ReactNode;
  /** 放进 `TwoColumn` 的 header 槽时传 "div"——那边已经有一层 <header>，
   *  嵌套 <header> 是无效 HTML 且对读屏是两个 banner。 */
  as?: "header" | "div";
}) {
  return (
    <Tag>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div
            data-testid="header-rule"
            aria-hidden="true"
            style={{ width: 22, height: 2, background: "var(--color-cinnabar)", marginBottom: 14 }}
          />
          <p style={{ fontSize: "10.5px", letterSpacing: "0.42em", color: "var(--color-muted)" }}>{kicker}</p>
          <h1 className="mt-3 font-serif font-bold leading-[1.2]" style={{ fontSize: 32 }}>
            {title}
          </h1>
          {annotation && (
            <p className="mt-2" style={{ fontSize: "11.5px", color: "var(--color-muted)" }}>
              {annotation}
            </p>
          )}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2 pt-8">{action}</div>}
      </div>
    </Tag>
  );
}
