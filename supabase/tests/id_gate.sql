-- Authorization checks for the mandatory ID gate (supabase/migrations/20261116174554_mandatory_id_gate.sql).
-- Run AFTER the migration (and, since phase 4, after 20261116174714_moderation_write_path.sql: profile writes go through
-- the profile-write function; since phase 5, after 20261116175110_nearby_recommendations.sql: alert_candidates()
-- takes no coordinates), as the postgres role:
--   SQL editor: paste the whole file and Run.   psql: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/id_gate.sql
-- Everything happens in one transaction that is rolled back: no data is kept. Any failed check stops the script with
-- an error naming it; success ends with the row 'id_gate: all checks passed'.
--
-- People (fixed test ids, created and rolled back here):
--   A  ...a1  profile only, never verified
--   S  ...a2  Stripe TEST pass (status verified, livemode=false) + forged id_verified=true flag
--   F  ...a3  stale id_verified=true flag, no id_verifications row
--   L1/L2/L3  live verified (flag + live verified row): real members
--   N  ...c1  brand-new account, no profile yet

begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
select u::uuid, 'authenticated', 'authenticated', 'idgate-' || right(u, 2) || '@example.invalid', now() - interval '3 days', now()
from unnest(array[
  '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a3',
  '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000b3',
  '00000000-0000-4000-8000-0000000000c1']) u;

-- As postgres the protect triggers let these flags through (they only reset app writes).
insert into public.profiles (id, first_name, last_name, discoverable, share_mode, area_lat, area_lng, id_verified, show_experience) values
  ('00000000-0000-4000-8000-0000000000a1', 'Ada',  'Test', true, 'area', 35.22, -80.84, false, true),
  ('00000000-0000-4000-8000-0000000000a2', 'Sam',  'Test', true, 'area', 35.22, -80.84, true,  true),
  ('00000000-0000-4000-8000-0000000000a3', 'Fay',  'Test', true, 'area', 35.22, -80.84, true,  true),
  ('00000000-0000-4000-8000-0000000000b1', 'Lee',  'Test', true, 'area', 35.22, -80.84, true,  true),
  ('00000000-0000-4000-8000-0000000000b2', 'Lou',  'Test', true, 'area', 35.22, -80.84, true,  true),
  ('00000000-0000-4000-8000-0000000000b3', 'Lia',  'Test', true, 'area', 35.22, -80.84, true,  true);

insert into public.id_verifications (user_id, provider, session_id, status, livemode) values
  ('00000000-0000-4000-8000-0000000000a2', 'stripe', 'vs_test_s',  'verified', false),
  ('00000000-0000-4000-8000-0000000000b1', 'stripe', 'vs_live_l1', 'verified', true),
  ('00000000-0000-4000-8000-0000000000b2', 'stripe', 'vs_live_l2', 'verified', true),
  ('00000000-0000-4000-8000-0000000000b3', 'stripe', 'vs_live_l3', 'verified', true);

insert into public.experiences (user_id, title, org, start_month) values
  ('00000000-0000-4000-8000-0000000000b2', 'Analyst', 'Test Co', '2020-01');

-- Existing conversations: L1-L2 (both members) and a legacy A-L1 chat from before the gate.
alter table public.connection_requests disable trigger connection_requests_require_id;
insert into public.connection_requests (id, from_user, to_user, message, status) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2', 'Hi Lou, happy to chat about careers', 'accepted'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', 'Hi Lee, could we chat sometime', 'accepted');
alter table public.connection_requests enable trigger connection_requests_require_id;
insert into public.messages (request_id, sender, body) values
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000b1', 'Sure, how about Tuesday');

-- The predicate itself, and no switch can turn the gate off.
do $$ begin
  assert not public.is_real_member('00000000-0000-4000-8000-0000000000a1'), 'A (unverified) must not be a member';
  assert not public.is_real_member('00000000-0000-4000-8000-0000000000a2'), 'S (test-mode pass + forged flag) must not be a member';
  assert not public.is_real_member('00000000-0000-4000-8000-0000000000a3'), 'F (flag without a live row) must not be a member';
  assert public.is_real_member('00000000-0000-4000-8000-0000000000b1'), 'L1 (live verified) must be a member';
  assert not public.is_real_member(null), 'null is not a member';
  insert into public.app_config (key, value) values ('id_gate', 'off') on conflict (key) do update set value = 'off';
  assert public.id_gate_on(), 'id_gate_on() must stay true whatever app_config says';
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Non-members: A, S and F get no real discovery, requests, messages or alerts.
-- ---------------------------------------------------------------------------------------------------------------
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
do $$ declare n int; begin
  select count(*) into n from public.profiles where id <> '00000000-0000-4000-8000-0000000000a1';
  assert n = 0, format('A sees %s other profiles (want 0)', n);
  select count(*) into n from public.nearby_profiles(35.22, -80.84, 5);
  assert n = 0, format('A nearby_profiles returned %s (want 0)', n);
  select count(*) into n from public.alert_candidates();
  assert n = 0, format('A alert_candidates returned %s (want 0)', n);
  select count(*) into n from public.experiences where user_id <> '00000000-0000-4000-8000-0000000000a1';
  assert n = 0, format('A sees %s experiences of others (want 0)', n);
  select count(*) into n from public.connection_requests;
  assert n = 0, format('A sees %s requests (want 0)', n);
  select count(*) into n from public.messages;
  assert n = 0, format('A sees %s messages (want 0)', n);
  begin
    insert into public.connection_requests (from_user, to_user, message) values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b3', 'Hello, could we talk');
    raise exception 'FAIL: unverified A sent a connection request';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.messages (request_id, sender, body) values ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000a1', 'Tuesday works');
    raise exception 'FAIL: unverified A sent a message';
  exception when insufficient_privilege then null; end;
