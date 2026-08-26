import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { zh } from "@/lib/i18n/messages/zh";
import { en } from "@/lib/i18n/messages/en";

let currentPath = "/";
vi.mock("next/navigation", () => ({ usePathname: () => currentPath }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  currentPath = "/";
});

describe("EP-dream 导航「梦」flag 门控", () => {
  it("flag 关闭时导航不含「解梦」", async () => {
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "");
    const { AppShell } = await import("../AppShell");
    // 与「境」用例同一约束：I18nProvider 必须来自同一次动态 import（context 身份匹配）。
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <I18nProvider locale="zh">{children}</I18nProvider>
    );
    render(<AppShell><div /></AppShell>, { wrapper: Wrapper });
    // 先确认导航本身渲染出来了，否则「不含」会因整树缺席而恒真
    expect(screen.getAllByLabelText("运势").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("解梦")).toBeNull();
  });

  it("flag 开启时导航含「解梦」且指向 /dream", async () => {
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1");
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <I18nProvider locale="zh">{children}</I18nProvider>
    );
    render(<AppShell><div /></AppShell>, { wrapper: Wrapper });
    const links = screen.getAllByLabelText("解梦");
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]!.getAttribute("href")).toBe("/dream");
  });
});

describe("EP-fs-07 导航「境」flag 门控", () => {
  it("flag 关闭时导航不含「境」", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "");
    const { AppShell } = await import("../AppShell");
    // NAV 在模块加载时读取 process.env，须与 AppShell 同一次动态 import 求值；
    // I18nProvider 也必须来自同一份刚重置的模块图，否则 useT() 读到的
    // I18nContext 实例会与 Wrapper 提供的不是同一个对象，导致
    // "useT must be used within <I18nProvider>"（模块重置后 context 身份不匹配）。
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <I18nProvider locale="zh">{children}</I18nProvider>
    );
    render(<AppShell><div /></AppShell>, { wrapper: Wrapper });
    expect(screen.queryByLabelText("风水")).toBeNull();
  });

  it("flag 开启时导航含「境」且指向 /fengshui", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "1");
    vi.resetModules();
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <I18nProvider locale="zh">{children}</I18nProvider>
    );
    render(<AppShell><div /></AppShell>, { wrapper: Wrapper });
    const links = screen.getAllByLabelText("风水");
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]!.getAttribute("href")).toBe("/fengshui");
  });
});

/**
 * 最终评审 Blocking 4：导航项内边距（px-2 → px-1.5）此前无条件生效，违反 spec §10
 * 「≥6 项时才收紧间距」——三个 flag 都关闭时（NAV.length=4）也被收紧，触控目标从
 * 52px 缩到 48px（虽仍高于 44px 下限，但这是本分支「flag 关闭时产品行为完全不变」
 * 约束的唯一字面违反）。这里钉住：只有 NAV.length ≥ 6 时才用
 * px-1.5，其余情况（含默认的全部 flag 都关）必须是 px-2。每条用例都把三个 flag
 * 全 stub 掉，防止将来某个 flag 在环境里开着跑测试时误判。
 * 用「运」（nav.calendar）这个恒定存在、不受任何 flag 影响的导航项作探针，避免依赖
 * 「境」/「灵」这类本身就受 flag 控制是否渲染的项。
 */
async function renderShellAndGetNavItemClassNames(): Promise<string[]> {
  const { AppShell } = await import("../AppShell");
  const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <I18nProvider locale="zh">{children}</I18nProvider>
  );
  render(<AppShell><div /></AppShell>, { wrapper: Wrapper });
  // 「运势」（nav.calendar）在桌面栏 + 移动栏各出现一次，两处应保持同一套间距规则；
  // aria-label 取自 t(item.key) 而非导航图标字符本身——「运势」两字，不是图标位显示的单字「运」。
  return screen.getAllByLabelText("运势").map((el) => el.className);
}

function hasClassToken(className: string, token: string): boolean {
  return className.split(/\s+/).includes(token);
}

describe("最终评审 Blocking 4：导航内边距按 NAV.length ≥ 6 门控（而非无条件生效）", () => {
  // Task 2 改项集：RAIL_ORDER = 运/盘/灵/境/梦/起/我（含 profiles、不含 home/account），
  // 「照」由铜铃承担、「账」并入「我的」不再单独占位——基数从旧版的 [照/运/盘/我/账]=5
  // 变成新版 [运/盘/起/我]=4。下面三条用例的具体 flag 组合据此重新校过，
  // 边界语义（<6 用 px-2，≥6 用 px-1.5）不变。
  it("三个 flag 都关闭时（NAV.length=4：运/盘/起/我，仍 <6）导航项用 px-2，不收紧", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "");
    const classNames = await renderShellAndGetNavItemClassNames();
    expect(classNames.length).toBeGreaterThan(0);
    for (const cn of classNames) {
      expect(hasClassToken(cn, "px-2")).toBe(true);
      expect(hasClassToken(cn, "px-1.5")).toBe(false);
    }
  });

  it("只开境时（NAV.length=5：运/盘/境/起/我，仍 <6）导航项仍不收紧，用 px-2", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "");
    const classNames = await renderShellAndGetNavItemClassNames();
    expect(classNames.length).toBeGreaterThan(0);
    for (const cn of classNames) {
      expect(hasClassToken(cn, "px-2")).toBe(true);
      expect(hasClassToken(cn, "px-1.5")).toBe(false);
    }
  });

  it("境 + 灵都开启、梦关闭时（NAV.length=6：运/盘/灵/境/起/我，触到 ≥6 门槛）导航项收紧为 px-1.5", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "");
    const classNames = await renderShellAndGetNavItemClassNames();
    expect(classNames.length).toBeGreaterThan(0);
    for (const cn of classNames) {
      expect(hasClassToken(cn, "px-1.5")).toBe(true);
      expect(hasClassToken(cn, "px-2")).toBe(false);
    }
  });
});

