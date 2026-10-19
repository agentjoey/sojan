import { sql } from "@/lib/db";

/** 条款版本——改版时改这个常量即可，不用动表结构（spec §6②，v1 最小面）。 */
export const TERMS_VERSION = "2026-08-20";

/**
 * 记录一次条款接受（EP-account2-07）。幂等——`user_consents` 表在
 * (user_id, document, version) 上有唯一约束，`on conflict do nothing` 让重复调用
 * 不插出第二条。best-effort：任何失败都只记日志、不抛错——记录条款接受
 * 不该阻断调用方（登录成功后的跳转）的主流程。
 */
export async function recordConsentOnce(uid: string, document: string, version: string): Promise<void> {
  try {
    await sql()`
      insert into user_consents (user_id, document, version)
      values (${uid}, ${document}, ${version})
      on conflict (user_id, document, version) do nothing`;
  } catch (e) {
    console.error("recordConsentOnce error", e);
  }
}
