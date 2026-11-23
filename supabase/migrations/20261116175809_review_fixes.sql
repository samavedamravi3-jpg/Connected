-- Phase 6: fixes from the security review. Idempotent: safe to run again. Mirrored in supabase/schema.sql.
-- Run AFTER 20261116120000_mandatory_id_gate.sql, 20261116180000_moderation_write_path.sql and
-- 20261116200000_nearby_recommendations.sql. Re-running any of those afterwards no longer regresses this one (their
-- superseded sections are guarded). Checks: supabase/tests/review_fixes.sql (and the other tests, updated).
--
-- 1) Rate, limit and log tables are server-only: no client grants (alert_rate was client-writable, so DELETE reset
--    the 12/min alert limit). Least-privilege table grants elsewhere (no client UPDATE/DELETE the app never uses).
-- 2) set_my_area: security definer, 30 position changes an hour (refreshing the same rounded spot is free), and a
--    move of more than 25 miles within 10 minutes of the last check-in is refused. Only set_my_area refreshes presence
--    (area_seen_at); the app can't write the area columns directly any more.
-- 3) profiles: column-level SELECT for the app (no area_seen_at, hidden, timestamps, badge details, goals and other
--    private preferences); your own full row through my_profile(). nearby_profiles returns only those columns, clamps
--    the radius to 25 miles and is rate limited.
-- 4) Report auto-hide (profiles and events) counts only reporters who are real members. Every report is still stored.
-- 5) Option columns (status, field, from_field, mode, meet_mode, share_mode, goals, challenges, want_traits, foods, diet,
--    availability) take only the app's ids, and all chips together are capped (check constraints).
-- 6) profile_write_rate(uid, kind): atomic per-user limits for the profile-write function (service role only);
--    rate_check is serialised per user and kind (no parallel bypass); moderation_events capped per user an hour.
-- 7) is_blocked / has_connection answer only for the caller's own pairs; no SECURITY DEFINER function is executable by
--    anon or PUBLIC, and trigger functions by nobody.

-- 1) Server-only tables ----------------------------------------------------------------------------------------------
drop policy if exists alert_rate_own on public.alert_rate;
revoke all on public.alert_rate, public.rate_log, public.audit_log, public.account_signals, public.moderation_events, public.app_config
  from anon, authenticated;
revoke select, update, delete on public.reports from anon, authenticated; -- file a report (insert) only
revoke update on public.blocks, public.mutes from anon, authenticated;
revoke update, delete on public.messages from anon, authenticated;
revoke delete on public.connection_requests from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated; -- only server-only tables use sequences

-- 6a) Rate limiting core: one locked check per user and kind, so parallel requests can't all pass the count.
-- Brand-new (under 24 h) or unverified accounts (no email check and not a real member) get the stricter limit.
create or replace function public.rate_check_uid(p_uid uuid, p_kind text, p_limit_strict int, p_limit int, p_window interval)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  is_strict boolean;
  n int;
begin
  if p_uid is null or p_kind is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('rate:' || p_uid::text || ':' || p_kind, 0));
  is_strict := coalesce((select u.created_at > now() - interval '24 hours' from auth.users u where u.id = p_uid), true)
            or not (coalesce((select p.verified from public.profiles p where p.id = p_uid), false) or public.is_real_member(p_uid));
  select count(*) into n from public.rate_log where user_id = p_uid and kind = p_kind and at > now() - p_window;
  if n >= (case when is_strict then p_limit_strict else p_limit end) then return false; end if;
  insert into public.rate_log (user_id, kind) values (p_uid, p_kind);
  delete from public.rate_log where user_id = p_uid and at < now() - interval '2 days';
  return true;
end;
$$;

create or replace function public.rate_check(p_kind text, p_limit_strict int, p_limit int, p_window interval)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then return; end if; -- service role / SQL editor are not limited here
  if not public.rate_check_uid(auth.uid(), p_kind, p_limit_strict, p_limit, p_window) then
    raise exception 'rate_limited: slow down and try again later' using errcode = '54000';
  end if;
end;
$$;

