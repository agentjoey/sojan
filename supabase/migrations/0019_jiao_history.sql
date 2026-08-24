-- EP-jiao · 掷筊问事历史（最近 10 条）
-- 结构与 RLS 照抄 dream_history（0017 + 0018 的 full_text 列），差异只在多一列 omen。
--
-- **不存问题原文**——与 dream_history「梦原文不落库」同一条红线（owner 2026-08-25 决策）：
-- 「该不该离职/分手/做手术」这类原话的敏感度不比梦低。summary 由 summarizeJiaoEntry()
-- 在应用层生成（明确禁止逐字复述提问）后才写入；full_text 是灵自己生成、已过
-- sanitizeReading/correctOmen/correctMutagens 全套后置链的输出，不是用户的原始陈述。
--
-- 续接追问时用 full_text 当锚点喂回模型，因此不需要问题原文（同 0018 的思路）。
--
-- 「最近 10 条」的裁剪在应用层做（写入后删掉超出的旧行），不做成 DB 触发器/RPC——
-- 本仓库已因 security definer RPC 忘记收权限出过两次生产漏洞（0012/0015），裁剪这种
-- 非特权操作没必要再开一个新的 RPC 面。

create table if not exists public.jiao_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  omen        text not null check (omen in ('圣筊', '笑筊', '阴筊')),
  summary     text not null,
  full_text   text,
  created_at  timestamptz not null default now()
);

create index if not exists jiao_history_profile_created_idx
  on public.jiao_history (profile_id, created_at);

alter table public.jiao_history enable row level security;

create policy own_select on public.jiao_history for select using (auth.uid() = user_id);
create policy own_insert on public.jiao_history for insert with check (auth.uid() = user_id);
create policy own_delete on public.jiao_history for delete using (auth.uid() = user_id);
