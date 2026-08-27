import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * I3（C2-2 终审）：spec §5 明写「正文 15px/2.05 分段，桌面列宽上限 620px」，
 * 但 `.reading-prose-3c` 此前只有 font-size/line-height，没有 max-width——
 * 1024px 视口下正文实测宽达 670px ≈ 43 汉字/行，超出上限 50px。
 *
 * ⚠️ 断言必须走 CSS 引擎真渲染，不能只查 className 字符串——className 里有
 * `reading-prose-3c` 不代表这条 CSS 规则真的定义了 max-width（比如写成
 * `max-widht:620px` 这种拼写错误，class-name 断言完全测不出来）。
 * 这里直接从 globals.css 原文件里摘出 `.reading-prose-3c { ... }` 规则块，
 * 注入一个真实 <style> 标签，用 jsdom 的 getComputedStyle 读取计算后的值——
 * 该规则只用了纯 CSS 属性（font-size/line-height/max-width），不含 Tailwind
 * `@theme`/`@apply` 语法，jsdom 的 CSSOM 能直接解析，不需要过 PostCSS/Tailwind
 * 管线（本仓 vitest.config.ts 未开 `test.css`，CSS import 默认是 no-op）。
 */
function extractRule(css: string, selector: string): string {
  const idx = css.indexOf(selector + " {");
  if (idx < 0) throw new Error(`selector not found in globals.css: ${selector}`);
  const open = css.indexOf("{", idx);
  const close = css.indexOf("}", open);
  return css.slice(idx, close + 1);
}

describe("globals.css `.reading-prose-3c`（I3：桌面列宽上限 620px）", () => {
  const cssPath = path.resolve(__dirname, "../../globals.css");
  const css = readFileSync(cssPath, "utf-8");
  const rule = extractRule(css, ".reading-prose-3c");

  function computedStyleFor(className: string): CSSStyleDeclaration {
    const style = document.createElement("style");
    style.textContent = rule;
    document.head.appendChild(style);
    const div = document.createElement("div");
    div.className = className;
    document.body.appendChild(div);
    return getComputedStyle(div);
  }

  it("真的定义了 max-width: 620px（不是靠 class-name 字符串推断）", () => {
    const cs = computedStyleFor("reading-prose-3c");
    expect(cs.maxWidth).toBe("620px");
    // 顺带钉住既有的 font-size/line-height 没被这次改动动到
    expect(cs.fontSize).toBe("15px");
    expect(cs.lineHeight).toBe("2.05");
  });

  it("没挂这个 class 的元素不受影响（排除误伤全局选择器）", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    expect(getComputedStyle(div).maxWidth).not.toBe("620px");
  });
});
