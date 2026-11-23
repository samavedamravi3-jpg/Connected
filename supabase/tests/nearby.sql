-- Authorization and behaviour checks for nearby recommendations (supabase/migrations/20261116175110_nearby_recommendations.sql).
-- Run AFTER all migrations, as the postgres role:
--   SQL editor: paste the whole file and Run.   psql: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/nearby.sql
-- One transaction, rolled back: no data is kept. Any failed check stops the script with an error naming it; success
-- ends with the row 'nearby: all checks passed'.
--
-- Viewer V (finance, interests Fintech + Coffee, skill SQL, wants mentorship, mode seeking, alerts on, radius 1 mi).
-- Everyone sits on the same rounded area unless noted, field finance, real member, discoverable, sharing area, fresh.
--   K  Kayla Smith   " fintech " + Coffee, skill Excel, offers help        -> the one match: [Fintech] + they_offer_mentorship
--   W  wrong field (tech), Fintech                O  about 2.8 mi away, Fintech        T  stale area (2 h), Fintech
--   H  Fintech/SQL only in experience (show_experience false, then true)   B1/B2 blocked by / blocking V
--   M1/M2 muted by / muting V                     X  hidden (auto-hide)                N  not a real member
--   CF only "coffee" in common, same meet mode and availability            D  not discoverable   P  public places only
--   S  wants mentorship, nothing in common        -> appears only once V offers help (they_seek_mentorship)

begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
select u::uuid, 'authenticated', 'authenticated', 'nearby-' || right(u, 2) || '@example.invalid', now() - interval '3 days', now()
from unnest(array[
  '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000e3',
  '00000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000e6',
  '00000000-0000-4000-8000-0000000000e7', '00000000-0000-4000-8000-0000000000e8', '00000000-0000-4000-8000-0000000000e9',
  '00000000-0000-4000-8000-0000000000ea', '00000000-0000-4000-8000-0000000000eb', '00000000-0000-4000-8000-0000000000ec',
  '00000000-0000-4000-8000-0000000000ed', '00000000-0000-4000-8000-0000000000ee', '00000000-0000-4000-8000-0000000000ef',
  '00000000-0000-4000-8000-0000000000f1']) u;

insert into public.profiles (id, first_name, last_name, field, interests, skills, goals, mode, meet_mode, availability, discoverable, share_mode, area_lat, area_lng, id_verified, show_experience) values
  ('00000000-0000-4000-8000-0000000000e1', 'Vera',  'Viewer',  'finance', '{Fintech,Coffee}',          '{SQL}',   '{mentorship}', 'seeking',  'inperson', '{week}', true,  'area',   35.22, -80.84, true, false),
  ('00000000-0000-4000-8000-0000000000e2', 'Kayla', 'Smith',   'finance', '{" fintech ",Coffee}',      '{Excel}', '{}',           'offering', 'inperson', '{week}', true,  'area',   35.22, -80.84, true, true),
  ('00000000-0000-4000-8000-0000000000e3', 'Wes',   'Tech',    'tech',    '{Fintech}',                 '{}',      '{}',           'offering', 'either',   '{week}', true,  'area',   35.22, -80.84, true, true),
  ('00000000-0000-4000-8000-0000000000e4', 'Otto',  'Far',     'finance', '{Fintech}',                 '{}',      '{}',           'offering', 'either',   '{week}', true,  'area',   35.26, -80.84, true, true),
  ('00000000-0000-4000-8000-0000000000e5', 'Tia',   'Stale',   'finance', '{Fintech}',                 '{}',      '{}',           'offering', 'either',   '{week}', true,  'area',   35.22, -80.84, true, true),
  ('00000000-0000-4000-8000-0000000000e6', 'Hal',   'Exp',     'finance', '{Product}',                 '{}',      '{}',           'seeking',  'either',   '{week}', true,  'area',   35.22, -80.84, true, false),
  ('00000000-0000-4000-8000-0000000000e7', 'Bo',    'One',     'finance', '{Fintech}',                 '{}',      '{}',           'offering', 'either',   '{week}', true,  'area',   35.22, -80.84, true, true),
  ('00000000-0000-4000-8000-0000000000e8', 'Bea',   'Two',     'finance', '{Fintech}',                 '{}',      '{}',           'offering', 'either',   '{week}', true,  'area',   35.22, -80.84, true, true),
  ('00000000-0000-4000-8000-0000000000e9', 'Mo',    'One',     'finance', '{Fintech}',                 '{}',      '{}',           'offering', 'either',   '{week}', true,  'area',   35.22, -80.84, true, true),
  ('00000000-0000-4000-8000-0000000000ea', 'Mia',   'Two',     'finance', '{Fintech}',                 '{}',      '{}',           'offering', 'either',   '{week}', true,  'area',   35.22, -80.84, true, true),
  ('00000000-0000-4000-8000-0000000000eb', 'Xan',   'Hidden',  'finance', '{Fintech}',                 '{}',      '{}',           'offering', 'either',   '{week}', true,  'area',   35.22, -80.84, true, true),
  ('00000000-0000-4000-8000-0000000000ec', 'Nell',  'Guest',   'finance', '{Fintech}',                 '{}',      '{}',           'offering', 'either',   '{week}', true,  'area',   35.22, -80.84, false, true),
  ('00000000-0000-4000-8000-0000000000ed', 'Cora',  'Coffee',  'finance', '{coffee," COFFEE "}',       '{}',      '{}',           'seeking',  'inperson', '{week}', true,  'area',   35.22, -80.84, true, true),
  ('00000000-0000-4000-8000-0000000000ee', 'Dee',   'Quiet',   'finance', '{Fintech}',                 '{}',      '{}',           'offering', 'either',   '{week}', false, 'area',   35.22, -80.84, true, true),
  ('00000000-0000-4000-8000-0000000000ef', 'Pat',   'Public',  'finance', '{Fintech}',                 '{}',      '{}',           'offering', 'either',   '{week}', true,  'public', 35.22, -80.84, true, true),
  ('00000000-0000-4000-8000-0000000000f1', 'Sol',   'Seeker',  'finance', '{Product}',                 '{}',      '{mentorship}', 'seeking',  'either',   '{week}', true,  'area',   35.22, -80.84, true, true);

