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
  });

  it("标题仍是 h1，说明行 11.5px", () => {
    render(<PageHeader kicker="解 梦" title="说说你的梦" annotation="梦是潜意识的信" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("说说你的梦");
    expect(screen.getByText("梦是潜意识的信").style.fontSize).toBe("11.5px");
  });
});
