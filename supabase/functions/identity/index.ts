// Edge function: ID verification, provider-agnostic. Stripe Identity (test mode) is the first provider.
//
//   POST { action: 'status' }   -> { available: boolean }              (is a provider configured?)
//   POST { action: 'session' }  -> { url }  Authorization: Bearer <user token>; starts a hosted check
//   POST ?action=webhook        -> provider webhook; verifies the signature, then updates status (service role)
//
// We never request or store ID images, numbers or reports: only session id, status and a timestamp.
// Only this function (service role) can mark someone verified; a DB trigger blocks the app from doing it.
//
// Secrets (set by the project owner, never in the app): STRIPE_SECRET_KEY (sk_test_... only), STRIPE_WEBHOOK_SECRET.
// Deploy WITHOUT gateway JWT check (the webhook has no user token; /session checks the token itself):
//   supabase functions deploy identity --no-verify-jwt --project-ref avfahjcgczcfyvcnhzyy
// Stripe webhook URL: https://avfahjcgczcfyvcnhzyy.supabase.co/functions/v1/identity?action=webhook
//   events: identity.verification_session.verified, .requires_input, .processing, .canceled
import { createClient } from 'npm:@supabase/supabase-js@2';

type Status = 'unverified' | 'pending' | 'verified' | 'rejected';
type WebhookResult = { sessionId: string; userId: string; status: Status } | null;

interface Provider {
  name: string;
  configured(): boolean;
  createSession(userId: string): Promise<{ sessionId: string; url: string }>;
  parseWebhook(raw: string, headers: Headers): Promise<WebhookResult>;
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const same = (a: string, b: string) => a.length === b.length && [...a].reduce((d, c, i) => d | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

const stripe: Provider = {
  name: 'stripe',
  // Test mode only: a live key makes the provider "unavailable" until a privacy review turns it on.
  configured: () => /^(sk|rk)_test_/.test(Deno.env.get('STRIPE_SECRET_KEY') ?? '') && !!Deno.env.get('STRIPE_WEBHOOK_SECRET'),
  async createSession(userId) {
    const body = new URLSearchParams({ type: 'document', 'metadata[user_id]': userId, 'options[document][require_matching_selfie]': 'true' });
    const res = await fetch('https://api.stripe.com/v1/identity/verification_sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const j = (await res.json()) as { id?: string; url?: string };
    if (!res.ok || !j.id || !j.url) throw new Error('provider_error');
    return { sessionId: j.id, url: j.url };
  },
  async parseWebhook(raw, headers) {
    // Stripe-Signature: t=<unix>,v1=<hmac sha256 of "<t>.<raw body>">
    const parts = Object.fromEntries((headers.get('stripe-signature') ?? '').split(',').map((p) => p.split('=') as [string, string]));
    const t = Number(parts.t);
    if (!t || !parts.v1 || Math.abs(Date.now() / 1000 - t) > 300) return null;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(Deno.env.get('STRIPE_WEBHOOK_SECRET')!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`)));
    if (!same(mac, parts.v1)) return null;
    const ev = JSON.parse(raw) as { type: string; data: { object: { id: string; metadata?: { user_id?: string } } } };
    const map: Record<string, Status> = {
      'identity.verification_session.verified': 'verified',
      'identity.verification_session.requires_input': 'rejected',
      'identity.verification_session.processing': 'pending',
      'identity.verification_session.canceled': 'unverified',
    };
    const status = map[ev.type];
    const userId = ev.data.object.metadata?.user_id;
    return status && userId ? { sessionId: ev.data.object.id, userId, status } : { sessionId: '', userId: '', status: 'unverified' };
  },
};

const PROVIDER: Provider = stripe; // swap or add providers here (Persona, Veriff, ...)

const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const raw = await req.text();
  const urlAction = new URL(req.url).searchParams.get('action');

  if (urlAction === 'webhook') {
    if (!PROVIDER.configured()) return json(503, { error: 'unavailable' });
    let r: WebhookResult;
    try {
      r = await PROVIDER.parseWebhook(raw, req.headers);
    } catch {
      return json(400, { error: 'bad payload' });
    }
    if (!r) return json(400, { error: 'bad signature' });
    if (!r.sessionId) return json(200, { ignored: true });
    // Only the user's latest session counts, so an old or foreign session can't change their status.
    const { data: row } = await admin.from('id_verifications').select('session_id').eq('user_id', r.userId).maybeSingle();
    if (!row || row.session_id !== r.sessionId) return json(200, { ignored: true });
    const at = new Date().toISOString();
    await admin.from('id_verifications').update({ status: r.status, updated_at: at }).eq('user_id', r.userId);
    if (r.status === 'verified') await admin.from('profiles').update({ id_verified: true, id_verified_at: at }).eq('id', r.userId);
    return json(200, { ok: true });
  }

  let action = '';
  try {
    action = String((JSON.parse(raw || '{}') as { action?: unknown }).action ?? '');
  } catch {
    return json(400, { error: 'Body must be JSON.' });
  }
  if (action === 'status') return json(200, { available: PROVIDER.configured() });
  if (action !== 'session') return json(400, { error: 'Unknown action.' });

  if (!PROVIDER.configured()) return json(503, { error: 'unavailable' });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /i, '');
  const { data: me } = await admin.auth.getUser(token);
  if (!me.user) return json(401, { error: 'Sign in first.' });
  const { data: prof } = await admin.from('profiles').select('id_verified').eq('id', me.user.id).maybeSingle();
  if (!prof) return json(409, { error: 'Finish setting up your profile first.' });
  if (prof.id_verified) return json(409, { error: 'You’re already ID verified.' });
  try {
    const s = await PROVIDER.createSession(me.user.id);
    await admin.from('id_verifications').upsert({ user_id: me.user.id, provider: PROVIDER.name, session_id: s.sessionId, status: 'pending', updated_at: new Date().toISOString() });
    return json(200, { url: s.url });
  } catch {
    return json(502, { error: 'Couldn’t start verification. Try again later.' });
  }
});
