import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * service-role Supabase 客户端（服务端专用）。
 *
 * 过渡文件：Supabase → Neon 迁移（Task 10）完成后整体删除。
 */
let _c: SupabaseClient | null = null;
export function supabaseAdmin(): SupabaseClient {
  if (_c) return _c;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service-role 未配置");
  _c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _c;
}
