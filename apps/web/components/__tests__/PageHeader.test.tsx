import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PageHeader } from "../PageHeader";

afterEach(() => cleanup());

describe("PageHeader（UI v3 页首范式）", () => {
  it("眉标是 10.5px / .42em 且不再用破折号包裹", () => {
    render(<PageHeader kicker="解 梦" title="说说你的梦" />);
    const kicker = screen.getByText("解 梦");
    expect(kicker.style.fontSize).toBe("10.5px");
    expect(kicker.style.letterSpacing).toBe("0.42em");
    expect(kicker.textContent).not.toContain("—");
  });

  it("眉标前有一段朱砂短横（装饰，对无障碍隐藏）", () => {
    const { container } = render(<PageHeader kicker="解 梦" title="说说你的梦" />);
    const rule = container.querySelector('[data-testid="header-rule"]');
    expect(rule).not.toBeNull();
    expect(rule!.getAttribute("aria-hidden")).toBe("true");
    expect((rule as HTMLElement).style.background).toContain("var(--color-cinnabar)");
    expect((rule as HTMLElement).style.width).toBe("22px");
    // 顺序断言：短横必须在眉标之前——若被挪到眉标之后，上面几条断言仍会绿。
    const kicker = screen.getByText("解 梦");
    // DOCUMENT_POSITION_FOLLOWING (4)：kicker 排在 rule 之后。
    const position = rule!.compareDocumentPosition(kicker);
    expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("标题仍是 h1，说明行 11.5px", () => {
    render(<PageHeader kicker="解 梦" title="说说你的梦" annotation="梦是潜意识的信" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("说说你的梦");
    expect(screen.getByText("梦是潜意识的信").style.fontSize).toBe("11.5px");
  });

  // M4：`as` 默认值改成 "div" 会让 8 个既有页面静默丢掉 <header> landmark，
  // 此前只靠 grep 确认、没有测试守。省略 `as` 时必须落地为 <header>。
  it("省略 `as` 时默认渲染为 <header>（防默认值被静默改成非 landmark 标签）", () => {
    const { container } = render(<PageHeader kicker="解 梦" title="说说你的梦" />);
    expect(container.querySelector("header")).not.toBeNull();
  });
});
