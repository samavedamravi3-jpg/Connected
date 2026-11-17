-- Profile photos. Avatars only: ID-verification images and selfies stay with Stripe and never come here.
--
-- Private bucket (not public): a public bucket would serve <uid>/avatar.jpg to anyone who ever learned a uid, forever,
-- even after the owner hides, gets blocked or is auto-hidden. Here storage signs a URL only for a caller who may read
-- the owner's profile row, so the photo has exactly the profile's audience (real members, not hidden, not blocked,
-- discoverable or already connected; profiles RLS decides). Signed URLs last an hour.
-- Exactly two objects per user: <uid>/avatar.jpg (512 px) and <uid>/thumb.jpg (128 px, for map markers), JPEG only,
-- at most 512 KB each. The app re-encodes on the phone, which drops EXIF and location metadata.
-- Photo content is not moderated yet: people can report a profile ("Inappropriate photo"), three real-member reports
-- auto-hide the profile, and a hidden profile's photo stops being signed for anyone else.
-- Idempotent: safe to run again.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 524288, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The owner of a profile-photo object name, or null for any other name. Strict, so the uuid cast never throws and
-- the profiles lookup below uses the primary key.
create or replace function public.profile_photo_owner(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(avatar|thumb)\.jpg$'
    then split_part(object_name, '/', 1)::uuid
  end;
$$;
revoke all on function public.profile_photo_owner(text) from public, anon;
grant execute on function public.profile_photo_owner(text) to authenticated;

-- Read: yourself, or anyone whose profile row you may read. The subquery runs as the caller, so the profiles
-- "read visible" policy (and the column grant on id) applies unchanged.
drop policy if exists "profile photos: read visible" on storage.objects;
create policy "profile photos: read visible" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and (
      public.profile_photo_owner(name) = (select auth.uid())
      or exists (select 1 from public.profiles p where p.id = public.profile_photo_owner(name))
    )
  );

-- Write, replace (upsert needs insert + update) and remove: your own two objects only.
drop policy if exists "profile photos: insert own" on storage.objects;
create policy "profile photos: insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'profile-photos' and public.profile_photo_owner(name) = (select auth.uid()));

drop policy if exists "profile photos: update own" on storage.objects;
create policy "profile photos: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'profile-photos' and public.profile_photo_owner(name) = (select auth.uid()))
  with check (bucket_id = 'profile-photos' and public.profile_photo_owner(name) = (select auth.uid()));

drop policy if exists "profile photos: delete own" on storage.objects;
create policy "profile photos: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'profile-photos' and public.profile_photo_owner(name) = (select auth.uid()));