end $$;

-- Own profile and own verification row stay usable; badges and verification rows are not writable.
do $$ declare n int; begin
  -- Since the moderation write path (20261116174714), profile text is written only through profile-write.
  begin
    update public.profiles set intro = 'Still setting up' where id = '00000000-0000-4000-8000-0000000000a1';
    raise exception 'FAIL: client edited profile text directly';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.profiles where id = '00000000-0000-4000-8000-0000000000a1';
  assert n = 1, 'A cannot read their own profile';
  begin
    update public.profiles set id_verified = true where id = '00000000-0000-4000-8000-0000000000a1';
    raise exception 'FAIL: client updated profiles.id_verified';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set verified = true, hidden = false where id = '00000000-0000-4000-8000-0000000000a1';
    raise exception 'FAIL: client updated profiles.verified/hidden';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.id_verifications (user_id, provider, session_id, status, livemode) values ('00000000-0000-4000-8000-0000000000a1', 'stripe', 'vs_forged', 'verified', true);
    raise exception 'FAIL: client inserted into id_verifications';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
do $$ declare n int; begin
  select count(*) into n from public.profiles where id <> '00000000-0000-4000-8000-0000000000a2';
  assert n = 0, format('S (test-mode pass) sees %s other profiles (want 0)', n);
  select count(*) into n from public.id_verifications;
  assert n = 1, 'S must read exactly their own id_verifications row';
  begin
    update public.id_verifications set livemode = true where user_id = '00000000-0000-4000-8000-0000000000a2';
    raise exception 'FAIL: client updated id_verifications';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.connection_requests (from_user, to_user, message) values ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000b3', 'Hello, could we talk');
    raise exception 'FAIL: sandbox-verified S sent a connection request';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);
do $$ declare n int; begin
  select count(*) into n from public.profiles where id <> '00000000-0000-4000-8000-0000000000a3';
  assert n = 0, format('F (stale flag) sees %s other profiles (want 0)', n);
  begin
    insert into public.connection_requests (from_user, to_user, message) values ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000b3', 'Hello, could we talk');
    raise exception 'FAIL: stale-flag F sent a connection request';
  exception when insufficient_privilege then null; end;
end $$;

-- A brand-new account can create and update its profile before any verification (no circular dependency), through the
-- profile-write function (service role). Direct client writes are refused since the moderation write path.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
do $$ begin
  begin
    insert into public.profiles (id, first_name, last_name, intro) values ('00000000-0000-4000-8000-0000000000c1', 'Nina', 'Park', 'Hello');
    raise exception 'FAIL: client inserted its profile directly';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
insert into public.profiles (id, first_name, last_name, intro) values ('00000000-0000-4000-8000-0000000000c1', 'Nina', 'Park', 'Hello')
  on conflict (id) do update set first_name = excluded.first_name, last_name = excluded.last_name, intro = excluded.intro;
insert into public.profiles (id, first_name, last_name, intro) values ('00000000-0000-4000-8000-0000000000c1', 'Nina', 'Park', 'Hello again')
  on conflict (id) do update set first_name = excluded.first_name, last_name = excluded.last_name, intro = excluded.intro;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
do $$ declare n int; begin
  select count(*) into n from public.profiles where id = '00000000-0000-4000-8000-0000000000c1' and intro = 'Hello again' and not id_verified;
  assert n = 1, 'N could not create their own profile (via profile-write) before verifying';
  begin
    insert into public.profiles (id, first_name, id_verified) values ('00000000-0000-4000-8000-0000000000c1', 'Nina', true)
      on conflict (id) do update set id_verified = excluded.id_verified;
    raise exception 'FAIL: client upsert set id_verified';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Live-verified member L1: sees other members only, can request and message members, not non-members.
-- ---------------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
do $$ declare n int; begin
  select count(*) into n from public.profiles where id <> '00000000-0000-4000-8000-0000000000b1';
  assert n = 2, format('L1 sees %s other profiles (want 2: L2, L3)', n);
  select count(*) into n from public.profiles where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000c1');
  assert n = 0, 'L1 can see a non-member profile';
  select count(*) into n from public.nearby_profiles(35.22, -80.84, 5);
  assert n = 2, format('L1 nearby_profiles returned %s (want 2)', n);
  select count(*) into n from public.experiences where user_id = '00000000-0000-4000-8000-0000000000b2';
  assert n = 1, 'L1 cannot see L2''s shown experience';
  insert into public.connection_requests (from_user, to_user, message) values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b3', 'Hi Lia, could we talk');
  begin
    insert into public.connection_requests (from_user, to_user, message) values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a3', 'Hi Fay, could we talk');
    raise exception 'FAIL: L1 sent a request to a non-member';
  exception when insufficient_privilege then null; end;
  insert into public.messages (request_id, sender, body) values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b1', 'Does Tuesday work?');
  select count(*) into n from public.messages where request_id = '00000000-0000-4000-8000-0000000000d1';
  assert n = 1, 'L1 cannot read their own chat';
  begin
    insert into public.messages (request_id, sender, body) values ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000b1', 'Still on for Tuesday?');
    raise exception 'FAIL: L1 messaged a non-member';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
select 'id_gate: all checks passed' as result;
rollback;
