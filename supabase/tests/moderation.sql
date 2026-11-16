-- Authorization and rule checks for the moderation write path (supabase/migrations/20261116180000_moderation_write_path.sql).
-- Run AFTER the migration, as the postgres role:
--   SQL editor: paste the whole file and Run.   psql: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/moderation.sql
-- One transaction, rolled back: no data is kept. Any failed check stops with an error naming it; success ends with
-- the row 'moderation: all checks passed'.
--
-- "Client" = role authenticated with that user's JWT claims (what the app's publishable key gets).
-- "Mediated" = role service_role (what the profile-write edge function uses after its own checks).
-- People: U ...e1 (new, not ID-verified: must still be able to get a basic profile), V ...e2.

begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
select u::uuid, 'authenticated', 'authenticated', 'mod-' || right(u, 2) || '@example.invalid', now() - interval '3 days', now()
from unnest(array['00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e2']) u;

-- Runs each statement and fails unless it raised. Used for "the client can't write this".
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
grant execute on function pg_temp.denied(text, text, text) to authenticated, service_role;

-- 1) Client (as U, before any ID check): every direct write of profile text is refused, clean or dirty.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
select pg_temp.denied('client insert clean profile', $s$insert into public.profiles (id, first_name, intro) values ('00000000-0000-4000-8000-0000000000e1', 'Uma', 'Hello')$s$, 'permission denied');
select pg_temp.denied('client insert dirty profile', $s$insert into public.profiles (id, first_name, intro) values ('00000000-0000-4000-8000-0000000000e1', 'Uma', 'send nudes')$s$, 'permission denied');
reset role;

-- 2) Mediated (service role): U creates a basic profile before ID verification. No circular dependency on the ID gate.
set local role service_role;
insert into public.profiles (id, first_name, last_name, org, intro, offer)
  values ('00000000-0000-4000-8000-0000000000e1', 'Dick', 'Cummings', 'Western Union', 'Sexual health nurse, LGBTQ+ mentor and rape crisis counselor.', 'Engineer at Venmo; graduated magna cum laude.');
insert into public.profiles (id, first_name, last_name, org) values ('00000000-0000-4000-8000-0000000000e2', 'Zoë', 'Ðoàn-Nguyễn', 'Booking.com');
update public.profiles set intro = 'मैं सॉफ्टवेयर इंजीनियर हूँ', interests = '{Fintech,Investing}' where id = '00000000-0000-4000-8000-0000000000e1';
select pg_temp.denied('mediated dirty intro', $s$update public.profiles set intro = 'DM me on Telegram for crypto signals' where id = '00000000-0000-4000-8000-0000000000e1'$s$, 'content_blocked');
select pg_temp.denied('mediated defanged link', $s$update public.profiles set offer = 'hxxp://evil[.]com' where id = '00000000-0000-4000-8000-0000000000e1'$s$, 'content_blocked');
select pg_temp.denied('mediated slur name', $s$update public.profiles set last_name = 'n i g g e r' where id = '00000000-0000-4000-8000-0000000000e1'$s$, 'content_blocked');
select pg_temp.denied('mediated email in org', $s$update public.profiles set org = 'me@evil.example' where id = '00000000-0000-4000-8000-0000000000e1'$s$, 'content_blocked');
select pg_temp.denied('mediated dirty chip', $s$update public.profiles set skills = '{Excel,sugar daddy}' where id = '00000000-0000-4000-8000-0000000000e1'$s$, 'content_blocked');
select pg_temp.denied('mediated dirty goal id', $s$update public.profiles set goals = '{mentorship,wa.me/123}' where id = '00000000-0000-4000-8000-0000000000e1'$s$, 'content_blocked');
select pg_temp.denied('mediated dirty area name', $s$update public.profiles set area_name = 'visit evil dot com' where id = '00000000-0000-4000-8000-0000000000e1'$s$, 'content_blocked');
insert into public.profile_drafts (user_id, fields) values ('00000000-0000-4000-8000-0000000000e1', '{"intro":"held for review"}');
insert into public.moderation_events (user_id, surface, field, decision, reason) values ('00000000-0000-4000-8000-0000000000e1', 'profile', 'intro', 'held', 'ai_unavailable');
reset role;

