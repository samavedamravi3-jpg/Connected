// Edge function: marks the caller verified after they proved a school or work email.
//
// Request:  POST { proof: <access token from the throwaway OTP session> }
//           Authorization: Bearer <the caller's real session token>   (sent by supabase.functions.invoke)
// Response: { kind: 'school' | 'work', at: <ISO date> }  or  { error } with a 4xx status.
//
// Deploy (after review): supabase functions deploy verify-email
// Needs no extra secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com',
  'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'zoho.com', 'yandex.com', 'qq.com', '163.com',
]);
const DISPOSABLE = new Set(['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'trashmail.com', 'yopmail.com', 'sharklasers.com', 'getnada.com']);

// Keep in sync with classifyEmail() in src/lib/verification.ts.
function classify(email: string): 'school' | 'work' | null {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  if (!domain || FREE_MAIL.has(domain) || DISPOSABLE.has(domain)) return null;
  return /\.edu$/.test(domain) || /\.(edu|ac)\.[a-z]{2}$/.test(domain) ? 'school' : 'work';
}

const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /i, '');
  let proof = '';
  try {
    proof = String(((await req.json()) as { proof?: unknown }).proof ?? '');
  } catch {
    return json(400, { error: 'Body must be JSON.' });
  }
  if (!token || !proof) return json(400, { error: 'Missing session or proof.' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const [{ data: me }, { data: pr }] = await Promise.all([admin.auth.getUser(token), admin.auth.getUser(proof)]);
  if (!me.user) return json(401, { error: 'Sign in first.' });
  if (!pr.user?.email || !pr.user.email_confirmed_at) return json(400, { error: 'That email wasn’t confirmed. Try again.' });

  const kind = classify(pr.user.email);
  if (!kind) return json(400, { error: 'Use a school or work email, not a personal or temporary one.' });

  const at = new Date().toISOString();
  const { data: updated, error } = await admin
    .from('profiles')
    .update({ verified: true, verified_at: at, verified_kind: kind })
    .eq('id', me.user.id)
    .select('id');
  if (error) return json(500, { error: 'Couldn’t save your verification. Try again.' });
  if (!updated?.length) return json(409, { error: 'Finish setting up your profile first, then verify.' });

  // The OTP session may have created a throwaway auth user for the school or work address. Remove it
  // (unless it is the caller's own account) so no stray accounts pile up.
  if (pr.user.id !== me.user.id) await admin.auth.admin.deleteUser(pr.user.id).catch(() => {});

  return json(200, { kind, at });
});
