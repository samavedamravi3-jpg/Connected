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