-- 3) Client (as U): no direct update of any profile text column, clean or dirty; the area columns stay writable for set_my_area.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
select pg_temp.denied('client update clean intro', $s$update public.profiles set intro = 'Hello there' where id = '00000000-0000-4000-8000-0000000000e1'$s$, 'permission denied');
select pg_temp.denied('client update dirty intro', $s$update public.profiles set intro = 'send nudes' where id = '00000000-0000-4000-8000-0000000000e1'$s$, 'permission denied');
select pg_temp.denied('client update offer', $s$update public.profiles set offer = 'x' where id = '00000000-0000-4000-8000-0000000000e1'$s$, 'permission denied');
select pg_temp.denied('client update names', $s$update public.profiles set first_name = 'X', last_name = 'Y', org = 'Z' where id = '00000000-0000-4000-8000-0000000000e1'$s$, 'permission denied');
select pg_temp.denied('client update chips', $s$update public.profiles set skills = '{a}', interests = '{b}', goals = '{c}' where id = '00000000-0000-4000-8000-0000000000e1'$s$, 'permission denied');
select pg_temp.denied('client update area_name', $s$update public.profiles set area_name = 'South End' where id = '00000000-0000-4000-8000-0000000000e1'$s$, 'permission denied');
select pg_temp.denied('client update badges', $s$update public.profiles set hidden = false, verified = true, id_verified = true where id = '00000000-0000-4000-8000-0000000000e1'$s$, 'permission denied');
select pg_temp.denied('client upsert', $s$insert into public.profiles (id, intro) values ('00000000-0000-4000-8000-0000000000e1', 'x') on conflict (id) do update set intro = excluded.intro$s$, 'permission denied');
update public.profiles set area_lat = 35.2271, area_lng = -80.8431 where id = '00000000-0000-4000-8000-0000000000e1';
do $$ begin
  assert (select count(*) from public.profile_drafts) = 1, 'owner reads own draft';
  assert (select count(*) from public.profile_drafts where user_id <> '00000000-0000-4000-8000-0000000000e1') = 0, 'no one else''s drafts';
end $$;
select pg_temp.denied('client writes draft', $s$insert into public.profile_drafts (user_id, fields) values ('00000000-0000-4000-8000-0000000000e1', '{}') on conflict (user_id) do update set fields = '{}'$s$, 'permission denied');
select pg_temp.denied('client deletes draft', $s$delete from public.profile_drafts$s$, 'permission denied');
select pg_temp.denied('client reads decision log', $s$select * from public.moderation_events$s$, 'permission denied');
select pg_temp.denied('client writes decision log', $s$insert into public.moderation_events (user_id, surface, field, decision, reason) values ('00000000-0000-4000-8000-0000000000e1', 'profile', 'intro', 'published', 'x')$s$, 'permission denied');
-- Experiences stay client-written, under the trigger: name rule for title/org, full rule for description and skills.
insert into public.experiences (user_id, title, org, start_month, description) values
  ('00000000-0000-4000-8000-0000000000e1', 'Analyst', 'Western Union', '2020-01', 'Built USDC payments; reported monthly returns.');
select pg_temp.denied('client dirty experience', $s$insert into public.experiences (user_id, title, org, start_month, description) values ('00000000-0000-4000-8000-0000000000e1', 'Analyst', 'Acme', '2020-01', 'visit evil dot com for guaranteed returns')$s$, 'content_blocked');
select pg_temp.denied('client experience email org', $s$insert into public.experiences (user_id, title, org, start_month) values ('00000000-0000-4000-8000-0000000000e1', 'Analyst', 'me@evil.example', '2020-01')$s$, 'content_blocked');
reset role;

-- 4) As V: U's draft is invisible.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.profile_drafts) = 0, 'V must not see U''s draft';
end $$;
reset role;

