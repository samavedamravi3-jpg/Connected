-- Connected. database schema.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste this file -> Run.
-- Safe to run again: it only creates what's missing and replaces policies and functions.
--
-- Privacy is enforced here, in the database, so the app can't leak data even if it has a bug:
--   * Profiles are visible only when discoverable (or when you share a request), never across a block.
--   * Locations are stored at neighborhood level (rounded to ~1 km); "public places only" stores none.
--   * Requests and messages are visible only to the two people involved.
--   * Messages can only be sent after a request is accepted.
--   * Other people's data and every interaction need real membership on both sides: a live-mode government ID +
--     selfie check (public.is_real_member). Your own profile can be created and edited before that.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  status text,
  org text not null default '',
  intro text not null default '',
  offer text not null default '',
  field text,
  from_field text,
  mode text not null default 'seeking',
  goals text[] not null default '{}',
  challenges text[] not null default '{}',
  want_traits text[] not null default '{}',
  interests text[] not null default '{}',
  skills text[] not null default '{}',
  languages text[] not null default '{English}',
  foods text[] not null default '{}',
  diet text[] not null default '{}',
  availability text[] not null default '{}',
  meet_mode text not null default 'either',
  share_mode text not null default 'public',
  discoverable boolean not null default true,
  area_name text,
  area_lat double precision,
  area_lng double precision,
  updated_at timestamptz not null default now(),
  constraint profiles_name_len check (char_length(first_name) <= 60 and char_length(last_name) <= 60),
  constraint profiles_text_len check (char_length(intro) <= 400 and char_length(offer) <= 300 and char_length(org) <= 120)
);
-- Set by the report auto-hide (see the misuse controls at the end of this file); the app cannot change it.
alter table public.profiles add column if not exists hidden boolean not null default false;

create table if not exists public.blocks (
  blocker uuid not null references auth.users (id) on delete cascade default auth.uid(),
  blocked uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);

create table if not exists public.connection_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users (id) on delete cascade default auth.uid(),
  to_user uuid not null references auth.users (id) on delete cascade,
  message text not null check (char_length(message) between 1 and 600),
  status text not null default 'requested' check (status in ('requested', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_user <> to_user)
);

-- At most one open (requested/accepted) connection between any two people.
create unique index if not exists connection_requests_one_open
  on public.connection_requests (least(from_user, to_user), greatest(from_user, to_user))
  where status in ('requested', 'accepted');
create index if not exists connection_requests_to_user on public.connection_requests (to_user);
create index if not exists connection_requests_from_user on public.connection_requests (from_user);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.connection_requests (id) on delete cascade,
  sender uuid not null references auth.users (id) on delete cascade default auth.uid(),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_request on public.messages (request_id, created_at);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references auth.users (id) on delete cascade default auth.uid(),
  reported uuid not null references auth.users (id) on delete cascade,
  reason text not null check (char_length(reason) <= 200),
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- True when either person has blocked the other. Security definer so it can see both rows.
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker = a and blocked = b) or (blocker = b and blocked = a)
  );
$$;

-- True when the two people have any request between them (so names still show in the inbox).
create or replace function public.has_connection(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.connection_requests
    where (from_user = a and to_user = b) or (from_user = b and to_user = a)
  );
$$;

create or replace function public.is_participant(req uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.connection_requests
    where id = req and auth.uid() in (from_user, to_user)
  );
$$;

-- Real membership (mandatory government photo ID + selfie). The single predicate behind every gate on other people's
-- data and on interactions: profiles.id_verified (set only by identity-webhook for a LIVE-mode check) AND a live
-- verified id_verifications row. A Stripe test pass, a bare id_verified flag and the email badge never count.
-- Always on: there is no switch. plpgsql so it can be defined before id_verifications (bodies resolve at run time).
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

-- Profiles: keep location coarse, and store none for "public places only".
create or replace function public.profiles_before_write()
returns trigger
language plpgsql
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
  elsif new.area_seen_at is distinct from old.area_seen_at and coalesce(current_setting('app.area_write', true), '') <> '1' then
    new.area_seen_at := old.area_seen_at;
  end if;
  if new.share_mode = 'public' or not new.discoverable then
    new.area_seen_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_before_write on public.profiles;
create trigger profiles_before_write
  before insert or update on public.profiles
  for each row execute function public.profiles_before_write();

-- Requests: only status can change, and only in allowed ways.
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

drop trigger if exists requests_before_update on public.connection_requests;
create trigger requests_before_update
  before update on public.connection_requests
  for each row execute function public.requests_before_update();

-- People near a point, within radius_mi. Runs with the caller's permissions, so RLS applies.
create or replace function public.nearby_profiles(lat double precision, lng double precision, radius_mi double precision default 25)
returns setof public.profiles
language sql
stable
security invoker
set search_path = public
as $$
  select p.*
  from public.profiles p
  where p.id <> auth.uid()
    and p.discoverable
    and p.area_lat is not null
    and p.area_lat between lat - radius_mi / 69.0 and lat + radius_mi / 69.0
    and 3958.8 * 2 * asin(sqrt(
          power(sin(radians(p.area_lat - lat) / 2), 2) +
          cos(radians(lat)) * cos(radians(p.area_lat)) * power(sin(radians(p.area_lng - lng) / 2), 2)
        )) <= radius_mi
  limit 300;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.blocks enable row level security;
alter table public.connection_requests enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;

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

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- No delete policy: a hidden user must not be able to delete and re-insert to clear the flag. Accounts are removed via auth.users (cascade).
drop policy if exists "profiles: delete own" on public.profiles;

