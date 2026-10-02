create table if not exists public.planner_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb
);

alter table public.planner_data enable row level security;

revoke all on table public.planner_data from anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update on table public.planner_data to authenticated;

drop policy if exists "Users read their own planner" on public.planner_data;
create policy "Users read their own planner"
  on public.planner_data for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users create their own planner" on public.planner_data;
create policy "Users create their own planner"
  on public.planner_data for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own planner" on public.planner_data;
create policy "Users update their own planner"
  on public.planner_data for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists public.username_accounts (
  username text primary key check (username ~ '^[a-z0-9_]{3,24}$'),
  user_id uuid not null unique references auth.users (id) on delete cascade
);

alter table public.username_accounts enable row level security;
revoke all on table public.username_accounts from public, anon, authenticated;
grant usage on schema public to service_role;
grant all on table public.username_accounts to service_role;
