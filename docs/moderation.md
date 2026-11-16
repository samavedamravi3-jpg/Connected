# Moderation (phase 4, updated in phase 6)

## Why "A little about you" let inappropriate text through (root cause)

Probed 53 strings through the app's `checkText` and the live `public.moderation_is_clean` (read-only `select`). Both gave identical verdicts on every string, so the app and database rules were in sync. The gaps were in what the rules covered and in how the write path was built:

1. **The bio only ever got a word list.** Onboarding checked `intro`/`offer` with sync `checkText`/`checkAll`, and `saveMyRow` with `assertClean`. The AI check (`moderate` -> `aiModerate`) was wired only to chat, connection notes, experience and the assistant, and only when the text matched the `BORDERLINE` regex. docs/guardrails.md said so: "Profile text and chips use local + DB checks only."
2. **The AI layer was never really there.** `aiModerate` returned `ok` when `EXPO_PUBLIC_ASSISTANT_URL` was missing (fail open). In this repo the URL is set, but `server/.env` has empty `GROQ_API_KEY` and `ANTHROPIC_API_KEY`, so `/moderate` always answered 503.
3. **The app wrote profiles directly** (`supabase.from('profiles').upsert`). The column grants allowed every text column, so the only server check possible was the rules trigger. A contextual check can't run inside a SQL trigger.
4. **Rule gaps.** Both layers let these through:
   - text with no listed word: "Immigrants are vermin…", "Seeking a sugar daddy", "DTF tonight", "Cross me and I will make you pay", "Send USDT to my wallet…", "Apple Pay me…", "300% gains every month", "Verify your ID at x dot com", "Send me the 6 digit code…"
   - obfuscated links: `hxxp://evil[.]com`, "evil dot com", `t . me/joinme`, `example(dot)com`
   - lookalikes: Armenian "fսck", "fvck", "phuck"

   They also blocked legitimate text: "magna cum laude", "Engineer at Venmo", "Product manager on the Zelle team", "Western Union analyst" and "Studied MLM fraud".
5. **Limits didn't match.** The UI capped `intro`/`offer` at 280/200, `myRow` sliced at 400/300 and the DB allows 400/300. A modified client could publish 400 characters.

The live DB was checked read-only. It has 1 profile, 0 experiences, 0 requests and 0 messages. Migration `20261116120000_mandatory_id_gate` is not applied there yet, so the old table-wide grants are still live.

## Where text can be written, and what checks it

"Rules" means the shared module `supabase/functions/_shared/moderationRules.ts`. In the database the same rules run as generated SQL. "AI" means the contextual review.

