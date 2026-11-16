# Handoff (Connected, branch hackathon-features)

- Last commit before this pass: 3cd20fa (UI pass). Nothing pushed.
- Live DB (connected-hackathon, avfahjcgczcfyvcnhzyy): guardrails/ID/misuse migration applied and tested. Stripe `identity` function NOT deployed (ID shows "Verification unavailable", gate off).
- Dev servers: assistant proxy on :8787 (server/.env, no AI key yet), Expo on :8081 (exp://192.168.86.34:8081, restart to reload env).
- Verified: tsc, expo lint, npm test (10/10) exit 0 at 3cd20fa. Phone UI not verified.
- Done: distance filtering fix (withinRange), person cards, events counts/scrim/expiry, inbox badges, guest note.
- In progress this pass: map clarity (hub legend into Layers sheet), Profile section order, profiles.show_experience default -> false (migration authorized).
- Remaining: add GROQ/ANTHROPIC key to server/.env, deploy identity fn + Stripe test secrets, phone checklist, screenshots.

## Update: after redesign push (fa91334 pushed to personal/hackathon-features)
- Impeccable v4.9.x installed at project scope: .claude/skills/impeccable, .claude/agents/impeccable-*, hooks in .claude/settings.local.json (gitignored), engine in ~/.impeccable. Not yet loadable as /impeccable in a session started before install: reload Claude Code (exit, then `claude --continue` in this folder) and run `/impeccable critique` or `/impeccable polish`.
- Metro on :8081 (exp://192.168.86.34:8081) and API server on :8787 keep running.
- Not verified on device: all redesign visuals. app.json splash/android icon backgrounds still purple.

## Phase 5: nearby recommendations (not applied, not pushed)
- DB: `supabase/migrations/20261116200000_nearby_recommendations.sql` (origin-free `alert_candidates()`, `nearby_alert_prefs` + `set_nearby_alert_prefs`). Tests: `supabase/tests/nearby.sql` (local container only). Apply after phases 3 and 4.
- Client: `src/lib/nearbyPolicy.ts` (pure, tested), `src/lib/nearbyAlerts.ts`, `src/components/NearbyRecCard.tsx`, Profile > Visibility & alerts. Foreground only. Details: `docs/nearby-alerts.md`. Not verified on a phone.

## Phase 6: security review fixes (not applied, not pushed)
- DB: `supabase/migrations/20261116220000_review_fixes.sql` (mirrored in `schema.sql`; tests `supabase/tests/review_fixes.sql`). Server-only rate/log tables, definer `set_my_area` with move limits, column-level profile SELECT + `my_profile()`, clamped/rate-limited `nearby_profiles`, real-member-only auto-hide, option-id check constraints, `profile_write_rate`, caller-only `is_blocked`/`has_connection`, no anon execute on definer functions. Older migrations now skip sections a later one supersedes, so re-running them is safe.
- Functions/server: profile-write (limit first, option allowlist, AI review of area name + custom chips by Groq called directly from the function with the `GROQ_API_KEY` secret, no redirects); assistant server (`APP_TOKEN` required, `TRUST_PROXY_HOPS`).
- Client: own row via `my_profile()`, explicit public column list for other people (an old build's `select *` fails closed after the migration).

### Apply order (all four migrations; owner, nothing applied yet)
1. Assistant server (assistant, resume import, chat `/moderate` only): deploy `server/` with `APP_TOKEN`, `GROQ_API_KEY` or `ANTHROPIC_API_KEY`, and `TRUST_PROXY_HOPS` (1 behind a platform proxy). profile-write does not use it or `MODERATION_SERVER_TOKEN`.
2. Function secrets (Supabase Edge Function Secrets): `GROQ_API_KEY`, optional `GROQ_MODERATION_MODEL`. `MODERATION_URL` / `MODERATION_TOKEN` are no longer used.
3. `supabase/migrations/20261116120000_mandatory_id_gate.sql`
4. `supabase/migrations/20261116180000_moderation_write_path.sql`
5. `supabase/migrations/20261116200000_nearby_recommendations.sql`
6. Deploy `profile-write` (from the repo root, `verify_jwt` on) and, if not yet, `identity` / `identity-webhook` (docs/id-verification.md). profile-write answers 503 until step 7 exists (fails closed), so do 7 right away.
7. `supabase/migrations/20261116220000_review_fixes.sql` (watch for a "stays NOT VALID" notice: docs/moderation.md step 7).
8. Run `supabase/tests/id_gate.sql`, `moderation.sql`, `nearby.sql`, `review_fixes.sql` (each rolls back, must end with `… all checks passed`); then `supabase/audits/legacy_moderation.sql`.
9. Ship/reload the app build from this branch.