insert into public.id_verifications (user_id, provider, session_id, status, livemode)
select p.id, 'stripe', 'vs_live_' || right(p.id::text, 2), 'verified', true
from public.profiles p where p.id::text like '00000000-0000-4000-8000-0000000000%' and p.id_verified
  and p.id between '00000000-0000-4000-8000-0000000000e1' and '00000000-0000-4000-8000-0000000000f1';

-- Fresh positions, as set_my_area would write them; T is stale.
select set_config('app.area_write', '1', true);
update public.profiles set area_seen_at = now() - interval '1 minute'
 where id between '00000000-0000-4000-8000-0000000000e1' and '00000000-0000-4000-8000-0000000000f1';
update public.profiles set area_seen_at = now() - interval '2 hours' where id = '00000000-0000-4000-8000-0000000000e5';
update public.profiles set hidden = true where id = '00000000-0000-4000-8000-0000000000eb';
select set_config('app.area_write', '', true);

insert into public.experiences (user_id, title, org, start_month, skills) values
  ('00000000-0000-4000-8000-0000000000e6', 'Analyst', 'Fintech Co', '2020-01', '{Fintech,SQL}');
insert into public.blocks (blocker, blocked) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e7'),
  ('00000000-0000-4000-8000-0000000000e8', '00000000-0000-4000-8000-0000000000e1');
insert into public.mutes (muter, muted) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e9'),
  ('00000000-0000-4000-8000-0000000000ea', '00000000-0000-4000-8000-0000000000e1');
-- Someone else's prefs, to check V can't read them.
insert into public.nearby_alert_prefs (user_id, alerts_enabled, alert_radius_mi) values ('00000000-0000-4000-8000-0000000000e2', true, 5);