| Surface (where in the app) | Stored / who sees it | App (before submit) | Server / DB (authoritative) | Contextual AI |
|---|---|---|---|---|
| First / last name (onboarding profile step, Profile > Edit) | `profiles`, real members | name rules, per-field message | profile-write rules + `profiles_moderation` (`moderation_name_ok`) | no: rules only, so real names aren't flagged |
| School or workplace (`org`) | `profiles`, public | name rules | profile-write + trigger (name rule) | **yes** (profile-write) |
| "A little about you" (`intro`) | `profiles`, public | full rules | profile-write + trigger | **yes** |
| "What could you help with" / "Can offer" (`offer`) | `profiles`, public | full rules | profile-write + trigger | **yes** |
| Custom skill / interest / language chip (not in the app's catalog) | `profiles.skills` / `interests` / `languages`, public | rules on Add and on save | profile-write + trigger (each item at most 60 chars, at most 30 per list, 3000 chars across all lists: `profiles_chips_len`) | **yes**, only chips that are new and not in the catalog (phase 6) |
| Catalog chips (interests, skills, languages) | same | rules on save | profile-write + trigger | no (fixed app text) |
| Status, field, previous field, mode, meet mode, share mode, goals, challenges, traits, foods, diet, availability (option ids) | `profiles` | the app only sends its ids | profile-write allowlists the ids (`_shared/profileOptions.ts`) + DB check constraints `profiles_<col>_ok` (phase 6) | no (no free text accepted) |
| Area label (`area_name`, from location or a picked place) | `profiles`, public | rules on save | profile-write + trigger | **yes** when changed, except the app's own map area names (phase 6) |
| Experience title / org / description / skills (Experience editor) | `experiences`, public if "Show my experience" | `experienceProblem` (name rule for title/org) + best-effort AI on borderline description/skills | `experiences_before_write` (name / full rules) | best-effort in the app only |
| Resume-imported experience (Review screen) | same | every entry is checked like hand entry before Save; same best-effort AI | same trigger | resume parsing treats the PDF text as data; no server AI review |
| Connection note (request message, person screen) | `connection_requests.message`, the recipient | rules + best-effort AI (borderline) | `requests_moderation` | best-effort in the app only |
| Chat message | `messages.body`, the other person | rules + best-effort AI (borderline) | `messages_moderation` | best-effort in the app only |
| "Something else" goal (`goalOther`) | this phone only, never sent | full rules on Continue | none (not stored on the server) | no |
| Open Door custom topics | this phone only (no table) | rules on Add and again on publish | none (no server table) | no |
| Open Door description | no such field | – | – | – |
| Assistant question | sent to /server, not stored or published | rules + best-effort AI | – | – |
| Search query | not stored | rules (search refused) | – | – |
| Reports (person / event menu) | `reports.reason`, preset strings, admin-only | no free text in the app | not content-moderated on purpose: a report has to be able to quote abuse | no |
| Events | external listings, not user-editable | – | report / hide / mute only | – |

Honest summary: the contextual AI review is enforced for profile `org`, `intro`, `offer`, `area_name` and new custom chips. Option columns accept only the app's ids. Chat, connection notes and experience text (written directly through PostgREST, so the function never sees them) get the rules in the database (authoritative), plus a best-effort AI check in the app that a modified app can skip. Moving experience through profile-write would close that gap; it was not cheap enough for this pass.

## The mediated write path

```
app (shared rules, field messages) --invoke--> profile-write (edge fn, verify_jwt)
   user id from the validated token
   -> profile_write_rate 'write' FIRST (120/hour, every request, atomic) -> 429 when over
   -> allowlisted columns, option ids, same rules again, chips size -> 422 with per-field reasons
   -> something new to review (org/intro/offer/area_name/custom chips)?
        profile_write_rate 'ai' (10/hour new or unverified accounts, 30/hour otherwise) -> over it: no review,
                       the new text is held as a private draft (202), the rest still saves
        -> Groq, called directly from the edge function (_shared/groqReview.ts: GROQ_API_KEY secret, redirects refused, 8 s timeout)
        allow       -> upsert public row (service role; DB trigger runs again) -> 200 published
        block       -> nothing saved -> 422 {fields: {intro: 'ai'}}
        unavailable / malformed / not configured -> public row saved WITHOUT that text,
                       text kept in profile_drafts (owner-read only) -> 202 draft
   -> moderation_events (field, decision, reason code; never the text)
```

- **Prompt.** Each field sits in its own `<field>` tag. Angle brackets in user text are neutralised, and the model is told to ignore instructions inside the fields. The answer must be `{"results":[{field, decision, category}]}`, checked by `parseVerdicts`: exact keys, enums, one entry per field, consistent allow/none. Anything else counts as unavailable. Both the server and the function run this check.
- **Fail closed.** Unreviewed text never reaches the public row. The app keeps the text locally (AsyncStorage) and restores the server draft on sign-in. The next save, or "Try again", retries the review.
- **Readiness (phase 3).** A draft still saves the row, so `profileReady` turns true and the ID step can go on. A rejection saves nothing and shows "Edit profile" with per-field messages. No message is shown while a save is running. `ensureProfileSaved` is unchanged.
- **No circular dependency.** profile-write does not require real membership, so a new user can save a basic profile before the ID check.
- **Database backstop.** `authenticated` has no INSERT/UPDATE/DELETE on `profiles` at all (since phase 6 the position goes through `set_my_area`, a definer function). The Phase 3 locks on badges, `hidden` and timestamps stay closed. The rules trigger and the option/size check constraints still run on service-role writes.
- **Rate limits (phase 6).** `profile_write_rate(uid, kind)` (service role only) is an atomic per-user check on `rate_log`, serialised with an advisory lock, so parallel requests can't all pass. `write` counts every request first (120/hour), including refused ones; `ai` counts requests that need the review (10/hour for accounts under 24 h old or without an email check or ID, 30/hour otherwise). This bounds AI spend per account; many throwaway accounts can still each spend their 10/hour. The old `profiles_rate_limit` trigger is kept but inert (it sees no `auth.uid()` under the service role, and clients can't update profiles).
- **Decision log.** `moderation_events` is service-role only and capped at 200 rows per user per hour by a trigger (extra rows are dropped). Nothing punishes accounts automatically.

## Evasion handling (normalised for matching only; displayed text is never changed)

The rules handle:
- case, accents, NFKC/NFKD width and math letters
- zero-width and invisible characters (incl. U+2061–2064, U+180E)
- leetspeak, spaced-out letters ("k i l l") and stretched letters
- Cyrillic, Greek and Armenian lookalikes, and small capitals
- spaced or defanged links: `hxxp`, `h t t p ://`, `www .`, `t . me/`, `[.]`, `(dot)`, "x dot com"
- bare domains in free text (not in names: "Booking.com" is fine)
- emails, phone numbers, handles and cashtags
- payment, crypto, code and password requests

**Not evasion-proof.** Known misses include fully spaced domains ("e v i l . c o m"), new slang, and harmful text with no listed phrase. The AI review covers some of this, for profile text only.

