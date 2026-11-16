// Edge function: ID verification for the app (Stripe Identity hosted page). The webhook lives in ../identity-webhook.
//
//   POST { action: 'status' }   -> { available, test }                 is a provider configured, and is it test mode?
//                                  (available && !test = live mode: the only mode whose result unlocks membership)
//   POST { action: 'session' }  -> { url, test } | { state: 'processing' }  resumes the user's open session or starts one
//
// Every call needs the user's Supabase token (Authorization: Bearer, sent by supabase.functions.invoke). The user id
// always comes from that verified token, never from the body. The session URL is returned to that user only and is
// never logged or stored; we never request or store ID images, selfies, document numbers, names or dates of birth.
//
// Secrets (project owner sets them; never in the app): STRIPE_SECRET_KEY (sk_test_/rk_test_), STRIPE_WEBHOOK_SECRET.
// Live mode stays off unless IDENTITY_LIVE_ENABLED=true is also set. See docs/id-verification.md.
// Deploy:  supabase functions deploy identity --project-ref avfahjcgczcfyvcnhzyy   (gateway JWT check ON)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { captureFor, createKey, isRealMember, providerMode, resumeAction, reusable, sessionParams, type Row } from '../_shared/identityCore.ts';

const STRIPE = 'https://api.stripe.com/v1/identity/verification_sessions';
const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type StripeSession = { id?: string; url?: string | null; status?: string; livemode?: boolean; metadata?: { user_id?: string } };

const BUSY = 'A check is already starting. Tap Check status, then try again.';

/** status 0 = network error. `s` is null unless Stripe answered 2xx with JSON. */
async function stripe(path: string, method: 'GET' | 'POST', body?: URLSearchParams, idempotencyKey?: string): Promise<{ status: number; s: StripeSession | null }> {
  const headers: Record<string, string> = { Authorization: `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`, 'Content-Type': 'application/x-www-form-urlencoded' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  try {
    const res = await fetch(`${STRIPE}${path}`, { method, headers, body });
    if (!res.ok) return { status: res.status, s: null }; // never echo Stripe's body: it can contain the session
    return { status: res.status, s: (await res.json()) as StripeSession };
  } catch {
    return { status: 0, s: null };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  let action = '';
  try {
    action = String(((await req.json()) as { action?: unknown } | null)?.action ?? '');
  } catch {
    return json(400, { error: 'Body must be JSON.' });
  }
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /i, '');
  const { data: me } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!me.user) return json(401, { error: 'Sign in first.' });
  const uid = me.user.id;

  const mode = providerMode({ secretKey: Deno.env.get('STRIPE_SECRET_KEY'), webhookSecret: Deno.env.get('STRIPE_WEBHOOK_SECRET'), liveEnabled: Deno.env.get('IDENTITY_LIVE_ENABLED') });
  if (action === 'status') return json(200, { available: mode.available, test: mode.test });
  if (action !== 'session') return json(400, { error: 'Unknown action.' });
  if (!mode.available) return json(503, { error: 'unavailable' });

  const { data: prof } = await admin.from('profiles').select('id_verified').eq('id', uid).maybeSingle();
  if (!prof) return json(409, { error: 'Finish setting up your profile first, then try again.' });

  const read = async () =>
    (await admin.from('id_verifications').select('user_id, session_id, status, livemode, event_at, created_at').eq('user_id', uid).maybeSingle()).data as Row | null;
  const row = await read();
  // Same rule as SQL is_real_member: a bare id_verified flag (no live verified row) must be able to verify again.
  if (isRealMember(prof.id_verified, row)) return json(409, { error: 'You’re already ID verified.' });
  const wantLive = !mode.test;
  const capture = captureFor(mode.test);

  // 1) Resume the stored session when Stripe says it is still open (fresh single-use URL on every retrieve).
  let gone = false; // Stripe has no such session (404): just create a new one
  if (reusable(row, wantLive, Date.now())) {
    const r = await stripe(`/${encodeURIComponent(row!.session_id)}`, 'GET');
    gone = r.status === 404;
    if (!r.s && !gone) return json(502, { error: 'Couldn’t reach the verification service. Try again.' });
    const next = r.s ? resumeAction(r.s, uid, capture) : 'new';
    if (next === 'open') return json(200, { url: r.s!.url, test: mode.test });
    if (next === 'processing') return json(200, { state: 'processing', test: mode.test });
  }

  // 2) Otherwise replace it. Best-effort cancel of the old session first so it can't be finished later; all errors ignored.
  if (row?.session_id && !gone) await stripe(`/${encodeURIComponent(row.session_id)}/cancel`, 'POST');
  // The idempotency key makes concurrent taps get the same session from Stripe; 409 = another request with it is in flight.
  const c = await stripe('', 'POST', sessionParams(uid, capture), createKey(uid, row, capture));
  if (c.status === 409) return json(409, { error: BUSY });
  const s = c.s;
  if (!s?.id || !s.url) return json(502, { error: 'Couldn’t start verification. Try again later.' });
  if (s.livemode && !mode.liveEnabled) {
    await stripe(`/${encodeURIComponent(s.id)}/cancel`, 'POST');
    return json(503, { error: 'unavailable' });
  }

  const now = new Date().toISOString();
  const fields = { provider: 'stripe', session_id: s.id, status: 'started', livemode: s.livemode === true, last_error: null, event_at: null, created_at: now, updated_at: now };
  // Replace only the row we read (compare-and-set), so two racing requests can't both win with different sessions.
  const w = row
    ? await admin.from('id_verifications').update(fields).eq('user_id', uid).eq('session_id', row.session_id).select('user_id')
    : await admin.from('id_verifications').insert({ user_id: uid, ...fields }).select('user_id');
  if (w.error || !w.data?.length) {
    const now2 = await read();
    if (now2?.session_id !== s.id) return json(409, { error: BUSY });
  }
  return json(200, { url: s.url, test: mode.test });
});
