/**
 * 风铃（UI v3，占位实现）：设计包要求「无字透明底图 + 运行时叠判词」，
 * 但设计包给的两张素材都烧着字（`windbell-jin.png` 烧「谨」、
 * `windbell-source.png` 连 alpha 通道都没有）——没有可用的无字透明底图，
 * 详见 backlog `EP-uiv3-banner`。
 *
 * 术语更正：这个组件此前一路被误称「风幡」——不对，这是**风铃**的另一张图
 * （画面是一只风铃，下方垂着红色幡带，幡面上刻字）。幡带本身可称「幡面」，
 * 但整件东西叫风铃。
 *
 * 本组件因此**只出占位**，且占位必须让任何看到它的人（不只是读 DOM 的人）
 * 一眼认出「这不是成品」：
 * - 虚线描边（全站其余描边都是实线，虚线在这套设计语言里天然读作「未完成」）
 * - 45° 斜纹底纹（经典的「素材缺失」视觉记号，不是幡面纹理）
 * - 角标文字「素材待定」——不依赖 data 属性也能被非开发者发现
 * 不模仿幡面曲面/海浪纹：`EP-jiao` 掷筊动效那轮已验证手绘矢量到不了参考图
 * 质感，owner 判「效果太差，质感粗糙，放弃」。一个「像成品的次品」比一个
 * 明显的占位更糟——前者会被误当成最终效果，反而没人再追问素材进度。
 *
 * 接口按最终形态设计：拿到无字透明底图后，只需替换本文件内部实现
 * （改为 <img>/背景图 + 叠字），调用方 `<WindBell verdict={...} />` 不变。
 */
export function WindBell({ verdict }: { verdict: string }) {
  return (
    <div
      data-testid="wind-bell"
      data-placeholder="wind-bell"
      role="img"
      aria-label={`风铃占位，当日判词：${verdict}`}
      style={{
        position: "relative",
        display: "flex",
        height: "100%",
        minHeight: 132,
        alignItems: "center",
        justifyContent: "center",
        border: "1px dashed var(--color-line-strong)",
        borderRadius: "var(--radius-panel)",
        backgroundImage:
          "repeating-linear-gradient(45deg, var(--color-line) 0 1px, transparent 1px 10px)",
        backgroundColor: "var(--color-tint)",
        overflow: "hidden",
      }}
    >
      <span
        className="font-serif font-bold"
        style={{ fontSize: 34, color: "var(--color-ink-2)" }}
      >
        {verdict}
      </span>
      <span
        style={{
          position: "absolute",
          bottom: 6,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 9,
          letterSpacing: "0.1em",
          color: "var(--color-muted)",
        }}
      >
        素材待定
      </span>
    </div>
  );
}
