import { describe, it, expect } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import type { ZiweiChart, Palace } from "@sojan/core";
import { ZiweiBoard } from "../ZiweiBoard";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

/**
 * EP-east-ui-r2：ZiweiBoard 细线格版（去 12 张小卡 / 去中心深墨块）。
 * 核心不变量：
 *  - 十二宫全数渲染、宫名在各宫内精确匹配（防「命宫」撞上中心格「命宫」标签的子串陷阱）；
 *  - 身宫朱砂小字「身」只出现在身宫；
 *  - 中心 2×2 合并格承载命主/身宫/五行局与生年四化，无深墨底；
 *  - 宫位按 branch 落位（非数组顺序）。
 */

function makePalace(name: string, branch: string, overrides: Partial<Palace> = {}): Palace {
  return {
    name,
    branch,
    isBodyPalace: false,
    majorStars: [],
    minorStars: [],
    adjectiveStars: [],
    ...overrides,
  };
}

// 数组顺序故意打乱，验证按 branch 落位而非按数组顺序。
const palaces: Palace[] = [
  makePalace("夫妻", "未"),
  makePalace("命宫", "巳", {
    majorStars: [{ name: "紫微", brightness: "庙" }, { name: "天府" }],
    minorStars: [{ name: "左辅" }],
  }),
  makePalace("兄弟", "午"),
  makePalace("子女", "申"),
  makePalace("财帛", "酉", { majorStars: [{ name: "武曲", mutagen: "忌" }] }),
  makePalace("疾厄", "戌"),
  makePalace("迁移", "亥", { isBodyPalace: true }),
  makePalace("交友", "子"),
  makePalace("官禄", "丑"),
  makePalace("田宅", "寅"),
  makePalace("福德", "卯"),
  makePalace("父母", "辰"),
];

const ziwei: ZiweiChart = {
  school: "zhongzhou",
  soulPalaceBranch: "巳",
  bodyPalaceBranch: "亥",
  fiveElementBureau: "水二局",
  palaces,
  birthMutagens: { 禄: "天同", 权: "天机", 科: "文昌", 忌: "廉贞" },
};

function renderBoard(chart: ZiweiChart = ziwei) {
  return render(
    <I18nProvider locale="zh">
      <ZiweiBoard ziwei={chart} />
    </I18nProvider>,
  );
}

describe("EP-east-ui-r2 ZiweiBoard", () => {
  it("十二宫全数渲染，宫名在各宫内精确匹配", () => {
    renderBoard();
    expect(palaces).toHaveLength(12);
    for (const p of palaces) {
      const cell = screen.getByTestId(`ziwei-palace-${p.branch}`);
      // 精确匹配：getByText 默认全串匹配，「命宫」只在巳宫断言语境内查找，
      // 不会被中心格的「命宫」标签或兄弟宫等干扰。
      expect(within(cell).getByText(p.name)).toBeInTheDocument();
      // 地支小标在各自宫内
      expect(within(cell).getByText(p.branch)).toBeInTheDocument();
    }
  });

  it("宫位按 branch 落位：巳宫在 (1,1)、亥宫在 (4,4)，与数组顺序无关", () => {
    renderBoard();
    const si = screen.getByTestId("ziwei-palace-巳");
    expect(si.style.gridRow).toBe("1");
    expect(si.style.gridColumn).toBe("1");
    const hai = screen.getByTestId("ziwei-palace-亥");
    expect(hai.style.gridRow).toBe("4");
    expect(hai.style.gridColumn).toBe("4");
  });

  it("身宫朱砂小字「身」只出现在身宫，旧 inset 描边已废", () => {
    renderBoard();
    const bodyCell = screen.getByTestId("ziwei-palace-亥");
    const mark = within(bodyCell).getByText("身");
    expect(mark.style.color).toBe("var(--color-cinnabar)");
    // 其余十一宫均无「身」标记（宫名 fixture 均不含「身」字，精确匹配安全）
    for (const p of palaces.filter((x) => !x.isBodyPalace)) {
      expect(within(screen.getByTestId(`ziwei-palace-${p.branch}`)).queryByText("身")).toBeNull();
    }
    // 旧身宫 inset 描边不再出现
    expect(bodyCell.style.boxShadow).toBe("");
  });

  it("中心 2×2 合并格：命主/身宫/五行局 + 生年四化，无深墨锚点块", () => {
    const { container } = renderBoard();
    const center = screen.getByTestId("ziwei-center");
    expect(center.style.gridRow).toBe("2 / span 2");
    expect(center.style.gridColumn).toBe("2 / span 2");
    expect(within(center).getByText("水二局")).toBeInTheDocument();
    expect(within(center).getByText("五行局")).toBeInTheDocument();
    // 生年四化星名完整
    for (const star of ["天同", "天机", "文昌", "廉贞"]) {
      expect(within(center).getByText(star)).toBeInTheDocument();
    }
    // 旧深墨锚点块令牌不再出现
    expect(container.innerHTML).not.toContain("var(--color-panel-strong)");
  });

  it("四化小签 MutagenTag 保留：化忌星所在宫渲染「忌」签", () => {
    renderBoard();
    const you = screen.getByTestId("ziwei-palace-酉");
    expect(within(you).getByText("忌")).toBeInTheDocument();
    expect(within(you).getByText("武曲")).toBeInTheDocument();
    // 无四化的宫不渲染签（兄弟宫星为空）
    expect(within(screen.getByTestId("ziwei-palace-午")).queryByText("忌")).toBeNull();
  });

  it("细线格：容器画上/左边线，宫格补右/下边线，无卡片圆角与 surface 底色", () => {
    renderBoard();
    const grid = screen.getByTestId("ziwei-grid");
    expect(grid.style.borderTop).toBe("1px solid var(--color-line)");
    expect(grid.style.borderLeft).toBe("1px solid var(--color-line)");
    expect(grid.style.gap).toBe("");
    const cell = screen.getByTestId("ziwei-palace-巳");
    expect(cell.style.borderRight).toBe("1px solid var(--color-line)");
    expect(cell.style.borderBottom).toBe("1px solid var(--color-line)");
    expect(cell.style.borderRadius).toBe("");
  });
});

