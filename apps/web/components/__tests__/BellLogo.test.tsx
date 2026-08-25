import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BellLogo } from "../ui";

afterEach(() => cleanup());

describe("BellLogo 风吹动效", () => {
  it.each([
    ["idle", "zj-bell-idle", "zj-bell-body-idle", "zj-bell-clapper-idle"],
    ["ring", "zj-bell-ring", "zj-bell-body-ring", "zj-bell-clapper-ring"],
    ["cast", "zj-bell-cast", "zj-bell-body-cast", "zj-bell-clapper-cast"],
  ] as const)("motion=%s 时主体、铃身和铃舌使用对应的惯性层", (motion, shellClass, bodyClass, clapperClass) => {
    const { container } = render(<BellLogo motion={motion} ringKey={1} />);

    expect(container.querySelector("svg > g")).toHaveClass(shellClass);
    expect(container.querySelector(".zj-bell-body")).toHaveClass(bodyClass);
    expect(container.querySelector(".zj-bell-clapper")).toHaveClass(clapperClass);
  });

  it("motion=none 时三层都保持静止", () => {
    const { container } = render(<BellLogo motion="none" />);

    expect(container.querySelector("svg > g")).not.toHaveAttribute("class");
    expect(container.querySelector(".zj-bell-body")).not.toHaveClass("zj-bell-body-idle", "zj-bell-body-ring");
    expect(container.querySelector(".zj-bell-clapper")).not.toHaveClass("zj-bell-clapper-idle", "zj-bell-clapper-ring");
  });

  it("detail=full 时增加只供大尺寸展示的材质细节", () => {
    const compact = render(<BellLogo motion="none" />);
    expect(compact.container.querySelector(".zj-bell-detail")).toBeNull();
    compact.unmount();

    const full = render(<BellLogo motion="cast" detail="full" />);
    expect(full.container.querySelectorAll(".zj-bell-detail").length).toBeGreaterThanOrEqual(2);
  });
});