-- Static shape: no origin parameter, only the agreed columns, helpers behave like the app's labelKey.
do $$ begin
  assert to_regprocedure('public.alert_candidates(double precision,double precision,double precision)') is null, 'old (lat, lng, radius) signature must be gone';
  assert (select count(*) from pg_proc where proname = 'alert_candidates' and pronamespace = 'public'::regnamespace) = 1, 'exactly one alert_candidates';
  assert (select pronargs from pg_proc where proname = 'alert_candidates' and pronamespace = 'public'::regnamespace) = 0, 'alert_candidates takes no arguments';
  assert (select proargnames from pg_proc where proname = 'alert_candidates' and pronamespace = 'public'::regnamespace)
         = array['id', 'name', 'distance_bucket_mi', 'shared_labels', 'shared_intents'], 'alert_candidates returns only the agreed columns';
  assert (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where proname = 'alert_candidates' and pronamespace = 'public'::regnamespace), 'definer with empty search_path';
  assert not has_function_privilege('anon', 'public.alert_candidates()', 'execute'), 'anon must not call alert_candidates';
  assert not has_function_privilege('anon', 'public.set_nearby_alert_prefs(boolean, numeric, int)', 'execute'), 'anon must not call set_nearby_alert_prefs';
  assert public.label_key(E'  Ｆｉｎｔｅｃｈ \t ') = 'fintech', 'label_key: NFKC, trim, lower';
  assert public.label_key('Data   &  analytics') = 'data & analytics', 'label_key: single spaces';
  assert public.nearby_shared_labels('{Fintech,Coffee,SQL,fintech}', '{" FINTECH ",coffee}') = array['Fintech'], 'labels: deduped, coffee ignored';
  assert public.nearby_shared_labels('{Coffee}', '{coffee}') = '{}', 'coffee alone is not a reason';
  assert public.nearby_shared_intents('{mentorship}', 'seeking', '{}', 'seeking') = '{}', 'two seekers: no intent';
  assert public.nearby_shared_intents('{peers}', 'both', '{peers}', 'both') = '{}', 'peers is not a complementary intent';
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Viewer V
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);

-- Opt-in: no prefs row yet means nothing.
do $$ declare n int; begin
  select count(*) into n from public.alert_candidates();
  assert n = 0, format('alerts never switched on: %s rows (want 0)', n);
end $$;

-- Prefs: validated RPC only.
do $$ declare r public.nearby_alert_prefs; n int; begin
  begin perform public.set_nearby_alert_prefs(true, 3, 24); assert false, 'radius 3 must be refused'; exception when invalid_parameter_value then null; end;
  begin perform public.set_nearby_alert_prefs(true, 0, 24); assert false, 'radius 0 must be refused'; exception when invalid_parameter_value then null; end;
  begin perform public.set_nearby_alert_prefs(true, 1, 0); assert false, 'cooldown 0 must be refused'; exception when invalid_parameter_value then null; end;
  begin perform public.set_nearby_alert_prefs(true, 1, 169); assert false, 'cooldown 169 must be refused'; exception when invalid_parameter_value then null; end;
  begin perform public.set_nearby_alert_prefs(null, 1, 24); assert false, 'null enabled must be refused'; exception when invalid_parameter_value then null; end;
  begin insert into public.nearby_alert_prefs (user_id, alerts_enabled) values ('00000000-0000-4000-8000-0000000000e1', true); assert false, 'direct insert must fail';
  exception when insufficient_privilege then null; end;
  begin update public.nearby_alert_prefs set alert_radius_mi = 5; assert false, 'direct update must fail';
  exception when insufficient_privilege then null; end;
  r := public.set_nearby_alert_prefs(true);
  assert r.alerts_enabled and r.alert_radius_mi = 1 and r.cooldown_hours = 24, 'defaults: on, 1 mi, 24 h';
  select count(*) into n from public.nearby_alert_prefs;
  assert n = 1, format('V reads %s prefs rows (want only their own)', n);
end $$;

-- The one eligible match, and exactly what it says.
do $$ declare n int; r record; begin
  select count(*) into n from public.alert_candidates();
  assert n = 1, format('V gets %s candidates (want 1: Kayla)', n);
  select * into r from public.alert_candidates();
  assert r.id = '00000000-0000-4000-8000-0000000000e2', 'the match is Kayla';
  assert r.name = 'Kayla S.', format('name is first + last initial, got %s', r.name);
  assert r.distance_bucket_mi = 0.5, format('distance bucket %s (want 0.5)', r.distance_bucket_mi);
  assert r.shared_labels = array['Fintech'], format('labels %s (want only Fintech: no coffee, no unshared skills)', r.shared_labels);
  assert r.shared_intents = array['they_offer_mentorship'], format('intents %s', r.shared_intents);
end $$;

-- Everyone else stays out (each listed in the header).
do $$ declare bad text; begin
  select string_agg(name, ', ') into bad from public.alert_candidates() where id <> '00000000-0000-4000-8000-0000000000e2';
  assert bad is null, format('unexpected candidates: %s', bad);
end $$;

