// Edge function: the only way the app writes the public profile row (the database no longer grants it direct writes).
//
//   POST { row: { first_name, last_name, org, intro, offer, ...prefs } }   Authorization: Bearer <user token>
//   200 { status: 'published' }                       everything is public
//   202 { status: 'draft', held: ['intro', ...] }      the AI review couldn't run: those fields stay private in
//                                                      profile_drafts, the rest is saved; send again to retry
//   422 { status: 'rejected', fields: { intro: 'contact' | 'scams' | ... | 'ai' | 'too_long' | 'invalid' } }  nothing saved
//   401 / 429 / 503                                   not signed in / too many edits / couldn't save
//
// The user id comes only from the verified token. Only allowlisted columns are written (_shared/profileWriteCore.ts).
// Order: shared rules (_shared/moderationRules.ts, same as the app and the DB trigger) -> contextual AI review of
// changed org / intro / offer through the assistant server's /moderate (provider keys live there, never here or in the
// app) -> write with the service role (the DB moderation trigger runs again) -> decision log (no text) in moderation_events.
// Real membership (ID check) is not required: a new user must be able to save a basic profile before verifying.
//
// Secrets (owner sets them): MODERATION_URL (the assistant server's base URL, https) and MODERATION_TOKEN (equal to the
// server's MODERATION_SERVER_TOKEN). Missing or failing review = fail closed: text kept as a private draft.
// Deploy: supabase functions deploy profile-write --project-ref avfahjcgczcfyvcnhzyy   (verify_jwt stays on, config.toml)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseVerdicts, type AiField, type Verdict } from '../_shared/moderationAi.ts';
import { aiFieldsToCheck, pick, pickRow, withHeld } from '../_shared/profileWriteCore.ts';

const HOURLY_LIMIT = 120; // reviewed or refused text edits per user per hour (same as the profile_edit rate limit)
const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** null = the review couldn't run or answered badly (missing config, network, timeout, non-200, malformed). */
async function review(fields: Partial<Record<AiField, string>>): Promise<Verdict[] | null> {
  const url = Deno.env.get('MODERATION_URL');
  const token = Deno.env.get('MODERATION_TOKEN');
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/moderate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-server-token': token },
      body: JSON.stringify({ fields }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return parseVerdicts(await res.json(), Object.keys(fields) as AiField[]);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /i, '');
  const { data: me } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!me.user) return json(401, { error: 'Sign in first.' });
  const uid = me.user.id;

  let body: { row?: unknown } | null;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Body must be JSON.' });
  }
  const log = (rows: { field: string; decision: 'published' | 'rejected' | 'held'; reason: string }[]) =>
    rows.length ? admin.from('moderation_events').insert(rows.map((r) => ({ user_id: uid, surface: 'profile', ...r }))).then(() => {}, () => {}) : Promise.resolve();

  const { row, errors } = pickRow(body?.row);
  if (Object.keys(errors).length) {
    await log(Object.entries(errors).map(([field, reason]) => ({ field, decision: 'rejected', reason })));
    return json(422, { status: 'rejected', fields: errors });
  }

  const { data: current, error: readErr } = await admin.from('profiles').select('org, intro, offer').eq('id', uid).maybeSingle();
  if (readErr) return json(503, { error: 'Couldn’t save right now.' });
  const check = aiFieldsToCheck(row, current);
  let held: AiField[] = [];
  if (check.length) {
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await admin.from('moderation_events').select('id', { count: 'exact', head: true }).eq('user_id', uid).gte('at', since);
    if ((count ?? 0) >= HOURLY_LIMIT) return json(429, { error: 'rate_limited' });
    const verdicts = await review(pick(row, check));
    const blocked = verdicts?.filter((v) => v.decision === 'block') ?? [];
    if (blocked.length) {
      await log(blocked.map((v) => ({ field: v.field, decision: 'rejected', reason: `ai:${v.category}` })));
      return json(422, { status: 'rejected', fields: Object.fromEntries(blocked.map((v) => [v.field, 'ai'])) });
    }
    if (!verdicts) held = check;
  }

  const { error: writeErr } = await admin.from('profiles').upsert({ ...withHeld(row, current, held), id: uid });
  if (writeErr) {
    // The DB trigger or a constraint refused it (rules out of sync, or a limit): nothing is published.
    if (writeErr.message?.includes('content_blocked') || /^2[23]/.test(writeErr.code ?? '')) return json(422, { status: 'rejected', fields: {} });
    return json(503, { error: 'Couldn’t save right now.' });
  }
  if (held.length) {
    const { error } = await admin.from('profile_drafts').upsert({ user_id: uid, fields: pick(row, held), reason: 'ai_unavailable', updated_at: new Date().toISOString() });
    if (error) return json(503, { error: 'Couldn’t save right now.' });
    await log(held.map((field) => ({ field, decision: 'held', reason: 'ai_unavailable' })));
    return json(202, { status: 'draft', held });
  }
  await admin.from('profile_drafts').delete().eq('user_id', uid);
  await log(check.map((field) => ({ field, decision: 'published', reason: 'ai:none' })));
  return json(200, { status: 'published' });
});
