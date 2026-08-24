import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { JiaoThrow } from "../JiaoThrow";

afterEach(() => cleanup());

describe("JiaoThrow", () => {
  it("渲染两枚筊", () => {
    render(<JiaoThrow blocks={["仰", "俯"]} onSettled={vi.fn()} />);
    expect(screen.getAllByTestId("jiao-block")).toHaveLength(2);
  });

  it("每枚筊按落地面标注（供无障碍与测试判别）", () => {
    render(<JiaoThrow blocks={["仰", "俯"]} onSettled={vi.fn()} />);
    const [a, b] = screen.getAllByTestId("jiao-block");
    expect(a).toHaveAttribute("data-face", "仰");
    expect(b).toHaveAttribute("data-face", "俯");
  });

  it("动画结束触发 onSettled——挂 animationend 而非计时器，reduced-motion 下也能出结果", () => {
    const onSettled = vi.fn();
    render(<JiaoThrow blocks={["俯", "俯"]} onSettled={onSettled} />);
    const blocks = screen.getAllByTestId("jiao-block");
    fireEvent.animationEnd(blocks[1]!); // 第二枚（延迟更久的那枚）落定才算结束
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("第一枚落定不触发 onSettled（必须等两枚都停）", () => {
    const onSettled = vi.fn();
    render(<JiaoThrow blocks={["仰", "仰"]} onSettled={onSettled} />);
    fireEvent.animationEnd(screen.getAllByTestId("jiao-block")[0]!);
    expect(onSettled).not.toHaveBeenCalled();
  });
});