describe("ZiweiBoard：选中宫详情块（6b）", () => {
  it("默认选中命宫，详情块显示其宫名", () => {
    renderBoard();
    const detail = screen.getByTestId("palace-detail");
    expect(detail).toHaveTextContent("命宫");
  });

  // I4：spec §8「详情块必须用 Emphasis」——此前七条新测试全部只查文本/role/
  // tabIndex/图例底色，把 <Emphasis> 换成裸 <div data-testid="palace-detail">
  // 七条照样全绿，毫无判别力。这里钉住 Emphasis 横向强调的两个特征性样式：
  // borderLeft 含朱砂、backgroundImage 含 90deg 渐变（同 BaziPillars.test.tsx
  // 已有的钉法，见其 borderTop 含 cinnabar + backgroundImage 含 180deg 一条）。
  // mutation 复验：把 Emphasis 换回裸 div，本条必须变红（见报告）。
  it("详情块必须是 Emphasis：borderLeft 含朱砂、backgroundImage 含 90deg（spec §8）", () => {
    renderBoard();
    const detail = screen.getByTestId("palace-detail");
    expect(detail.style.borderLeft).toContain("var(--color-cinnabar)");
    expect(detail.style.backgroundImage).toContain("90deg");
  });

  it("点另一宫切换详情块", () => {
    renderBoard();
    fireEvent.click(screen.getByTestId("palace-cell-财帛"));
    expect(screen.getByTestId("palace-detail")).toHaveTextContent("财帛");
  });

  // I5：spec §5 要求照抄 BaguaWheel 的既有交互契约——选中态必须是视觉的，
  // aria-pressed 只是它的无障碍镜像。此前只搬了镜像，棋盘上没有任何视觉选中
  // 指示。这里钉住：选中宫带朱砂内描边、未选中宫不带。
  it("选中宫有视觉选中指示（inset 朱砂描边），未选中宫没有（I5）", () => {
    renderBoard();
    fireEvent.click(screen.getByTestId("palace-cell-财帛"));
    const selectedCell = screen.getByTestId("palace-cell-财帛");
    const otherCell = screen.getByTestId("palace-cell-兄弟");
    expect(selectedCell.style.boxShadow).toContain("var(--color-cinnabar)");
    expect(otherCell.style.boxShadow).not.toContain("var(--color-cinnabar)");
  });

  // I6：棋盘从「纯展示」变成「十二个可聚焦按钮」后，Tab 序里凭空多 12 站，
  // 需要 role="group" + aria-label 给出上位语境（同 BaguaWheel 交互化时的既有
  // 契约）。
  it("棋盘容器有 role=group 与 aria-label（I6）", () => {
    renderBoard();
    const grid = screen.getByTestId("ziwei-grid");
    expect(grid.getAttribute("role")).toBe("group");
    expect(grid.getAttribute("aria-label")).toBeTruthy();
  });

  it("宫格可键盘触达：Enter 与 Space 都能选中", () => {
    renderBoard();
    const cell = screen.getByTestId("palace-cell-财帛");
    expect(cell.getAttribute("role")).toBe("button");
    expect(cell.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(cell, { key: "Enter" });
    expect(screen.getByTestId("palace-detail")).toHaveTextContent("财帛");
  });

  it("空格键也能选中", () => {
    renderBoard();
    const cell = screen.getByTestId("palace-cell-疾厄");
    fireEvent.keyDown(cell, { key: " " });
    expect(screen.getByTestId("palace-detail")).toHaveTextContent("疾厄");
  });

  it("四化图例：每个签实际渲染出对应五行底色（禄=木/权=土/科=水/忌=火），换裸 <span> 会锁不住", () => {
    // 评审 Important 2：上一条只查文字，裸 <span>{k}</span> 也能通过。
    // 这里核对 MutagenTag 真实渲染出的 background 变量，锁定「必须复用 MutagenTag」。
    renderBoard();
    const legend = screen.getByTestId("mutagen-legend");
    const expectedElement: Record<string, string> = { 禄: "wood", 权: "earth", 科: "water", 忌: "fire" };
    for (const [k, el] of Object.entries(expectedElement)) {
      const tag = within(legend).getByText(k);
      expect(tag.style.background).toBe(`var(--color-${el})`);
    }
  });

  it("空宫详情块的借星必须真的来自 deriveTriad：疾厄借田宅/命宫/父母，借来的星为紫微、天府", () => {
    // 评审 Important 1：曾有一条只查「借」这个模板字的弱断言，换成硬编码桩
    // { isEmpty:true, borrowedFrom:[], stars:[] } 也能过（已删，被本条覆盖）。这里核对
    // deriveTriad(palaces, "疾厄") 的实跑输出——注意：这是**本 fixture 数组序**的产物，
    // 不是命理真值（fixture 数组顺序故意打乱，疾厄按环序本应借兄弟宫而非命宫；
    // 这里断言的借宫名只是 deriveTriad 对着这份打乱 fixture 的确定性输出，用来
    // 锁定「必须真调用 deriveTriad」，不代表真实命理规则）：
    //   { stars: ["紫微","天府"], borrowedFrom: ["田宅","命宫","父母"], isEmpty: true }
    // 断言这些真实的借宫名/借星名，锁定「必须真调用 deriveTriad」（mutation 复验见报告）。
    renderBoard();
    fireEvent.click(screen.getByTestId("palace-cell-疾厄"));
    const detail = screen.getByTestId("palace-detail");
    expect(detail).toHaveTextContent("田宅");
    expect(detail).toHaveTextContent("命宫");
    expect(detail).toHaveTextContent("父母");
    expect(detail).toHaveTextContent("紫微");
    expect(detail).toHaveTextContent("天府");
  });

  it("副标题标注流派；身宫与命宫同支时标「身宫同度」", () => {
    // renderBoard 的实际签名是 renderBoard(chart: ZiweiChart = ziwei)——吃整份 chart，
    // 不是 overrides 对象。用扩展既有 fixture 的写法。
    renderBoard({ ...ziwei, soulPalaceBranch: "丑", bodyPalaceBranch: "丑" });
    const sub = screen.getByTestId("ziwei-subtitle");
    expect(sub.textContent).toContain("中州派");
    expect(sub.textContent).toContain("身宫同度");
  });

  it("流派取自 chart.school，不是硬编码（切到 default 派要跟着变）", () => {
    renderBoard({ ...ziwei, school: "default" });
    const sub = screen.getByTestId("ziwei-subtitle");
    expect(sub.textContent).not.toContain("中州派");
    expect(sub.textContent).toContain("全书派");
  });

  it("身宫与命宫不同支时不标「身宫同度」（防无条件渲染）", () => {
    renderBoard({ ...ziwei, soulPalaceBranch: "丑", bodyPalaceBranch: "未" });
    expect(screen.getByTestId("ziwei-subtitle").textContent).not.toContain("身宫同度");
  });

  it("格高 ≥84px（6b 要求）", () => {
    renderBoard();
    const cell = screen.getByTestId("ziwei-palace-丑");
    const mh = (cell.getAttribute("style") ?? "").match(/min-height:\s*(\d+)px/);
    expect(mh).not.toBeNull();
    expect(Number(mh![1])).toBeGreaterThanOrEqual(84);
  });

  it("有交互说明一句", () => {
    renderBoard();
    expect(screen.getByTestId("ziwei-hint").textContent).toContain("点任一宫");
  });
});
