import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Neon（serverless Postgres）查询函数，惰性单例。
 * 读 `process.env.DATABASE_URL`；缺失时在首次调用处抛错，而不是 import 期崩——
 * 这样 `next build` 收集 page-data、以及不连库的单测都不会被拖垮。
 *
 * 用法：`const rows = await sql()\`select * from profiles where user_id = ${uid}\``
 * ⚠️ 只能在服务端（route handler / server action）使用，`server-only` 会在客户端 bundle 里直接报错。
 */
let cached: NeonQueryFunction<false, false> | undefined;
let cachedUrl: string | undefined;

export function sql(): NeonQueryFunction<false, false> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 未配置");
  // URL 变了（测试里 useTestDb 切库）就重建，避免沿用旧连接
  if (!cached || cachedUrl !== url) {
    cached = neon(url);
    cachedUrl = url;
  }
  return cached;
}
