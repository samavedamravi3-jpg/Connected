# ID verification (mandatory for real members)

Stripe Identity, hosted page. A government photo ID plus a matching selfie is **required** to see or interact with real
people on Connected. Test mode works now; live mode stays off until the owner turns it on (see "Live activation").

## What the check means
- Stripe confirms a government photo ID is genuine and matches a live selfie. It does **not** prove anyone is safe to meet, and we don't use it as an age check (Stripe itself won't verify people under the age of majority).
- Stripe collects and processes the ID images and selfie. Connected never stores images, selfies, face data, document numbers, names, dates of birth or Stripe payloads. Stripe keeps verification data under its own policy (see "Data retention").
- Email verification (blue check, "Email verified", `profiles.verified`, `/verify`) is separate and never unlocks anything. ID verification is the purple shield ("ID verified", `/verify-id`).

## Real membership: one predicate, always on
`public.is_real_member(uid)` = `profiles.id_verified` (set only by `identity-webhook`, only for a live-mode verified event)
**and** an `id_verifications` row for that user with `status='verified'` and `livemode=true`.

- A Stripe test pass (`livemode=false`), a bare/stale `id_verified` flag without a live row, and the email badge never count. Existing rows aren't changed; a stale flag simply stops counting.
- No switch: `id_gate_on()` is a constant `true` (kept for older app builds) and the `app_config` `id_gate` row is deleted.
- Enforced in the database (`supabase/migrations/20261116120000_mandatory_id_gate.sql`, mirrored in `schema.sql`):
  - `profiles` select: other people's rows only when both viewer and subject are real members (this also covers `nearby_profiles`, people search and `fetchPeopleByIds`, which read through RLS).
  - `experiences` of others: both sides real members.
  - `alert_candidates`: empty for non-members; candidates must be real members (was: email-verified).
  - `connection_requests`: read needs membership; insert needs sender **and** recipient to be members (`id_required` / `recipient_unavailable`); accepting needs both.
  - `messages`: read needs membership; send needs both participants to be members.
  - `rate_check`: the relaxed limit needs email or real membership, never a bare flag.
  - Report auto-hide (phase 6, `20261116220000_review_fixes.sql`): only reports from real members count toward the three-reporter threshold (profiles and events). Reports from anyone are still stored.
- Always allowed (no circular dependency): creating/updating your own profile row before verifying (through profile-write), reading your own profile (`my_profile()`) and `id_verifications` row, your own experiences, blocks, mutes, reports, `set_my_area`, `hidden_event_ids`.
- Client roles can't write `profiles` at all (since phases 4 and 6: profile-write and `set_my_area` do it), can't read other members' `hidden`, `area_seen_at`, timestamps or badge details (column-level SELECT, phase 6), and can't write `id_verifications` at all. The protect triggers stay as a second layer.
- `is_blocked` / `has_connection` (SECURITY DEFINER) answer only when the caller is one of the two people, and no SECURITY DEFINER function is executable by `anon` (phase 6).
- Not in the database, so gated in the app only: Open Door publishing (Open Doors live on the phone) and live event listings (Meetup/Devpost, fetched by the app). There is no user event creation.
- Authorization checks: `supabase/tests/id_gate.sql` (see "Apply").

## How it works
- `identity` edge function (gateway JWT check **on**). The user id comes from the verified token, never the body.
  - `{ action: 'status' }` → `{ available, test }`. Only `available && !test` (live) can unlock Connected.
  - `{ action: 'session' }` → `{ url, test }` or `{ state: 'processing' }`. Resumes the open session (fresh single-use URL from a Stripe retrieve) or creates one with `type=document`, `options[document][require_live_capture]=true`, `options[document][require_matching_selfie]=true`, `options[document][allowed_types][]=driving_license|passport|id_card`, `metadata.user_id`. **No** `require_id_number`, **no** `return_url`, no `provided_details`. Idempotency key `idv2:<user>:<previous session or first>` plus a compare-and-set write stop double taps from creating two sessions. Refuses only when the user is already a real member (same rule as the SQL predicate), so a stale flag can re-verify.
