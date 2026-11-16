-- Mandatory government photo ID + selfie for real membership (Phase 3). Idempotent: safe to run again.
-- Mirrored in supabase/schema.sql. Authorization checks: supabase/tests/id_gate.sql.
-- Re-running it after the later migrations is safe: sections 5-7 are superseded by 20261116200000 (alert_candidates),
-- 20261116220000 (rate_check) and 20261116180000/220000 (profile grants), and run only while those haven't been applied.
--
-- One predicate decides real membership: public.is_real_member(uid) =
--   profiles.id_verified (set only by identity-webhook for a LIVE-mode verified event)
--   AND id_verifications.status = 'verified' AND id_verifications.livemode.
-- A Stripe test-mode pass (livemode=false), an id_verified flag without a live verified row, and the email badge
-- (profiles.verified) never count. The gate is always on: there is no switch. Existing rows are not changed; a stale
-- flag simply stops counting.
--
-- Covered: profiles (other people's rows), nearby_profiles + people search (via profiles RLS), experiences of others,
-- alert_candidates, connection_requests (read, send, accept), messages (read, send), rate_check trust.
-- Not gated (always allowed): your own profile row (insert/update before verifying), your own id_verifications row,
-- experiences you own, blocks, mutes, reports, set_my_area, hidden_event_ids.
-- Events (Meetup/Devpost listings) and Open Doors are not stored in this database, so they have nothing to gate here.

-- 1) The predicate. plpgsql so schema.sql can define it before id_verifications exists (bodies resolve at run time).
create or replace function public.is_real_member(uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return uid is not null and exists (
    select 1
    from public.profiles p
    join public.id_verifications v on v.user_id = p.id
    where p.id = uid and p.id_verified and v.status = 'verified' and v.livemode
  );
end;
$$;
revoke all on function public.is_real_member(uuid) from public, anon;
grant execute on function public.is_real_member(uuid) to authenticated;

-- 2) No switch. id_gate_on() stays only so older app builds that call it get "on"; app_config can't turn it off.
create or replace function public.id_gate_on()
returns boolean
language sql
immutable
set search_path = ''
as $$ select true $$;
revoke all on function public.id_gate_on() from public, anon;
grant execute on function public.id_gate_on() to authenticated;
delete from public.app_config where key = 'id_gate';

-- 3) Connection requests: sender and recipient must both be real members.
create or replace function public.require_id_for_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select p.hidden from public.profiles p where p.id = new.from_user), false) then
    raise exception 'account_restricted' using errcode = '42501';
  end if;
  if not public.is_real_member(new.from_user) then
    raise exception 'id_required' using errcode = '42501';
  end if;
  if not public.is_real_member(new.to_user) then
    raise exception 'recipient_unavailable' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists connection_requests_require_id on public.connection_requests;
create trigger connection_requests_require_id
  before insert on public.connection_requests
  for each row execute function public.require_id_for_requests();

-- Accepting needs both people to still be real members. Declining and cancelling stay allowed.
create or replace function public.requests_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.from_user <> old.from_user or new.to_user <> old.to_user or new.message <> old.message or new.created_at <> old.created_at then
    raise exception 'Only the status of a request can change';
  end if;
  if new.status = old.status then
    return new;
  end if;
  if new.status in ('accepted', 'declined') and not (old.status = 'requested' and auth.uid() = old.to_user) then
    raise exception 'Only the recipient can accept or decline a pending request';
  end if;
  if new.status = 'accepted' and not (public.is_real_member(old.from_user) and public.is_real_member(old.to_user)) then
    raise exception 'id_required' using errcode = '42501';
  end if;
  if new.status = 'cancelled' and not (old.status in ('requested', 'accepted') and auth.uid() in (old.from_user, old.to_user)) then
    raise exception 'This request can no longer be cancelled';
  end if;
  if new.status = 'requested' then
    raise exception 'A request cannot go back to pending';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- 4) Row level security. Your own row is always yours; other people only between two real members.
drop policy if exists "profiles: read visible" on public.profiles;
create policy "profiles: read visible" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (
      (select public.is_real_member((select auth.uid())))
      and public.is_real_member(id)
      and not hidden
      and not public.is_blocked((select auth.uid()), id)
      and (discoverable or public.has_connection((select auth.uid()), id))
    )
  );

drop policy if exists "requests: participants read" on public.connection_requests;
create policy "requests: participants read" on public.connection_requests
  for select to authenticated
  using ((select auth.uid()) in (from_user, to_user) and (select public.is_real_member((select auth.uid()))));

drop policy if exists "messages: participants read" on public.messages;
create policy "messages: participants read" on public.messages
  for select to authenticated
  using (public.is_participant(request_id) and (select public.is_real_member((select auth.uid()))));

drop policy if exists "messages: send when accepted" on public.messages;
create policy "messages: send when accepted" on public.messages
  for insert to authenticated
  with check (
    sender = (select auth.uid())
    and exists (
      select 1 from public.connection_requests r
      where r.id = request_id and r.status = 'accepted' and (select auth.uid()) in (r.from_user, r.to_user)
        and public.is_real_member(r.from_user) and public.is_real_member(r.to_user)
    )
  );

