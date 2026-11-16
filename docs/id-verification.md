# ID verification

Stripe Identity, hosted page, **test mode only** until someone deliberately turns live mode on.

## What the check means
- Stripe confirms a government ID is genuine and matches a live selfie. It does **not** prove anyone is safe, and we do not use it as an age check.
- Stripe processes the ID photos and selfie. We never receive or store images, selfies, document numbers, names or dates of birth.
- Email verification (blue check, `profiles.verified`, `/verify`) is a separate thing. ID verification is the green shield (`profiles.id_verified`, `/verify-id`).

## How it works
- `identity` edge function (gateway JWT check **on**). Every call needs the user's Supabase token; the user id comes from that token, never from the body.
  - `{ action: 'status' }` → `{ available, test }`
  - `{ action: 'session' }` → `{ url, test }` or `{ state: 'processing' }`. Resumes the user's open session (fresh single-use URL from a Stripe retrieve) or creates one with `type=document`, `require_matching_selfie=true`, `metadata.user_id`. A Stripe `Idempotency-Key` (`idv:<user>:<previous session or first>`) plus a compare-and-set write stop double taps from creating two sessions. The URL is returned to the user only; never logged or stored.
- `identity-webhook` edge function (gateway JWT check **off**; authenticated by the `Stripe-Signature` HMAC over the raw body, 5-minute tolerance, any `v1` may match). Invalid signature → 400. It only applies an event when `metadata.user_id` and our stored `session_id` for that user agree. Verified and canceled are final; older events never overwrite newer ones; duplicates are no-ops. Our own write failure → 500 so Stripe retries.
- Shared pure rules: `supabase/functions/_shared/identityCore.ts` (tests: `src/lib/__tests__/identityCore.test.ts`).
- Stored in `id_verifications` (owner can read, nobody but the service role writes): session id, status (`started` / `pending` / `verified` / `rejected` / `canceled`), `livemode`, `last_error` code, `event_at`, timestamps.
- `profiles.id_verified` (public badge) is set only by the webhook, only for a **live-mode** verified event. Trigger `profiles_protect_id_verified` resets any app write.

### Test mode does not grant the badge
A passed test-mode check is stored as `status=verified, livemode=false`. The app shows **"Test verification passed"** with a "Test verification" label, but `profiles.id_verified` stays false: no public badge, no ID gate, no relaxed rate limit, no Open Door trust. Live mode needs a live key **and** `IDENTITY_LIVE_ENABLED=true`; otherwise the function reports unavailable and the webhook ignores live events.

### App
- Onboarding: preferences → profile ("Say hello") → create account (or skip as guest) → **Verify your identity** → resume → experience → done. Guests see "Sign in to verify". "Do this later" changes nothing.
- Progress is saved (`resumeAt` in local app state), so closing the app during the browser trip reopens the ID step.
- The hosted page opens in the external browser (Safari/Chrome; camera works there). No `return_url` and no deep link: the user closes the browser and the app re-reads status when it comes to the foreground, or on **Check status**. The app never marks anything verified itself.
- Profile → "Verify your ID" opens `/verify-id`, the same panel.
- Missing keys, a non-deployed function or any server error → "Verification currently unavailable" with Continue. Never a fake badge.
- Gate: `app_config.id_gate` (default `off`). With it on, the DB blocks connection requests from members without `profiles.id_verified`.

## Setup (project owner, on your own machine; never paste keys into chat)
1. Apply the ID section of `supabase/schema.sql` to connected-hackathon (adds `livemode`, `last_error`, `event_at`, `created_at`, widens the status check).
2. Stripe Dashboard, **test mode** on (toggle top right):
   - Identity: open https://dashboard.stripe.com/test/identity and complete the Identity application / activation if asked.
   - Key: Developers → API keys → **Create restricted key** with *Identity Verification Sessions*: **Write** (includes read). Nothing else is needed. It starts with `rk_test_`. (A `sk_test_` secret key also works.)
   - Webhook: Workbench → Webhooks → **Add destination** → events `identity.verification_session.verified`, `identity.verification_session.requires_input`, `identity.verification_session.processing`, `identity.verification_session.canceled` → Webhook endpoint → URL `https://avfahjcgczcfyvcnhzyy.supabase.co/functions/v1/identity-webhook` → create, then **Reveal** the signing secret (`whsec_...`).
3. In your terminal:
   ```bash
   supabase secrets set STRIPE_SECRET_KEY=rk_test_... STRIPE_WEBHOOK_SECRET=whsec_... --project-ref avfahjcgczcfyvcnhzyy
   supabase functions deploy identity --project-ref avfahjcgczcfyvcnhzyy
   supabase functions deploy identity-webhook --no-verify-jwt --project-ref avfahjcgczcfyvcnhzyy
   ```
   If the app gets 401 from `identity` before the function runs (gateway can't verify the project's JWT signing keys), redeploy it with `--no-verify-jwt`; the function still checks the token itself.
4. Do **not** set `IDENTITY_LIVE_ENABLED`. Live mode stays off.

## Test (Stripe test mode)
1. In the app, sign in, reach the ID step (or Profile → Verify your ID). You should see the "Test verification" label.
2. Tap **Verify identity**. Safari opens Stripe's test page; pick a test outcome (e.g. *Verified*, or a failure such as *Document expired* / *Selfie mismatch*), no real ID needed.
3. Close Safari, return to the app. It refreshes on foreground; or tap **Check status**.
4. Expect: success → "Test verification passed" (no badge); failure → "That attempt didn't go through" + Try again (same session is reused).
5. Check Workbench → Webhooks → event deliveries all return 200.

Limits: Open Doors are stored on the phone, so the Open Door gate is client-side only. The ID gate should stay off until a live-mode flow has been reviewed.