reset role;
delete from public.alert_rate;
-- H shows experience now: experience is still never used.
update public.profiles set show_experience = true where id = '00000000-0000-4000-8000-0000000000e6';
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.alert_candidates() where id = '00000000-0000-4000-8000-0000000000e6';
  assert n = 0, 'experience skills never justify a match';
end $$;

-- A wider radius (V's own setting) reaches O; back to 1 mi drops O again.
do $$ declare n int; begin
  perform public.set_nearby_alert_prefs(true, 5, 24);
  select count(*) into n from public.alert_candidates() where id = '00000000-0000-4000-8000-0000000000e4';
  assert n = 1, 'radius 5 includes O';
  perform public.set_nearby_alert_prefs(true, 1, 24);
  select count(*) into n from public.alert_candidates() where id = '00000000-0000-4000-8000-0000000000e4';
  assert n = 0, 'radius 1 excludes O';
end $$;

-- Client-supplied origin: the old signature is gone, so there is no way to pass one.
do $$ begin
  begin perform * from public.alert_candidates(35.26::float8, -80.84::float8, 5::float8); assert false, 'alert_candidates(lat, lng, radius) must not exist';
  exception when undefined_function then null; end;
end $$;

-- Complementary intent without a shared label: once V offers help, S (wants mentorship) appears with no labels.
reset role;
delete from public.alert_rate;
update public.profiles set mode = 'both' where id = '00000000-0000-4000-8000-0000000000e1';
set local role authenticated;
do $$ declare r record; n int; begin
  select count(*) into n from public.alert_candidates();
  assert n = 2, format('V (offering) gets %s (want Kayla and Sol)', n);
  select * into r from public.alert_candidates() where id = '00000000-0000-4000-8000-0000000000f1';
  assert r.shared_labels = '{}' and r.shared_intents = array['they_seek_mentorship'], format('Sol: %s / %s', r.shared_labels, r.shared_intents);
end $$;

-- Rate limit: 12 calls a minute.
reset role;
delete from public.alert_rate;
set local role authenticated;
do $$ declare i int; begin
  for i in 1..12 loop perform * from public.alert_candidates(); end loop;
  begin perform * from public.alert_candidates(); assert false, '13th call in a minute must be refused';
  exception when sqlstate '54000' then null; end;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Viewer-side states that must return nothing.
-- ---------------------------------------------------------------------------------------------------------------
reset role;
delete from public.alert_rate;
set local role authenticated;
do $$ declare n int; begin
  perform public.set_nearby_alert_prefs(false, 1, 24);
  select count(*) into n from public.alert_candidates();
  assert n = 0, 'alerts off: nothing';
  perform public.set_nearby_alert_prefs(true, 1, 24);
end $$;

reset role;
update public.profiles set hidden = true where id = '00000000-0000-4000-8000-0000000000e1';
set local role authenticated;
do $$ declare n int; begin select count(*) into n from public.alert_candidates(); assert n = 0, 'hidden viewer: nothing'; end $$;

reset role;
update public.profiles set hidden = false where id = '00000000-0000-4000-8000-0000000000e1';
select set_config('app.area_write', '1', true);
update public.profiles set area_seen_at = now() - interval '31 minutes' where id = '00000000-0000-4000-8000-0000000000e1';
select set_config('app.area_write', '', true);
set local role authenticated;
do $$ declare n int; begin select count(*) into n from public.alert_candidates(); assert n = 0, 'stale viewer area: nothing'; end $$;

reset role;
update public.profiles set discoverable = false where id = '00000000-0000-4000-8000-0000000000e1';
set local role authenticated;
do $$ declare n int; begin select count(*) into n from public.alert_candidates(); assert n = 0, 'viewer paused discovery: nothing'; end $$;

reset role;
delete from public.id_verifications where user_id = '00000000-0000-4000-8000-0000000000e1';
set local role authenticated;
do $$ declare n int; begin select count(*) into n from public.alert_candidates(); assert n = 0, 'viewer not a real member: nothing'; end $$;

-- Non-member viewer N (alerts on) sees nothing either; anon can't call it at all.
reset role;
insert into public.nearby_alert_prefs (user_id, alerts_enabled) values ('00000000-0000-4000-8000-0000000000ec', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ec","role":"authenticated"}', true);
do $$ declare n int; begin select count(*) into n from public.alert_candidates(); assert n = 0, 'non-member viewer: nothing'; end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  begin perform * from public.alert_candidates(); assert false, 'anon must be refused';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
select 'nearby: all checks passed' as result;
rollback;