-- 5) Rules parity: the database agrees with the app on the whole corpus.
-- >>> parity (generated by scripts/gen-moderation-sql.ts; do not edit by hand)
-- The app's verdicts (checkText) for scripts/moderation-corpus.ts; the database must agree.
do $parity$ begin
  assert public.moderation_is_clean($c$I will kill you$c$) = false, 'parity text #0';
  assert public.moderation_name_ok($c$I will kill you$c$) = false, 'parity name #0';
  assert public.moderation_is_clean($c$k1ll y0urself$c$) = false, 'parity text #1';
  assert public.moderation_name_ok($c$k1ll y0urself$c$) = false, 'parity name #1';
  assert public.moderation_is_clean($c$k y s$c$) = false, 'parity text #2';
  assert public.moderation_name_ok($c$k y s$c$) = false, 'parity name #2';
  assert public.moderation_is_clean($c$you are so stupid$c$) = false, 'parity text #3';
  assert public.moderation_name_ok($c$you are so stupid$c$) = false, 'parity name #3';
  assert public.moderation_is_clean($c$send nudes$c$) = false, 'parity text #4';
  assert public.moderation_name_ok($c$send nudes$c$) = false, 'parity name #4';
  assert public.moderation_is_clean($c$go d1e$c$) = false, 'parity text #5';
  assert public.moderation_name_ok($c$go d1e$c$) = false, 'parity name #5';
  assert public.moderation_is_clean($c$wh0re$c$) = false, 'parity text #6';
  assert public.moderation_name_ok($c$wh0re$c$) = false, 'parity name #6';
  assert public.moderation_is_clean($c$n i g g e r$c$) = false, 'parity text #7';
  assert public.moderation_name_ok($c$n i g g e r$c$) = false, 'parity name #7';
  assert public.moderation_is_clean($c$n​іgger$c$) = false, 'parity text #8';
  assert public.moderation_name_ok($c$n​іgger$c$) = false, 'parity name #8';
  assert public.moderation_is_clean($c$f.u.c.k you$c$) = false, 'parity text #9';
  assert public.moderation_name_ok($c$f.u.c.k you$c$) = false, 'parity name #9';
  assert public.moderation_is_clean($c$fuuuuck off$c$) = false, 'parity text #10';
  assert public.moderation_name_ok($c$fuuuuck off$c$) = false, 'parity name #10';
  assert public.moderation_is_clean($c$ｋｉｌｌ ｙｏｕｒｓｅｌｆ$c$) = false, 'parity text #11';
  assert public.moderation_name_ok($c$ｋｉｌｌ ｙｏｕｒｓｅｌｆ$c$) = false, 'parity name #11';
  assert public.moderation_is_clean($c$k‍ill you$c$) = false, 'parity text #12';
  assert public.moderation_name_ok($c$k‍ill you$c$) = false, 'parity name #12';
  assert public.moderation_is_clean($c$sеnd nudеs$c$) = false, 'parity text #13';
  assert public.moderation_name_ok($c$sеnd nudеs$c$) = false, 'parity name #13';
  assert public.moderation_is_clean($c$𝐟𝐮𝐜𝐤 𝐲𝐨𝐮$c$) = false, 'parity text #14';
  assert public.moderation_name_ok($c$𝐟𝐮𝐜𝐤 𝐲𝐨𝐮$c$) = false, 'parity name #14';
  assert public.moderation_is_clean($c$fսck you$c$) = false, 'parity text #15';
  assert public.moderation_name_ok($c$fսck you$c$) = false, 'parity name #15';
  assert public.moderation_is_clean($c$fvck you$c$) = false, 'parity text #16';
  assert public.moderation_name_ok($c$fvck you$c$) = false, 'parity name #16';
  assert public.moderation_is_clean($c$phuck off$c$) = false, 'parity text #17';
  assert public.moderation_name_ok($c$phuck off$c$) = false, 'parity name #17';
  assert public.moderation_is_clean($c$ꜰᴜᴄᴋ ʏᴏᴜ$c$) = false, 'parity text #18';
  assert public.moderation_name_ok($c$ꜰᴜᴄᴋ ʏᴏᴜ$c$) = false, 'parity name #18';
  assert public.moderation_is_clean($c$por⁣n$c$) = false, 'parity text #19';
  assert public.moderation_name_ok($c$por⁣n$c$) = false, 'parity name #19';
  assert public.moderation_is_clean($c$Immigrants are vermin and should all be deported$c$) = false, 'parity text #20';
  assert public.moderation_name_ok($c$Immigrants are vermin and should all be deported$c$) = false, 'parity name #20';
  assert public.moderation_is_clean($c$Seeking a sugar daddy, generous men only$c$) = false, 'parity text #21';
  assert public.moderation_name_ok($c$Seeking a sugar daddy, generous men only$c$) = false, 'parity name #21';
  assert public.moderation_is_clean($c$DTF tonight$c$) = false, 'parity text #22';
  assert public.moderation_name_ok($c$DTF tonight$c$) = false, 'parity name #22';
  assert public.moderation_is_clean($c$s3xy and single$c$) = false, 'parity text #23';
  assert public.moderation_name_ok($c$s3xy and single$c$) = false, 'parity name #23';
  assert public.moderation_is_clean($c$Cross me and I will make you pay$c$) = false, 'parity text #24';
  assert public.moderation_name_ok($c$Cross me and I will make you pay$c$) = false, 'parity name #24';
  assert public.moderation_is_clean($c$Paid mentorship: $50 per session via CashApp$c$) = false, 'parity text #25';
  assert public.moderation_name_ok($c$Paid mentorship: $50 per session via CashApp$c$) = true, 'parity name #25';
  assert public.moderation_is_clean($c$Send USDT to my wallet and I will triple it$c$) = false, 'parity text #26';
  assert public.moderation_name_ok($c$Send USDT to my wallet and I will triple it$c$) = true, 'parity name #26';
  assert public.moderation_is_clean($c$Apple Pay me for a referral$c$) = false, 'parity text #27';
  assert public.moderation_name_ok($c$Apple Pay me for a referral$c$) = true, 'parity name #27';
  assert public.moderation_is_clean($c$Crypto mentor, 300% gains every month$c$) = false, 'parity text #28';
  assert public.moderation_name_ok($c$Crypto mentor, 300% gains every month$c$) = true, 'parity name #28';
  assert public.moderation_is_clean($c$Verify your ID at connected-verify dot com$c$) = false, 'parity text #29';
  assert public.moderation_name_ok($c$Verify your ID at connected-verify dot com$c$) = true, 'parity name #29';
  assert public.moderation_is_clean($c$Send me the 6 digit code you just got$c$) = false, 'parity text #30';
  assert public.moderation_name_ok($c$Send me the 6 digit code you just got$c$) = true, 'parity name #30';
  assert public.moderation_is_clean($c$Tell me your login and I will set up your profile$c$) = false, 'parity text #31';
  assert public.moderation_name_ok($c$Tell me your login and I will set up your profile$c$) = true, 'parity name #31';
  assert public.moderation_is_clean($c$hxxp://evil[.]com$c$) = false, 'parity text #32';
  assert public.moderation_name_ok($c$hxxp://evil[.]com$c$) = false, 'parity name #32';
  assert public.moderation_is_clean($c$visit evil dot com$c$) = false, 'parity text #33';
  assert public.moderation_name_ok($c$visit evil dot com$c$) = true, 'parity name #33';
  assert public.moderation_is_clean($c$t . me/joinme$c$) = false, 'parity text #34';
  assert public.moderation_name_ok($c$t . me/joinme$c$) = false, 'parity name #34';
  assert public.moderation_is_clean($c$example(dot)com/offer$c$) = false, 'parity text #35';
  assert public.moderation_name_ok($c$example(dot)com/offer$c$) = true, 'parity name #35';
  assert public.moderation_is_clean($c$insta @cooljohn$c$) = false, 'parity text #36';
  assert public.moderation_name_ok($c$insta @cooljohn$c$) = false, 'parity name #36';
  assert public.moderation_is_clean($c$h t t p : / / x$c$) = false, 'parity text #37';
  assert public.moderation_name_ok($c$h t t p : / / x$c$) = false, 'parity name #37';
  assert public.moderation_is_clean($c$www . site$c$) = false, 'parity text #38';
  assert public.moderation_name_ok($c$www . site$c$) = false, 'parity name #38';
  assert public.moderation_is_clean($c$call 704-555-1234$c$) = false, 'parity text #39';
  assert public.moderation_name_ok($c$call 704-555-1234$c$) = false, 'parity name #39';
  assert public.moderation_is_clean($c$john.doe@gmail.com$c$) = false, 'parity text #40';
  assert public.moderation_name_ok($c$john.doe@gmail.com$c$) = false, 'parity name #40';
  assert public.moderation_is_clean($c$visit mysite.com today$c$) = false, 'parity text #41';
  assert public.moderation_name_ok($c$visit mysite.com today$c$) = true, 'parity name #41';
  assert public.moderation_is_clean($c$free-prizes.xyz$c$) = false, 'parity text #42';
  assert public.moderation_name_ok($c$free-prizes.xyz$c$) = true, 'parity name #42';
  assert public.moderation_is_clean($c$Pay me via Cash App$c$) = false, 'parity text #43';
  assert public.moderation_name_ok($c$Pay me via Cash App$c$) = true, 'parity name #43';
  assert public.moderation_is_clean($c$i accept zelle$c$) = false, 'parity text #44';
  assert public.moderation_name_ok($c$i accept zelle$c$) = true, 'parity name #44';
  assert public.moderation_is_clean($c$western union only$c$) = false, 'parity text #45';
  assert public.moderation_name_ok($c$western union only$c$) = true, 'parity name #45';
  assert public.moderation_is_clean($c$gift-cards only$c$) = false, 'parity text #46';
  assert public.moderation_name_ok($c$gift-cards only$c$) = true, 'parity name #46';
  assert public.moderation_is_clean($c$Be your own boss with our MLM$c$) = false, 'parity text #47';
  assert public.moderation_name_ok($c$Be your own boss with our MLM$c$) = true, 'parity name #47';
  assert public.moderation_is_clean($c$her address is 12 Oak St$c$) = false, 'parity text #48';
  assert public.moderation_name_ok($c$her address is 12 Oak St$c$) = true, 'parity name #48';
  assert public.moderation_is_clean($c$selling weed$c$) = false, 'parity text #49';
  assert public.moderation_name_ok($c$selling weed$c$) = true, 'parity name #49';
  assert public.moderation_is_clean($c$you should just kill yourself$c$) = false, 'parity text #50';
  assert public.moderation_name_ok($c$you should just kill yourself$c$) = false, 'parity name #50';
  assert public.moderation_is_clean($c$Graduated magna cum laude and cum on$c$) = false, 'parity text #51';
  assert public.moderation_name_ok($c$Graduated magna cum laude and cum on$c$) = false, 'parity name #51';
  assert public.moderation_is_clean($c$Sexual health nurse at Atrium$c$) = true, 'parity text #52';
  assert public.moderation_name_ok($c$Sexual health nurse at Atrium$c$) = true, 'parity name #52';
  assert public.moderation_is_clean($c$LGBTQ+ mentor for first-gen students$c$) = true, 'parity text #53';
  assert public.moderation_name_ok($c$LGBTQ+ mentor for first-gen students$c$) = true, 'parity name #53';
  assert public.moderation_is_clean($c$Rape crisis counselor and volunteer trainer$c$) = true, 'parity text #54';
  assert public.moderation_name_ok($c$Rape crisis counselor and volunteer trainer$c$) = true, 'parity name #54';
  assert public.moderation_is_clean($c$Dick$c$) = true, 'parity text #55';
  assert public.moderation_name_ok($c$Dick$c$) = true, 'parity name #55';
  assert public.moderation_is_clean($c$Cummings$c$) = true, 'parity text #56';
  assert public.moderation_name_ok($c$Cummings$c$) = true, 'parity name #56';
  assert public.moderation_is_clean($c$Graduated magna cum laude$c$) = true, 'parity text #57';
  assert public.moderation_name_ok($c$Graduated magna cum laude$c$) = true, 'parity name #57';
  assert public.moderation_is_clean($c$Summa cum laude$c$) = true, 'parity text #58';
  assert public.moderation_name_ok($c$Summa cum laude$c$) = true, 'parity name #58';
  assert public.moderation_is_clean($c$Hancock$c$) = true, 'parity text #59';
  assert public.moderation_name_ok($c$Hancock$c$) = true, 'parity name #59';
  assert public.moderation_is_clean($c$Scunthorpe$c$) = true, 'parity text #60';
  assert public.moderation_name_ok($c$Scunthorpe$c$) = true, 'parity name #60';
  assert public.moderation_is_clean($c$Cocktail bar manager$c$) = true, 'parity text #61';
  assert public.moderation_name_ok($c$Cocktail bar manager$c$) = true, 'parity name #61';
  assert public.moderation_is_clean($c$Sex education teacher$c$) = true, 'parity text #62';
  assert public.moderation_name_ok($c$Sex education teacher$c$) = true, 'parity name #62';
  assert public.moderation_is_clean($c$Breast cancer researcher$c$) = true, 'parity text #63';
  assert public.moderation_name_ok($c$Breast cancer researcher$c$) = true, 'parity name #63';
  assert public.moderation_is_clean($c$Product manager on the Zelle team$c$) = true, 'parity text #64';
  assert public.moderation_name_ok($c$Product manager on the Zelle team$c$) = true, 'parity name #64';
  assert public.moderation_is_clean($c$Engineer at Venmo$c$) = true, 'parity text #65';
  assert public.moderation_name_ok($c$Engineer at Venmo$c$) = true, 'parity name #65';
  assert public.moderation_is_clean($c$Western Union analyst$c$) = true, 'parity text #66';
  assert public.moderation_name_ok($c$Western Union analyst$c$) = true, 'parity name #66';
  assert public.moderation_is_clean($c$ML engineer$c$) = true, 'parity text #67';
  assert public.moderation_name_ok($c$ML engineer$c$) = true, 'parity name #67';
  assert public.moderation_is_clean($c$Studied MLM fraud as a regulator$c$) = true, 'parity text #68';
  assert public.moderation_name_ok($c$Studied MLM fraud as a regulator$c$) = true, 'parity name #68';
  assert public.moderation_is_clean($c$I survived the dot-com bubble$c$) = true, 'parity text #69';
  assert public.moderation_name_ok($c$I survived the dot-com bubble$c$) = true, 'parity name #69';
  assert public.moderation_is_clean($c$B.Com and M.Com graduate$c$) = true, 'parity text #70';
  assert public.moderation_name_ok($c$B.Com and M.Com graduate$c$) = true, 'parity name #70';
  assert public.moderation_is_clean($c$Built Node.js and ASP.NET services$c$) = true, 'parity text #71';
  assert public.moderation_name_ok($c$Built Node.js and ASP.NET services$c$) = true, 'parity name #71';
  assert public.moderation_is_clean($c$Pest control: rats are vermin$c$) = true, 'parity text #72';
  assert public.moderation_name_ok($c$Pest control: rats are vermin$c$) = true, 'parity name #72';
  assert public.moderation_is_clean($c$Reported monthly returns to clients$c$) = true, 'parity text #73';
  assert public.moderation_name_ok($c$Reported monthly returns to clients$c$) = true, 'parity name #73';
  assert public.moderation_is_clean($c$Built USDC payments at a fintech$c$) = true, 'parity text #74';
  assert public.moderation_name_ok($c$Built USDC payments at a fintech$c$) = true, 'parity name #74';
  assert public.moderation_is_clean($c$OTP authentication engineer$c$) = true, 'parity text #75';
  assert public.moderation_name_ok($c$OTP authentication engineer$c$) = true, 'parity name #75';
  assert public.moderation_is_clean($c$I offer more than just coffee chats$c$) = true, 'parity text #76';
  assert public.moderation_name_ok($c$I offer more than just coffee chats$c$) = true, 'parity name #76';
  assert public.moderation_is_clean($c$I want to kill it at my interview$c$) = true, 'parity text #77';
  assert public.moderation_name_ok($c$I want to kill it at my interview$c$) = true, 'parity name #77';
  assert public.moderation_is_clean($c$Raccoon rescue volunteer$c$) = true, 'parity text #78';
  assert public.moderation_name_ok($c$Raccoon rescue volunteer$c$) = true, 'parity name #78';
  assert public.moderation_is_clean($c$Middlesex Community College$c$) = true, 'parity text #79';
  assert public.moderation_name_ok($c$Middlesex Community College$c$) = true, 'parity name #79';
  assert public.moderation_is_clean($c$Essex$c$) = true, 'parity text #80';
  assert public.moderation_name_ok($c$Essex$c$) = true, 'parity name #80';
  assert public.moderation_is_clean($c$assess$c$) = true, 'parity text #81';
  assert public.moderation_name_ok($c$assess$c$) = true, 'parity name #81';
  assert public.moderation_is_clean($c$Classic cars$c$) = true, 'parity text #82';
  assert public.moderation_name_ok($c$Classic cars$c$) = true, 'parity name #82';
  assert public.moderation_is_clean($c$我是软件工程师，喜欢帮助新人$c$) = true, 'parity text #83';
  assert public.moderation_name_ok($c$我是软件工程师，喜欢帮助新人$c$) = true, 'parity name #83';
  assert public.moderation_is_clean($c$مهندسة برمجيات في شارلوت$c$) = true, 'parity text #84';
  assert public.moderation_name_ok($c$مهندسة برمجيات في شارلوت$c$) = true, 'parity name #84';
  assert public.moderation_is_clean($c$Zoë Ðoàn-Nguyễn$c$) = true, 'parity text #85';
  assert public.moderation_name_ok($c$Zoë Ðoàn-Nguyễn$c$) = true, 'parity name #85';
  assert public.moderation_is_clean($c$O'Brien-Smith$c$) = true, 'parity text #86';
  assert public.moderation_name_ok($c$O'Brien-Smith$c$) = true, 'parity name #86';
  assert public.moderation_is_clean($c$Νίκος Παπαδόπουλος$c$) = true, 'parity text #87';
  assert public.moderation_name_ok($c$Νίκος Παπαδόπουλος$c$) = true, 'parity name #87';
  assert public.moderation_is_clean($c$Наташа Кокорина$c$) = true, 'parity text #88';
  assert public.moderation_name_ok($c$Наташа Кокорина$c$) = true, 'parity name #88';
  assert public.moderation_is_clean($c$प्रिया शर्मा$c$) = true, 'parity text #89';
  assert public.moderation_name_ok($c$प्रिया शर्मा$c$) = true, 'parity name #89';
  assert public.moderation_is_clean($c$José Martínez Ñúñez$c$) = true, 'parity text #90';
  assert public.moderation_name_ok($c$José Martínez Ñúñez$c$) = true, 'parity name #90';
  assert public.moderation_is_clean($c$Øyvind Ærø$c$) = true, 'parity text #91';
  assert public.moderation_name_ok($c$Øyvind Ærø$c$) = true, 'parity name #91';
  assert public.moderation_is_clean($c$Nguyễn Thị Minh Khai$c$) = true, 'parity text #92';
  assert public.moderation_name_ok($c$Nguyễn Thị Minh Khai$c$) = true, 'parity name #92';
  assert public.moderation_is_clean($c$김민준$c$) = true, 'parity text #93';
  assert public.moderation_name_ok($c$김민준$c$) = true, 'parity name #93';
  assert public.moderation_is_clean($c$Siobhán Ní Bhriain$c$) = true, 'parity text #94';
  assert public.moderation_name_ok($c$Siobhán Ní Bhriain$c$) = true, 'parity name #94';
  assert public.moderation_is_clean($c$Mbɔ́ŋ$c$) = true, 'parity text #95';
  assert public.moderation_name_ok($c$Mbɔ́ŋ$c$) = true, 'parity name #95';
  assert public.moderation_is_clean($c$Booking.com$c$) = false, 'parity text #96';
  assert public.moderation_name_ok($c$Booking.com$c$) = true, 'parity name #96';
  assert public.moderation_is_clean($c$Salesforce.com$c$) = false, 'parity text #97';
  assert public.moderation_name_ok($c$Salesforce.com$c$) = true, 'parity name #97';
  assert public.moderation_is_clean($c$Mentor at Black Women in Tech$c$) = true, 'parity text #98';
  assert public.moderation_name_ok($c$Mentor at Black Women in Tech$c$) = true, 'parity name #98';
  assert public.moderation_is_clean($c$Trans people mentoring network$c$) = true, 'parity text #99';
  assert public.moderation_name_ok($c$Trans people mentoring network$c$) = true, 'parity name #99';
  assert public.moderation_is_clean($c$Hablo español y English$c$) = true, 'parity text #100';
  assert public.moderation_name_ok($c$Hablo español y English$c$) = true, 'parity name #100';
end $parity$;
-- <<< parity

select 'moderation: all checks passed' as result;
rollback;