drop policy if exists "blocks: own" on public.blocks;
create policy "blocks: own" on public.blocks
  for all to authenticated using (blocker = auth.uid()) with check (blocker = auth.uid());

drop policy if exists "requests: participants read" on public.connection_requests;
create policy "requests: participants read" on public.connection_requests
  for select to authenticated
  using ((select auth.uid()) in (from_user, to_user) and (select public.is_real_member((select auth.uid()))));

drop policy if exists "requests: send" on public.connection_requests;
create policy "requests: send" on public.connection_requests
  for insert to authenticated
  with check (from_user = auth.uid() and status = 'requested' and not public.is_blocked(from_user, to_user));

drop policy if exists "requests: participants update" on public.connection_requests;
create policy "requests: participants update" on public.connection_requests
  for update to authenticated
  using (auth.uid() in (from_user, to_user))
  with check (auth.uid() in (from_user, to_user));

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

drop policy if exists "reports: file own" on public.reports;
create policy "reports: file own" on public.reports
  for insert to authenticated with check (reporter = auth.uid());

-- ---------------------------------------------------------------------------
-- Access for signed-in users only (RLS above decides which rows)
-- ---------------------------------------------------------------------------

revoke all on public.profiles, public.blocks, public.connection_requests, public.messages, public.reports from anon;
-- Profiles: read here; insert/update are column-level grants at the end of this file (the app can't write badges or flags).
grant select on public.profiles to authenticated;
revoke insert, update, delete on public.profiles from authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select, insert, update on public.connection_requests to authenticated;
grant select, insert on public.messages to authenticated;
grant insert on public.reports to authenticated;
grant execute on function public.nearby_profiles(double precision, double precision, double precision) to authenticated;
grant execute on function public.is_blocked(uuid, uuid), public.has_connection(uuid, uuid), public.is_participant(uuid) to authenticated;
revoke all on function public.is_real_member(uuid) from public, anon;
grant execute on function public.is_real_member(uuid) to authenticated;
revoke execute on function public.nearby_profiles(double precision, double precision, double precision) from anon;

-- ---------------------------------------------------------------------------
-- Live updates for requests and messages
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'connection_requests') then
    alter publication supabase_realtime add table public.connection_requests;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Verified badge (phase 1: school or work email by one-time code)
-- ---------------------------------------------------------------------------
-- Only true/false, the date and the kind are stored. Never the email address, and never ID photos.
-- Clients cannot set these columns: the verify-email edge function does it with the service role
-- (supabase/functions/verify-email). The trigger below resets any attempt from the app.

alter table public.profiles add column if not exists verified boolean not null default false;
alter table public.profiles add column if not exists verified_at timestamptz;
alter table public.profiles add column if not exists verified_kind text;
alter table public.profiles drop constraint if exists profiles_verified_kind_check;
alter table public.profiles add constraint profiles_verified_kind_check check (verified_kind is null or verified_kind in ('school', 'work', 'id'));

create or replace function public.profiles_protect_verified()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Runs as the caller, so current_user is 'authenticated' for app requests and a privileged
  -- role (service_role, postgres) for the edge function and the SQL editor.
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.verified := false;
      new.verified_at := null;
      new.verified_kind := null;
    else
      new.verified := old.verified;
      new.verified_at := old.verified_at;
      new.verified_kind := old.verified_kind;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_verified on public.profiles;
create trigger profiles_protect_verified
  before insert or update on public.profiles
  for each row execute function public.profiles_protect_verified();

