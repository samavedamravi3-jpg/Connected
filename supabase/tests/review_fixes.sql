-- Checks for the security-review fixes (supabase/migrations/20261116175809_review_fixes.sql).
-- Run AFTER all migrations, as the postgres role:
--   SQL editor: paste the whole file and Run.   psql: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/review_fixes.sql
-- One transaction, rolled back: no data is kept. Any failed check stops the script with an error naming it; success
-- ends with the row 'review_fixes: all checks passed'.
--
-- People: R1 R2 R3 real members (old accounts) ...f1-f3   U1 U2 U3 unverified ...f4-f6   T real member, reported ...f7
--         M mover (rate limit) ...f8   J jumper (plausibility) ...f9   N brand-new unverified account ...fa

begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
select u::uuid, 'authenticated', 'authenticated', 'review-' || right(u, 2) || '@example.invalid',
       case when u like '%fa' then now() else now() - interval '3 days' end, now()
from unnest(array[
  '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000f3',
  '00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-0000000000f6',
  '00000000-0000-4000-8000-0000000000f7', '00000000-0000-4000-8000-0000000000f8', '00000000-0000-4000-8000-0000000000f9',
  '00000000-0000-4000-8000-0000000000fa']) u;

insert into public.profiles (id, first_name, last_name, field, discoverable, share_mode, area_lat, area_lng, id_verified)
select u::uuid, 'Rev', 'Test' || right(u, 2), 'finance', true, 'area', 35.22, -80.84, right(u, 2) in ('f1', 'f2', 'f3', 'f7', 'f8', 'f9')
from unnest(array[
  '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000f3',
  '00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-0000000000f6',
  '00000000-0000-4000-8000-0000000000f7', '00000000-0000-4000-8000-0000000000f8', '00000000-0000-4000-8000-0000000000f9',
  '00000000-0000-4000-8000-0000000000fa']) u;
insert into public.id_verifications (user_id, provider, session_id, status, livemode)
select p.id, 'stripe', 'vs_live_' || right(p.id::text, 2), 'verified', true
from public.profiles p where p.id between '00000000-0000-4000-8000-0000000000f1' and '00000000-0000-4000-8000-0000000000fa' and p.id_verified;

