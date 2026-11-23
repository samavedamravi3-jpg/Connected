-- Legacy content audit: which existing rows fail the current rules (moderation_is_clean / moderation_name_ok from
-- 20261116174714_moderation_write_path.sql). READ-ONLY: selects only, safe on the live database, changes nothing.
-- Run after that migration, in the SQL editor or: psql "$DB_URL" -f supabase/audits/legacy_moderation.sql
-- Rules only: rows the AI review would refuse but no rule matches are not found here.

-- 1) Counts per surface and column. No text, no ids: safe to paste into a report.
with flags as (
  select 'profiles' as surface, c.col
  from public.profiles p
  cross join lateral (values
    ('first_name', public.moderation_name_ok(p.first_name)), ('last_name', public.moderation_name_ok(p.last_name)),
    ('org', public.moderation_name_ok(p.org)), ('intro', public.moderation_is_clean(p.intro)), ('offer', public.moderation_is_clean(p.offer)),
    ('area_name', public.moderation_is_clean(p.area_name)),
    ('chips', not exists (select 1 from unnest(p.interests || p.skills || p.languages || p.goals || p.challenges || p.want_traits || p.foods || p.diet || p.availability) s
                          where not public.moderation_is_clean(s)))
  ) c(col, ok)
  where not c.ok
  union all
  select 'experiences', c.col
  from public.experiences e
  cross join lateral (values
    ('title', public.moderation_name_ok(e.title)), ('org', public.moderation_name_ok(e.org)), ('description', public.moderation_is_clean(e.description)),
    ('skills', not exists (select 1 from unnest(e.skills) s where not public.moderation_is_clean(s)))
  ) c(col, ok)
  where not c.ok
  union all
  select 'connection_requests', 'message' from public.connection_requests where not public.moderation_is_clean(message)
  union all
  select 'messages', 'body' from public.messages where not public.moderation_is_clean(body)
)
select surface, col, count(*) as failing_rows from flags group by surface, col
union all
select 'total rows checked', 'profiles/experiences/requests/messages',
  (select count(*) from public.profiles) + (select count(*) from public.experiences) + (select count(*) from public.connection_requests) + (select count(*) from public.messages)
order by 1, 2;

-- 2) For the owner only (contains user ids, no text): which public profiles and experiences to remediate.
-- select p.id as user_id, array_remove(array[
--     case when not public.moderation_name_ok(p.first_name) then 'first_name' end, case when not public.moderation_name_ok(p.last_name) then 'last_name' end,
--     case when not public.moderation_name_ok(p.org) then 'org' end, case when not public.moderation_is_clean(p.intro) then 'intro' end,
--     case when not public.moderation_is_clean(p.offer) then 'offer' end], null) as columns
-- from public.profiles p
-- where not (public.moderation_name_ok(p.first_name) and public.moderation_name_ok(p.last_name) and public.moderation_name_ok(p.org)
--            and public.moderation_is_clean(p.intro) and public.moderation_is_clean(p.offer));
-- select e.user_id, e.id as experience_id from public.experiences e
-- where not (public.moderation_name_ok(e.title) and public.moderation_name_ok(e.org) and public.moderation_is_clean(e.description));
--
-- Remediation (a WRITE, owner decides; never silent deletion) is described in docs/moderation.md:
-- flag -> tell the owner what to edit -> if not fixed, move the text to profile_drafts (reason 'audit') and blank the
-- public column, logging moderation_events (surface 'audit', decision 'held'). The user gets the text back in the editor
-- on next sign-in and republishes it through profile-write after editing.
