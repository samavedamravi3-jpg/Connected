-- Connected. database schema.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste this file -> Run.
-- Safe to run again: it only creates what's missing and replaces policies and functions.
--
-- Privacy is enforced here, in the database, so the app can't leak data even if it has a bug:
--   * Profiles are visible only when discoverable (or when you share a request), never across a block.
--   * Locations are stored at neighborhood level (rounded to ~1 km); "public places only" stores none.
--   * Requests and messages are visible only to the two people involved.
--   * Messages can only be sent after a request is accepted.

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
    id = auth.uid()
    or (
      not public.is_blocked(auth.uid(), id)
      and (discoverable or public.has_connection(auth.uid(), id))
    )
  );

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "profiles: delete own" on public.profiles;
create policy "profiles: delete own" on public.profiles
  for delete to authenticated using (id = auth.uid());

drop policy if exists "blocks: own" on public.blocks;
create policy "blocks: own" on public.blocks
  for all to authenticated using (blocker = auth.uid()) with check (blocker = auth.uid());

drop policy if exists "requests: participants read" on public.connection_requests;
create policy "requests: participants read" on public.connection_requests
  for select to authenticated using (auth.uid() in (from_user, to_user));

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
  for select to authenticated using (public.is_participant(request_id));

drop policy if exists "messages: send when accepted" on public.messages;
create policy "messages: send when accepted" on public.messages
  for insert to authenticated
  with check (
    sender = auth.uid()
    and exists (
      select 1 from public.connection_requests r
      where r.id = request_id and r.status = 'accepted' and auth.uid() in (r.from_user, r.to_user)
    )
  );

drop policy if exists "reports: file own" on public.reports;
create policy "reports: file own" on public.reports
  for insert to authenticated with check (reporter = auth.uid());

-- ---------------------------------------------------------------------------
-- Access for signed-in users only (RLS above decides which rows)
-- ---------------------------------------------------------------------------

revoke all on public.profiles, public.blocks, public.connection_requests, public.messages, public.reports from anon;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select, insert, update on public.connection_requests to authenticated;
grant select, insert on public.messages to authenticated;
grant insert on public.reports to authenticated;
grant execute on function public.nearby_profiles(double precision, double precision, double precision) to authenticated;
grant execute on function public.is_blocked(uuid, uuid), public.has_connection(uuid, uuid), public.is_participant(uuid) to authenticated;
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
-- We never store ID images or numbers: only the provider's session id, a status and a timestamp.
-- id_verifications is private (a user can read only their own row; nobody but the service role can write).
-- profiles.id_verified is the public badge. A trigger resets any attempt by the app to change it, so only the
-- identity edge function (service role, after checking the provider's signed webhook) can set it.

create table if not exists public.id_verifications (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null,
  session_id text not null,
  status text not null default 'pending' check (status in ('unverified', 'pending', 'verified', 'rejected')),
  updated_at timestamptz not null default now()
);
alter table public.id_verifications enable row level security;
drop policy if exists "id_verifications: read own" on public.id_verifications;
create policy "id_verifications: read own" on public.id_verifications for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.id_verifications from anon, authenticated;

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

-- Gate switch. Off until the ID provider works end to end, so nobody is locked out while it is unavailable.
-- Turn on with:  update public.app_config set value = 'on' where key = 'id_gate';
create table if not exists public.app_config (key text primary key, value text not null);
alter table public.app_config enable row level security; -- no policies: service role / SQL editor only
insert into public.app_config (key, value) values ('id_gate', 'off') on conflict (key) do nothing;

create or replace function public.id_gate_on()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from public.app_config where key = 'id_gate' and value = 'on') $$;
revoke all on function public.id_gate_on() from public, anon;
grant execute on function public.id_gate_on() to authenticated;

-- With the gate on, only ID-verified members can send connection requests (the API cannot bypass this).
create or replace function public.require_id_for_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.id_gate_on() and not coalesce((select p.id_verified from public.profiles p where p.id = new.from_user), false) then
    raise exception 'id_required' using errcode = '42501';
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
-- Same rules as src/lib/moderation.ts, enforced on the server so a modified app cannot bypass them.
-- Blocks slurs, sexual content, harassment and threats, including leetspeak, spaced-out letters
-- and stretched letters.

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
  s := regexp_replace(s, '[\u0300-\u036f\u200b-\u200f\u2060\ufeff\u00ad]', '', 'g');
  s := translate(s, 'аеорсухкмнтвіјѕԁԛԝӏοαεικνυρτχɑɡıℓøłđ', 'aeopcyxkmhtbijsdqwloaeikvuptxagilold');
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
    lower(regexp_replace(normalize(coalesce(t, ''), NFKC), '[\u0300-\u036f\u200b-\u200f\u2060\ufeff\u00ad]', '', 'g')),
    'аеорсухкмнтвіјѕԁԛԝӏοαεικνυρτχɑɡıℓøłđ', 'aeopcyxkmhtbijsdqwloaeikvuptxagilold');