-- Runs a statement and fails unless it raised an error matching `want`.
create or replace function pg_temp.denied(label text, stmt text, want text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm !~* want then raise exception '%: failed for the wrong reason: %', label, sqlerrm; end if;
    return;
  end;
  raise exception '%: should have been refused', label;
end $$;
grant execute on function pg_temp.denied(text, text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 1, 3, 7) Static privileges: server-only tables, least-privilege client tables, profile columns, definer functions.
-- ---------------------------------------------------------------------------------------------------------------
do $$
declare t text; p text; r record;
  callable text[] := array['is_blocked', 'has_connection', 'is_participant', 'is_real_member', 'hidden_event_ids', 'set_nearby_alert_prefs',
                           'alert_candidates', 'set_my_area', 'my_profile', 'nearby_profiles_rate'];
begin
  foreach t in array array['alert_rate', 'rate_log', 'audit_log', 'account_signals', 'moderation_events', 'area_checkins', 'app_config'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
      assert not has_table_privilege('authenticated', 'public.' || t, p), format('authenticated has %s on %s', p, t);
      assert not has_table_privilege('anon', 'public.' || t, p), format('anon has %s on %s', p, t);
    end loop;
  end loop;
  assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alert_rate'), 'alert_rate must have no client policy';
  foreach t in array array['profile_drafts', 'nearby_alert_prefs', 'id_verifications', 'profiles'] loop
    foreach p in array array['INSERT', 'UPDATE', 'DELETE'] loop
      assert not has_table_privilege('authenticated', 'public.' || t, p), format('authenticated has %s on %s', p, t);
    end loop;
  end loop;
  assert has_table_privilege('authenticated', 'public.reports', 'INSERT'), 'reports: the app files reports';
  foreach p in array array['SELECT', 'UPDATE', 'DELETE'] loop
    assert not has_table_privilege('authenticated', 'public.reports', p), format('authenticated has %s on reports', p);
  end loop;
  assert not has_table_privilege('authenticated', 'public.blocks', 'UPDATE') and not has_table_privilege('authenticated', 'public.mutes', 'UPDATE'), 'no block/mute edits';
  assert not has_table_privilege('authenticated', 'public.messages', 'UPDATE') and not has_table_privilege('authenticated', 'public.messages', 'DELETE'), 'no message edits';
  assert not has_table_privilege('authenticated', 'public.connection_requests', 'DELETE'), 'no request deletes';
  for r in select c.oid::regclass as s from pg_class c where c.relkind = 'S' and c.relnamespace = 'public'::regnamespace loop
    assert not has_sequence_privilege('authenticated', r.s::text, 'USAGE') and not has_sequence_privilege('anon', r.s::text, 'USAGE'), format('client can use %s', r.s);
  end loop;
  -- profiles: no table-wide SELECT; only the public columns.
  assert not has_table_privilege('authenticated', 'public.profiles', 'SELECT'), 'profiles: no table-wide select';
  foreach t in array array['area_seen_at', 'hidden', 'created_at', 'updated_at', 'verified_at', 'verified_kind', 'id_verified_at', 'from_field',
                           'goals', 'challenges', 'want_traits', 'share_mode'] loop
    assert not has_column_privilege('authenticated', 'public.profiles', t, 'SELECT'), format('app can read profiles.%s', t);
  end loop;
  foreach t in array array['id', 'first_name', 'last_name', 'area_lat', 'area_lng', 'area_name', 'interests', 'verified', 'id_verified', 'discoverable'] loop
    assert has_column_privilege('authenticated', 'public.profiles', t, 'SELECT'), format('app cannot read profiles.%s', t);
  end loop;
  -- SECURITY DEFINER functions: never anon/PUBLIC; authenticated only for the client-callable ones; triggers for nobody.
  for r in select p.oid, p.proname, p.prorettype = 'trigger'::regtype as trg from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef loop
    assert not has_function_privilege('anon', r.oid, 'execute'), format('anon can execute %s', r.proname);
    assert has_function_privilege('authenticated', r.oid, 'execute') = (r.proname = any(callable) and not r.trg),
      format('authenticated execute on %s is %s', r.proname, has_function_privilege('authenticated', r.oid, 'execute'));
  end loop;
  assert has_function_privilege('service_role', 'public.profile_write_rate(uuid, text)', 'execute'), 'service role runs profile_write_rate';
  assert (select prosrc like '%pg_advisory_xact_lock%' from pg_proc where oid = 'public.rate_check_uid(uuid,text,int,int,interval)'::regprocedure), 'rate checks are serialised';
  assert (select prosecdef from pg_proc where oid = 'public.alert_candidates()'::regprocedure), 'alert_candidates (alert_rate writer) is definer';
  assert (select prosecdef from pg_proc where oid = 'public.set_my_area(double precision, double precision)'::regprocedure), 'set_my_area is definer';
  -- Option and size constraints exist and are validated on a clean database.
  assert (select count(*) from pg_constraint where conrelid = 'public.profiles'::regclass and convalidated
          and conname in ('profiles_status_ok', 'profiles_field_ok', 'profiles_from_field_ok', 'profiles_mode_ok', 'profiles_meet_mode_ok',
                          'profiles_share_mode_ok', 'profiles_goals_ok', 'profiles_challenges_ok', 'profiles_want_traits_ok', 'profiles_foods_ok',
                          'profiles_diet_ok', 'profiles_availability_ok', 'profiles_chips_len')) = 13, 'all 13 profile option constraints validated';
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 1) The alert limit can't be reset by the client, and no rate/log table is client-writable.
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
select public.set_nearby_alert_prefs(true, 1, 24);
do $$ declare i int; begin for i in 1..12 loop perform * from public.alert_candidates(); end loop; end $$;
select pg_temp.denied('client resets alert limit', $s$delete from public.alert_rate$s$, 'permission denied');
select pg_temp.denied('client zeroes alert limit', $s$update public.alert_rate set calls = 0$s$, 'permission denied');
select pg_temp.denied('client writes alert limit', $s$insert into public.alert_rate (user_id, calls) values ('00000000-0000-4000-8000-0000000000f1', 0) on conflict (user_id) do update set calls = 0$s$, 'permission denied');
select pg_temp.denied('client reads alert limit', $s$select * from public.alert_rate$s$, 'permission denied');
select pg_temp.denied('13th alert call in a minute', $s$select * from public.alert_candidates()$s$, 'rate limit');
select pg_temp.denied('client deletes rate_log', $s$delete from public.rate_log$s$, 'permission denied');
select pg_temp.denied('client inserts rate_log', $s$insert into public.rate_log (user_id, kind, at) values ('00000000-0000-4000-8000-0000000000f1', 'request', now() - interval '3 days')$s$, 'permission denied');
select pg_temp.denied('client updates rate_log', $s$update public.rate_log set at = now() - interval '3 days'$s$, 'permission denied');
select pg_temp.denied('client deletes moderation_events', $s$delete from public.moderation_events$s$, 'permission denied');
select pg_temp.denied('client updates moderation_events', $s$update public.moderation_events set at = now() - interval '2 hours'$s$, 'permission denied');
select pg_temp.denied('client writes audit_log', $s$insert into public.audit_log (action) values ('x')$s$, 'permission denied');
select pg_temp.denied('client deletes audit_log', $s$delete from public.audit_log$s$, 'permission denied');
select pg_temp.denied('client deletes account_signals', $s$delete from public.account_signals$s$, 'permission denied');
select pg_temp.denied('client reads area_checkins', $s$select * from public.area_checkins$s$, 'permission denied');
select pg_temp.denied('client moves area check-in', $s$update public.area_checkins set at = now() - interval '1 day'$s$, 'permission denied');
select pg_temp.denied('client deletes area check-in', $s$delete from public.area_checkins$s$, 'permission denied');
select pg_temp.denied('client reads reports', $s$select * from public.reports$s$, 'permission denied');
select pg_temp.denied('client deletes reports', $s$delete from public.reports$s$, 'permission denied');
reset role;

-- ---------------------------------------------------------------------------------------------------------------
-- 2) set_my_area: free refreshes, 30 moves an hour, no 25+ mile jumps within 10 minutes, presence only from set_my_area.
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f8","role":"authenticated"}', true);
do $$ declare i int; r public.profiles; begin
  perform public.set_my_area(35.2234, -80.8412); -- rounds to 35.22, -80.84
  for i in 1..40 loop perform public.set_my_area(35.2201, -80.8398); end loop; -- same rounded spot: refresh only
  select * into r from public.my_profile();
  assert r.area_lat = 35.22 and r.area_lng = -80.84 and r.area_seen_at is not null, 'set_my_area stores the rounded spot and presence';
  for i in 1..29 loop perform public.set_my_area(35.22 + i * 0.01, -80.84); end loop; -- moves 2..30, about 0.7 mi each
  begin perform public.set_my_area(35.60, -80.84); assert false, '31st move in an hour must be refused';
  exception when sqlstate '54000' then null; end;
  select * into r from public.my_profile();
  assert r.area_lat = 35.51, format('a refused move keeps the last spot (got %s)', r.area_lat);
