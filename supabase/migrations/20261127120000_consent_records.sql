-- PREPARED FOR REVIEW, NOT APPLIED. Records which Terms/Privacy version an account accepted, and when.
-- The app never writes the table: it calls record_consent(), which stamps the time on the server and is the only writer.
-- No date of birth is stored: only the yes to "I am 18 or older".
create table if not exists public.consents (
  user_id uuid primary key references auth.users (id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  adult_confirmed boolean not null default false,
  accepted_at timestamptz not null default now()
);
alter table public.consents enable row level security;
revoke all on public.consents from anon, authenticated;
create policy consents_read_own on public.consents for select to authenticated using (user_id = auth.uid());
grant select on public.consents to authenticated;

create or replace function public.record_consent(p_terms text, p_privacy text, p_adult boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_adult is not true then raise exception 'adult confirmation required'; end if;
  if length(coalesce(p_terms, '')) not between 1 and 32 or length(coalesce(p_privacy, '')) not between 1 and 32 then raise exception 'bad version'; end if;
  insert into public.consents as c (user_id, terms_version, privacy_version, adult_confirmed, accepted_at)
  values (auth.uid(), p_terms, p_privacy, true, now())
  on conflict (user_id) do update set terms_version = excluded.terms_version, privacy_version = excluded.privacy_version, adult_confirmed = true, accepted_at = now();
end $$;
revoke all on function public.record_consent(text, text, boolean) from public, anon;
grant execute on function public.record_consent(text, text, boolean) to authenticated;
