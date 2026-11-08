import { getDb } from '@/db';
import { isBlockedPair } from '@/lib/mobile/model';
import { HttpError, activeDoors, apiError, blocksBetween, getMember, haveConnection, json, personView, requireAccount, viewerOf } from '@/lib/mobile/server';

/** GET /api/v1/people/:id -> a profile you may see: discoverable now, hosting a door, or already in your inbox. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    const { id } = await ctx.params;
    const row = await getMember(db, id);
    const notFound = new HttpError(404, 'This profile isn’t available.');
    if (!row || !row.onboarded || id === accountId) throw notFound;
    if (isBlockedPair(await blocksBetween(db, accountId, id), accountId, id)) throw notFound;
    const now = Date.now();
    const door = (await activeDoors(db, [id], now)).get(id);
    if (!(row.visibleUntil > now) && !door && !(await haveConnection(db, accountId, id))) throw notFound;
    return json({ person: personView(row, viewerOf(await getMember(db, accountId)), door) });
  } catch (e) {
    return apiError(e);
  }
}