end $$;
select pg_temp.denied('client writes its position directly', $s$update public.profiles set area_lat = 40.71, area_lng = -74.0 where id = '00000000-0000-4000-8000-0000000000f8'$s$, 'permission denied');
select pg_temp.denied('client refreshes presence directly', $s$update public.profiles set area_seen_at = now() where id = '00000000-0000-4000-8000-0000000000f8'$s$, 'permission denied');
select pg_temp.denied('invalid coordinates', $s$select public.set_my_area(91, 0)$s$, 'invalid coordinates');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f9","role":"authenticated"}', true);
select public.set_my_area(35.22, -80.84);
select public.set_my_area(35.50, -80.84); -- about 19 miles: plausible
select pg_temp.denied('40-mile jump within 10 minutes', $s$select public.set_my_area(36.08, -80.84)$s$, 'implausible_move');
do $$ declare r public.profiles; begin
  select * into r from public.my_profile();
  assert r.area_lat = 35.50, 'a refused jump keeps the last spot';
end $$;
reset role;
update public.area_checkins set at = now() - interval '11 minutes' where user_id = '00000000-0000-4000-8000-0000000000f9';
set local role authenticated;
select public.set_my_area(36.08, -80.84); -- the same jump after 10 minutes (a drive or a flight) is fine
reset role;
do $$ begin
  assert (select count(*) from public.rate_log where user_id = '00000000-0000-4000-8000-0000000000f8' and kind = 'area_move') = 30, 'only position changes count';
  assert (select area_lat from public.profiles where id = '00000000-0000-4000-8000-0000000000f9') = 36.08, 'jump allowed after 10 minutes';
