# Moderation (phase 4)

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
| Custom skill chip (onboarding interests step) | `profiles.skills`, public | rules on Add and on save | profile-write + trigger (each item, at most 60 chars) | no |
| Interests, languages, goals, challenges, traits, foods, diet, availability (fixed lists) | `profiles` arrays | rules on save | profile-write + trigger | no |
| Area label (`area_name`, from location) | `profiles`, public | rules on save | profile-write + trigger | no |
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

Honest summary: the contextual AI review is enforced **only for profile `org`, `intro` and `offer`**. Chat, connection notes and experience text get the rules in the database (authoritative), plus a best-effort AI check in the app that a modified app can skip.

## The mediated write path

```
app (shared rules, field messages) --invoke--> profile-write (edge fn, verify_jwt)
   user id from the validated token; allowlisted columns only; same rules again
   -> changed org/intro/offer -> assistant server /moderate {fields} (Groq or Claude; keys only there)
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
- **Database backstop.** `authenticated` loses INSERT/UPDATE on `profiles`. It keeps UPDATE on `area_lat`, `area_lng` and `area_seen_at` only, for `set_my_area`. The Phase 3 locks on badges, `hidden` and timestamps stay closed. The rules trigger still runs on service-role writes.
- **Rate limit.** At most 120 reviewed or refused text edits per user per hour, counted from `moderation_events`. The old `profiles_rate_limit` trigger sees no `auth.uid()` under the service role.
- **Decision log.** `moderation_events` is service-role only. Nothing punishes accounts automatically.

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

These are unchanged. Flag: 3 distinct reporters auto-**hide** a profile (reversible, not a ban), and reports are not weighted by verification. Three throwaway accounts could hide someone. The threshold is left as is.

## Apply (owner, in this order; never paste keys into chat)
1. Phase 3 first, if it isn't applied yet: `supabase/migrations/20261116120000_mandatory_id_gate.sql`.
2. **Assistant server.** Deploy `server/` somewhere Supabase can reach over https, with the current code. It needs:
   - `MODERATION_SERVER_TOKEN`: a random string of 32+ characters.
   - `GROQ_API_KEY` or `ANTHROPIC_API_KEY`.
   - `APP_TOKEN`, as before.
3. **Function secrets.** Run `supabase secrets set MODERATION_URL=https://<server> MODERATION_TOKEN=<same value as MODERATION_SERVER_TOKEN> --project-ref avfahjcgczcfyvcnhzyy`. Without these, every bio change becomes a private draft. That is fail closed by design.
4. **Function.** From the repo root, so `config.toml` keeps `verify_jwt = true`, run `supabase functions deploy profile-write --project-ref avfahjcgczcfyvcnhzyy`. Then `list_edge_functions` must show `verify_jwt: true`.
5. **App.** Ship or reload the app build that calls profile-write. It works before step 6 too, because it writes with the service role.
6. **Database.** Apply `supabase/migrations/20261116180000_moderation_write_path.sql`. It is idempotent. From then on, older app builds can't save profiles: they fail closed and publish nothing.
7. **Check.** Run `supabase/tests/moderation.sql` and `supabase/tests/id_gate.sql`. Both run in a rolled-back transaction and must end with `… all checks passed`.
8. **Audit.** Run `supabase/audits/legacy_moderation.sql` (read-only) and remediate as described above.

Local SQL tests: `supabase/tests/local_stub.sql` stands in for Supabase's roles and auth in a throwaway `postgis/postgis:16-3.4` container. Run order: stub -> schema -> migrations -> tests.