$$;

create or replace function public.moderation_is_clean(t text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select t is null or (
    public.moderation_normalize(t) !~ '\y(?:nigg?(er|ers|a|as|ah|ahs)|fag+(ot|ots|s)?|dykes?|tranny|trannies|retard(ed|s)?|chinks?|spics?|kikes?|wetbacks?|gooks?|coons?|pakis?|beaners?|towel ?heads?|sand ?nigg?(er|a)s?|raghead|cunts?|porn(o|ography)?|nudes?|send nudes|horny|sexy|sex(ting| chat| tape)|blow ?jobs?|hand ?jobs?|cum|cumshot|boobs?|tits|titties|pussy|pussies|penis|vagina|orgasm|dildo|only ?fans|naked|one night stand|hook ?up with me|sleep with me|slut(s|ty)?|whores?|cock ?suckers?|dick ?heads?|jerk ?off|masturbat(e|ing|ion)|erotic|fetish|escort service|fuck ?(you|off|u)|fuck ?(ing)? (idiot|loser|moron)|f u|stfu|shut ?the ?fuck ?up|go to hell|go ?fuck ?yourself|bitch(es)?|bastards?|asshole|dumb ?ass|son of a bitch|(you are|you re|u r|ur|youre) (so |such a |a |an )?(stupid|ugly|worthless|useless|pathetic|idiot|loser|moron|trash|garbage|disgusting|fat|retard(ed)?)|nobody (likes|wants|loves) you|i hate you|hope you (die|rot|suffer)|kill your ?self|kys|go (die|kill yourself)|stalk(ing)? you|i m watching you|i am watching you|send me (pics|pictures|photos)|show me your (body|boobs|tits)|(i|we) (will|ll|m going to|am going to|gonna|ma) (kill|hurt|find|beat|shoot|stab|rape|murder|ruin|destroy) (you|u|your family|ur family)|i know where you (live|work|are)|i will find you|i ll find you|watch your back|you re (dead|going to die)|you are (dead|going to die)|you will (pay|regret|die)|shoot (you|up)|stab you|bomb (threat|the|this)|rape (you|her|him)|rapist|kill ?(you|him|her|them)|beat you up|burn your (house|home)|i have a (gun|knife)|guaranteed (returns?|profits?|income|roi|winnings)|risk ?free (investment|returns?|profits?)|double your (money|investment|bitcoin|crypto)|investment opportunit(y|ies)|invest (with|in) (me|my|our)|crypto (investment|trading|signals?|giveaway|mining|opportunity|doubler)|bitcoin (investment|trading|doubler|giveaway|mining)|forex (trading|signals?)|binary options?|passive income|trading (signals?|bot|mentor)|airdrop|get rich|financial freedom|unlimited income|make (money|cash) (fast|online|from home)|earn (money|cash|income) (fast|online|daily|weekly|from home)|easy money|quick money|send (me |us )?(some )?(money|cash|funds)|wire (me|us) (money|cash|funds)|western union|moneygram|gift ?cards?|cash ?app|venmo|zelle|paypal (me|us)|pay (me|us) (via|through|on|with)|(dm|message|text|add|contact|hit) (me|us) (on|at|via) (telegram|whatsapp|snapchat|snap|signal|instagram|insta|wechat|kik|discord)|(telegram|whatsapp|snapchat|snap|wechat|kik) (me|us)|my (telegram|whatsapp|snapchat|snap|wechat|kik) (is|id|handle|number)|(gmail|yahoo|hotmail|outlook|icloud|proton ?mail|proton) (dot )?com|act now|limited time (offer|only)?|last chance|don t miss out|offer expires|respond (immediately|asap|now)|urgent(ly)? (reply|response|action|need)|verify your (account|identity|bank|password)|confirm your (password|account|bank)|click (here|the link|this link|below)|you have (won|been selected)|claim your (prize|reward|gift)|account (has been )?(suspended|locked|compromised)|login to claim|multi ?level marketing|mlm|be your own boss|work from home opportunity|no experience (needed|necessary|required) (job|work|offer)|join my (team|downline|business)|pay (a|an|the) (training|registration|starter|application|processing) fee|recruiting (now|today)|ground floor opportunity|you should (just )?(kill|hurt|harm|cut|hang) your ?self|(just )?(go )?(end|take) your (own )?life|do (everyone|us all|the world) a favou?r and (die|leave|disappear)|you (should|ought to|need to) (just )?(die|disappear)|commit suicide|cut your wrists|hang your ?self|overdose (on|yourself)|(selling|sell|buy|buying) (some )?(weed|cocaine|coke|molly|mdma|xanax|adderall|oxy|oxycodone|percocet|fentanyl|heroin|meth|lsd|ketamine|edibles)|(weed|cocaine|molly|xanax|adderall|guns?|weapons?|ammo) for sale|cocaine|heroin|fentanyl|crystal meth|ghost guns?|ar ?15|illegal (guns?|weapons?|drugs?)|(selling|sell|buy|buying) (guns?|firearms?|weapons?|ammo|ammunition)|(her|his|their|your) (home )?address is|lives at|i found (her|his|their|your) (address|number|home)|social security (number)?|ssn|credit card number|bank account number|routing number|drivers? licen[cs]e number|leak(ing|ed)? (her|his|their|your) (address|number|photos|nudes))\y'
    and public.moderation_raw(t) !~ '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}|(https?|ftp)://|\ywww\.|\y(bit\.ly|tinyurl\.com|goo\.gl|ow\.ly|is\.gd|cutt\.ly|rb\.gy|shorturl\.at|t\.me|wa\.me|linktr\.ee|rebrand\.ly|buff\.ly|tiny\.cc|lnkd\.in|t\.co)\y|\y[a-z0-9-]+\.(xyz|top|click|zip|mov|tk|ml|ga|cf|gq|icu|buzz|monster|cyou|rest|support)\y|\y[a-z0-9-]*(paypa1|paypai|linkedln|1inkedin|faceb00k|g00gle|gma1l|app1e|amaz0n|micr0soft|netf1ix|wellsfarg0|bankofamerlca)[a-z0-9-]*\.[a-z]{2,}|\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}|(^|[^a-z0-9])\$[a-z][a-z0-9_]{2,}|\y(snapchat|snap|telegram|tg|whatsapp|wechat|kik|signal|insta|instagram|ig|discord) ?(:|@) ?[a-z0-9_.]{3,}'
  );
$$;

create or replace function public.profiles_moderation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name
     or new.org is distinct from old.org or new.intro is distinct from old.intro or new.offer is distinct from old.offer
     or new.interests is distinct from old.interests or new.skills is distinct from old.skills or new.languages is distinct from old.languages then
    if not (public.moderation_is_clean(new.first_name) and public.moderation_is_clean(new.last_name)
            and public.moderation_is_clean(new.org) and public.moderation_is_clean(new.intro)
            and public.moderation_is_clean(new.offer)
            and not exists (select 1 from unnest(new.interests || new.skills || new.languages) s where char_length(s) > 60 or not public.moderation_is_clean(s))) then
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

alter table public.profiles add column if not exists show_experience boolean not null default true;

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
      not public.is_blocked((select auth.uid()), user_id)
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
  if not (public.moderation_is_clean(new.title) and public.moderation_is_clean(new.org)
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
-- (about a mile) and clears it for "public places only". alert_candidates returns verified members in the
-- caller's own field within the radius who had the map open in the last 30 minutes. Runs as the caller, so RLS
-- (blocks, discoverable) still applies.
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

-- Returns only id, first name + last initial, field and distance rounded to 0.1 mi. Max 12 calls a minute per user.
drop function if exists public.alert_candidates(double precision, double precision, double precision);
create function public.alert_candidates(lat double precision, lng double precision, radius_mi double precision default 1)
returns table (id uuid, name text, field text, distance_mi numeric)
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
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
    and p.verified
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

revoke all on function public.set_my_area(double precision, double precision) from public, anon;
revoke all on function public.alert_candidates(double precision, double precision, double precision) from public, anon;
grant execute on function public.set_my_area(double precision, double precision) to authenticated;
grant execute on function public.alert_candidates(double precision, double precision, double precision) to authenticated;
