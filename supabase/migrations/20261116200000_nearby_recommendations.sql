-- Phase 5: nearby "You should connect" recommendations. Idempotent: safe to run again. Mirrored in supabase/schema.sql.
-- Run AFTER 20261116120000_mandatory_id_gate.sql and 20261116180000_moderation_write_path.sql. Re-running the ID-gate
-- migration afterwards re-creates the old alert_candidates(lat, lng, radius_mi); run this one again if you do.
-- Checks: supabase/tests/nearby.sql (and id_gate.sql, which now calls the new signature).
--
-- 1) nearby_alert_prefs: per-user proximity alert settings (on/off, radius, cooldown). Separate from the map's search
--    radius. Owner can read; writes only through set_nearby_alert_prefs(), which validates every value.
-- 2) alert_candidates() takes NO coordinates: the origin is always the caller's own stored coarse area (set_my_area,
--    rounded to 0.01 degrees, fresh within 30 minutes). The old (lat, lng, radius_mi) signature is dropped, so a client
--    can't ask "who is near this point". Radius comes from the caller's saved prefs.
-- 3) A candidate needs a meaningful reason: a shared interest/skill from the public profile chips (normalised like the
--    app's labelKey, generic social labels such as "coffee" ignored) or a complementary intent (you want mentorship or
--    advice and they offer help, or the other way round). Experience entries are never read, whatever show_experience
--    says. Returns only id, first name + last initial, a distance bucket and the shared labels / intent keys.

-- 1) Settings -------------------------------------------------------------------------------------------------------
create table if not exists public.nearby_alert_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  alerts_enabled boolean not null default false,
  alert_radius_mi numeric(4, 2) not null default 1,
  cooldown_hours int not null default 24,
  updated_at timestamptz not null default now(),
  constraint nearby_alert_prefs_radius check (alert_radius_mi in (0.25, 0.5, 1, 2, 5)),
  constraint nearby_alert_prefs_cooldown check (cooldown_hours between 1 and 168)
);
alter table public.nearby_alert_prefs enable row level security;
drop policy if exists "nearby_alert_prefs: read own" on public.nearby_alert_prefs;
create policy "nearby_alert_prefs: read own" on public.nearby_alert_prefs for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.nearby_alert_prefs from anon, authenticated;
grant select on public.nearby_alert_prefs to authenticated;

create or replace function public.set_nearby_alert_prefs(p_enabled boolean, p_radius_mi numeric default 1, p_cooldown_hours int default 24)
returns public.nearby_alert_prefs
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.nearby_alert_prefs;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_enabled is null then raise exception 'invalid alerts setting' using errcode = '22023'; end if;
  if p_radius_mi is null or p_radius_mi not in (0.25, 0.5, 1, 2, 5) then raise exception 'invalid alert radius' using errcode = '22023'; end if;
  if p_cooldown_hours is null or p_cooldown_hours not between 1 and 168 then raise exception 'invalid cooldown' using errcode = '22023'; end if;
  perform public.rate_check('nearby_prefs', 60, 60, interval '1 hour');
  insert into public.nearby_alert_prefs as n (user_id, alerts_enabled, alert_radius_mi, cooldown_hours, updated_at)
  values (uid, p_enabled, p_radius_mi, p_cooldown_hours, now())
  on conflict (user_id) do update set
    alerts_enabled = excluded.alerts_enabled, alert_radius_mi = excluded.alert_radius_mi,
    cooldown_hours = excluded.cooldown_hours, updated_at = now()
  returning n.* into r;
  return r;
end;
$$;
revoke all on function public.set_nearby_alert_prefs(boolean, numeric, int) from public, anon;
grant execute on function public.set_nearby_alert_prefs(boolean, numeric, int) to authenticated;

-- 2) Matching helpers (pure) -------------------------------------------------------------------------------------------
-- Same comparison key as src/lib/lists.ts labelKey: NFKC, trimmed, single spaces, lower case.
create or replace function public.label_key(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(regexp_replace(normalize(coalesce(t, ''), NFKC), '\s+', ' ', 'g')));
$$;

