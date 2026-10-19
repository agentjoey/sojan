-- Neon baseline schema（2026-10-19，取自 Supabase 生产库现状）。
-- 与生产的差异，全部是 Supabase → Neon 迁移刻意为之：
--   * 业务表的 user_id / uid 不再外键指向 auth.users（身份由 Neon Auth 托管，
--     删除由应用层事务保证，见 spec §5/§6），也没有 default auth.uid()；
--   * 无 RLS、无 anon/authenticated 授权（只有服务端经 DATABASE_URL 访问）；
--   * consume_llm_credit_account 去掉 security definer。
-- 业务表之间的外键原样保留。

create table profiles (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null,
  nickname text not null default '无名',
  birth_input jsonb not null,
  chart jsonb not null,
  created_at timestamptz not null default now(),
  reading text,
  reading_model text,
  reading_at timestamptz,
  spirit_memory jsonb,
  questionnaire jsonb
);
create index profiles_user_id_idx on profiles (user_id, created_at desc);

create table dwellings (
  id uuid not null default gen_random_uuid() primary key,
  uid uuid not null,
  name text not null,
  kind text not null default 'home',
  tenancy text not null default 'rent',
  facing text,
  facing_degrees numeric,
  built_year integer,
  layout jsonb,
  member_profile_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dwellings_uid_idx on dwellings (uid);

create table fengshui_reports (
  id uuid not null default gen_random_uuid() primary key,
  uid uuid not null,
  dwelling_id uuid references dwellings (id) on delete cascade,
  profile_id uuid not null,
  layer integer not null,
  locale text not null,
  input_fingerprint text not null,
  sections jsonb not null,
  created_at timestamptz not null default now()
);
create unique index fengshui_reports_fp_idx on fengshui_reports (uid, input_fingerprint);

create table dream_history (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null,
  profile_id uuid not null references profiles (id) on delete cascade,
  summary text not null,
  created_at timestamptz not null default now(),
  full_text text
);
create index dream_history_profile_created_idx on dream_history (profile_id, created_at);

create table jiao_history (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null,
  profile_id uuid not null references profiles (id) on delete cascade,
  omen text not null check (omen = any (array['圣筊', '笑筊', '阴筊'])),
  summary text not null,
  full_text text,
  created_at timestamptz not null default now()
);
create index jiao_history_profile_created_idx on jiao_history (profile_id, created_at);

create table entitlements (
  user_id uuid primary key,
  tier text not null default 'free',
  member_until timestamptz,
  updated_at timestamptz not null default now()
);

create table llm_usage (
  user_id uuid not null,
  period text not null,
  uses integer not null default 0,
  primary key (user_id, period)
);

create table user_consents (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null,
  document text not null,
  version text not null,
  accepted_at timestamptz not null default now(),
  unique (user_id, document, version)
);
create index user_consents_user_idx on user_consents (user_id, document);

-- 命盘冻结：chart / birth_input / user_id 一经写入不可改
create function public.profiles_freeze() returns trigger
language plpgsql
as $$
begin
  if new.chart is distinct from old.chart
     or new.birth_input is distinct from old.birth_input
     or new.user_id is distinct from old.user_id then
    raise exception '命盘已冻结，不可修改 chart/birth_input/user_id';
  end if;
  return new;
end;
$$;

create trigger profiles_freeze_trg
  before update on profiles
  for each row execute function public.profiles_freeze();

-- 月度免费 LLM 额度：原子占一次额度，超出 p_free 返回 false。
-- 仅服务端调用（非 security definer）；单条语句即一个事务，行锁保证并发下不超发。
create function public.consume_llm_credit_account(p_user_id uuid, p_free int default 30)
returns boolean
language plpgsql
as $$
declare
  v_period text := to_char(now(), 'YYYY-MM');
  v_uses int;
begin
  insert into public.llm_usage (user_id, period, uses)
  values (p_user_id, v_period, 0)
  on conflict (user_id, period) do nothing;

  select uses into v_uses
  from public.llm_usage
  where user_id = p_user_id and period = v_period
  for update;

  if v_uses >= p_free then
    return false;
  end if;

  update public.llm_usage
  set uses = uses + 1
  where user_id = p_user_id and period = v_period;
  return true;
end;
$$;
