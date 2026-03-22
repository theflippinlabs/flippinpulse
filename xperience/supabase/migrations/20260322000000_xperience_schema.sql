-- ============================================================
-- Xperience — X Growth Platform
-- Schema Migration
-- Created: 2026-03-22
-- ============================================================

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_cron"; -- for scheduled jobs

-- ── Profiles ─────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  email         text not null,
  full_name     text,
  avatar_url    text,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null
);

comment on table public.profiles is 'Extended user profile data';

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── X Accounts ───────────────────────────────────────────────────────────────
create table if not exists public.x_accounts (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  handle          text not null,
  display_name    text not null,
  avatar_url      text,
  followers_count integer default 0 not null,
  following_count integer default 0 not null,
  tweets_count    integer default 0 not null,
  is_connected    boolean default true not null,
  last_synced_at  timestamptz,
  created_at      timestamptz default now() not null,

  unique(user_id, handle)
);

comment on table public.x_accounts is 'Connected X/Twitter accounts per user';

-- ── Content Drafts ───────────────────────────────────────────────────────────
create type public.draft_status as enum ('draft', 'scheduled', 'published', 'failed');

create table if not exists public.content_drafts (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  account_id   uuid references public.x_accounts(id) on delete set null,
  content      text not null check (char_length(content) <= 280),
  hashtags     text[] default '{}' not null,
  tone         text not null default 'manual',
  is_thread    boolean default false not null,
  thread_parts text[],
  status       draft_status default 'draft' not null,
  scheduled_at timestamptz,
  published_at timestamptz,
  created_at   timestamptz default now() not null
);

comment on table public.content_drafts is 'Content drafts and scheduled posts';

-- Index for common queries
create index if not exists idx_content_drafts_user_status
  on public.content_drafts(user_id, status);

create index if not exists idx_content_drafts_scheduled
  on public.content_drafts(scheduled_at)
  where status = 'scheduled';

-- ── Analytics Snapshots ───────────────────────────────────────────────────────
create table if not exists public.analytics_snapshots (
  id               uuid primary key default uuid_generate_v4(),
  account_id       uuid not null references public.x_accounts(id) on delete cascade,
  date             date not null,
  followers_count  integer not null default 0,
  followers_delta  integer not null default 0,
  impressions      integer not null default 0,
  engagements      integer not null default 0,
  engagement_rate  numeric(6,4) not null default 0,
  profile_visits   integer not null default 0,
  created_at       timestamptz default now() not null,

  unique(account_id, date)
);

comment on table public.analytics_snapshots is 'Daily analytics snapshots per account';

create index if not exists idx_analytics_account_date
  on public.analytics_snapshots(account_id, date desc);

-- ── Generation Logs ───────────────────────────────────────────────────────────
create type public.generation_type as enum ('content', 'reply');

create table if not exists public.generation_logs (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  type          generation_type not null,
  input_tokens  integer default 0 not null,
  output_tokens integer default 0 not null,
  created_at    timestamptz default now() not null
);

comment on table public.generation_logs is 'Audit log for AI content generation';

create index if not exists idx_gen_logs_user_created
  on public.generation_logs(user_id, created_at desc);

-- ── Row-Level Security ────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.x_accounts enable row level security;
alter table public.content_drafts enable row level security;
alter table public.analytics_snapshots enable row level security;
alter table public.generation_logs enable row level security;

-- Profiles: users see only their own
create policy "profiles: own access" on public.profiles
  for all using (auth.uid() = id);

-- X Accounts: users see only their own
create policy "x_accounts: own access" on public.x_accounts
  for all using (auth.uid() = user_id);

-- Content Drafts: users see only their own
create policy "content_drafts: own access" on public.content_drafts
  for all using (auth.uid() = user_id);

-- Analytics: users see only their own accounts' data
create policy "analytics_snapshots: own access" on public.analytics_snapshots
  for all using (
    exists (
      select 1 from public.x_accounts a
      where a.id = analytics_snapshots.account_id
        and a.user_id = auth.uid()
    )
  );

-- Generation logs: users see only their own
create policy "generation_logs: own access" on public.generation_logs
  for all using (auth.uid() = user_id);

-- ── Helper functions ──────────────────────────────────────────────────────────

-- Count AI generations in current calendar month
create or replace function public.monthly_generation_count(p_user_id uuid, p_type generation_type)
returns bigint language sql security definer set search_path = public as $$
  select count(*) from public.generation_logs
  where user_id = p_user_id
    and type = p_type
    and created_at >= date_trunc('month', now());
$$;

-- Check if user is within monthly AI limit
create or replace function public.can_generate(p_user_id uuid, p_type generation_type, p_limit int default 100)
returns boolean language sql security definer set search_path = public as $$
  select public.monthly_generation_count(p_user_id, p_type) < p_limit;
$$;