-- 6b) The profile-write function's limits (it runs as the service role, so auth.uid() is null and rate_check skips).
-- 'write' counts every request, first; 'ai' counts requests that need the AI review (lower for new/unverified accounts).
create or replace function public.profile_write_rate(p_uid uuid, p_kind text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_kind = 'write' then return public.rate_check_uid(p_uid, 'profile_write', 120, 120, interval '1 hour'); end if;
  if p_kind = 'ai' then return public.rate_check_uid(p_uid, 'profile_ai', 10, 30, interval '1 hour'); end if;
  raise exception 'unknown limit kind' using errcode = '22023';
end;
$$;
revoke all on function public.rate_check_uid(uuid, text, int, int, interval), public.profile_write_rate(uuid, text) from public, anon, authenticated;
grant execute on function public.profile_write_rate(uuid, text) to service_role;

-- 6c) Decision log: at most 200 rows per user an hour (extra rows are dropped; the writes themselves are limited above).
create or replace function public.moderation_events_cap()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('modlog:' || new.user_id::text, 0));
  if (select count(*) from public.moderation_events e where e.user_id = new.user_id and e.at > now() - interval '1 hour') >= 200 then
    return null;
  end if;
  return new;
end;
$$;
drop trigger if exists moderation_events_cap on public.moderation_events;
create trigger moderation_events_cap before insert on public.moderation_events for each row execute function public.moderation_events_cap();

-- 2) Area: check-ins, presence and the definer set_my_area --------------------------------------------------------
-- Last position each user reported through set_my_area (rounded). Private: definer functions only.
create table if not exists public.area_checkins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  at timestamptz not null default now()
);
alter table public.area_checkins enable row level security;
revoke all on public.area_checkins from anon, authenticated;

-- Coarse location, and presence (area_seen_at) only from set_my_area: any other change of position (profile-write)
-- clears it, so alerts never measure from a point set_my_area didn't check.
create or replace function public.profiles_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.share_mode = 'public' then
    new.area_lat := null;
    new.area_lng := null;
  else
    new.area_lat := round(new.area_lat::numeric, 2)::double precision;
    new.area_lng := round(new.area_lng::numeric, 2)::double precision;
  end if;
  if tg_op = 'INSERT' then
    new.area_seen_at := null;
  elsif coalesce(current_setting('app.area_write', true), '') <> '1' then
    new.area_seen_at := case when (new.area_lat, new.area_lng) is not distinct from (old.area_lat, old.area_lng) then old.area_seen_at end;
  end if;
  if new.share_mode = 'public' or not new.discoverable then
    new.area_seen_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.set_my_area(lat double precision, lng double precision)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  rlat double precision;
  rlng double precision;
  prev public.area_checkins;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180 then
    raise exception 'invalid coordinates' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = uid and p.share_mode = 'area' and p.discoverable) then return; end if;
  rlat := round(lat::numeric, 2)::double precision;
  rlng := round(lng::numeric, 2)::double precision;
  perform pg_advisory_xact_lock(hashtextextended('area:' || uid::text, 0));
  select * into prev from public.area_checkins c where c.user_id = uid;
  if prev.user_id is null or (prev.lat, prev.lng) is distinct from (rlat, rlng) then
    -- 25 miles in 10 minutes is 150 mph: faster than anyone moves across a city.
    if prev.at > now() - interval '10 minutes' and extensions.st_distance(
         extensions.st_setsrid(extensions.st_makepoint(prev.lng, prev.lat), 4326)::extensions.geography,
         extensions.st_setsrid(extensions.st_makepoint(rlng, rlat), 4326)::extensions.geography) > 25 * 1609.344 then
      raise exception 'implausible_move: that position is too far from your last one' using errcode = '22023';
    end if;
    perform public.rate_check('area_move', 30, 30, interval '1 hour');
  end if;
  insert into public.area_checkins as c (user_id, lat, lng, at) values (uid, rlat, rlng, now())
  on conflict (user_id) do update set lat = excluded.lat, lng = excluded.lng, at = excluded.at;
  perform set_config('app.area_write', '1', true);
  update public.profiles set area_lat = rlat, area_lng = rlng, area_seen_at = now() where id = uid;
  perform set_config('app.area_write', '', true);
end;
$$;
revoke all on function public.set_my_area(double precision, double precision) from public, anon;
grant execute on function public.set_my_area(double precision, double precision) to authenticated;

-- 4) Report auto-hide: only real members' reports count toward the three-person threshold. -------------------------
create or replace function public.reports_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.audit_log (actor, action, subject, detail)
    values (new.reporter, 'report', new.subject_kind || ':' || new.subject_id, jsonb_build_object('reason', new.reason));
  select count(distinct r.reporter) into n from public.reports r
   where r.subject_kind = new.subject_kind and r.subject_id = new.subject_id and public.is_real_member(r.reporter);
  if n >= 3 and new.subject_kind = 'profile' then
    update public.profiles set hidden = true where id::text = new.subject_id and not hidden;
    if found then
      insert into public.audit_log (action, subject, detail) values ('auto_hide', 'profile:' || new.subject_id, jsonb_build_object('reporters', n));
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.hidden_event_ids()
returns setof text language sql stable security definer set search_path = '' as $$
  select r.subject_id from public.reports r where r.subject_kind = 'event'
  group by r.subject_id having count(distinct r.reporter) filter (where public.is_real_member(r.reporter)) >= 3;