describe("UI v3：竖栏项集（7 项，「我的」沉底，无「照」无「账」）", () => {
  it("全 flag 开启时竖栏 7 项，顺序为 运/盘/灵/境/梦/起/我", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1");
    // 裁定 R3：RAIL_ORDER 定义在 lib/nav.ts（而非 AppShell.tsx），避免后续任务
    // NavGrid 组件与 AppShell 之间的循环依赖。
    const { RAIL_ORDER } = await import("@/lib/nav");
    expect(RAIL_ORDER).toEqual(["calendar", "chart", "spirit", "fengshui", "dream", "reading", "profiles"]);
  });

  it("导航项集不含首页与账号（照＝铜铃、账已并入我的）", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "1");
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    render(<AppShell><div /></AppShell>, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    const hrefs = screen.getAllByTestId("nav-item").map((el) => el.getAttribute("href"));
    // 竖栏与底栏此刻都渲染，故每个 href 会出现两次；用 Set 比对项集本身。
    expect(new Set(hrefs)).toEqual(new Set(["/calendar", "/chart", "/spirit", "/reading", "/profiles"]));
    expect(hrefs).not.toContain("/account");
    // 铜铃仍是首页链接，且它不是导航项——所以上面的项集里没有 "/"
    expect(screen.getByLabelText("首页").getAttribute("href")).toBe("/");
  });

  it("「盘」的标签是「命盘」而不是「解读」", async () => {
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    render(<AppShell><div /></AppShell>, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    expect(screen.getAllByLabelText("命盘").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("解读")).toBeNull();
  });

  it("「起盘」入口存在且指向 /reading", async () => {
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    render(<AppShell><div /></AppShell>, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    const links = screen.getAllByLabelText("起盘");
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]!.getAttribute("href")).toBe("/reading");
  });
});

/** 递归收集对象的全部叶子键路径（数组视为叶子），用于比较字典结构。 */
function collectKeyPaths(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return [prefix];
  }
  const paths: string[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    paths.push(...collectKeyPaths(value, path));
  }
  return paths;
}

describe("EP-fs-07 i18n fengshui 命名空间键结构一致性", () => {
  it("zh 与 en 的 fengshui 命名空间键路径完全一致", () => {
    // 显式断言两侧命名空间均已存在，避免「双方都缺失」时误判通过。
    expect(zh.fengshui).toBeDefined();
    expect(en.fengshui).toBeDefined();

    const zhPaths = collectKeyPaths(zh.fengshui).sort();
    const enPaths = collectKeyPaths(en.fengshui).sort();
    expect(enPaths).toEqual(zhPaths);
  });
});

/**
 * EP-account2-fix：web widget 登录路径的唯一续期点此前只有 /account 页，
 * 用户 30 天不打开 /account 就被静默登出。AppShell 全局挂载时对
 * 「非 TG + zj_tg_hint=1」的会话 fire-and-forget 调一次 GET /api/tg/session。
 * 这三条钉住门控条件：hint 存在才发、非 TG 才发、失败静默（不 reject 到组件树）。
 */
describe("EP-account2-fix：AppShell 对 zj_tg_hint 会话续期（fire-and-forget）", () => {
  async function renderShell(): Promise<ReturnType<typeof vi.fn>> {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <I18nProvider locale="zh">{children}</I18nProvider>
    );
    render(<AppShell><div /></AppShell>, { wrapper: Wrapper });
    return fetchMock;
  }

  afterEach(() => {
    document.cookie = "zj_tg_hint=; max-age=0; path=/";
    delete (window as { Telegram?: unknown }).Telegram;
    vi.unstubAllGlobals();
  });

  it("非 TG + zj_tg_hint=1：挂载时发出一次 GET /api/tg/session", async () => {
    document.cookie = "zj_tg_hint=1; path=/";
    const fetchMock = await renderShell();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tg/session",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("无 zj_tg_hint：不发", async () => {
    const fetchMock = await renderShell();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("TG 环境内即使有 hint 也不发（Mini App 走 ensureTgSession 重签）", async () => {
    document.cookie = "zj_tg_hint=1; path=/";
    (window as { Telegram?: unknown }).Telegram = { WebApp: { initData: "x" } };
    const fetchMock = await renderShell();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetch 失败静默消化，不抛出", async () => {
    document.cookie = "zj_tg_hint=1; path=/";
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <I18nProvider locale="zh">{children}</I18nProvider>
    );
    render(<AppShell><div /></AppShell>, { wrapper: Wrapper });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // 等一拍让 reject 链跑完：若未 catch，测试进程会收到 unhandled rejection
    await new Promise((r) => setTimeout(r, 10));
  });
});

