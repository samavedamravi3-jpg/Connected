import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { connections } from '@/db/schema';
import { canChange, isBlockedPair } from '@/lib/mobile/model';
import { HttpError, apiError, blocksBetween, body, firstName, getMember, json, parseMember, pushTo, requireAccount } from '@/lib/mobile/server';

/** PATCH /api/v1/connections/:id {status} -> sender cancels; recipient accepts or declines (never across a block). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    const { id } = await ctx.params;
    const { status } = await body(req, z.object({ status: z.enum(['accepted', 'declined', 'cancelled']) }));
    const [c] = await db.select().from(connections).where(eq(connections.id, id));
    const blocked = c ? isBlockedPair(await blocksBetween(db, c.senderId, c.recipientId), c.senderId, c.recipientId) : false;
    if (!canChange(c, accountId, status, blocked)) throw new HttpError(403, 'You can’t change this request.');
    const now = Date.now();
    await db.update(connections).set({ status, updatedAt: now }).where(and(eq(connections.id, id), eq(connections.status, 'requested')));
    if (status === 'accepted') {
      const me = await getMember(db, accountId);
      await pushTo(db, c!.senderId, { title: 'Request accepted', body: `${firstName(me ? parseMember(me).pub.name : 'Someone')} accepted. Say hello and pick a public spot.`, data: { type: 'accepted', connectionId: id } });
    }
    return json({ ok: true, status, updatedAt: now });
  } catch (e) {
    return apiError(e);
  }
}