- `identity-webhook` (gateway JWT check **off**; Stripe-Signature HMAC over the raw body, 5-minute tolerance). Applies an event only when `metadata.user_id` and our stored `session_id` agree; verified/canceled are final; older events never overwrite newer ones; duplicates are no-ops; our write failure → 500 so Stripe retries. Sets `profiles.id_verified` only for a live-mode verified event with `IDENTITY_LIVE_ENABLED=true`.
- Pure rules and tests: `supabase/functions/_shared/identityCore.ts`, `src/lib/__tests__/identityCore.test.ts`.
- Missing keys or webhook secret → `available: false`: the app says real verification is unavailable and why, and everything real stays locked. Never a fake camera flow or badge.

## App
- Onboarding: welcome → **create account** (email confirmation, sign in) → **basic profile** → **Verify your identity** (Connected explainer: ID photo, selfie, accepted IDs, privacy and retention, "verified ≠ safe", explicit consent checkbox) → Stripe's hosted camera flow → server-confirmed result → the remaining steps (preferences, resume, experience).
- No "Optional" / "Do this later" / "Skip" unlocks anything. Escape hatches that keep real areas locked: **Explore demo mode instead** (demo people only) and **Sign out**. Guests can continue in demo mode.
- States: not started, capturing (browser open), processing (spinner + polling 3 s → 30 s backoff, ~10 min), verified, needs another attempt, canceled/expired, unavailable (no provider configured, or test mode: "Live ID verification is switched off"), and a test pass labelled **"Test result — does not unlock Connected"**.
- Return to app: no deep link. The app re-reads status when it comes to the foreground, on **Check status**, and while polling. Browser dismissed early → **Continue verification** reuses the session. App restart → status is read from the server; `resumeAt` reopens the step. Network failure → "Couldn't reach the server…", last status kept.
- Locked areas (map real people, search, requests/chats, events, Open Door publishing) show the next action: Create an account / Verify your ID / Continue verification / Check status / Try again. Profile (account, sign out, privacy), `/verify-id` and demo content stay reachable. There is no in-app support screen yet.

