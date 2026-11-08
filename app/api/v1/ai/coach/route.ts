import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { getDb } from '@/db';
import { COACH_REPLY_MAX, COACH_SYSTEM, buildCoachMessages, callClaude, coachContext, coachMessagesSchema, fallbackNote, plainClip, templateCoach } from '@/lib/ai';
import { senderForAi, targetForAi } from '@/lib/mobile/ai-context';
import { HttpError, apiError, body, json, parseMember, reachableMember, requireAccount, requireMember } from '@/lib/mobile/server';
import { consumeAiQuota } from '@/lib/server';

/** POST /api/v1/ai/coach {personId, messages} -> approach coaching for one person; labeled template guidance on failure. */
export async function POST(req: Request) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    const input = await body(req, z.object({ personId: z.string().min(3).max(64), messages: coachMessagesSchema }));
    const me = parseMember(await requireMember(db, accountId)).priv;
    const target = await reachableMember(db, accountId, input.personId);
    if (!target) throw new HttpError(404, 'This profile isn’t available.');
    const ctx = coachContext(senderForAi(me.profile, me.prefs), targetForAi(parseMember(target).pub));
    const template = (reason: Parameters<typeof fallbackNote>[0]) => json({ text: templateCoach(ctx).slice(0, COACH_REPLY_MAX), source: 'template', note: fallbackNote(reason) });
    if (!env.ANTHROPIC_API_KEY) return template('missing-key');
    if (!(await consumeAiQuota(db, accountId))) return template('quota');
    const result = await callClaude({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL, system: COACH_SYSTEM, maxTokens: 4000, messages: buildCoachMessages(ctx, input.messages) });
    if (!result.ok) return template(result.reason);
    return json({ text: plainClip(result.text, COACH_REPLY_MAX), source: 'claude' });
  } catch (e) {
    return apiError(e);
  }
}