end $$;
-- A position written any other way (profile-write, service role) drops presence: alerts never measure from it.
set local role service_role;
update public.profiles set area_lat = 40.71, area_lng = -74.01 where id = '00000000-0000-4000-8000-0000000000f9';
reset role;
do $$ begin
  assert (select area_seen_at from public.profiles where id = '00000000-0000-4000-8000-0000000000f9') is null, 'profile-write move clears presence';
end $$;
set local role service_role;
update public.profiles set intro = 'Still here' where id = '00000000-0000-4000-8000-0000000000f8';
reset role;
do $$ begin
  assert (select area_seen_at from public.profiles where id = '00000000-0000-4000-8000-0000000000f8') is not null, 'an edit that keeps the position keeps presence';
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3) Profiles: public columns only, own row via my_profile(), nearby_profiles clamped and rate limited.
-- ---------------------------------------------------------------------------------------------------------------
update public.profiles set area_lat = 35.62, area_lng = -80.84 where id = '00000000-0000-4000-8000-0000000000f3'; -- about 28 mi north
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
do $$ declare n int; r public.profiles; begin
  select count(*) into n from (select id, first_name, last_name, area_lat, area_lng, area_name, interests, verified, id_verified from public.profiles
                               where id = '00000000-0000-4000-8000-0000000000f2') x;
  assert n = 1, 'a member reads another member''s public columns';
  select count(*) into n from public.my_profile();
  assert n = 1, 'my_profile returns exactly your row';
  select * into r from public.my_profile();
  assert r.id = '00000000-0000-4000-8000-0000000000f1' and not r.hidden and r.created_at is not null, 'my_profile has your private columns';
  select count(*) into n from public.nearby_profiles(35.22, -80.84, 100) where id = '00000000-0000-4000-8000-0000000000f3';
  assert n = 0, 'radius is clamped to 25 miles';
  select count(*) into n from public.nearby_profiles(35.22, -80.84, 100) where id = '00000000-0000-4000-8000-0000000000f2';
  assert n = 1, 'nearby_profiles still finds people within 25 miles';
end $$;
select pg_temp.denied('select * on profiles', $s$select * from public.profiles$s$, 'permission denied');
select pg_temp.denied('others'' presence', $s$select area_seen_at from public.profiles$s$, 'permission denied');
select pg_temp.denied('hidden flag', $s$select id from public.profiles where hidden$s$, 'permission denied');
select pg_temp.denied('account age', $s$select created_at from public.profiles$s$, 'permission denied');
select pg_temp.denied('private preferences', $s$select goals, challenges, want_traits from public.profiles$s$, 'permission denied');
select pg_temp.denied('badge details', $s$select verified_kind, verified_at, id_verified_at from public.profiles$s$, 'permission denied');
select pg_temp.denied('nearby bad origin', $s$select * from public.nearby_profiles(95, 0, 5)$s$, 'invalid coordinates');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
do $$ declare i int; begin
  for i in 1..200 loop perform * from public.nearby_profiles(35.22, -80.84, 5); end loop;
  begin perform * from public.nearby_profiles(35.22, -80.84, 5); assert false, '201st nearby call in an hour must be refused';
  exception when sqlstate '54000' then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------------------------------------------------------
-- 7) is_blocked / has_connection answer only for the caller's own pairs; anon can't call them.
-- ---------------------------------------------------------------------------------------------------------------
insert into public.blocks (blocker, blocked) values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000f3');
alter table public.connection_requests disable trigger connection_requests_require_id;
insert into public.connection_requests (from_user, to_user, message) values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000f3', 'Hello there, could we talk');
alter table public.connection_requests enable trigger connection_requests_require_id;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
do $$ begin
  assert not public.is_blocked('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000f3'), 'third party learns nothing about a block';
  assert not public.has_connection('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000f3'), 'third party learns nothing about a request';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f3","role":"authenticated"}', true);
do $$ begin
  assert public.is_blocked('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000f3'), 'the blocked person''s own pair still answers (policies need it)';
  assert public.has_connection('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000f2'), 'own connection answers';
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);
select pg_temp.denied('anon is_blocked', $s$select public.is_blocked('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000f3')$s$, 'permission denied');
select pg_temp.denied('anon has_connection', $s$select public.has_connection('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000f3')$s$, 'permission denied');
select pg_temp.denied('anon is_participant', $s$select public.is_participant('00000000-0000-4000-8000-0000000000f2')$s$, 'permission denied');
select pg_temp.denied('anon my_profile', $s$select * from public.my_profile()$s$, 'permission denied');
select pg_temp.denied('anon set_my_area', $s$select public.set_my_area(35.22, -80.84)$s$, 'permission denied');
select pg_temp.denied('anon nearby_profiles', $s$select * from public.nearby_profiles(35.22, -80.84, 5)$s$, 'permission denied');
select pg_temp.denied('anon profile_write_rate', $s$select public.profile_write_rate('00000000-0000-4000-8000-0000000000f2', 'write')$s$, 'permission denied');
reset role;

