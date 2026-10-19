import "server-only";
import { sql } from "@/lib/db";

/**
 * 注销账号：一个事务内先删 8 张业务表里该 uid 的行，最后一条删 `neon_auth."user"`。
 *
 * 为什么直接删托管 schema：托管版 Neon Auth 的 `POST /delete-user` 返回 404（2026-10-19 实测），
 * 没有官方删号入口。`neon_auth.session` / `neon_auth.account` 对 user 是 `ON DELETE CASCADE`，
 * 删掉 user 行后同一个 cookie 的 get-session 立即返回 null。
 * 业务数据与账号同事务：要么全删，要么全留（任何一条失败整体回滚）。
 * 依赖 Neon 不改 `neon_auth."user"` 的表名与级联关系，由 delete-account.db.test.ts 守住。
 *
 * 不改 neon_auth 的 schema，只删行。
 */
export async function purgeUserData(uid: string): Promise<void> {
  const db = sql();
  await db.transaction([
    // 子表（带 profile_id / dwelling_id 外键）先于 profiles / dwellings
    db`delete from fengshui_reports where uid = ${uid}`,
    db`delete from dream_history where user_id = ${uid}`,
    db`delete from jiao_history where user_id = ${uid}`,
    db`delete from dwellings where uid = ${uid}`,
    db`delete from profiles where user_id = ${uid}`,
    db`delete from llm_usage where user_id = ${uid}`,
    db`delete from entitlements where user_id = ${uid}`,
    db`delete from user_consents where user_id = ${uid}`,
    // 必须是最后一条
    db`delete from neon_auth."user" where id = ${uid}`,
  ]);
}
