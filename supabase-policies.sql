-- Supabase RLS migration for life-tracker + athlete apps (glebv-dot)
-- Run in the Supabase SQL editor (project vgurpottnlcixzjmatlz).
--
-- What it does:
--  * Creates private.app_config with an optional sync_secret (NULL = everything
--    behaves exactly as today).
--  * Replaces the wide-open anon RLS policies with policies gated on
--    private.sync_ok(): allowed while sync_secret is NULL, and once you set a
--    secret, only clients sending the matching `x-app-secret` header get access.
--    (Both apps already send that header from localStorage key `lt_sync_secret`.)
--  * Adds anon policies to athlete_day_data / athlete_globals — REQUIRED for the
--    athlete app's cross-device sync to work at all.
--  * Drops a duplicate unique constraint on life_tracker_data.
--
-- To lock down later (after both apps are deployed and you've entered the same
-- password once per device when prompted):
--   update private.app_config set sync_secret = 'YOUR-LONG-RANDOM-PASSWORD' where id = 1;

create schema if not exists private;

create table if not exists private.app_config (
  id int primary key default 1 check (id = 1),
  sync_secret text
);
insert into private.app_config (id, sync_secret) values (1, null)
on conflict (id) do nothing;

revoke all on private.app_config from anon, authenticated;

create or replace function private.sync_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select c.sync_secret is null
         or c.sync_secret = ((current_setting('request.headers', true))::json ->> 'x-app-secret')
       from private.app_config c
      where c.id = 1),
    true);
$$;

grant usage on schema private to anon, authenticated;
grant execute on function private.sync_ok() to anon, authenticated;

-- life_tracker_data: replace blanket anon access with gated access
drop policy if exists "Allow anon full access" on public.life_tracker_data;
create policy "anon gated access" on public.life_tracker_data
  for all to anon using (private.sync_ok()) with check (private.sync_ok());

-- athlete tables: add gated anon access (previously authenticated-only,
-- which silently blocked the app's anon-key sync entirely)
create policy "anon gated access" on public.athlete_day_data
  for all to anon using (private.sync_ok()) with check (private.sync_ok());
create policy "anon gated access" on public.athlete_globals
  for all to anon using (private.sync_ok()) with check (private.sync_ok());

-- habit_logs / receptor_logs / screen_time: same gate, same command coverage as before
drop policy if exists "anon insert" on public.habit_logs;
drop policy if exists "anon read" on public.habit_logs;
drop policy if exists "anon update" on public.habit_logs;
create policy "anon gated insert" on public.habit_logs for insert to public with check (private.sync_ok());
create policy "anon gated read" on public.habit_logs for select to public using (private.sync_ok());
create policy "anon gated update" on public.habit_logs for update to public using (private.sync_ok()) with check (private.sync_ok());

drop policy if exists "anon insert" on public.receptor_logs;
drop policy if exists "anon read" on public.receptor_logs;
drop policy if exists "anon delete" on public.receptor_logs;
create policy "anon gated insert" on public.receptor_logs for insert to public with check (private.sync_ok());
create policy "anon gated read" on public.receptor_logs for select to public using (private.sync_ok());
create policy "anon gated delete" on public.receptor_logs for delete to public using (private.sync_ok());

drop policy if exists "Allow anon insert" on public.screen_time;
drop policy if exists "Allow anon select" on public.screen_time;
drop policy if exists "Allow anon update" on public.screen_time;
create policy "anon gated insert" on public.screen_time for insert to anon with check (private.sync_ok());
create policy "anon gated select" on public.screen_time for select to anon using (private.sync_ok());
create policy "anon gated update" on public.screen_time for update to anon using (private.sync_ok()) with check (private.sync_ok());

-- drop redundant duplicate unique constraint
alter table public.life_tracker_data drop constraint if exists life_tracker_data_user_key_unique;

-- Athlete sync hardening (2026-07): least-privilege grants, efficient policies,
-- and a database-side last-write-wins guard for devices that reconnect late.
revoke all on public.athlete_day_data from anon, authenticated;
revoke all on public.athlete_globals from anon, authenticated;
grant select, insert, update on public.athlete_day_data to anon, authenticated;
grant select, insert, update on public.athlete_globals to anon, authenticated;

drop policy if exists "Users can access own data" on public.athlete_day_data;
drop policy if exists "anon gated access" on public.athlete_day_data;
create policy "authenticated athlete data" on public.athlete_day_data
  for all to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);
create policy "anon athlete data" on public.athlete_day_data
  for all to anon
  using ((select private.sync_ok()))
  with check ((select private.sync_ok()));

drop policy if exists "Users can access own data" on public.athlete_globals;
drop policy if exists "anon gated access" on public.athlete_globals;
create policy "authenticated athlete globals" on public.athlete_globals
  for all to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);
create policy "anon athlete globals" on public.athlete_globals
  for all to anon
  using ((select private.sync_ok()))
  with check ((select private.sync_ok()));

create or replace function private.keep_latest_athlete_sync()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.updated_at is not null
     and (new.updated_at is null or new.updated_at < old.updated_at) then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function private.keep_latest_athlete_sync() from public;

drop trigger if exists keep_latest_athlete_day on public.athlete_day_data;
create trigger keep_latest_athlete_day
before update on public.athlete_day_data
for each row execute function private.keep_latest_athlete_sync();

drop trigger if exists keep_latest_athlete_global on public.athlete_globals;
create trigger keep_latest_athlete_global
before update on public.athlete_globals
for each row execute function private.keep_latest_athlete_sync();
