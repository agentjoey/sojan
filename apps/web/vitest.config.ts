import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    /**
     * 固定测试时区。**不是洁癖，是补一个真实的区分力漏洞**：
     *
     * `app/dream/page.tsx` 用 `new Date(createdAt).toLocaleDateString("en-CA")`
     * 按**本地时区**渲染日期（此前是 `createdAt.slice(0, 10)`，取的是 UTC，
     * UTC+8 用户跨午夜会差一天）。守这条的用例把期望值用同一个平台 API 现算，
     * 于是在 **TZ=UTC 的机器上期望值与 UTC 截取恒等**——把实现回退成 `.slice(0, 10)`
     * 该用例照样全绿。验收实测：本机 `+08` 下 mutation 命中 1 红，`TZ=UTC` 下
     * 813 条全绿、零命中。而 vitest 配置与 CI 此前都没固定 TZ，GitHub Actions
     * runner 默认正是 UTC——**这条断言恰恰在最需要它的地方失效**。
     *
     * 选 `Asia/Shanghai`（UTC+8，无夏令时）：与产品首发市场的主要用户时区一致，
     * 且偏移恒定，不会让依赖日期边界的用例随 DST 漂移。
     *
     * ⚠️ 任何「本地时区 vs UTC」的日期/时间断言都依赖这里。要改成别的时区，
     * 先确认它是**非 UTC** 的，否则同类用例会静默退化为零区分力。
     */
    env: { TZ: "Asia/Shanghai" },
  },
});
