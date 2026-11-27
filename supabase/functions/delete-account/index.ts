// Edge function: delete the signed-in account. POST { password, confirm: 'DELETE' }  -> { ok: true, stripe }
//
// Order matters: (1) verify the token, (2) re-authenticate with the password, (3) ask Stripe to redact the ID check,
// (4) remove photos, (5) de-identify the audit log, (6) delete the auth user (every table cascades from it).
// If a verified ID check can't be redacted we stop BEFORE deleting anything, so the user can retry and the data is never
// orphaned at Stripe. Nothing here logs the email, password or Stripe ids.
// Deploy (after review):  supabase functions deploy delete-account --project-ref <ref>   (gateway JWT check ON)
import { createClient } from 'npm:@supabase/supabase-js@2';

const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const STRIPE = 'https://api.stripe.com/v1/identity/verification_sessions';

async function redact(sessionId: string): Promise<number> {
  try {
    const res = await fetch(`${STRIPE}/${encodeURIComponent(sessionId)}/redact`, { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}` } });
    return res.status;
  } catch {
    return 0;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  let body: { password?: unknown; confirm?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad_request' });
  }
  if (body.confirm !== 'DELETE') return json(400, { error: 'confirm' });
  const password = typeof body.password === 'string' ? body.password : '';
  if (!password || password.length > 256) return json(400, { error: 'wrong_password' });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /i, '');
  const { data: me } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!me.user?.email) return json(401, { error: 'sign_in' });
  const uid = me.user.id;

  // Re-authentication with a throwaway client, so the real session is untouched.
  const probe = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: authErr } = await probe.auth.signInWithPassword({ email: me.user.email, password });
  if (authErr) return json(authErr.status === 429 ? 429 : 403, { error: authErr.status === 429 ? 'rate_limited' : 'wrong_password' });

  // Stripe: redact the verification session (removes what Stripe collected; Stripe says up to 4 days).
  const { data: idv } = await admin.from('id_verifications').select('session_id, status').eq('user_id', uid).maybeSingle();
  let stripeResult: 'redaction_requested' | 'none' = 'none';
  if (idv?.session_id) {
    let code = await redact(idv.session_id);
    if (code === 0 || code >= 500) code = await redact(idv.session_id); // one retry
    const ok = (code >= 200 && code < 300) || code === 404; // 404: Stripe has no such session
    if (ok) stripeResult = 'redaction_requested';
    else if (idv.status === 'verified') return json(502, { error: 'stripe_failed' }); // keep the account so it can be retried
  }

  // Photos (private bucket). Missing files are not an error.
  await admin.storage.from('profile-photos').remove([`${uid}/avatar.jpg`, `${uid}/thumb.jpg`]);

  // The audit log has no foreign key: remove the person's id from it and keep the action itself.
  await admin.from('audit_log').update({ actor: null }).eq('actor', uid);
  await admin.from('audit_log').update({ subject: 'deleted-user' }).like('subject', `%${uid}%`);

  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) return json(500, { error: 'delete_failed' });
  return json(200, { ok: true, stripe: stripeResult });
});