describe("UI v3 移动外壳", () => {
  it("底栏已删除（全站不再有 fixed bottom 导航）", async () => {
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    const { container } = render(<AppShell><div /></AppShell>, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    expect(container.querySelector("nav.fixed.bottom-0")).toBeNull();
  });

  it("语境胶囊默认取当前路由的 nav 标签，且链到 /profiles", async () => {
    // 裁定 R4：本文件顶层已把 next/navigation 的路由 mock 改成读取模块级可变
    // 变量 `currentPath`（见文件头 vi.mock），切路由直接赋值即可，不用 vi.doMock
    // ——两者混用会导致模块解析出两份不同的 mock 实例，路由读不到新值。
    currentPath = "/chart";
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    render(<AppShell><div /></AppShell>, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    const capsule = screen.getByTestId("shell-capsule");
    expect(capsule.getAttribute("href")).toBe("/profiles");
    expect(capsule).toHaveTextContent("命盘");
  });

  it("页面声明语境词时优先用声明值", async () => {
    const { AppShell } = await import("../AppShell");
    const { useShellContext } = await import("../ShellContext");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    function Page() {
      useShellContext("圣筊");
      return <div />;
    }
    render(<AppShell><Page /></AppShell>, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    expect(screen.getByTestId("shell-capsule")).toHaveTextContent("圣筊");
  });

  it("菜单键打开九宫格；覆盖层里同位换成关闭键，尺寸不变", async () => {
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    render(<AppShell><div /></AppShell>, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByTestId("shell-menu"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const close = screen.getByTestId("shell-menu");
    expect(close.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(close);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("关闭后焦点归还菜单键（Esc 路径）", async () => {
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    render(<AppShell><div /></AppShell>, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    const menu = screen.getByTestId("shell-menu");
    fireEvent.click(menu);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(document.activeElement).toBe(menu);
  });

  // 评审 Critical：此前菜单键 onClick 直接 setOpen(v => !v)，不经过 close()，
  // 点击关闭这条路径根本不归还焦点——iOS Safari/WebView 点 <button> 默认不留
  // 焦点（跟桌面浏览器不同），MobileShell 移动端正是主场，这不是边角情况。
  // 两条关闭路径（本用例 + 上面的 Esc 用例）现在都收敛到同一个 close()。
  it("关闭后焦点归还菜单键（点关闭键路径）", async () => {
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    render(<AppShell><div /></AppShell>, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    const menu = screen.getByTestId("shell-menu");
    fireEvent.click(menu);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // 关闭键此刻就是 shell-menu 本身（原地切换图形，元素不变）。
    fireEvent.click(screen.getByTestId("shell-menu"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(menu);
  });

  it("打开时焦点移入对话框（九宫格第一个导航格）", async () => {
    // 控制器裁定必修：NavGrid 声明 aria-modal="true"，若打开后焦点仍留在菜单键
    // 上、Tab 又能跑到背后页面，aria-modal 就是一句假声明。选择聚焦第一个
    // 导航格（而不是对话框容器本身）——理由见 MobileShell.tsx 顶部注释。
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    render(<AppShell><div /></AppShell>, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    fireEvent.click(screen.getByTestId("shell-menu"));
    const firstCell = screen.getAllByTestId("nav-grid-cell")[0];
    expect(document.activeElement).toBe(firstCell);
  });

  it("SSR 水合安全：打开前七十二候节点不存在，只在用户点开菜单后才挂载", async () => {
    // 验证选择的方案（打开前整体不求值，见 MobileShell.tsx 注释）：`open` 初始为
    // false，服务端与客户端首帧渲染一致地跳过 NavGrid 内部依赖 new Date() 的
    // 七十二候节点，杜绝「服务端候 A / 客户端候 B」的水合不一致（CLAUDE.md 记录
    // 过一次 hydration error #418，此处不重蹈）。
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    render(<AppShell><div /></AppShell>, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    expect(screen.queryByTestId("nav-grid-seasons")).toBeNull();
    fireEvent.click(screen.getByTestId("shell-menu"));
    expect(screen.getByTestId("nav-grid-seasons")).toBeInTheDocument();
  });

  it("Telegram 环境内不渲染任何新外壳（冻结线）", async () => {
    vi.doMock("@/lib/tg/ui", () => ({ useIsTelegram: () => true }));
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    render(<AppShell><div /></AppShell>, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    expect(screen.queryByTestId("shell-capsule")).toBeNull();
    expect(screen.queryByTestId("shell-menu")).toBeNull();
  });
});
