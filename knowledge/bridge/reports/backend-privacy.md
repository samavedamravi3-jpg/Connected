# backend-privacy — report

Owner: claude · Mode: edit · Date: 2026-11-07 · Status: ready for review (not accepted)

## Scope
Edited only: `lib/server.ts`, `lib/visibility.ts` (new), `app/api/profile/route.ts`, `app/api/discover/route.ts`, `app/api/connections/route.ts`, `app/api/icebreaker/route.ts`, `tests/authorization.test.ts` (new).
`app/api/saved/route.ts` was in scope but needed no change. No UI, schema, migration, package, bridge or shared-note edits. Identity provider (`getChatGPTUser`) and all demo labels unchanged.

## Findings → fixes
1. **Coarse location retained after discovery expired.**
   `clearExpiredLocations()` in `lib/server.ts` nulls `profiles.lat`/`lng` and sets `latitude`/`longitude` to null and `discovery` to false inside `profiles.data` (SQLite `json_set`). It only touches rows where `visible_until <= now`, so a fresh opt-in written at the same moment is never wiped.
   - `GET /api/profile` clears the caller's own row, then returns a scrubbed profile and `visibleUntil: 0` once expired (it still scrubs the response even if the write did not happen).
   - `GET /api/discover` sweeps all expired rows lazily on each read.
   - No scheduled job: a row is cleared the next time its owner loads their profile or anyone loads discovery.
2. **Blocks not enforced on existing requests.**
   - `GET /api/connections` hides any request whose counterpart is blocked in either direction (`visibleRequests`).
   - `PATCH` refuses `accepted` when either side has blocked the other (`canTransition`). Decline and cancel remain allowed so people can clean up.
   - The PATCH update is now also guarded by `status = 'pending'` against double transitions.
   - `POST` now checks blocks for sample people too (previously only real profiles), which matches the UI's "Hide this person" copy.
3. **Icebreaker ignored blocks.** `POST /api/icebreaker` returns the same 404 "This profile is unavailable." for a blocked pair or for the caller's own ID, so a block can't be detected or bypassed this way.
4. **Rejected origins returned 500; connections loaded every profile.**
   - `sameOrigin` now throws `FORBIDDEN_ORIGIN`, and `errorResponse` maps it to **403**.
   - `GET /api/connections` now looks up names only for the counterparts of the caller's visible requests (`inArray`, skipped when the list is empty).
   - Also fixed a naming bug: the sample-name lookup always used `recipient` instead of the counterpart.

Pure policy lives in `lib/visibility.ts` (no framework imports): `isDiscoverable`, `scrubLocation`, `hiddenFor`, `isBlockedPair`, `counterpart`, `visibleRequests`, `canTransition`. The database helpers `clearExpiredLocations`, `blocksFor` and `blocksBetween` live in `lib/server.ts`.

## Validation (run 2026-11-07)
- `npm run typecheck`: pass.
- `npm test`: 11/11 pass, including 7 new tests in `tests/authorization.test.ts`. They cover the expiry boundary, location scrubbing, two-way block hiding, request visibility for non-participants, the transition rules, and blocks preventing acceptance while still allowing decline/cancel.
- `npx eslint` on the edited files: clean.
- SQL check: built the exact `clearExpiredLocations` UPDATE with drizzle's sqlite-proxy and ran it against in-memory `node:sqlite`. The per-user call cleared only that user's expired row; the sweep cleared all expired rows; the live row was unchanged. The script was a scratchpad file, not committed.

## Not verified / remaining limits
- **`npm run build` not run.** Codex owns release and build output; I avoided writing `dist/` while it publishes.
- **No route-level tests.** Not run against local D1 or wrangler, and no HTTP tests of the route handlers. The tests cover the pure policy only. Cloudflare D1 support for `json_set`/`json_extract` is assumed from its SQLite base and was checked on local SQLite, not D1.
- **Cleanup is lazy.** An expired location stays in the database until the next profile or discovery read. A cron job would be needed to guarantee a time bound.
- **Requests survive a block.** Blocking does not cancel or delete pending requests; they are hidden and can't be accepted. If the block is removed, the request reappears.
- **Origin check.** `sameOrigin` still allows requests with no `Origin` header. I did not review session cookie SameSite settings in `app/chatgpt-auth.ts` (out of scope).
- **Request listing has no location data.** Profiles that are not discoverable still appear by name to people they already exchanged requests with. This is intended.

## Suggested review steps for codex
Diff the files above, run `npm run typecheck && npm test`, then do one manual pass. A blocks B → B's pending request disappears for both sides → PATCH accept returns 403 → icebreaker for the blocked ID returns 404 → a cross-origin PUT returns 403.