## Stripe docs (checked 2026-11-16)
- Create session parameters (https://docs.stripe.com/api/identity/verification_sessions/create): `options.document.allowed_types` (`driving_license`, `id_card`, `passport`; other types fail with `document_type_not_allowed`), `require_id_number`, `require_live_capture` ("Disable image uploads, identity document images have to be captured using the device's camera"), `require_matching_selfie`; `return_url` ("The URL that the user will be redirected to upon completing the verification flow").
- Hosted redirect flow (https://docs.stripe.com/identity/verify-identity-documents?platform=web&type=redirect): session URL is single-use, expires after 48 hours, must not be stored or logged; `return_url` is shown only with an `https://` web page. Nothing is documented about custom app schemes or `exp://` URLs, so we don't set it.
- Sessions (https://docs.stripe.com/identity/verification-sessions): reuse the same session after an interruption; use an idempotency key; retrieve for a fresh URL after `requires_input`; cancel before `processing`; redaction deletes PII (up to 7 days).
- Test vs live: "If your API key is in test mode, verification checks won't actually process" (create reference). Activation needs the Identity application (https://dashboard.stripe.com/identity/application) and business verification. Live webhooks need a live-mode endpoint (https://docs.stripe.com/identity/handle-verification-outcomes).
- Selfie checks: in places like the EU, privacy law may require justifying biometrics or offering a non-biometric alternative (https://docs.stripe.com/identity/verification-checks?type=selfie). We offer no alternative; get legal advice before launching there.
- Unsupported uses include verifying minors / under-16s (https://docs.stripe.com/identity/use-cases).

## Data retention
Stripe's support page (https://support.stripe.com/questions/managing-your-id-verification-information) says biometric identifiers are removed within one year and the rest of the submitted identity data, including all captured images, is typically kept for 7 years, longer where law requires. Stripe acts as our processor for that data; deletion requests go to us (we can redact the session in Stripe). The app says only "Stripe keeps verification data for a period set by its own privacy policy" and links https://stripe.com/privacy; it never promises no retention.

## Pricing
Stripe Identity: **$1.50 per verification** for ID document + selfie, "charged when a user completes verification" (https://stripe.com/identity, checked 2026-11-16). ID number lookup is $0.50 (US SSN only); we don't use it. Test mode is free.

## Expo Go limits
- The hosted page opens in the external browser (Safari/Chrome) via `Linking.openURL`; the camera works there, and this works in Expo Go.
- No `return_url` / deep link: Expo Go has no stable app URL, and Stripe doesn't document custom schemes. The user closes the browser and the app re-reads status.
- Stripe's native sheet (`@stripe/stripe-identity-react-native`) needs native iOS/Android SDKs, camera permission and an ephemeral key endpoint, so it can't run in Expo Go (development build only). Not used.

## Apply (owner, in this order; never paste keys into chat)
1. **Database**: run `supabase/migrations/20261116120000_mandatory_id_gate.sql` on connected-hackathon (SQL editor: paste and Run, or `apply_migration`), then the later migrations in the order in docs/handoff.md. Idempotent; re-running this one after the later ones is safe (its superseded sections skip themselves). Real-member areas lock for everyone without a live verified row as soon as it runs.
2. **Check**: run `supabase/tests/id_gate.sql` in the SQL editor (or `psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/id_gate.sql`). It works in a rolled-back transaction and must end with `id_gate: all checks passed`.
3. **Functions** (from the repo root so `supabase/config.toml` pins `verify_jwt`):
   ```bash
   supabase functions deploy identity --project-ref avfahjcgczcfyvcnhzyy
   supabase functions deploy identity-webhook --no-verify-jwt --project-ref avfahjcgczcfyvcnhzyy
   ```
   Then `list_edge_functions` must show `verify_jwt: true` for `identity` and `false` for `identity-webhook`. (Only `identity` changed; redeploying the webhook is harmless.)
4. **App**: reload the dev build / Expo Go.

### Test mode setup (if not done yet)
Stripe Dashboard in test mode: complete the Identity application; create a restricted key with *Identity Verification Sessions: Write* (`rk_test_…`); add a webhook destination for `identity.verification_session.verified`, `.requires_input`, `.processing`, `.canceled` at `https://avfahjcgczcfyvcnhzyy.supabase.co/functions/v1/identity-webhook`; then
`supabase secrets set STRIPE_SECRET_KEY=rk_test_... STRIPE_WEBHOOK_SECRET=whsec_... --project-ref avfahjcgczcfyvcnhzyy`.
Do **not** set `IDENTITY_LIVE_ENABLED`.

Test: sign in → profile → ID step shows "Test mode" → Start ID check → pick a Stripe test outcome → close the browser → the app shows "Test result — does not unlock Connected" (verified test) or "That attempt didn't go through" (failure). Real areas stay locked either way.

## Live activation (owner only, when ready)
1. Stripe: switch to live mode, complete business verification and the Identity application, accept the Identity terms (https://stripe.com/identity/legal), and confirm the use case is supported (https://docs.stripe.com/identity/use-cases).
2. Create a **live** restricted key (*Identity Verification Sessions: Write*, `rk_live_…`).
3. Add a **live-mode** webhook destination with the same four events and URL; reveal its live `whsec_…` secret (different from the test one).
4. `supabase secrets set STRIPE_SECRET_KEY=rk_live_... STRIPE_WEBHOOK_SECRET=whsec_... IDENTITY_LIVE_ENABLED=true --project-ref avfahjcgczcfyvcnhzyy`
   (one key per project: setting live keys stops test mode).
5. Verify yourself end to end with a real ID; confirm webhook deliveries return 200 and that `is_real_member` is true for your user.
6. Budget for $1.50 per completed verification.