drop policy if exists "experiences: read own or shown" on public.experiences;
create policy "experiences: read own or shown" on public.experiences
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      (select public.is_real_member((select auth.uid())))
      and public.is_real_member(user_id)
      and not public.is_blocked((select auth.uid()), user_id)
      and exists (
        select 1 from public.profiles p
        where p.id = experiences.user_id
          and p.show_experience
          and (p.discoverable or public.has_connection((select auth.uid()), p.id))
      )
    )
  );

-- 5) Nearby alerts: only between real members (was: email-verified). Non-members get an empty list.
-- Skipped once 20261116200000 is applied (it replaces this with the origin-free alert_candidates()).
do $guard$
begin
  if to_regclass('public.nearby_alert_prefs') is not null then return; end if;
  execute $sql$
create or replace function public.alert_candidates(lat double precision, lng double precision, radius_mi double precision default 1)
returns table (id uuid, name text, field text, distance_mi numeric)
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public.is_real_member(auth.uid()) then return; end if;
  insert into public.alert_rate as r (user_id, window_start, calls) values (auth.uid(), now(), 1)
  on conflict (user_id) do update set
    window_start = case when r.window_start < now() - interval '1 minute' then now() else r.window_start end,
    calls = case when r.window_start < now() - interval '1 minute' then 1 else r.calls + 1 end
  returning calls into n;
  if n > 12 then raise exception 'rate limit exceeded' using errcode = '54000'; end if;

  return query
  select p.id,
         trim(p.first_name || ' ' || left(p.last_name, 1) || case when p.last_name <> '' then '.' else '' end),
         p.field,
         round((st_distance(
           st_setsrid(st_makepoint(p.area_lng, p.area_lat), 4326)::geography,
           st_setsrid(st_makepoint(me.area_lng, me.area_lat), 4326)::geography) / 1609.344)::numeric, 1)
  from public.profiles p
  join public.profiles me on me.id = auth.uid()
  where me.field is not null
    and me.share_mode = 'area' and me.discoverable
    and me.area_lat is not null and me.area_lng is not null
    and me.area_seen_at > now() - interval '30 minutes'
    and p.field = me.field
    and p.id <> me.id
    and not exists (select 1 from public.mutes mu where mu.muter = auth.uid() and mu.muted = p.id)
    and public.is_real_member(p.id)
    and p.discoverable
    and p.area_lat is not null and p.area_lng is not null
    and p.area_seen_at > now() - interval '30 minutes'
    and st_dwithin(
          st_setsrid(st_makepoint(p.area_lng, p.area_lat), 4326)::geography,
          st_setsrid(st_makepoint(me.area_lng, me.area_lat), 4326)::geography,
          least(greatest(coalesce(radius_mi, 1), 0), 5) * 1609.344
        )
  order by 4
  limit 100;
end;
$$;
  $sql$;
  revoke all on function public.alert_candidates(double precision, double precision, double precision) from public, anon;
  grant execute on function public.alert_candidates(double precision, double precision, double precision) to authenticated;
end $guard$;

-- 6) Rate limits: the relaxed limit needs real membership (or email), never a bare id_verified flag.
-- Skipped once 20261116220000 is applied (its rate_check keeps this rule and adds a per-user lock).
do $guard$
begin
  if to_regprocedure('public.rate_check_uid(uuid, text, integer, integer, interval)') is not null then return; end if;
  execute $sql$
create or replace function public.rate_check(p_kind text, p_limit_strict int, p_limit int, p_window interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  is_strict boolean;
  n int;
begin
  if uid is null then return; end if; -- service role / SQL editor are not limited
  is_strict := coalesce((select u.created_at > now() - interval '24 hours' from auth.users u where u.id = uid), true)
            or not (coalesce((select p.verified from public.profiles p where p.id = uid), false) or public.is_real_member(uid));
  select count(*) into n from public.rate_log where user_id = uid and kind = p_kind and at > now() - p_window;
  if n >= (case when is_strict then p_limit_strict else p_limit end) then
    raise exception 'rate_limited: slow down and try again later' using errcode = '54000';
  end if;
  insert into public.rate_log (user_id, kind) values (uid, p_kind);
  delete from public.rate_log where user_id = uid and at < now() - interval '2 days';
end;
$$;
  $sql$;
end $guard$;
revoke all on function public.rate_check(text, int, int, interval) from public, anon, authenticated;

-- 7) Column-level write grants on profiles. The app can write only its own profile fields; the badges
-- (verified*, id_verified*), hidden, created_at and updated_at are server-only (the triggers also reset them).
-- id_verifications stays read-own only (no client insert/update/delete).
revoke insert, update on public.profiles from anon, authenticated;
-- Skipped once 20261116180000 is applied (profiles are then written only through profile-write, see that migration).
do $guard$
begin
  if to_regclass('public.profile_drafts') is not null then return; end if;
  grant insert (id, first_name, last_name, status, org, intro, offer, field, from_field, mode, goals, challenges, want_traits,
                interests, skills, languages, foods, diet, availability, meet_mode, share_mode, discoverable, show_experience,
                area_name, area_lat, area_lng)
    on public.profiles to authenticated;
  grant update (id, first_name, last_name, status, org, intro, offer, field, from_field, mode, goals, challenges, want_traits,
                interests, skills, languages, foods, diet, availability, meet_mode, share_mode, discoverable, show_experience,
                area_name, area_lat, area_lng, area_seen_at)
    on public.profiles to authenticated;
end $guard$;
revoke all on public.id_verifications from anon, authenticated;
grant select on public.id_verifications to authenticated;
