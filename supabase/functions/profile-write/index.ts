// Edge function: the only way the app writes the public profile row (the database no longer grants it direct writes).
//
//   POST { row: { first_name, last_name, org, intro, offer, ...prefs } }   Authorization: Bearer <user token>
//   200 { status: 'published' }                       everything is public
//   202 { status: 'draft', held: ['intro', ...] }      the AI review couldn't run: those fields stay private in
//                                                      profile_drafts, the rest is saved; send again to retry
//   422 { status: 'rejected', fields: { intro: 'contact' | 'scams' | ... | 'ai' | 'too_long' | 'invalid' } }  nothing saved
//   401 / 429 / 503                                   not signed in / too many edits / couldn't save
//
// The user id comes only from the verified token. Flow (_shared/profileWriteCore.ts handleProfileWrite):
// 1) atomic per-user write limit FIRST, for every request (profile_write_rate 'write': 120 an hour);
// 2) allowlisted columns, option ids (status, field, mode, goals, ...) against the app's catalog, shared rules
//    (_shared/moderationRules.ts, same as the app and the DB trigger), total chips size;
// 3) only when something new needs review: the lower AI limit (profile_write_rate 'ai': 10 an hour for new or
//    unverified accounts, 30 otherwise; over it the new text is held as a draft, no review spent), then the contextual AI review of changed org / intro / offer / area_name and
//    new custom (non-catalog) interests, skills and languages through the assistant server's /moderate (provider keys
//    live there, never here or in the app);
// 4) write with the service role (the DB moderation trigger and check constraints run again) -> decision log (no text)
//    in moderation_events (capped at 200 rows per user an hour by a trigger).
// Real membership (ID check) is not required: a new user must be able to save a basic profile before verifying.
//
// Secrets (owner sets them): MODERATION_URL (the assistant server's base URL; https only, redirects refused) and
// MODERATION_TOKEN (equal to the server's MODERATION_SERVER_TOKEN). Missing, non-https or failing review = fail
// closed: text kept as a private draft.
// Deploy: supabase functions deploy profile-write --project-ref avfahjcgczcfyvcnhzyy   (verify_jwt stays on, config.toml)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseVerdicts, type AiField, type Verdict } from '../_shared/moderationAi.ts';
import { handleProfileWrite, moderationEndpoint } from '../_shared/profileWriteCore.ts';

const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** null = the review couldn't run or answered badly (missing or non-https config, network, redirect, timeout, non-200, malformed). */
async function review(fields: Partial<Record<AiField, string>>): Promise<Verdict[] | null> {
  const url = moderationEndpoint(Deno.env.get('MODERATION_URL'));
  const token = Deno.env.get('MODERATION_TOKEN');
  if (!url || !token) return null;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-server-token': token },
      body: JSON.stringify({ fields }),
      redirect: 'error', // never follow a redirect with the server token
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

  const { status, body } = await handleProfileWrite(
    {
      rate: async (kind) => {
        const { data, error } = await admin.rpc('profile_write_rate', { p_uid: uid, p_kind: kind });
        return error ? null : data === true;
      },
      readCurrent: async (cols) => {
        const { data, error } = await admin.from('profiles').select(cols).eq('id', uid).maybeSingle();
        return { data: data as Record<string, unknown> | null, error };
      },
      review,
      upsert: async (row) => await admin.from('profiles').upsert({ ...row, id: uid }),
      saveDraft: async (fields) => await admin.from('profile_drafts').upsert({ user_id: uid, fields, reason: 'ai_unavailable', updated_at: new Date().toISOString() }),
      clearDraft: async () => {
        await admin.from('profile_drafts').delete().eq('user_id', uid);
      },
      log: async (rows) => {
        // Best effort: a failed log never fails the save (supabase-js returns errors instead of throwing).
        if (rows.length) await admin.from('moderation_events').insert(rows.map((r) => ({ user_id: uid, surface: 'profile', ...r })));
      },
    },
    () => req.json(),
  );
  return json(status, body);
});
