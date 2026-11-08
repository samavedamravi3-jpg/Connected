# Build Status

Last updated: 2026-11-08.

## Implemented
- **Mobile app (2026-11-08):** installable web app with home-screen icon, standalone display, offline page and install banner; phone-first layout; working MapLibre map. See [[Mobile App]].
- **Preferences and coach (2026-11-08):** discovery distance, meeting style, experience, availability, photo and social links; radius-checked discovery, requests and AI; approach coach sharing the daily limit of 20 AI calls.
- Charlotte local events and demo data alongside the NYC sample.
Onboarding, map and filters, labeled NYC demo/live modes, persistent profiles, connection requests, saved items, event creation, expiring approximate discovery, and a server-side Claude draft endpoint with labeled template fallback.

## Verified
- 2026-11-08 on branch `claude/mobile-app`: 34 tests pass, typecheck clean, production build passes; mobile, offline and signed-in flows checked in a 390px Chromium viewport; icebreaker and coach returned real Claude replies with the saved key. Details in [[Mobile App]].
- TypeScript check and production build pass.
- 12 tests pass, including matching, discovery, bilateral blocks, request ownership, and bridge coordination rules.
- Local HTTP/D1 checks pass: sign-in boundary, profile persistence, GPS rounding, expiry cleanup, blocked drafts and requests, duplicate requests, cancellation, and cross-origin rejection.
- Fresh database migration and repeated migration are both verified.
- Desktop and 390-pixel mobile layout verified; no horizontal overflow.
- Real Claude Code session completed backend fixes, an independent bridge review, and verification of six bridge fixes.
- Project vault is registered and open in Obsidian. VS Code trusts only Connected.
- Source is published to the private GitHub repository. GitHub Actions run #1 passed for commit `1fd4daa`: https://github.com/samavedamravi3-jpg/Connected/actions/runs/42425635840.
- Private hosting remains blocked: the release-helper session was rejected by automatic approval review even after explicit user approval. The deployment archive is prepared locally; no deployed URL is claimed.

## Remaining setup
- Merge the `claude/mobile-app` pull request after review, then host it. Installing the app on phones needs the hosted HTTPS URL.
- Test the installed app on a real iPhone and Android phone, including sign-in from the home-screen app.
- Codex stopped (out of credits) with `charlotte-data-ui` and `bridge-and-release` still active on the bridge. Claude finished and committed that work on the owner's instruction; the bridge tasks were left as they are rather than closed under Codex's name.
- A server-side Anthropic key is now saved locally in the ignored `.dev.vars` (never committed). Hosted deployments need it set as a hosted secret.
- Invitations sent to notrishi08, kartik215, and NafisBhuiyan1; all three are pending acceptance.
- Real event ingestion, employer verification, full messaging, and multi-hop introductions are future work.
- Location cleanup happens on reads; no scheduled cleanup job exists.

## Coordination
Read [[bridge/Protocol]] and [[bridge/Board]]. Use the bridge inbox and acknowledge handoffs. Agent names are cooperative labels, not credentials. This bridge does not run unattended or wake an idle chat.