-- ---------------------------------------------------------------------------------------------------------------
-- 4) Auto-hide counts only real members' reports (all reports are stored).
-- ---------------------------------------------------------------------------------------------------------------
create or replace function pg_temp.report_as(who text, subj text, kind text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"00000000-0000-4000-8000-0000000000%s","role":"authenticated"}', who), true);
  if kind = 'profile' then insert into public.reports (reported, reason) values (subj::uuid, 'spam');
  else insert into public.reports (subject_kind, subject_id, reason) values ('event', subj, 'spam'); end if;
end $$;
grant execute on function pg_temp.report_as(text, text, text) to authenticated;
set local role authenticated;
select pg_temp.report_as(w, '00000000-0000-4000-8000-0000000000f7', 'profile') from unnest(array['f4', 'f5', 'f6']) w;
select pg_temp.report_as(w, 'evt-review-1', 'event') from unnest(array['f4', 'f5', 'f6']) w;
reset role;
do $$ begin
  assert (select count(*) from public.reports where subject_id = '00000000-0000-4000-8000-0000000000f7') = 3, 'unverified reports are stored';
  assert not (select hidden from public.profiles where id = '00000000-0000-4000-8000-0000000000f7'), 'three unverified reporters must not hide a member';
end $$;
set local role authenticated;
select pg_temp.report_as(w, '00000000-0000-4000-8000-0000000000f7', 'profile') from unnest(array['f1', 'f2']) w;
select pg_temp.report_as(w, 'evt-review-1', 'event') from unnest(array['f1', 'f2']) w;
do $$ begin assert not ('evt-review-1' = any(array(select public.hidden_event_ids()))), 'two real + three unverified must not hide an event'; end $$;
reset role;
do $$ begin assert not (select hidden from public.profiles where id = '00000000-0000-4000-8000-0000000000f7'), 'two real reporters are not enough'; end $$;
set local role authenticated;
select pg_temp.report_as('f3', '00000000-0000-4000-8000-0000000000f7', 'profile');
select pg_temp.report_as('f3', 'evt-review-1', 'event');
do $$ begin assert 'evt-review-1' = any(array(select public.hidden_event_ids())), 'three real members hide an event'; end $$;
reset role;
do $$ begin assert (select hidden from public.profiles where id = '00000000-0000-4000-8000-0000000000f7'), 'three real members hide a profile'; end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 5) Option columns take only the app's ids; chips are capped (as the profile-write function, service role).
-- ---------------------------------------------------------------------------------------------------------------
set local role service_role;
update public.profiles set status = 'student', field = 'tech', from_field = null, mode = 'both', meet_mode = 'video', share_mode = 'area',
  goals = '{mentorship,peers}', challenges = '{network}', want_traits = '{firstgen}', foods = '{coffee}', diet = '{halal}', availability = '{week}'
  where id = '00000000-0000-4000-8000-0000000000f4';
