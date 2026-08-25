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
 * UAT 修复轮：尺寸/时长/抛起幅度原先太小太快（56×38px、0.75s、-42px），整个
 * 「抛起→翻转→落地」过程实际看不清——放大到 128×86px、拉长到 1.4s、抛起幅度
 * 按比例放大到 -120px（具体数值见 globals.css 的 zjJiaoToss 关键帧注释）。
 *
 * 落地面用 data-face 暴露（供测试与无障碍判别），视觉上「仰」是平面朝上（浅色、
 * 平直边缘），「俯」是弧面朝上（深色、圆弧）。
 */

/** 两枚筊共用的视觉样式（动画版 JiaoThrow 与揭晓屏静态版 JiaoBlocksStatic 都据此算，避免两处漂移）。 */
function blockVisual(face: BlockFace): React.CSSProperties {
  return {
    // 「仰」平面朝上：浅色、下缘平直；「俯」弧面朝上：墨色、整体圆弧。
    background: face === "仰" ? "var(--color-tint)" : "var(--color-ink)",
    border: "1px solid var(--color-line-strong)",
    borderRadius: face === "仰" ? "50% 50% 9px 9px" : "50%",
  };
}

export function JiaoThrow({
  blocks,
  onSettled,
}: {
  blocks: [BlockFace, BlockFace];
  onSettled: () => void;
}) {
  return (
    <div className="flex items-end justify-center gap-8 pb-8 pt-16" aria-live="polite">
      {blocks.map((face, i) => (
        <div
          key={i}
          data-testid="jiao-block"
          data-face={face}
          onAnimationEnd={i === 1 ? onSettled : undefined}
          className="h-[128px] w-[86px]"
          style={{
            ...blockVisual(face),
            animation: `zjJiaoToss 1.4s var(--ease-pop) ${i * 0.18}s both`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * 揭晓屏（EP-jiao UAT 修复②）用的静态筊块：与 JiaoThrow 同一视觉，但不带动画——
 * 掷筊落定后先定格展示「一俯一仰」这样的实际组合，让筊象结果真正被用户看见，
 * 而不是像此前那样落定即跳走、结果从未呈现过。见 app/spirit/page.tsx 的 "revealed" 阶段。
 */
export function JiaoBlocksStatic({ blocks }: { blocks: [BlockFace, BlockFace] }) {
  return (
    <div className="flex items-end justify-center gap-8">
      {blocks.map((face, i) => (
        <div key={i} data-testid="jiao-block-static" data-face={face} className="h-[128px] w-[86px]" style={blockVisual(face)} />
      ))}
    </div>
  );
}
