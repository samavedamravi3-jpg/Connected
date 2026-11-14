# Spec: Profile Experience section

## Objective
Let a member list work/school experience on Profile (title, organization, dates, description, skills), optionally pre-filled from a resume PDF, and use it to sharpen matches and nearby alerts.
Success: add/edit/delete works offline and with Supabase; PDF import yields editable drafts; matches rank higher when experience skills/orgs overlap.

## Assumptions (correct me or I proceed)
1. Local-first like the rest of the app (AsyncStorage in `AppState`), synced to Supabase only when signed in (same pattern as `backend.ts`).
2. Other members can see your experiences only if they can already see your profile (mirrors "profiles: read visible"); you can always edit only your own.
3. Resume parsing happens in `server/` (holds the Anthropic key). The app never sees the key and never saves parsed data without the user's review.
4. PDF text extraction uses a small server dependency (`unpdf`); scanned/image-only PDFs return "couldn't read text" and fall back to manual entry.
5. Model for parsing: `claude-haiku-5-5` (cheap, structured JSON), same proxy/token/rate limit as `/assistant`.

## Commands
- Typecheck: `npx tsc --noEmit` (app) and `cd server && npm run typecheck`
- Lint: `npx expo lint`
- Proxy: `cd server && npm run dev`
- App: `npx expo start`
- Install picker: `npx expo install expo-document-picker`; server: `cd server && npm i unpdf`

## Data model
```ts
type Experience = { id: string; title: string; org: string; start: string /* YYYY-MM */; end: string | null /* null = present */; description: string; skills: string[] };
```
Supabase `experiences` (needs your approval before I apply it):
`id uuid pk, user_id uuid -> auth.users on delete cascade, title, org, start_date, end_date null, description, skills text[], created_at, updated_at`
- RLS on. Policies: owner insert/update/delete/select own rows; select for others only when the owner's profile is visible and neither side blocked the other.
- Moderation trigger on title/org/description/skills, same as the `profiles_moderation` pattern (`content_blocked`).
- Length checks: title/org <= 120, description <= 1000, skills <= 15 items of <= 40 chars; index on `user_id`.

## Project structure
```
src/data/types.ts              + Experience; Person.experience?: Experience[]
src/lib/experience.ts          validation, date formatting, skill/org helpers (pure)
src/lib/resumeImport.ts        pick PDF -> POST to proxy -> draft Experience[]
src/lib/backend.ts             + experiences CRUD (assertClean + dbError)
src/lib/match.ts               use experience skills/orgs/titles
src/state/AppState.tsx         experiences state + add/update/remove
src/components/ExperienceEditor.tsx   edit sheet; ResumeReview list
src/app/(tabs)/profile.tsx     Experience section
server/src/index.ts            POST /resume (PDF -> JSON)
supabase/schema.sql            experiences table, RLS, triggers
```

## Behavior
- **Section:** list sorted newest first; "Add" button; tap to edit; delete with confirm; empty state explains the section and offers import.
- **Editor:** title + org required; dates month pickers (end = "Present" toggle; end >= start); description; skills as chips. All text goes through `allowed()` (local + AI check) before save; `assertClean` in the data layer; DB trigger is the backstop.
- **Import:** `expo-document-picker` (`application/pdf`, `copyToCacheDirectory: true`), 5 MB cap. File is read as base64 and POSTed to `/resume`. Server extracts text, asks Claude for JSON, validates/clamps the shape, returns `{ experiences }`. App shows each draft in the editor for review; nothing is saved until the user taps Save per entry (or "Save all" after review). Drafts also run through moderation.
- **Fallback:** if `EXPO_PUBLIC_ASSISTANT_URL` is unset, the request fails/times out (15 s), or the server returns an error, show "Couldn't import, add it manually" and open the empty editor.
- **Privacy:** resume text is sent to the proxy only for parsing, not stored or logged by the server. Say so in the import sheet.

## Matching (`match.ts`)
- `effectiveSkills(prefs, experiences)` = prefs.skills union experience skills, deduped, case-insensitive. Same for a Person (skills union their experience skills).
- `sharedSkills` uses the effective sets; weight 0.25 -> 0.5 per shared skill (cap 4) so experience matters.
- New: shared organization (case-insensitive) = +1.5 and a `matchPoints` line "Also worked at {org}"; overlapping title keywords add a point "Has done {title}".
- Nearby alerts and the assistant context reuse `matchScore`, so they inherit this with no separate logic; assistant context also lists top 3 experiences.

## Code style
Follow existing: strict TS, functional helpers, `@/` imports, `C/S/R/T` theme tokens, `Section/Row/KV/Button` from `ui.tsx`, no new styling system.

## Testing strategy
- No test runner exists in the repo; I won't add one. Pure helpers in `experience.ts` and `match.ts` changes are verified with a throwaway `tsx` script (not committed) plus typecheck + lint.
- Server: curl `/resume` with a sample PDF and with garbage; confirm fallback path with proxy off.
- UI: run on web/simulator, add/edit/delete, import with proxy on and off.

## Boundaries
- Always: typecheck + lint before commit; commit after each working step; moderate every text field; install via `npx expo install`.
- Ask first: applying the Supabase migration (you said so), adding `unpdf` to server, adding `expo-document-picker` (native module: needs a dev build, not Expo Go).
- Never: put an API key in the app, save parsed data without review, touch `ios/`/`android/`, commit secrets.

## Success criteria
1. Add/edit/delete an experience; persists across restart; blocked language is rejected.
2. Import a text PDF with proxy running -> editable drafts -> saved only after review.
3. Proxy off / scanned PDF -> clear message and manual editor opens.
4. A person sharing a skill or org via experience scores higher and shows a match line; alerts reflect it.
5. `tsc` and `expo lint` clean for app and server; RLS verified (other user can't read/edit/delete rows).

## Open questions
1. Visibility: should others see your experience (assumption 2), or keep it private and used only for your own matching? Note: using it for *their* matching of you requires sharing it.
2. OK to add `unpdf` to `server/` and `expo-document-picker` to the app?
3. Demo people: add sample experiences to a few so matching is visible in the demo?
