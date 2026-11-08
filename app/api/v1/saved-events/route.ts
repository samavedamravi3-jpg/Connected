import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { savedEvents } from '@/db/schema';
import { apiError, body, json, requireAccount } from '@/lib/mobile/server';

/** GET /api/v1/saved-events -> event ids you saved. */
export async function GET(req: Request) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    const rows = await db.select().from(savedEvents).where(eq(savedEvents.accountId, accountId));
    return json({ eventIds: rows.map((r) => r.eventId) });
  } catch (e) {
    return apiError(e);
  }
}

/** POST /api/v1/saved-events {eventId, saved} -> save or unsave. */
export async function POST(req: Request) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    const { eventId, saved } = await body(req, z.object({ eventId: z.string().min(1).max(100), saved: z.boolean() }));
    if (saved) await db.insert(savedEvents).values({ id: `${accountId}:${eventId}`, accountId, eventId }).onConflictDoNothing();
    else await db.delete(savedEvents).where(and(eq(savedEvents.accountId, accountId), eq(savedEvents.eventId, eventId)));
    return json({ ok: true, saved });
  } catch (e) {
    return apiError(e);
  }
}
