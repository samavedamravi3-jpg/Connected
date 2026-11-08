import { getDb } from '@/db';
import { reports } from '@/db/schema';
import { LIMITS, reportInputSchema } from '@/lib/mobile/model';
import { HttpError, apiError, blockMember, body, json, rateLimit, requireAccount } from '@/lib/mobile/server';

/** POST /api/v1/reports {personId, reason, details} -> stored for review; reporting also blocks them. */
export async function POST(req: Request) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    const input = await body(req, reportInputSchema);
    if (input.personId === accountId) throw new HttpError(400, 'You can’t report yourself.');
    const now = Date.now();
    await rateLimit(db, `reports:${accountId}`, LIMITS.reportsPerDay, now);
    await db.insert(reports).values({ id: crypto.randomUUID(), reporterId: accountId, targetId: input.personId, reason: input.reason, details: input.details, createdAt: now });
    await blockMember(db, accountId, input.personId, now);
    return json({ ok: true, blocked: true });
  } catch (e) {
    return apiError(e);
  }
}
