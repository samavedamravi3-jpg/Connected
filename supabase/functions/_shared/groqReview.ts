// Contextual AI review of profile fields, called by the profile-write edge function directly (no assistant server).
// Same policy and request shape as server/src/index.ts moderateFields. The key is read through `env` only, sent only
// in the Authorization header, and never logged or returned. No Deno APIs here, so node:test covers it
// (src/lib/__tests__/groqReview.test.ts) with a fake fetch and env.
import { AI_SYSTEM, aiUserMessage, parseVerdicts, type AiField, type Verdict } from './moderationAi.ts';

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';
export const GROQ_TIMEOUT_MS = 8_000;

export type Env = (name: string) => string | undefined;
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * 'not_configured' = no GROQ_API_KEY. null = provider error, treated as temporary by the caller: network failure,
 * timeout, a redirect, any non-200 (429 and 5xx included), or a malformed / inconclusive answer (parseVerdicts).
 * Never throws; on null or 'not_configured' the caller keeps the text as a private draft (fail closed).
 */
export async function groqReview(fields: Partial<Record<AiField, string>>, env: Env, fetchFn: FetchLike = fetch): Promise<Verdict[] | null | 'not_configured'> {
  const key = env('GROQ_API_KEY')?.trim();
  if (!key) return 'not_configured';
  try {
    const res = await fetchFn(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env('GROQ_MODERATION_MODEL')?.trim() || GROQ_DEFAULT_MODEL,
        temperature: 0,
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: AI_SYSTEM }, { role: 'user', content: aiUserMessage(fields) }],
      }),
      redirect: 'error', // never follow a redirect with the key
      signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`profile review: Groq answered HTTP ${res.status}`);
      return null;
    }
    const j = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const verdicts = parseVerdicts(j?.choices?.[0]?.message?.content ?? '', Object.keys(fields) as AiField[]);
    if (!verdicts) console.warn('profile review: Groq answer was malformed or inconclusive');
    return verdicts;
  } catch (e) {
    console.warn(`profile review: Groq call failed (${e instanceof Error ? e.name : 'error'})`); // name only: no URL, headers or key
    return null;
  }
}