select pg_temp.denied('free-text status', $s$update public.profiles set status = 'CEO of everything' where id = '00000000-0000-4000-8000-0000000000f4'$s$, 'profiles_status_ok');
select pg_temp.denied('free-text field', $s$update public.profiles set field = 'crypto' where id = '00000000-0000-4000-8000-0000000000f4'$s$, 'profiles_field_ok');
select pg_temp.denied('free-text from_field', $s$update public.profiles set from_field = 'anything' where id = '00000000-0000-4000-8000-0000000000f4'$s$, 'profiles_from_field_ok');
select pg_temp.denied('free-text mode', $s$update public.profiles set mode = 'dating' where id = '00000000-0000-4000-8000-0000000000f4'$s$, 'profiles_mode_ok');
select pg_temp.denied('free-text meet_mode', $s$update public.profiles set meet_mode = 'my place' where id = '00000000-0000-4000-8000-0000000000f4'$s$, 'profiles_meet_mode_ok');
select pg_temp.denied('free-text share_mode', $s$update public.profiles set share_mode = 'exact' where id = '00000000-0000-4000-8000-0000000000f4'$s$, 'profiles_share_mode_ok');
select pg_temp.denied('unknown goal', $s$update public.profiles set goals = '{mentorship,dates}' where id = '00000000-0000-4000-8000-0000000000f4'$s$, 'profiles_goals_ok');
select pg_temp.denied('unknown challenge', $s$update public.profiles set challenges = '{money}' where id = '00000000-0000-4000-8000-0000000000f4'$s$, 'profiles_challenges_ok');
select pg_temp.denied('unknown trait', $s$update public.profiles set want_traits = '{rich}' where id = '00000000-0000-4000-8000-0000000000f4'$s$, 'profiles_want_traits_ok');
select pg_temp.denied('unknown food', $s$update public.profiles set foods = '{steak}' where id = '00000000-0000-4000-8000-0000000000f4'$s$, 'profiles_foods_ok');
select pg_temp.denied('unknown diet', $s$update public.profiles set diet = '{keto}' where id = '00000000-0000-4000-8000-0000000000f4'$s$, 'profiles_diet_ok');
select pg_temp.denied('unknown availability', $s$update public.profiles set availability = '{never}' where id = '00000000-0000-4000-8000-0000000000f4'$s$, 'profiles_availability_ok');
select pg_temp.denied('too many chips', $s$update public.profiles set interests = array(select 'Topic ' || i from generate_series(1, 31) i) where id = '00000000-0000-4000-8000-0000000000f4'$s$, 'profiles_chips_len');
select pg_temp.denied('chips too long together', $s$update public.profiles set interests = array(select rpad('Topic ' || i, 60, 'x') from generate_series(1, 30) i), skills = array(select rpad('Skill ' || i, 60, 'y') from generate_series(1, 30) i) where id = '00000000-0000-4000-8000-0000000000f4'$s$, 'profiles_chips_len');
update public.profiles set interests = array(select rpad('Topic ' || i, 60, 'x') from generate_series(1, 30) i) where id = '00000000-0000-4000-8000-0000000000f4'; -- 1800 chars: fine
reset role;

-- ---------------------------------------------------------------------------------------------------------------
-- 6) profile_write_rate: service role only, every write counted, lower AI cap for new accounts; decision log capped.
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
select pg_temp.denied('client calls profile_write_rate', $s$select public.profile_write_rate('00000000-0000-4000-8000-0000000000f1', 'write')$s$, 'permission denied');
select pg_temp.denied('client calls rate_check_uid', $s$select public.rate_check_uid('00000000-0000-4000-8000-0000000000f1', 'x', 1, 1, interval '1 hour')$s$, 'permission denied');
reset role;
set local role service_role;
do $$ declare i int; begin
  for i in 1..10 loop assert public.profile_write_rate('00000000-0000-4000-8000-0000000000fa', 'ai'), format('new account AI review %s allowed', i); end loop;
  assert not public.profile_write_rate('00000000-0000-4000-8000-0000000000fa', 'ai'), '11th AI review for a new account refused';
  for i in 1..30 loop assert public.profile_write_rate('00000000-0000-4000-8000-0000000000f1', 'ai'), format('member AI review %s allowed', i); end loop;
  assert not public.profile_write_rate('00000000-0000-4000-8000-0000000000f1', 'ai'), '31st AI review for a member refused';
  for i in 1..120 loop assert public.profile_write_rate('00000000-0000-4000-8000-0000000000fa', 'write'), format('write %s allowed', i); end loop;
  assert not public.profile_write_rate('00000000-0000-4000-8000-0000000000fa', 'write'), '121st write in an hour refused';
  assert public.profile_write_rate('00000000-0000-4000-8000-0000000000f2', 'write'), 'limits are per user';
  assert not public.profile_write_rate(null, 'write'), 'no user, no write';
  begin perform public.profile_write_rate('00000000-0000-4000-8000-0000000000f2', 'other'); assert false, 'unknown kind must raise';
  exception when invalid_parameter_value then null; end;
end $$;
insert into public.moderation_events (user_id, surface, field, decision, reason)
select '00000000-0000-4000-8000-0000000000f5', 'profile', 'intro', 'rejected', 'scams' from generate_series(1, 205);
reset role;
do $$ begin
  assert (select count(*) from public.moderation_events where user_id = '00000000-0000-4000-8000-0000000000f5') = 200, 'decision log capped at 200 an hour';
end $$;

select 'review_fixes: all checks passed' as result;
rollback;
