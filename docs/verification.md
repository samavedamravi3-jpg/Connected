# Verification

## Phase 1: school or work email (built)

- Profile → Verify → enter a school or work email → one-time code by email → blue check.
- Personal providers (Gmail, Yahoo, …) and temporary inboxes are rejected. `.edu` / `.ac.xx` = "school", other domains = "work".
- The check is set only by the `verify-email` edge function (service role). A database trigger
  (`profiles_protect_verified`) resets any attempt from the app to change `verified`, `verified_at`, `verified_kind`.
- Stored: `verified` (bool), `verified_at`, `verified_kind`. Never the email address.
- Only verified people trigger nearby alerts (`peopleWithin` in `src/lib/nearbyAlerts.ts`).

Setup in the Supabase dashboard:
1. Run `supabase/schema.sql` (adds the columns, trigger and moderation functions).
2. Deploy: `supabase functions deploy verify-email`.
3. Authentication → Email templates → **Magic Link**: include the code, e.g. `Your code is {{ .Token }}`. The default template only has a link.
4. Authentication → Rate limits: the built-in mailer allows only a few emails an hour. Configure a custom SMTP provider before real use.

Limits: a "work" email proves the person controls an inbox at that domain, not that they work there.

## Phase 2: ID check with Stripe Identity, test mode (built: see docs/id-verification.md)

Goal: a stronger "ID verified" level. We never store ID photos. Stripe holds them; we keep only `verified = true` and a date.

1. **Server (`server/`)**: add `STRIPE_SECRET_KEY` (test key, `sk_test_…`) and `STRIPE_WEBHOOK_SECRET` to `server/.env.example`.
   - `POST /identity/session` (requires the user's Supabase JWT; check it with Supabase Auth): create a
     `stripe.identity.verificationSessions.create({ type: 'document', metadata: { user_id }, options: { document: { require_matching_selfie: true } } })`
     and return `{ client_secret, url }`. Do not return anything else.
   - `POST /identity/webhook`: verify the Stripe signature, handle `identity.verification_session.verified`
     (set `profiles.verified = true, verified_at = now(), verified_kind = 'id'` with the service role, using `metadata.user_id`) and
     `identity.verification_session.requires_input` (do nothing; the user can retry). Do not request or save the report/files.
2. **App**: "Verify with ID" in `src/app/verify.tsx` calls `/identity/session`, then opens `url` with `expo-web-browser` (hosted flow, no native SDK, works in Expo Go). On return, call `refreshVerification()`.
3. **Privacy**: no ID image, document number, name or date of birth is written to our database. Set Stripe's data retention to the minimum in the dashboard and mention Stripe in the privacy copy.
4. **Rollout**: test mode first (Stripe's test document images), then live mode after a privacy review.
