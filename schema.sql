-- SENTRY account storage. Run in a NEW Supabase project's SQL Editor.
-- Safe to run again: no reagent data is deleted.
begin;
create table if not exists public.sentry_reagents (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 128),
  data jsonb not null check (jsonb_typeof(data) = 'object' and data ? 'id' and data ->> 'id' = id),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists public.sentry_sensor_latest (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reagent_id text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  received_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, reagent_id),
  foreign key (user_id, reagent_id) references public.sentry_reagents(user_id, id) on delete cascade
);
create or replace function public.sentry_reagent_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.user_id <> old.user_id or new.id <> old.id then
    raise exception 'Reagent ownership and ID cannot be changed';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.sentry_reagent_version() from public, anon, authenticated;
drop trigger if exists sentry_reagent_version on public.sentry_reagents;
create trigger sentry_reagent_version before update on public.sentry_reagents
for each row execute function public.sentry_reagent_version();
alter table public.sentry_reagents enable row level security;
alter table public.sentry_sensor_latest enable row level security;
revoke all on public.sentry_reagents, public.sentry_sensor_latest from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.sentry_reagents, public.sentry_sensor_latest to authenticated;
drop policy if exists sentry_reagents_select on public.sentry_reagents;
drop policy if exists sentry_reagents_insert on public.sentry_reagents;
drop policy if exists sentry_reagents_update on public.sentry_reagents;
drop policy if exists sentry_reagents_delete on public.sentry_reagents;
create policy sentry_reagents_select on public.sentry_reagents for select to authenticated using ((select auth.uid()) = user_id);
create policy sentry_reagents_insert on public.sentry_reagents for insert to authenticated with check ((select auth.uid()) = user_id);
create policy sentry_reagents_update on public.sentry_reagents for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy sentry_reagents_delete on public.sentry_reagents for delete to authenticated using ((select auth.uid()) = user_id);
drop policy if exists sentry_sensor_select on public.sentry_sensor_latest;
drop policy if exists sentry_sensor_insert on public.sentry_sensor_latest;
drop policy if exists sentry_sensor_update on public.sentry_sensor_latest;
drop policy if exists sentry_sensor_delete on public.sentry_sensor_latest;
create policy sentry_sensor_select on public.sentry_sensor_latest for select to authenticated using ((select auth.uid()) = user_id);
create policy sentry_sensor_insert on public.sentry_sensor_latest for insert to authenticated with check ((select auth.uid()) = user_id);
create policy sentry_sensor_update on public.sentry_sensor_latest for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy sentry_sensor_delete on public.sentry_sensor_latest for delete to authenticated using ((select auth.uid()) = user_id);
commit;
