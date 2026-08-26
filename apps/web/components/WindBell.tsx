import Image from "next/image";

/**
 * 风铃（UI v3）：今日卡左栏的命理配图——一只风铃，下方垂着红色幡带，
 * 幡面上刻着字。素材见 `public/brand/windbell-jin.png`
 * （1254×1254、RGBA 带透明通道，owner 2026-08-26 核实即为终版素材，
 * 详见 backlog `EP-uiv3-banner`）。
 *
 * 用 `next/image` 而非全站惯用的 `<img>`：素材是尺寸已知的本地静态文件
 * （1254×1254、`public/` 下），是 next/image 的典型场景——省一次
 * `@next/next/no-img-element` lint 警告（全站已有的三处 `<img>` 都是
 * 动态/隐藏图，各自场景不适合 next/image，此处不同）。
 *
 * ⚠️ 给后人的提醒——这条注释别删：
 * 幡面上的字是**烧进图片本身**的（当前这张固定是「谨」），不是运行时叠加。
 * 也就是说：**幡面上的字目前不随 `verdict` 变化**。设计包判词有四档
 * （吉/顺/平/谨），但目前只有「谨」这一张图对应的素材。等四档配图都
 * 到位后，这里应该改成 `verdict → 图片文件名` 的映射（例如
 * `{ 吉: "windbell-ji.png", 顺: "windbell-shun.png", ... }`），而不是
 * 继续假装一张图能代表四种判词。
 *
 * 正因为字已经烧在图里，**本组件绝不能再把 `verdict` 当可见大字叠加
 * 渲染**——那样画面上会同时出现两个字（图里烧的 + 代码叠的），这在
 * 08-25 之前的占位实现里就是这么干的，字号 34px 还顺带把英文判词
 * （i18n `en: "Watch"`，5 个字母）在 124px 栏里越界裁切过。
 *
 * `verdict` prop 因此只用于 `aria-label`，且措辞必须诚实：不能写成
 * 「图上写着今日判词」，因为图上恒为「谨」，与当日实际判词可能不同。
 */
export function WindBell({ verdict }: { verdict: string }) {
  return (
    <div
      data-testid="wind-bell"
      style={{
        position: "relative",
        height: "100%",
        minHeight: 132,
      }}
    >
      <Image
        src="/brand/windbell-jin.png"
        alt={`风铃图，幡面刻「谨」字（固定字样，非当日判词）；今日判词另见右栏：${verdict}`}
        fill
        sizes="124px"
        style={{ objectFit: "contain" }}
      />
    </div>
  );
}