-- ---------------------------------------------------------------------------
-- ID verification (provider-agnostic; Stripe Identity in test mode first)
-- ---------------------------------------------------------------------------
-- We never store ID images or numbers: only the provider's session id, a status, the test/live flag, an error code and timestamps.
-- id_verifications is private (a user can read only their own row; nobody but the service role can write).
-- profiles.id_verified is the public badge. A trigger resets any attempt by the app to change it, so only the
-- identity-webhook edge function (service role, after checking the provider's signed webhook) can set it.

create table if not exists public.id_verifications (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null,
  session_id text not null,
  status text not null default 'pending' check (status in ('unverified', 'pending', 'verified', 'rejected')),
  updated_at timestamptz not null default now()
);
-- Minimal metadata only. status: started (session created, nothing submitted) / pending (Stripe processing) /
-- verified / rejected (needs another attempt; last_error is Stripe's code, e.g. document_expired) / canceled.
-- livemode=false rows are Stripe test mode: "verified" there never sets profiles.id_verified (the webhook only grants
-- the public badge for live mode). event_at = created time of the last applied webhook event (ordering guard).
alter table public.id_verifications add column if not exists livemode boolean not null default false;
alter table public.id_verifications add column if not exists last_error text;
alter table public.id_verifications add column if not exists event_at timestamptz;
alter table public.id_verifications add column if not exists created_at timestamptz not null default now();
do $$
declare c text;
begin -- drop the old status check whatever it was named (the table has no other check constraints)
  for c in select conname from pg_constraint where conrelid = 'public.id_verifications'::regclass and contype = 'c' loop
    execute format('alter table public.id_verifications drop constraint %I', c);
  end loop;
end $$;
alter table public.id_verifications add constraint id_verifications_status_check
  check (status in ('unverified', 'started', 'pending', 'verified', 'rejected', 'canceled'));
alter table public.id_verifications enable row level security;
drop policy if exists "id_verifications: read own" on public.id_verifications;
create policy "id_verifications: read own" on public.id_verifications for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.id_verifications from anon, authenticated;
grant select on public.id_verifications to authenticated;

alter table public.profiles add column if not exists id_verified boolean not null default false;
alter table public.profiles add column if not exists id_verified_at timestamptz;

create or replace function public.profiles_protect_id_verified()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.id_verified := false;
      new.id_verified_at := null;
    else
      new.id_verified := old.id_verified;
      new.id_verified_at := old.id_verified_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_id_verified on public.profiles;
create trigger profiles_protect_id_verified
  before insert or update on public.profiles
  for each row execute function public.profiles_protect_id_verified();

-- The ID gate is mandatory and always on (public.is_real_member, defined with the helpers above). There is no switch:
-- id_gate_on() is a constant kept only for older app builds that still call it, and app_config can't turn it off.
create table if not exists public.app_config (key text primary key, value text not null);
alter table public.app_config enable row level security; -- no policies: service role / SQL editor only
revoke all on public.app_config from anon, authenticated;
delete from public.app_config where key = 'id_gate';

create or replace function public.id_gate_on()
returns boolean
language sql
immutable
set search_path = ''
as $$ select true $$;
revoke all on function public.id_gate_on() from public, anon;
grant execute on function public.id_gate_on() to authenticated;

-- Only real members can send connection requests, and only to real members (the API cannot bypass this).
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

-- ---------------------------------------------------------------------------
-- Content guardrails
-- ---------------------------------------------------------------------------

-- >>> moderation (generated by scripts/gen-moderation-sql.ts; do not edit by hand)
-- Same rules as supabase/functions/_shared/moderationRules.ts, enforced in the database so a modified app cannot bypass them.
-- Blocks slurs, hate, sexual content, harassment, threats, scams, contact details and links, including leetspeak,
-- spaced-out and stretched letters, zero-width characters and lookalike letters. Rules only: the contextual AI check
-- runs in the profile-write edge function, never from SQL. Not evasion-proof.

create or replace function public.moderation_normalize(t text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  s text;
  tok text;
  run text := '';
  res text[] := '{}';
  ch text;
begin
  s := normalize(lower(coalesce(t, '')), NFKD);
  s := regexp_replace(s, '[\u0300-\u036f\u200b-\u200f\u2060-\u2064\ufeff\u00ad\u180e]', '', 'g');
  s := translate(s, 'аеорсухкмнтвіјѕԁԛԝӏοαεικνυρτχɑɡıℓøłđսօոհցզᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘʀꜱᴛᴜᴠᴡʏᴢ', 'aeopcyxkmhtbijsdqwloaeikvuptxagilolduonhgqabcdefghijklmnoprstuvwyz');
  -- "!", "|" and "+" stand in for letters only when a letter follows (k!ll), so "income!!!" stays "income".
  s := regexp_replace(s, '!(?=[a-z0-9@$])', 'i', 'g');
  s := regexp_replace(s, '[|](?=[a-z0-9@$])', 'i', 'g');
  s := regexp_replace(s, '[+](?=[a-z0-9@$])', 't', 'g');
  s := translate(s, '01345789@$', 'oieastbgas');
  s := btrim(regexp_replace(s, '[^a-z]+', ' ', 'g'));
  if s = '' then return ''; end if;
  foreach tok in array string_to_array(s, ' ') loop
    if length(tok) = 1 then
      run := run || tok;
    else
      if length(run) >= 3 then res := res || run;
      elsif run <> '' then
        foreach ch in array regexp_split_to_array(run, '') loop res := res || ch; end loop;
      end if;
      run := '';
      res := res || tok;
    end if;
  end loop;
  if length(run) >= 3 then res := res || run;
  elsif run <> '' then
    foreach ch in array regexp_split_to_array(run, '') loop res := res || ch; end loop;
  end if;
  return regexp_replace(array_to_string(res, ' '), '(.)\1{2,}', '\1', 'g');
end;
$$;

-- Raw text: accents, zero-width characters and lookalike letters folded; digits and symbols kept (phones, links, handles).
create or replace function public.moderation_raw(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(
    lower(regexp_replace(normalize(coalesce(t, ''), NFKC), '[\u0300-\u036f\u200b-\u200f\u2060-\u2064\ufeff\u00ad\u180e]', '', 'g')),
    'аеорсухкмнтвіјѕԁԛԝӏοαεικνυρτχɑɡıℓøłđսօոհցզᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘʀꜱᴛᴜᴠᴡʏᴢ', 'aeopcyxkmhtbijsdqwloaeikvuptxagilolduonhgqabcdefghijklmnoprstuvwyz');
$$;

-- Free text (bios, messages, notes, chips): every list, contact details and links.
create or replace function public.moderation_is_clean(t text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select t is null or (
    public.moderation_normalize(t) !~ '\y(?:nigg?(er|ers|a|as|ah|ahs)|fag+(ot|ots|s)?|dykes?|tranny|trannies|retard(ed|s)?|chinks?|spics?|kikes?|wetbacks?|gooks?|coons?|pakis?|beaners?|towel ?heads?|sand ?nigg?(er|a)s?|raghead|cunts?|(immigrants|foreigners|refugees|muslims|jews|christians|blacks|whites|asians|mexicans|indians|gays|lesbians|trans people|women|men) (are|r) (all )?(vermin|subhuman|cockroaches|parasites|animals|savages|filth|inferior|a disease|a plague)|(gas|exterminate|deport all) (the )?(jews|muslims|immigrants|gays|blacks)|porn(o|ography)?|nudes?|send nudes|horny|sexy|sex(ting| chat| tape)|blow ?jobs?|hand ?jobs?|cum(?! laude)|cumshot|boobs?|tits|titties|pussy|pussies|penis|vagina|orgasm|dildo|only ?fans|naked|one night stand|hook ?up with me|sleep with me|slut(s|ty)?|whores?|cock ?suckers?|dick ?heads?|jerk ?off|masturbat(e|ing|ion)|erotic|fetish|escort service|sugar (daddy|daddies|baby|babies|mama|momma)|dtf|fwb|friends with benefits|nsfw|no strings attached|netflix and chill|fuck ?(you|off|u)|fuck ?(ing)? (idiot|loser|moron)|f u|stfu|shut ?the ?fuck ?up|go to hell|go ?fuck ?yourself|(mother ?)?fuck(ing|ed|er|ers|s)?|(fvck|phuck|fuk|fck|fuq)(ing|ed|er|s)? ?(you|off|u)?|bitch(es)?|bastards?|asshole|dumb ?ass|son of a bitch|(you are|you re|u r|ur|youre) (so |such a |a |an )?(stupid|ugly|worthless|useless|pathetic|idiot|loser|moron|trash|garbage|disgusting|fat|retard(ed)?)|nobody (likes|wants|loves) you|i hate you|hope you (die|rot|suffer)|kill your ?self|kys|go (die|kill yourself)|stalk(ing)? you|i m watching you|i am watching you|send me (pics|pictures|photos)|show me your (body|boobs|tits)|(i|we) (will|ll|m going to|am going to|gonna|ma) (kill|hurt|find|beat|shoot|stab|rape|murder|ruin|destroy) (you|u|your family|ur family)|i know where you (live|work|are)|i will find you|i ll find you|watch your back|you re (dead|going to die)|you are (dead|going to die)|you will (pay|regret|die)|shoot (you|up)|stab you|bomb (threat|the|this)|rape (you|her|him)|rapist|kill ?(you|him|her|them)|beat you up|burn your (house|home)|i have a (gun|knife)|you ll (pay|regret|die)|(make|making) you pay|guaranteed (returns?|profits?|income|roi|winnings)|risk ?free (investment|returns?|profits?)|double your (money|investment|bitcoin|crypto)|investment opportunit(y|ies)|invest (with|in) (me|my|our)|crypto (investment|trading|signals?|giveaway|mining|opportunity|doubler)|bitcoin (investment|trading|doubler|giveaway|mining)|forex (trading|signals?)|binary options?|passive income|trading (signals?|bot|mentor)|airdrop|get rich|financial freedom|unlimited income|make (money|cash) (fast|online|from home)|earn (money|cash|income) (fast|online|daily|weekly|from home)|easy money|quick money|wallet address|seed phrase|recovery phrase|triple (your|my) (money|investment|crypto|bitcoin)|(send|buy|pay|deposit|transfer) (in |me |us |some )?(usdt|usdc|tether)|(usdt|usdc|tether) (wallet|address|only|payment)|(huge|massive|insane) (gains|returns|profits?)|(gains|profits?) (every|each|per|a) (day|week|month)|send (me |us )?(some )?(money|cash|funds)|wire (me|us) (money|cash|funds)|(via|through|by|send|wire|use) (western union|moneygram)|(western union|moneygram) (only|me|us|transfer)|gift ?cards?|(pay|send|via|through|accept|accepting) (me |us )?(on |via |through |with )?(venmo|zelle|cash ?app|paypal|apple pay)|(venmo|zelle|cash ?app|paypal|apple pay) (me|us|only|accepted|handle|id|username)|paypal (me|us)|pay (me|us) (via|through|on|with)|(dm|message|text|add|contact|hit) (me|us) (on|at|via) (telegram|whatsapp|snapchat|snap|signal|instagram|insta|wechat|kik|discord)|(telegram|whatsapp|snapchat|snap|wechat|kik) (me|us)|my (telegram|whatsapp|snapchat|snap|wechat|kik) (is|id|handle|number)|(gmail|yahoo|hotmail|outlook|icloud|proton ?mail|proton) (dot )?com|(?!the |a |of )[a-z]+ dot (com|net|org|io|me|co|ly|xyz|app|gg|info|biz)|act now|limited time (offer|only)?|last chance|don t miss out|offer expires|respond (immediately|asap|now)|urgent(ly)? (reply|response|action|need)|verify your (account|identity|bank|password|id)|confirm your (password|account|bank)|click (here|the link|this link|below)|you have (won|been selected)|claim your (prize|reward|gift)|account (has been )?(suspended|locked|compromised)|login to claim|(send|share|give|tell|text) me (your |the )?(code|otp|password|passcode|login|pin|verification code|one time code|six digit code|digit code)|one time (code|password|passcode)|multi ?level marketing (team|opportunity|business|company)|(join|our|my) (an? )?(mlm|multi ?level marketing)|(mlm|multi ?level marketing) (team|opportunity|business)|be your own boss|work from home opportunity|no experience (needed|necessary|required) (job|work|offer)|join my (team|downline|business)|pay (a|an|the) (training|registration|starter|application|processing) fee|recruiting (now|today)|ground floor opportunity|you should (just )?(kill|hurt|harm|cut|hang) your ?self|(just )?(go )?(end|take) your (own )?life|do (everyone|us all|the world) a favou?r and (die|leave|disappear)|you (should|ought to|need to) (just )?(die|disappear)|commit suicide|cut your wrists|hang your ?self|overdose (on|yourself)|(selling|sell|buy|buying) (some )?(weed|cocaine|coke|molly|mdma|xanax|adderall|oxy|oxycodone|percocet|fentanyl|heroin|meth|lsd|ketamine|edibles)|(weed|cocaine|molly|xanax|adderall|guns?|weapons?|ammo) for sale|cocaine|heroin|fentanyl|crystal meth|ghost guns?|ar ?15|illegal (guns?|weapons?|drugs?)|(selling|sell|buy|buying) (guns?|firearms?|weapons?|ammo|ammunition)|(her|his|their|your) (home )?address is|lives at|i found (her|his|their|your) (address|number|home)|social security (number)?|ssn|credit card number|bank account number|routing number|drivers? licen[cs]e number|leak(ing|ed)? (her|his|their|your) (address|number|photos|nudes))\y'
    and public.moderation_raw(t) !~ '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}|(https?|ftp)://|\yh\s*t\s*t\s*p\s*s?\s*:\s*/\s*/|\yhxxps?\y|\ywww\s*\.|\y(bit|tinyurl|goo|ow|is|cutt|rb|shorturl|t|wa|linktr|rebrand|buff|tiny|lnkd)\s*\.\s*(ly|com|gl|gd|gy|at|me|ee|cc|in|co)\s*/|\y(bit\.ly|tinyurl\.com|goo\.gl|ow\.ly|is\.gd|cutt\.ly|rb\.gy|shorturl\.at|t\.me|wa\.me|linktr\.ee|rebrand\.ly|buff\.ly|tiny\.cc|lnkd\.in|t\.co)\y|\y[a-z0-9-]*(paypa1|paypai|linkedln|1inkedin|faceb00k|g00gle|gma1l|app1e|amaz0n|micr0soft|netf1ix|wellsfarg0|bankofamerlca)[a-z0-9-]*\.[a-z]{2,}|\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}|(^|[^a-z0-9])\$[a-z][a-z0-9_]{2,}|\y(snapchat|snap|telegram|tg|whatsapp|wechat|kik|signal|insta|instagram|ig|discord) ?(:|@) ?[a-z0-9_.]{3,}|\y[a-z0-9-]{2,}\.(com|org|io|me|ly|gg|app|info|biz|link|site|online|ru|cn|co)\y|\y[a-z0-9-]+\.(xyz|top|click|zip|mov|tk|ml|ga|cf|gq|icu|buzz|monster|cyou|rest|support)\y|[a-z0-9]\s*(\[\s*(\.|dot)\s*\]|\(\s*(\.|dot)\s*\)|\{\s*(\.|dot)\s*\})\s*[a-z]'
  );
$$;

-- Names of people and organisations: abuse lists and contact details only, so "Western Union", "Booking.com",
-- "Dick" or "Cummings" are fine, in any script.
create or replace function public.moderation_name_ok(t text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select t is null or (
    public.moderation_normalize(t) !~ '\y(?:nigg?(er|ers|a|as|ah|ahs)|fag+(ot|ots|s)?|dykes?|tranny|trannies|retard(ed|s)?|chinks?|spics?|kikes?|wetbacks?|gooks?|coons?|pakis?|beaners?|towel ?heads?|sand ?nigg?(er|a)s?|raghead|cunts?|(immigrants|foreigners|refugees|muslims|jews|christians|blacks|whites|asians|mexicans|indians|gays|lesbians|trans people|women|men) (are|r) (all )?(vermin|subhuman|cockroaches|parasites|animals|savages|filth|inferior|a disease|a plague)|(gas|exterminate|deport all) (the )?(jews|muslims|immigrants|gays|blacks)|porn(o|ography)?|nudes?|send nudes|horny|sexy|sex(ting| chat| tape)|blow ?jobs?|hand ?jobs?|cum(?! laude)|cumshot|boobs?|tits|titties|pussy|pussies|penis|vagina|orgasm|dildo|only ?fans|naked|one night stand|hook ?up with me|sleep with me|slut(s|ty)?|whores?|cock ?suckers?|dick ?heads?|jerk ?off|masturbat(e|ing|ion)|erotic|fetish|escort service|sugar (daddy|daddies|baby|babies|mama|momma)|dtf|fwb|friends with benefits|nsfw|no strings attached|netflix and chill|fuck ?(you|off|u)|fuck ?(ing)? (idiot|loser|moron)|f u|stfu|shut ?the ?fuck ?up|go to hell|go ?fuck ?yourself|(mother ?)?fuck(ing|ed|er|ers|s)?|(fvck|phuck|fuk|fck|fuq)(ing|ed|er|s)? ?(you|off|u)?|bitch(es)?|bastards?|asshole|dumb ?ass|son of a bitch|(you are|you re|u r|ur|youre) (so |such a |a |an )?(stupid|ugly|worthless|useless|pathetic|idiot|loser|moron|trash|garbage|disgusting|fat|retard(ed)?)|nobody (likes|wants|loves) you|i hate you|hope you (die|rot|suffer)|kill your ?self|kys|go (die|kill yourself)|stalk(ing)? you|i m watching you|i am watching you|send me (pics|pictures|photos)|show me your (body|boobs|tits)|(i|we) (will|ll|m going to|am going to|gonna|ma) (kill|hurt|find|beat|shoot|stab|rape|murder|ruin|destroy) (you|u|your family|ur family)|i know where you (live|work|are)|i will find you|i ll find you|watch your back|you re (dead|going to die)|you are (dead|going to die)|you will (pay|regret|die)|shoot (you|up)|stab you|bomb (threat|the|this)|rape (you|her|him)|rapist|kill ?(you|him|her|them)|beat you up|burn your (house|home)|i have a (gun|knife)|you ll (pay|regret|die)|(make|making) you pay)\y'
    and public.moderation_raw(t) !~ '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}|(https?|ftp)://|\yh\s*t\s*t\s*p\s*s?\s*:\s*/\s*/|\yhxxps?\y|\ywww\s*\.|\y(bit|tinyurl|goo|ow|is|cutt|rb|shorturl|t|wa|linktr|rebrand|buff|tiny|lnkd)\s*\.\s*(ly|com|gl|gd|gy|at|me|ee|cc|in|co)\s*/|\y(bit\.ly|tinyurl\.com|goo\.gl|ow\.ly|is\.gd|cutt\.ly|rb\.gy|shorturl\.at|t\.me|wa\.me|linktr\.ee|rebrand\.ly|buff\.ly|tiny\.cc|lnkd\.in|t\.co)\y|\y[a-z0-9-]*(paypa1|paypai|linkedln|1inkedin|faceb00k|g00gle|gma1l|app1e|amaz0n|micr0soft|netf1ix|wellsfarg0|bankofamerlca)[a-z0-9-]*\.[a-z]{2,}|\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}|(^|[^a-z0-9])\$[a-z][a-z0-9_]{2,}|\y(snapchat|snap|telegram|tg|whatsapp|wechat|kik|signal|insta|instagram|ig|discord) ?(:|@) ?[a-z0-9_.]{3,}'
  );
$$;

create or replace function public.profiles_moderation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or (new.first_name, new.last_name, new.org, new.intro, new.offer, new.area_name, new.status, new.field, new.from_field, new.mode, new.meet_mode, new.share_mode, new.interests, new.skills, new.languages, new.goals, new.challenges, new.want_traits, new.foods, new.diet, new.availability)
        is distinct from (old.first_name, old.last_name, old.org, old.intro, old.offer, old.area_name, old.status, old.field, old.from_field, old.mode, old.meet_mode, old.share_mode, old.interests, old.skills, old.languages, old.goals, old.challenges, old.want_traits, old.foods, old.diet, old.availability) then
    if not (public.moderation_name_ok(new.first_name) and public.moderation_name_ok(new.last_name) and public.moderation_name_ok(new.org)
            and public.moderation_is_clean(new.intro) and public.moderation_is_clean(new.offer) and public.moderation_is_clean(new.area_name)
            and public.moderation_is_clean(new.status) and public.moderation_is_clean(new.field) and public.moderation_is_clean(new.from_field)
            and public.moderation_is_clean(new.mode) and public.moderation_is_clean(new.meet_mode) and public.moderation_is_clean(new.share_mode)
            and not exists (select 1 from unnest(new.interests || new.skills || new.languages || new.goals || new.challenges || new.want_traits || new.foods || new.diet || new.availability) s
                            where char_length(s) > 60 or not public.moderation_is_clean(s))) then
      raise exception 'content_blocked: profile text is not allowed';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_moderation on public.profiles;
create trigger profiles_moderation
  before insert or update on public.profiles
  for each row execute function public.profiles_moderation();

create or replace function public.requests_moderation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.moderation_is_clean(new.message) then
    raise exception 'content_blocked: message is not allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists requests_moderation on public.connection_requests;
create trigger requests_moderation
  before insert on public.connection_requests
  for each row execute function public.requests_moderation();

create or replace function public.messages_moderation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.moderation_is_clean(new.body) then
    raise exception 'content_blocked: message is not allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_moderation on public.messages;
create trigger messages_moderation
  before insert on public.messages
  for each row execute function public.messages_moderation();
-- <<< moderation

-- ---------------------------------------------------------------------------
-- Experience (work and school history)
-- Visible to the owner, and to signed-in members who can already see the owner's profile
-- when the owner left "Show my experience" on. Only the owner can write.
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists show_experience boolean not null default false;
-- Default only; existing rows keep their saved choice. Sharing is never switched on silently.
alter table public.profiles alter column show_experience set default false;

create table if not exists public.experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  org text not null,
  start_month text not null,
  end_month text,
  description text not null default '',
  skills text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint experiences_title_len check (char_length(title) between 1 and 120),
  constraint experiences_org_len check (char_length(org) between 1 and 120),
  constraint experiences_desc_len check (char_length(description) <= 1000),
  constraint experiences_skills_len check (coalesce(cardinality(skills), 0) <= 15),
  constraint experiences_start_fmt check (start_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  constraint experiences_end_fmt check (end_month is null or (end_month ~ '^\d{4}-(0[1-9]|1[0-2])$' and end_month >= start_month))
);

create index if not exists experiences_user_idx on public.experiences (user_id);

alter table public.experiences enable row level security;

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

drop policy if exists "experiences: insert own" on public.experiences;
create policy "experiences: insert own" on public.experiences
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "experiences: update own" on public.experiences;
create policy "experiences: update own" on public.experiences
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "experiences: delete own" on public.experiences;
create policy "experiences: delete own" on public.experiences
  for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.experiences_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not (public.moderation_name_ok(new.title) and public.moderation_name_ok(new.org)
          and public.moderation_is_clean(new.description)
          and not exists (select 1 from unnest(new.skills) s where char_length(s) > 40 or not public.moderation_is_clean(s))) then
    raise exception 'content_blocked: experience text is not allowed';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.experiences where user_id = new.user_id) >= 30 then
    raise exception 'You can list up to 30 experiences.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists experiences_before_write on public.experiences;
create trigger experiences_before_write
  before insert or update on public.experiences
  for each row execute function public.experiences_before_write();

-- ---------------------------------------------------------------------------
-- Nearby alerts (real path): PostGIS radius search over rounded positions
-- The app calls set_my_area while the map is open; profiles_before_write rounds it to 0.01 degrees
-- (about 0.7 mi) and clears it for "public places only". alert_candidates() (end of file) returns real members in the
-- caller's own field within the caller's saved alert radius of the caller's OWN stored area, both seen in the last
-- 30 minutes, with a shared interest/skill or a complementary intent; blocks, mutes and hidden accounts excluded.
-- ---------------------------------------------------------------------------

create extension if not exists postgis with schema extensions;

alter table public.profiles add column if not exists area_seen_at timestamptz;

create index if not exists profiles_area_geog_idx on public.profiles
  using gist ((extensions.st_setsrid(extensions.st_makepoint(area_lng, area_lat), 4326)::extensions.geography))
  where area_lat is not null and area_lng is not null;

create or replace function public.set_my_area(lat double precision, lng double precision)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180 then
    raise exception 'invalid coordinates';
  end if;
  perform set_config('app.area_write', '1', true);
  update public.profiles
     set area_lat = lat, area_lng = lng, area_seen_at = now()
   where id = auth.uid() and share_mode = 'area' and discoverable;
end;
$$;

-- Per-user call counter for alert_candidates (own row only, RLS).
create table if not exists public.alert_rate (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_start timestamptz not null default now(),
  calls int not null default 0
);
alter table public.alert_rate enable row level security;
drop policy if exists alert_rate_own on public.alert_rate;
create policy alert_rate_own on public.alert_rate for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- alert_candidates() (nearby recommendations) is defined at the end of this file, after the tables it reads.

revoke all on function public.set_my_area(double precision, double precision) from public, anon;
grant execute on function public.set_my_area(double precision, double precision) to authenticated;

-- ---------------------------------------------------------------------------
-- Account-misuse controls: audit log, rate limits, mute, report auto-hide, fake-account signals, review queue
-- ---------------------------------------------------------------------------
-- Private tables: RLS on and no policies, so only the service role / SQL editor / definer functions touch them.

alter table public.profiles add column if not exists created_at timestamptz not null default now();

create table if not exists public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  subject text,
  detail jsonb not null default '{}'
);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;

create table if not exists public.rate_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  at timestamptz not null default now()
);
create index if not exists rate_log_lookup on public.rate_log (user_id, kind, at desc);
alter table public.rate_log enable row level security;
revoke all on public.rate_log from anon, authenticated;

-- Brand-new (under 24 h) or unverified accounts (no email check and not a real member) get the stricter limit.
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
revoke all on function public.rate_check(text, int, int, interval) from public, anon, authenticated;

-- Connection requests: 10 a day (strict, raised for the demo; use 3 in production) or 15 a day.
create or replace function public.requests_rate_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.rate_check('request', 10, 15, interval '1 day');
  return new;
end;
$$;
drop trigger if exists requests_rate_limit on public.connection_requests;
create trigger requests_rate_limit before insert on public.connection_requests for each row execute function public.requests_rate_limit();

-- Profile edits: only edits to text fields count (position updates and syncs do not). 120 an hour (strict limit raised for the demo; use 30 in production).
create or replace function public.profiles_rate_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (
       new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name or new.org is distinct from old.org
       or new.intro is distinct from old.intro or new.offer is distinct from old.offer
       or new.interests is distinct from old.interests or new.skills is distinct from old.skills or new.languages is distinct from old.languages) then
    perform public.rate_check('profile_edit', 120, 120, interval '1 hour');
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_rate_limit on public.profiles;
create trigger profiles_rate_limit before update on public.profiles for each row execute function public.profiles_rate_limit();

-- Mute: hide someone from your map and alerts without telling them (a block is the stronger option).
create table if not exists public.mutes (
  muter uuid not null references auth.users (id) on delete cascade default auth.uid(),
  muted uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter, muted)
);
alter table public.mutes enable row level security;
drop policy if exists "mutes: own" on public.mutes;
create policy "mutes: own" on public.mutes for all to authenticated using (muter = (select auth.uid())) with check (muter = (select auth.uid()));
revoke all on public.mutes from anon;
grant select, insert, delete on public.mutes to authenticated;

-- Reports: one per reporter per subject (a profile or an event). Three distinct reporters auto-hide the subject.
alter table public.reports alter column reported drop not null;
alter table public.reports add column if not exists subject_kind text not null default 'profile';
alter table public.reports drop constraint if exists reports_subject_kind_check;
alter table public.reports add constraint reports_subject_kind_check check (subject_kind in ('profile', 'event'));
alter table public.reports add column if not exists subject_id text;
update public.reports set subject_id = reported::text where subject_id is null and reported is not null;
delete from public.reports a using public.reports b
  where a.ctid < b.ctid and a.reporter = b.reporter and a.subject_kind = b.subject_kind and a.subject_id is not distinct from b.subject_id;
create unique index if not exists reports_one_per_reporter on public.reports (reporter, subject_kind, subject_id);

alter table public.profiles add column if not exists hidden boolean not null default false;

create or replace function public.profiles_protect_hidden()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.hidden := case when tg_op = 'INSERT' then false else old.hidden end;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_protect_hidden on public.profiles;
create trigger profiles_protect_hidden before insert or update on public.profiles for each row execute function public.profiles_protect_hidden();

create or replace function public.reports_before()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.subject_id is null then new.subject_id := new.reported::text; end if;
  if new.subject_id is null or new.subject_id = '' or char_length(new.subject_id) > 200 then raise exception 'invalid report'; end if;
  if new.subject_kind = 'profile' and new.subject_id = auth.uid()::text then raise exception 'invalid report'; end if;
  perform public.rate_check('report', 10, 30, interval '1 day');
  return new;
end;
$$;
drop trigger if exists reports_before on public.reports;
create trigger reports_before before insert on public.reports for each row execute function public.reports_before();

create or replace function public.reports_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.audit_log (actor, action, subject, detail)
    values (new.reporter, 'report', new.subject_kind || ':' || new.subject_id, jsonb_build_object('reason', new.reason));
  select count(distinct reporter) into n from public.reports where subject_kind = new.subject_kind and subject_id = new.subject_id;
  if n >= 3 and new.subject_kind = 'profile' then
    update public.profiles set hidden = true where id::text = new.subject_id and not hidden;
    if found then
      insert into public.audit_log (action, subject, detail) values ('auto_hide', 'profile:' || new.subject_id, jsonb_build_object('reporters', n));
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists reports_after on public.reports;
create trigger reports_after after insert on public.reports for each row execute function public.reports_after();

-- Events come from outside the database, so their auto-hide is a list the app filters by.
create or replace function public.hidden_event_ids()
returns setof text language sql stable security definer set search_path = '' as $$
  select subject_id from public.reports where subject_kind = 'event' group by subject_id having count(distinct reporter) >= 3;
$$;
revoke all on function public.hidden_event_ids() from public, anon;
grant execute on function public.hidden_event_ids() to authenticated;

-- Fake-account signals (flag only, nothing is blocked automatically): the same name on two accounts, or 5+ signups in 10 minutes.
-- Profile photos are kept on the phone, so "same name and photo" cannot be compared here.
create table if not exists public.account_signals (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('same_name', 'burst_signup')),
  detail jsonb not null default '{}'
);
alter table public.account_signals enable row level security;
revoke all on public.account_signals from anon, authenticated;

create or replace function public.profiles_signals()
returns trigger language plpgsql security definer set search_path = '' as $$
declare other uuid;
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.profiles where created_at > now() - interval '10 minutes') >= 5 then
      insert into public.account_signals (user_id, kind, detail) values (new.id, 'burst_signup', '{}');
    end if;
  end if;
  if char_length(btrim(new.first_name)) > 0 and char_length(btrim(new.last_name)) > 0
     and (tg_op = 'INSERT' or new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name) then
    select p.id into other from public.profiles p
      where p.id <> new.id and lower(btrim(p.first_name)) = lower(btrim(new.first_name)) and lower(btrim(p.last_name)) = lower(btrim(new.last_name)) limit 1;
    if other is not null then
      insert into public.account_signals (user_id, kind, detail) values (new.id, 'same_name', jsonb_build_object('other', other));
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_signals on public.profiles;
create trigger profiles_signals after insert or update on public.profiles for each row execute function public.profiles_signals();

