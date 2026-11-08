import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { openDoors } from '@/db/schema';
import { HttpError, apiError, json, requireAccount } from '@/lib/mobile/server';

/** DELETE /api/v1/doors/:id -> end your Open Door now (kept in history as ended). */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    const { id } = await ctx.params;
    const [d] = await db.select().from(openDoors).where(eq(openDoors.id, id));
    if (!d || d.accountId !== accountId) throw new HttpError(404, 'Open Door not found.');
    const now = Date.now();
    await db.update(openDoors).set({ endedAt: now }).where(and(eq(openDoors.id, id), isNull(openDoors.endedAt)));
    return json({ ok: true, endedAt: d.endedAt ?? now });
  } catch (e) {
    return apiError(e);
  }
}
