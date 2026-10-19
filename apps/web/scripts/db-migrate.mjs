// 迁移脚本：按文件名顺序应用 db/migrations/*.sql，已登记在 schema_migrations 的跳过。
// 每个文件在一个事务里执行并登记，失败整体回滚。
// 用法：DATABASE_URL=<连接串> pnpm --filter @sojan/web db:migrate
// 依赖 Node 22+ 自带的全局 WebSocket（@neondatabase/serverless 的 Pool 走 WebSocket）。
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL 未配置");
  process.exit(1);
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../db/migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

const pool = new Pool({ connectionString: url });
let applied = 0;
try {
  await pool.query(
    `create table if not exists schema_migrations (
       name text primary key,
       applied_at timestamptz not null default now()
     )`,
  );
  const done = new Set(
    (await pool.query("select name from schema_migrations")).rows.map((r) => r.name),
  );

  for (const file of files) {
    if (done.has(file)) continue;
    const body = await readFile(path.join(dir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(body);
      await client.query("insert into schema_migrations (name) values ($1)", [file]);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw new Error(`迁移 ${file} 失败：${err.message}`);
    } finally {
      client.release();
    }
    console.log(`applied ${file}`);
    applied++;
  }
  if (applied === 0) console.log("up to date");
} finally {
  await pool.end();
}
