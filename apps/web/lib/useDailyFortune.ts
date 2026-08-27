import { useEffect, useState } from "react";
import type { DailyFortune } from "@sojan/core";
import type { Profile } from "@/lib/profiles";
import { dailyFortuneAction, dailyPolishAction } from "@/app/actions";

/**
 * `useDailyFortune`（owner 打磨批指令 2）：卷首今日卡与运势页共用的
 * 「流日 + LLM 轻润色」取数逻辑——从 `app/calendar/page.tsx` 原样抽出，
 * 只搬位置不改逻辑，两处从此逐字同源（此前卷首卡是写死在 locale 里的
 * 静态文案，任何日期任何访客都同一句，且与运势页注定对不上）。
 *
 * 数据一律走 server action（`dailyFortuneAction`/`dailyPolishAction`），
 * 不在客户端 import `@sojan/core`——`lunar-typescript` 那条依赖链不能进
 * `/` 的客户端 chunk（见 `app/page.tsx` 顶部注释与 bundle-fix 报告）。
 */

// 按 (档案,日期,kind) 缓存 LLM 结果到 localStorage，避免重复调用。
// ⚠️ 键前缀 `zhaojian.` 刻意保留旧品牌名、不随 2026-08-25 更名 Sojan 而改（owner 决策）：
// 这是用户浏览器里已存在的键，改前缀等于让全体存量用户缓存失效、白烧一轮 LLM 额度，
// 而用户根本看不到这个字符串。同理见 lib/access.ts 的 SYNTHETIC_EMAIL_DOMAIN。
export function cacheGet(kind: string, pid: string, date: string): string | null {
  try { return localStorage.getItem(`zhaojian.${kind}.${pid}.${date}`); } catch { return null; }
}
export function cacheSet(kind: string, pid: string, date: string, v: string): void {
  try { localStorage.setItem(`zhaojian.${kind}.${pid}.${date}`, v); } catch { /* ignore */ }
}

// 综合分 → 大字总评（返回 i18n key 后缀，接 `calendar.grade.`）
export function gradeOf(overall: number): "auspicious" | "smooth" | "neutral" | "cautious" {
  if (overall >= 8) return "auspicious";
  if (overall >= 6) return "smooth";
  if (overall >= 4) return "neutral";
  return "cautious";
}

/**
 * 按 (档案, 日期) 取当日流日与 LLM 轻润色。`profile` 为 `undefined`（加载中）
 * 或 `null`（无档案）时不取数；`dateStr` 格式 `YYYY-MM-DD`（访客本地日期）。
 */
export function useDailyFortune(
  profile: Profile | null | undefined,
  dateStr: string,
): { fortune: DailyFortune | null; polish: string | null; loading: boolean } {
  const [fortune, setFortune] = useState<DailyFortune | null>(null);
  const [polish, setPolish] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const p = profile;
    if (!p) return;
    let alive = true;
    setLoading(true);
    setPolish(cacheGet("polish", p.id, dateStr)); // 命中缓存先显示
    dailyFortuneAction({ bazi: p.chart.bazi }, dateStr)
      .then((f) => {
        if (!alive) return;
        setFortune(f);
        // 轻润色：缓存未命中才调 LLM
        if (!cacheGet("polish", p.id, dateStr)) {
          dailyPolishAction(f, p.nickname).then((line) => {
            if (alive && line) { setPolish(line); cacheSet("polish", p.id, dateStr, line); }
          });
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [profile, dateStr]);

  return { fortune, polish, loading };
}