$$;
revoke all on function public.hidden_event_ids() from public, anon;
grant execute on function public.hidden_event_ids() to authenticated;

-- 7) Block and connection helpers: only about the caller's own pairs (every policy passes auth.uid() as one side). -----
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.uid()) in (a, b), false) and exists (
    select 1 from public.blocks
    where (blocker = a and blocked = b) or (blocker = b and blocked = a)
  );
$$;

create or replace function public.has_connection(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.uid()) in (a, b), false) and exists (
    select 1 from public.connection_requests
    where (from_user = a and to_user = b) or (from_user = b and to_user = a)
  );
$$;
revoke all on function public.is_blocked(uuid, uuid), public.has_connection(uuid, uuid), public.is_participant(uuid) from public, anon;
grant execute on function public.is_blocked(uuid, uuid), public.has_connection(uuid, uuid), public.is_participant(uuid) to authenticated;

-- 5) Option ids and chip size. Added NOT VALID, then validated when existing rows allow it; a legacy row that breaks
-- one leaves that constraint NOT VALID (new writes are still checked) and a notice. See docs/moderation.md.
alter table public.profiles drop constraint if exists profiles_status_ok;
alter table public.profiles add constraint profiles_status_ok check (status is null or status in ('student', 'early', 'experienced', 'changing', 'between')) not valid;
alter table public.profiles drop constraint if exists profiles_field_ok;
alter table public.profiles add constraint profiles_field_ok check (field is null or field in ('finance', 'tech', 'health', 'energy', 'design', 'public', 'education')) not valid;
alter table public.profiles drop constraint if exists profiles_from_field_ok;
alter table public.profiles add constraint profiles_from_field_ok check (from_field is null or from_field in ('finance', 'tech', 'health', 'energy', 'design', 'public', 'education')) not valid;
alter table public.profiles drop constraint if exists profiles_mode_ok;
alter table public.profiles add constraint profiles_mode_ok check (mode in ('seeking', 'offering', 'both')) not valid;
alter table public.profiles drop constraint if exists profiles_meet_mode_ok;
alter table public.profiles add constraint profiles_meet_mode_ok check (meet_mode in ('inperson', 'video', 'either')) not valid;
alter table public.profiles drop constraint if exists profiles_share_mode_ok;
alter table public.profiles add constraint profiles_share_mode_ok check (share_mode in ('area', 'public')) not valid;
alter table public.profiles drop constraint if exists profiles_goals_ok;
alter table public.profiles add constraint profiles_goals_ok check (goals <@ array['mentorship', 'advice', 'peers', 'collab', 'recruiting', 'other']) not valid;
alter table public.profiles drop constraint if exists profiles_challenges_ok;
alter table public.profiles add constraint profiles_challenges_ok check (challenges <@ array['start', 'network', 'interviews', 'resume', 'credentials', 'switching', 'hiring', 'skills', 'team']) not valid;
alter table public.profiles drop constraint if exists profiles_want_traits_ok;
alter table public.profiles add constraint profiles_want_traits_ok check (want_traits <@ array['firstgen', 'immigrant', 'switcher', 'senior', 'near', 'hiring']) not valid;
alter table public.profiles drop constraint if exists profiles_foods_ok;
alter table public.profiles add constraint profiles_foods_ok check (foods <@ array['coffee', 'tea', 'bakery', 'mediterranean', 'mexican', 'indian', 'japanese', 'chinese', 'thai', 'italian', 'american', 'caribbean']) not valid;
alter table public.profiles drop constraint if exists profiles_diet_ok;
alter table public.profiles add constraint profiles_diet_ok check (diet <@ array['vegetarian', 'vegan', 'halal', 'kosher', 'gluten_free', 'no_alcohol']) not valid;
alter table public.profiles drop constraint if exists profiles_availability_ok;
alter table public.profiles add constraint profiles_availability_ok check (availability <@ array['today', 'week', 'evenings', 'weekends']) not valid;
alter table public.profiles drop constraint if exists profiles_chips_len;
alter table public.profiles add constraint profiles_chips_len check (
  greatest(cardinality(interests), cardinality(skills), cardinality(languages), cardinality(goals), cardinality(challenges),
           cardinality(want_traits), cardinality(foods), cardinality(diet), cardinality(availability)) <= 30
  and char_length(array_to_string(interests || skills || languages || goals || challenges || want_traits || foods || diet || availability, '')) <= 3000
) not valid;
do $$
declare c text;
begin
  foreach c in array array['profiles_status_ok', 'profiles_field_ok', 'profiles_from_field_ok', 'profiles_mode_ok', 'profiles_meet_mode_ok',
    'profiles_share_mode_ok', 'profiles_goals_ok', 'profiles_challenges_ok', 'profiles_want_traits_ok', 'profiles_foods_ok', 'profiles_diet_ok',
    'profiles_availability_ok', 'profiles_chips_len'] loop
    begin
      execute format('alter table public.profiles validate constraint %I', c);
    exception when check_violation then
      raise notice '% stays NOT VALID: existing rows break it (new writes are checked). See docs/moderation.md.', c;
    end;
  end loop;
