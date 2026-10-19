import { beforeAll } from "vitest";
import { neon } from "@neondatabase/serverless";

/**
 * db 测试辅助：只在设了 TEST_DATABASE_URL 时才连真库，否则 `*.db.test.ts`
 * 用 `describe.skipIf(!hasTestDb)` 整体跳过（CI / 本机默认不连库，全量测试仍全绿）。
 *
 * ⚠️ 刻意没有「全局 truncate」：vitest 并行跑多个测试文件，全局清表会抹掉
 * 别的文件正在断言的行。约定：每条用例用 `newUid()` 取全新 uid，
 * 结束时只用 `cleanupUsers()` 清自己名下的行。
 */
export const hasTestDb: boolean = !!process.env.TEST_DATABASE_URL;

/** 在 beforeAll 里把 DATABASE_URL 指向测试库（lib/db.ts 惰性读取，故先于首次 `sql()` 生效）。 */
export function useTestDb(): void {
  beforeAll(() => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  });
}

export function newUid(): string {
  return crypto.randomUUID();
}

/**
 * 删除这些 uid 名下的全部业务行。按外键顺序：先删子表（报告/历史），再删
 * dwellings / profiles。`dwellings`、`fengshui_reports` 的归属列叫 `uid`，其余叫 `user_id`。
 */
export async function cleanupUsers(uids: string[]): Promise<void> {
  if (uids.length === 0) return;
  const q = neon(process.env.TEST_DATABASE_URL!);
  await q.transaction([
    q`delete from fengshui_reports where uid = any(${uids}::uuid[])`,
    q`delete from dream_history where user_id = any(${uids}::uuid[])`,
    q`delete from jiao_history where user_id = any(${uids}::uuid[])`,
    q`delete from dwellings where uid = any(${uids}::uuid[])`,
    q`delete from profiles where user_id = any(${uids}::uuid[])`,
    q`delete from entitlements where user_id = any(${uids}::uuid[])`,
    q`delete from llm_usage where user_id = any(${uids}::uuid[])`,
    q`delete from user_consents where user_id = any(${uids}::uuid[])`,
  ]);
}