**Parity.** `scripts/gen-moderation-sql.ts` writes the SQL into `schema.sql` and the migration, and the app's verdicts for `scripts/moderation-corpus.ts` into `supabase/tests/moderation.sql`. `moderationSync.test.ts` fails when any of these is stale. The SQL test fails if the database disagrees with the app.

## Legacy content

`supabase/audits/legacy_moderation.sql` is read-only. It counts failing rows per surface and column, with an owner-only commented query for ids. The live run on 2026-11-16 found 1 row checked and 0 failing. That run used the new patterns with the live (old) normalisers, because the migration isn't applied yet. Re-run the audit after applying.

Remediation (no silent deletion):
1. Flag the row with the audit.
2. Tell the owner what to edit, by email for now: the app has no notification channel for this.
3. If it isn't fixed, move the text to `profile_drafts` (`reason 'audit'`), blank the public column, and log `moderation_events` (`surface 'audit'`, `held`).
4. The user gets the text back in the editor on next sign-in and republishes it through profile-write.

## Reports, blocks, mutes

3 distinct reporters who are **real members** (ID-verified) auto-**hide** a profile or event (reversible, not a ban). Since phase 6, reports from unverified accounts are still stored and show in `admin_review_queue`, but they don't count toward the threshold, so throwaway accounts can't hide anyone. Reports are insert-only for the app (no reading or deleting them).

## Apply (owner, in this order; never paste keys into chat)
1. Phase 3 first, if it isn't applied yet: `supabase/migrations/20261116120000_mandatory_id_gate.sql`.
2. **Assistant server** (for the assistant, resume import and the app's borderline-chat `/moderate` check only; profile-write no longer calls it). Deploy `server/` with the current code. It needs:
   - `GROQ_API_KEY` or `ANTHROPIC_API_KEY`.
   - `APP_TOKEN`: now **required**. Without it `/assistant`, `/resume` and the app's `/moderate` check answer 503. It ships in the app, so it is a speed bump, not a secret.
   - `MODERATION_SERVER_TOKEN` is no longer needed: only profile-write used it, for the server's `/moderate {fields}` route.
   - `TRUST_PROXY_HOPS`: the number of proxies in front of the server that append to `x-forwarded-for` (usually `1` on a hosting platform, `0` when the server is reached directly). With `0` the per-IP limit uses the socket address and ignores the header.
3. **Function secrets.** In Supabase Edge Function Secrets set `GROQ_API_KEY` (and optionally `GROQ_MODERATION_MODEL`, default `llama-3.3-70b-versatile`), e.g. `supabase secrets set GROQ_API_KEY=<key> --project-ref avfahjcgczcfyvcnhzyy` typed in your own terminal. profile-write calls Groq directly; the key never reaches the app. Without it every reviewed change becomes a private draft (`reason: 'not_configured'`); a failing or malformed Groq answer does the same (`'provider_error'`). That is fail closed by design. The old `MODERATION_URL` / `MODERATION_TOKEN` secrets are unused and can be deleted.
4. **Function.** From the repo root, so `config.toml` keeps `verify_jwt = true`, run `supabase functions deploy profile-write --project-ref avfahjcgczcfyvcnhzyy`. Then `list_edge_functions` must show `verify_jwt: true`.
5. **App.** Ship or reload the app build that calls profile-write. It works before step 6 too, because it writes with the service role.
6. **Database.** Apply `supabase/migrations/20261116180000_moderation_write_path.sql`, then `20261116200000_nearby_recommendations.sql` and `20261116220000_review_fixes.sql` (full order in docs/handoff.md). All are idempotent, and re-running an older one no longer undoes a newer one. From then on, older app builds can't save profiles: they fail closed and publish nothing. Deploy profile-write from this commit **before** applying `20261116220000`: the function calls `profile_write_rate`, and until the migration exists the function answers 503 (fails closed) — so apply the migration right after the deploy.
7. **Check.** Run `supabase/tests/id_gate.sql`, `moderation.sql`, `nearby.sql` and `review_fixes.sql`. Each runs in a rolled-back transaction and must end with `… all checks passed`.
   If `20261116220000` printed a notice that a `profiles_*_ok` / `profiles_chips_len` constraint stays NOT VALID, existing rows break it (new writes are still checked). Find them (read-only), fix each through profile-write or by hand, then `alter table public.profiles validate constraint <name>;`:
   `select id from public.profiles where not (status is null or status in ('student','early','experienced','changing','between')) or not (mode in ('seeking','offering','both')) or not (goals <@ array['mentorship','advice','peers','collab','recruiting','other']);` (same shape for the other columns; the lists are in the migration).
8. **Audit.** Run `supabase/audits/legacy_moderation.sql` (read-only) and remediate as described above.

Local SQL tests: `supabase/tests/local_stub.sql` stands in for Supabase's roles and auth in a throwaway `postgis/postgis:16-3.4` container. Run order: stub -> schema -> migrations -> tests.