-- Admin review queue (SQL editor / service role only): reported subjects and fake-account signals, newest first.
create or replace view public.admin_review_queue with (security_invoker = true) as
  select 'report'::text as source, r.subject_kind || ':' || r.subject_id as subject, count(distinct r.reporter) as people, array_agg(distinct r.reason) as reasons,
         max(r.created_at) as last_at, coalesce(bool_or(p.hidden), false) as hidden
    from public.reports r left join public.profiles p on r.subject_kind = 'profile' and p.id::text = r.subject_id
    group by r.subject_kind, r.subject_id
  union all
  select 'signal', s.user_id::text, count(*), array_agg(distinct s.kind), max(s.at), false
    from public.account_signals s group by s.user_id
  order by last_at desc;
revoke all on public.admin_review_queue from anon, authenticated;
-- To restore a wrongly hidden profile:  update public.profiles set hidden = false where id = '<uuid>';

-- Hardening: Supabase default grants include TRUNCATE (which skips RLS), REFERENCES and TRIGGER. The app never needs them.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- Moderation write path (phase 4; same as supabase/migrations/20261116180000_moderation_write_path.sql).
-- Private drafts: profile text held back from the public row because its review couldn't run (ai_unavailable), or
-- unpublished by the legacy audit (audit). fields = {"intro": "...", ...}. Owner-read only, never public.
create table if not exists public.profile_drafts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  fields jsonb not null default '{}',
  reason text not null default 'ai_unavailable' check (reason in ('ai_unavailable', 'audit')),
  updated_at timestamptz not null default now()
);
alter table public.profile_drafts enable row level security;
drop policy if exists "profile_drafts: read own" on public.profile_drafts;
create policy "profile_drafts: read own" on public.profile_drafts for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.profile_drafts from anon, authenticated;
grant select on public.profile_drafts to authenticated;

-- Decision log written by the profile-write function. Never stores the text itself. Service role only.
create table if not exists public.moderation_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  surface text not null check (surface in ('profile', 'audit')),
  field text not null check (char_length(field) <= 40),
  decision text not null check (decision in ('published', 'rejected', 'held')),
  reason text not null check (char_length(reason) <= 40)
);
create index if not exists moderation_events_user_at on public.moderation_events (user_id, at desc);
alter table public.moderation_events enable row level security;
revoke all on public.moderation_events from anon, authenticated;

-- Profiles are written only by the profile-write edge function (service role), which applies the shared rules and the
-- contextual AI check first; the moderation trigger above still runs on its writes. The app keeps UPDATE on the area
-- columns only, for set_my_area(). Badges, hidden and timestamps stay server-only (the protect triggers also reset them).
-- Here at the end because every column must exist first. Revoking the table privilege also revokes column privileges.
revoke insert, update on public.profiles from anon, authenticated;
grant update (area_lat, area_lng, area_seen_at) on public.profiles to authenticated;

-- Nearby recommendations (phase 5; same as supabase/migrations/20261116200000_nearby_recommendations.sql).
-- alert_candidates() takes no coordinates: the origin is the caller's own stored coarse area. See docs/nearby-alerts.md.
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
