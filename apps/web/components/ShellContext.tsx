"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * 移动端顶部语境胶囊的文字来源（Task 6）。
 *
 * 页面可以用 `useShellContext("圣筊")` 声明「当前语境词」——比如掷筊过场中
 * 胶囊应显示「圣筊」而不是路由默认的「命盘」。未声明时 `MobileShell` 回退到
 * 当前路由在 `NAV_CATALOG` 里的 `labelKey`。
 *
 * 声明值存在 Provider 里而不是每个页面自己画胶囊，是因为胶囊是外壳的一部分
 * （固定在顶部、跨页面持久），页面只负责「说一句话」。
 */
type ShellContextValue = {
  label: string | null;
  setLabel: (label: string | null) => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [label, setLabel] = useState<string | null>(null);
  const value = useMemo(() => ({ label, setLabel }), [label]);
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

/** 外壳内部读取当前声明值——`MobileShell` 专用，页面请用 `useShellContext(label)`。 */
export function useShellContextValue(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) {
    throw new Error("useShellContextValue 必须在 ShellProvider 内使用");
  }
  return ctx;
}

/**
 * 页面调用此 hook 声明当前语境词。挂载时设置、卸载时清空（回退到路由默认值），
 * 依赖 `label` 变化时重新设置。
 *
 * 特意放进 `useEffect` 而不是渲染期直接 `setLabel`：渲染期 setState 会触发
 * 「先渲染 A 页面默认值、再渲染声明值」的多余一帧，且撞上仓库
 * `react-hooks/set-state-in-effect` lint 规则——效果里做是唯一允许的写法。
 */
export function useShellContext(label: string | null): void {
  const { setLabel } = useShellContextValue();
  useEffect(() => {
    setLabel(label);
    return () => setLabel(null);
  }, [label, setLabel]);
}
