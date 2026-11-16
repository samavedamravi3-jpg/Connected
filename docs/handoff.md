# Handoff (Connected, branch hackathon-features)

- Last commit before this pass: 3cd20fa (UI pass). Nothing pushed.
- Live DB (connected-hackathon, avfahjcgczcfyvcnhzyy): guardrails/ID/misuse migration applied and tested. Stripe `identity` function NOT deployed (ID shows "Verification unavailable", gate off).
- Dev servers: assistant proxy on :8787 (server/.env, no AI key yet), Expo on :8081 (exp://192.168.86.34:8081, restart to reload env).
- Verified: tsc, expo lint, npm test (10/10) exit 0 at 3cd20fa. Phone UI not verified.
- Done: distance filtering fix (withinRange), person cards, events counts/scrim/expiry, inbox badges, guest note.
- In progress this pass: map clarity (hub legend into Layers sheet), Profile section order, profiles.show_experience default -> false (migration authorized).
- Remaining: add GROQ/ANTHROPIC key to server/.env, deploy identity fn + Stripe test secrets, phone checklist, screenshots.
