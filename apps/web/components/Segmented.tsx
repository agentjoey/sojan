"use client";

import React from "react";

/**
 * 分段选择器（单选按钮组：role="group" + aria-pressed）。
 * 用于「住宅/办公」「自有/租赁」这类互斥选项。颜色全部走 CSS 令牌。
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className="flex-1 rounded-[var(--radius-button)] border py-2 text-[14px]"
            style={{
              borderColor: active ? "var(--color-cinnabar)" : "var(--color-line)",
              color: active ? "var(--color-cinnabar)" : "var(--color-ink)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
