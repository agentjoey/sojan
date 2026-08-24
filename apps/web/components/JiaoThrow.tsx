"use client";

import type { BlockFace } from "@sojan/core";

/**
 * 掷筊动画（EP-jiao）：两枚月牙形筊抛起、翻转、落地。
 *
 * 纯 CSS（本仓零动画库，同 CastingOverlay）。结果揭晓挂在**第二枚**筊的
 * `onAnimationEnd` 上——不用 setTimeout：`globals.css` 的全局
 * `prefers-reduced-motion` 会把 animation-duration 压到 0.001ms，animationend
 * 随即触发，无障碍降级因此天然成立，不需要额外判 matchMedia 的分支。
 *
 * 落地面用 data-face 暴露（供测试与无障碍判别），视觉上「仰」是平面朝上（浅色、
 * 平直边缘），「俯」是弧面朝上（深色、圆弧）。
 */
export function JiaoThrow({
  blocks,
  onSettled,
}: {
  blocks: [BlockFace, BlockFace];
  onSettled: () => void;
}) {
  return (
    <div className="flex items-end justify-center gap-6 py-8" aria-live="polite">
      {blocks.map((face, i) => (
        <div
          key={i}
          data-testid="jiao-block"
          data-face={face}
          onAnimationEnd={i === 1 ? onSettled : undefined}
          className="h-[56px] w-[38px]"
          style={{
            // 「仰」平面朝上：浅色、下缘平直；「俯」弧面朝上：墨色、整体圆弧。
            background: face === "仰" ? "var(--color-tint)" : "var(--color-ink)",
            border: "1px solid var(--color-line-strong)",
            borderRadius: face === "仰" ? "50% 50% 4px 4px" : "50%",
            animation: `zjJiaoToss .75s var(--ease-pop) ${i * 0.12}s both`,
          }}
        />
      ))}
    </div>
  );
}
