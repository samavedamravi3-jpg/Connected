-- Security review 2026-11-23: auto-hidden / banned users must stop counting as real members everywhere is_real_member() is used.
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
    where p.id = uid and p.id_verified and not p.hidden and v.status = 'verified' and v.livemode
  );
end;
$$;
revoke all on function public.is_real_member(uuid) from public, anon;
grant execute on function public.is_real_member(uuid) to authenticated;
