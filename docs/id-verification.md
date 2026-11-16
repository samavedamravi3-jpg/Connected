# ID verification

Built: provider-agnostic edge function `identity` (`supabase/functions/identity`), Stripe Identity (test mode) first.

- States: `unverified` / `pending` / `verified` / `rejected`. Private row in `id_verifications` (own-read only); public badge is `profiles.id_verified`.
- We store only provider, session id, status, timestamp. Never ID images or numbers.
- Only the signed webhook (service role) can set `verified`. Trigger `profiles_protect_id_verified` resets any app attempt.
- Two badges: blue check = school/work email, purple shield = ID.
- No Stripe key (or a non-test key) = the app shows "Verification unavailable". Never a fake badge.
- Entry points: final onboarding step, Profile card, `/verify-id`, and a prompt when an unverified user sends a connection request or creates an Open Door.
- Gate: `app_config.id_gate` (default `off`). The DB trigger on `connection_requests` blocks unverified senders once it is `on`.

Setup (project owner):
1. Run `supabase/schema.sql` on connected-hackathon.
2. `supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_... --project-ref avfahjcgczcfyvcnhzyy`
3. `supabase functions deploy identity --no-verify-jwt --project-ref avfahjcgczcfyvcnhzyy`
4. Stripe dashboard (test mode) webhook: `https://avfahjcgczcfyvcnhzyy.supabase.co/functions/v1/identity?action=webhook`, events `identity.verification_session.verified`, `.requires_input`, `.processing`, `.canceled`.
5. After a successful test: `update public.app_config set value = 'on' where key = 'id_gate';`

Limits: Open Doors are stored on the phone, so the Open Door gate is client-side only. Gate requires a test of the whole flow with Stripe test documents.

## Onboarding and profile
Onboarding has optional resume import and experience steps (privacy toggle "Show my experience" defaults off) and a final skippable ID step. The Profile tab shows a Resume & Experience card under the header. See `docs/guardrails.md` for limits and the gate switch.