end $$;

-- 3) Profiles: what the app may read, and how --------------------------------------------------------------------
-- Your whole own row (including hidden, presence and badge details).
create or replace function public.my_profile()
returns setof public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.profiles p where p.id = (select auth.uid());
$$;
revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- People near a point: the same columns the app may read, radius clamped to 25 miles, rate limited. Runs as the
-- caller, so profiles RLS applies (real members only, blocks, hidden, discoverable). The map pans anywhere, so the
-- origin is free; the positions it returns are the same rounded areas any member can read (docs/nearby-alerts.md).
create or replace function public.nearby_profiles_rate()
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.rate_check('nearby', 200, 200, interval '1 hour'); -- the map refreshes every 45 s (80 an hour)
end;
$$;
revoke all on function public.nearby_profiles_rate() from public, anon;
grant execute on function public.nearby_profiles_rate() to authenticated;

drop function if exists public.nearby_profiles(double precision, double precision, double precision);
create function public.nearby_profiles(lat double precision, lng double precision, radius_mi double precision default 25)
returns table (
  id uuid, first_name text, last_name text, status text, org text, intro text, offer text, field text, mode text,
  interests text[], skills text[], languages text[], foods text[], diet text[], availability text[], meet_mode text,
  discoverable boolean, area_name text, area_lat double precision, area_lng double precision, verified boolean, id_verified boolean
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare r double precision := least(greatest(coalesce(radius_mi, 25), 0), 25);
begin
  if lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180 then
    raise exception 'invalid coordinates' using errcode = '22023';
  end if;
  perform public.nearby_profiles_rate();
  return query
  select p.id, p.first_name, p.last_name, p.status, p.org, p.intro, p.offer, p.field, p.mode,
         p.interests, p.skills, p.languages, p.foods, p.diet, p.availability, p.meet_mode,
         p.discoverable, p.area_name, p.area_lat, p.area_lng, p.verified, p.id_verified
  from public.profiles p
  where p.id <> (select auth.uid())
    and p.discoverable
    and p.area_lat is not null
    and p.area_lat between lat - r / 69.0 and lat + r / 69.0
    and 3958.8 * 2 * asin(sqrt(
          power(sin(radians(p.area_lat - lat) / 2), 2) +
          cos(radians(lat)) * cos(radians(p.area_lat)) * power(sin(radians(p.area_lng - lng) / 2), 2)
        )) <= r
  limit 300;
end;
$$;
revoke all on function public.nearby_profiles(double precision, double precision, double precision) from public, anon;
grant execute on function public.nearby_profiles(double precision, double precision, double precision) to authenticated;

-- Column-level grants (keep in sync with PUBLIC_PROFILE_COLUMNS in src/lib/backend.ts; show_experience is here only
-- because the experiences read policy checks it as the caller). Not readable by the app: area_seen_at, hidden,
-- created_at, updated_at, verified_at, verified_kind, id_verified_at, from_field, goals, challenges, want_traits,
-- share_mode (your own: my_profile()). No direct client writes at all: profile-write (service role) writes text,
-- set_my_area (definer) writes the position.
revoke select, insert, update, delete on public.profiles from anon, authenticated;
grant select (id, first_name, last_name, status, org, intro, offer, field, mode, interests, skills, languages, foods, diet,
              availability, meet_mode, discoverable, show_experience, area_name, area_lat, area_lng, verified, id_verified)
  on public.profiles to authenticated;

-- 7b) No SECURITY DEFINER function in public is executable by PUBLIC or anon; trigger functions by no client role.
-- Client-callable ones are granted to authenticated explicitly (above and in the earlier migrations).
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.prorettype = 'trigger'::regtype as trg
           from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef loop
    execute format('revoke all on function %s from public, anon', f.sig);
    if f.trg then execute format('revoke all on function %s from authenticated', f.sig); end if;
  end loop;
end $$;
