// Edge function: Stripe Identity webhook. Stripe calls it without a Supabase token, so it is deployed with the gateway JWT
// check OFF and authenticates every request by the Stripe-Signature HMAC over the raw body instead.
//
// Deploy:  supabase functions deploy identity-webhook --no-verify-jwt --project-ref avfahjcgczcfyvcnhzyy
// Stripe endpoint: https://avfahjcgczcfyvcnhzyy.supabase.co/functions/v1/identity-webhook
//   events: identity.verification_session.verified, .requires_input, .processing, .canceled
//
// Stores only status, livemode, last_error code and the event time. Never logs or stores the payload.
// Only live-mode verifications set the public badge (profiles.id_verified); test mode records "verified" privately.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { decide, parseSessionEvent, providerMode, verifyStripeSignature, type Row } from '../_shared/identityCore.ts';

const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  const mode = providerMode({ secretKey: Deno.env.get('STRIPE_SECRET_KEY'), webhookSecret: Deno.env.get('STRIPE_WEBHOOK_SECRET'), liveEnabled: Deno.env.get('IDENTITY_LIVE_ENABLED') });
  if (!mode.available) return json(503, { error: 'unavailable' });

  const raw = await req.text(); // raw body: the signature is over these exact bytes
  if (!(await verifyStripeSignature(raw, req.headers.get('stripe-signature'), Deno.env.get('STRIPE_WEBHOOK_SECRET'), Date.now() / 1000))) {
    return json(400, { error: 'bad signature' });
  }
  let ev;
  try {
    ev = parseSessionEvent(JSON.parse(raw));
  } catch {
    return json(400, { error: 'bad payload' });
  }
  if (!ev) return json(200, { ignored: true });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: row, error: readErr } = await admin
    .from('id_verifications')
    .select('user_id, session_id, status, livemode, event_at, created_at')
    .eq('user_id', ev.userId)
    .maybeSingle();
  if (readErr) return json(500, { error: 'read failed' });

  const d = decide(row as Row | null, ev, mode.liveEnabled);
  if (!d.apply) return json(200, { ignored: d.reason });

  // Badge first: if the row update below fails, Stripe retries and the badge write repeats harmlessly.
  if (d.grantBadge) {
    const p = await admin.from('profiles').update({ id_verified: true, id_verified_at: d.patch.event_at }).eq('id', ev.userId).select('id');
    if (p.error || !p.data?.length) return json(500, { error: 'update failed' });
  }
  // Compare-and-set on the row we decided against (status and event_at), so a late older event can't overwrite a newer
  // one that raced it; a concurrent change makes Stripe retry and re-decide.
  const prev = row as Row;
  const cas = admin
    .from('id_verifications')
    .update({ ...d.patch, updated_at: new Date().toISOString() })
    .eq('user_id', ev.userId)
    .eq('session_id', ev.sessionId)
    .eq('status', prev.status);
  const u = await (prev.event_at === null ? cas.is('event_at', null) : cas.eq('event_at', prev.event_at)).select('user_id');
  if (u.error || !u.data?.length) return json(500, { error: 'update failed' }); // non-2xx so Stripe retries
  return json(200, { ok: true });
});
