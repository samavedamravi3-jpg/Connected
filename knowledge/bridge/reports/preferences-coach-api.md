# preferences-coach-api — report

Owner: claude · Mode: edit · Date: 2026-11-07 · Status: ready for review (not accepted)

## Revision 2: Codex integration feedback applied
The task was requeued and re-claimed through the bridge before these edits.
- **Default model:** back to `claude-sonnet-5-5`, the existing configured default. An `ANTHROPIC_MODEL` override is still honored.
- **Plain Messages API request:** removed `fallbacks`, the `anthropic-beta` header and `output_config.effort`. The request body is now only `model`, `max_tokens`, `system` and `messages`.
- **Coach reply cap:** replies and template guidance are capped at `COACH_REPLY_MAX = 1200` characters (was 2000), so a reply always passes the 1200-character history limit on the next turn. The system prompt now asks for under 150 words every time.
- **Tests:** asserts the exact body keys, no beta header, the Sonnet default, the model override, and a round trip of a reply at the cap.

## Scope
Edited: `lib/server.ts`, `lib/visibility.ts`, `app/api/profile/route.ts`, `app/api/discover/route.ts`, `app/api/connections/route.ts`, `app/api/icebreaker/route.ts`, `tests/authorization.test.ts`.
New: `lib/ai.ts`, `app/api/coach/route.ts`, `tests/coach.test.ts`.
Not touched: `lib/network.ts`, UI, schema/migrations, package files, shared notes. I did not open or print `.dev.vars` or any secret.

## What changed
**Profile preferences** (`lib/visibility.ts` `profileSchema`, re-exported from `lib/server.ts` so existing imports are unchanged):

| Field | Default | Allowed |
|---|---|---|
| `visibilityKm` | 1.6 | 0.8, 1.6, 4.8, 8, 16.1 |
| `meetingStyle` | Either | Either, In person, Online |
| `experience` | Student | Student, Early career, Experienced |
| `availability` | Flexible | Now, This week, Flexible |
| `photoUrl` | `''` | HTTPS URL (no credentials, not `.svg`/`.svgz`), or `data:image/{jpeg,png,webp};base64,…`; max 180,000 chars |
| `socials.{linkedin,instagram,github}` | `''` | HTTPS URL whose host is exactly the provider domain or a subdomain; no credentials; max 300 chars |
| `onboardingVersion` | 1 | integer 1–100 (the UI saves 2) |

- **Old profiles stay compatible.** Every new field has a default in the schema.
- **Reads repair stored data.** `withProfileDefaults()` runs on every profile read (profile GET, discover, coach and target resolution). It fills defaults and also replaces any stored value that fails policy.

**Discovery radius**
- `GET /api/discover` (live mode) now **requires** `?latitude=&longitude=`; without them it returns 400. The center is rounded to the same coarse grid as stored profiles.
- A person is returned only if that center lies within the `visibilityKm` *they* chose (default 1.6 km).
- The response adds `searchCenter`, a `note`, and the person's new fields: `visibilityKm`, `meetingStyle`, `experience`, `availability`, `photoUrl`, `socials`.
- The demo path (`?demo=true`) is unchanged.
- Discover, requests, icebreaker and coach all share one rule, `canReach()`: demo IDs are exempt; live people need a valid center inside their radius.

**Shared target resolution** (`resolveTarget()` in `lib/server.ts`) checks, in order:
1. Not the caller.
2. No block in either direction.
3. A demo person, or a profile still inside its one-hour window.
4. Within that person's radius.

It's used by:
- `POST /api/connections`: new optional `latitude`/`longitude`; blocked → 403, unavailable or out of range → 409 with one generic message.
- `POST /api/icebreaker`: new optional `latitude`/`longitude`; any failure → 404 "This profile is unavailable."
- `POST /api/coach`: same as icebreaker.

**Coach** (`app/api/coach/route.ts`, `lib/ai.ts`)
- `GET` returns `{configured: boolean}` only, never the key or model. It doesn't require sign-in.
- `POST` accepts `{personId, messages, latitude, longitude}`:
  - Messages: 1–12 turns, role `user` or `assistant`, each 1–1200 characters after trimming, and the last must be from the user.
  - Leading assistant turns are dropped, because the UI sends a trailing window of history (`slice(-11)`) that can start with an assistant reply.
  - It requires your own profile and passes the shared target check.