-- Generic social labels never justify a professional recommendation on their own.
create or replace function public.nearby_label_meaningful(k text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select k <> '' and k <> all (array[
    'coffee', 'tea', 'lunch', 'dinner', 'breakfast', 'brunch', 'drinks', 'food', 'beer', 'wine', 'chat', 'chatting',
    'hanging out', 'meeting up', 'meetups', 'networking', 'socializing', 'friends', 'making friends', 'walks']);
$$;

-- Labels both people list, in the viewer's spelling and order, deduped by label_key, at most 5.
create or replace function public.nearby_shared_labels(mine text[], theirs text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce((array_agg(s.label order by s.ord))[1:5], '{}')
  from (
    select distinct on (public.label_key(m.label)) btrim(regexp_replace(m.label, '\s+', ' ', 'g')) as label, m.ord
    from unnest(coalesce(mine, '{}')) with ordinality as m(label, ord)
    where public.nearby_label_meaningful(public.label_key(m.label))
      and exists (select 1 from unnest(coalesce(theirs, '{}')) as t(x) where public.label_key(t.x) = public.label_key(m.label))
    order by public.label_key(m.label), m.ord
  ) s;
$$;

-- Complementary intents from goals and mode ("offering"/"both" = open to help others, as rowToPerson maps it).
-- Keys are from the candidate's side: they_offer_* = they can help with what you want; they_seek_* = you can help them.
create or replace function public.nearby_shared_intents(my_goals text[], my_mode text, their_goals text[], their_mode text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array_remove(array[
    case when 'mentorship' = any(coalesce(my_goals, '{}')) and their_mode in ('offering', 'both') then 'they_offer_mentorship' end,
    case when 'advice' = any(coalesce(my_goals, '{}')) and their_mode in ('offering', 'both') then 'they_offer_advice' end,
    case when 'mentorship' = any(coalesce(their_goals, '{}')) and my_mode in ('offering', 'both') then 'they_seek_mentorship' end,
    case when 'advice' = any(coalesce(their_goals, '{}')) and my_mode in ('offering', 'both') then 'they_seek_advice' end
  ], null);
$$;
revoke all on function public.label_key(text), public.nearby_label_meaningful(text), public.nearby_shared_labels(text[], text[]),
  public.nearby_shared_intents(text[], text, text[], text) from public, anon;

-- 3) Candidates ------------------------------------------------------------------------------------------------------
drop function if exists public.alert_candidates(double precision, double precision, double precision);
create or replace function public.alert_candidates()
returns table (id uuid, name text, distance_bucket_mi numeric, shared_labels text[], shared_intents text[])
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n int;
  radius numeric;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if not public.is_real_member(uid) then return; end if; -- non-members get an empty list
  -- Max 12 calls a minute per user (same counter as before).
  insert into public.alert_rate as r (user_id, window_start, calls) values (uid, now(), 1)
  on conflict (user_id) do update set
    window_start = case when r.window_start < now() - interval '1 minute' then now() else r.window_start end,
    calls = case when r.window_start < now() - interval '1 minute' then 1 else r.calls + 1 end
  returning r.calls into n;
  if n > 12 then raise exception 'rate limit exceeded' using errcode = '54000'; end if;
  -- Opt-in: no saved prefs or alerts off means nothing.
  select ap.alert_radius_mi into radius from public.nearby_alert_prefs ap where ap.user_id = uid and ap.alerts_enabled;
  if radius is null then return; end if;

  return query
  with me as (
    select p.id, p.field, p.interests, p.skills, p.goals, p.mode,
           extensions.st_setsrid(extensions.st_makepoint(p.area_lng, p.area_lat), 4326)::extensions.geography as g
    from public.profiles p
    where p.id = uid and not p.hidden and p.discoverable and p.share_mode = 'area' and p.field is not null
      and p.area_lat is not null and p.area_lng is not null and p.area_seen_at > now() - interval '30 minutes'
  ), c as (
    select p.id,
           trim(p.first_name || ' ' || left(p.last_name, 1) || case when p.last_name <> '' then '.' else '' end) as name,
           extensions.st_distance(extensions.st_setsrid(extensions.st_makepoint(p.area_lng, p.area_lat), 4326)::extensions.geography, me.g) / 1609.344 as d,
           public.nearby_shared_labels(me.interests || me.skills, p.interests || p.skills) as labels,
           public.nearby_shared_intents(me.goals, me.mode, p.goals, p.mode) as intents
    from me
    join public.profiles p on p.id <> me.id and p.field = me.field
    where public.is_real_member(p.id)
      and not p.hidden and p.discoverable and p.share_mode = 'area'
      and p.area_lat is not null and p.area_lng is not null and p.area_seen_at > now() - interval '30 minutes'
      and not public.is_blocked(uid, p.id)
      and not exists (select 1 from public.mutes mu where (mu.muter = uid and mu.muted = p.id) or (mu.muter = p.id and mu.muted = uid))
      and extensions.st_dwithin(extensions.st_setsrid(extensions.st_makepoint(p.area_lng, p.area_lat), 4326)::extensions.geography, me.g, radius * 1609.344)
  )
  select c.id, c.name,
         -- Positions are rounded to 0.01 degrees (about 0.7 mi), so finer buckets would be false precision.
         (case when c.d <= 0.5 then 0.5 when c.d <= 1 then 1 when c.d <= 2 then 2 else 5 end)::numeric,
         c.labels, c.intents
  from c
  where cardinality(c.labels) > 0 or cardinality(c.intents) > 0
  order by cardinality(c.labels) * 2 + cardinality(c.intents) * 3 desc, c.d, c.id
  limit 20;
end;
$$;
revoke all on function public.alert_candidates() from public, anon;
grant execute on function public.alert_candidates() to authenticated;