- **What reaches Claude** is built by `coachContext()` as an allow-list: sender name, goal and preferences (meetingStyle, experience, availability); target name, role, company, help and goal. It sends no photo, socials, location, user IDs or email. The profile JSON goes in a delimited `<profiles>` block in the first user turn and is labeled as untrusted data.
- **System prompt:** respectful, specific introductions; no invented relationships, referrals or hiring; cannot send messages or look anyone up; declines to scrape socials; public places; respect a "no".
- **Quota:** one daily limit of 20 calls per user, shared with the icebreaker (`consumeAiQuota()`).
- **Fallback:** a missing key, exhausted quota, timeout, upstream error, refusal or empty reply all return `{text, source:'template', note}` with labeled guidance ("Template guidance (not written by Claude)…"). A demo target adds a note saying it's a fictional profile.

**Shared AI helper** (`lib/ai.ts`)
- Pure module: it takes the key, model and `fetch` as arguments and has no Worker or database imports.
- Raw `fetch` to `POST /v1/messages`, because the Anthropic SDK isn't a dependency and package files are out of scope.
- Timeout 25 s; it never throws and never logs the key (only the HTTP status).
- Default model `claude-sonnet-5-5`; an `ANTHROPIC_MODEL` override is honored. Plain request with no beta headers or extra options (see Revision 2).
- A `stop_reason` of `refusal` falls back to the labeled template.
- `max_tokens` is 2000 for the icebreaker (previously 512) and 4000 for the coach, leaving room for adaptive thinking. Output is truncated to 500 characters (icebreaker) and 1200 characters (coach).

## Validation
- `npm test` (Revision 2): **33/33 pass**, including 18 new tests of mine (8 in `authorization.test.ts`, 10 in `coach.test.ts`).
- `npm run typecheck` (Revision 2): **0 errors across the whole project**, now that Codex's UI files are fixed. The Revision 1 notes about UI-file errors below are superseded.
- New tests in `authorization.test.ts` cover:
  - legacy-profile defaults;
  - allowed-choice limits;
  - replacing bad stored values on read;
  - social domain spoofing (`evillinkedin.com`, `linkedin.com.evil.com`, `http:`, credentials, `javascript:`);
  - photos (SVG by data URL and by path, GIF, HTML, script, 180,000-character limit);
  - parity of the local location math with `lib/network.ts`;
  - search-center parsing and rounding;
  - radius in/out across 0.8, 1.6, 4.8 and invalid values;
  - demo exemption.
- New tests in `coach.test.ts` cover:
  - message limits and roles;
  - trimming a window that starts with an assistant turn;
  - no leak of photo, socials, location, IDs or email in what is sent;
  - request structure;
  - required system-prompt rules;
  - headers and body (key only in the header);
  - an older model skips the model-specific fields;
  - every failure reason (including a real timeout);
  - labeled templates;
  - the quota constant.
- `npm run typecheck`: **0 errors in my files.** The only current errors are in Codex's in-progress `components/approach-coach.tsx` (`d`/`data` typed `unknown`) and `components/nearby-map.tsx`.
- `npx eslint` on all edited and new files: clean.
- Quota SQL: replayed the exact `consumeAiQuota` update against in-memory `node:sqlite` with drizzle. 20 allowed, the 21st and 22nd denied, another user unaffected.
- UI contract checked by reading Codex's components only: discover sends `latitude`/`longitude`; connections, icebreaker and coach POST send `latitude`/`longitude`; the coach reads `text`, `source` and `note`.

## Not verified / limits
- **No full build and no HTTP/D1 route run.** `npm run build` wasn't run, because typecheck currently fails in Codex's UI files. The routes weren't exercised over HTTP or D1 locally. Please rerun your HTTP/D1 checks for discover-without-center 400, out-of-radius request 409, coach 404 for blocked/out-of-range, and the shared quota.
- **No live Claude call by me.** Codex says a key is now saved. I did not read `.dev.vars` or start the app to use it. The plain request shape follows the Messages API reference; please run one live coach call and one icebreaker call. Any rejection falls back to labeled templates rather than failing.
- **Build not run:** I left `npm run build` to Codex, since it owns build output and release.
- **The radius is a client-asserted bound, not location proof.** The search center comes from the client, so a determined user can send any coordinates. The check stops casual wide-area browsing only. The discover `note` says so.
- **HTTPS photo URLs are fetched by viewers' browsers.** The photo host can see viewer IPs, as map tiles can. Data-URL photos avoid that but add up to about 180 KB per person to discover responses.
- **Not radius-filtered:** events in discover (not requested). Pending requests already created stay visible to both participants after either one moves out of range.
- **Other limits:** `GET /api/coach` is public (the boolean only). Coach history is client-supplied, so a user can forge "assistant" turns; that only affects their own coaching. `withProfileDefaults` drops stored `onboardingVersion` values that aren't integers (for example the string `'2'`) back to 1.
