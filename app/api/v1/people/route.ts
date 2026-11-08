import { and, gt, isNotNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { memberProfiles, openDoors } from '@/db/schema';
import { distanceMi, doorIsActive, hiddenFor, locationInputSchema } from '@/lib/mobile/model';
import { activeDoors, apiError, blocksFor, clearExpiredAreas, getMember, json, personView, requireAccount, viewerOf } from '@/lib/mobile/server';
import { inArray } from 'drizzle-orm';

/**
 * GET /api/v1/people?latitude=&longitude=&radiusMi= -> members currently discoverable (neighborhood shown for
 * one hour after they open the app) or hosting an Open Door you may see, within radiusMi (max 25) of the map
 * center. Blocks hide people in both directions. The center bounds the search; it is not stored.
 */
export async function GET(req: Request) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    const q = new URL(req.url).searchParams;
    const center = locationInputSchema.parse({ latitude: Number(q.get('latitude')), longitude: Number(q.get('longitude')) });
    const radiusMi = z.number().min(0.5).max(25).catch(5).parse(Number(q.get('radiusMi')));
    const now = Date.now();
    await clearExpiredAreas(db, now);
    const hidden = hiddenFor(await blocksFor(db, accountId), accountId);

    const visible = await db.select().from(memberProfiles).where(and(gt(memberProfiles.visibleUntil, now), isNotNull(memberProfiles.lat), ne(memberProfiles.accountId, accountId)));
    const doorRows = (await db.select().from(openDoors).where(gt(openDoors.endAt, now))).filter((d) => doorIsActive(d, now) && d.accountId !== accountId);
    const doorHostIds = [...new Set(doorRows.map((d) => d.accountId))].filter((id) => !visible.some((v) => v.accountId === id));
    const hosts = doorHostIds.length ? await db.select().from(memberProfiles).where(inArray(memberProfiles.accountId, doorHostIds)) : [];
    const rows = [...visible, ...hosts].filter((r) => r.onboarded && !hidden.has(r.accountId));

    const viewer = viewerOf(await getMember(db, accountId));
    const doors = await activeDoors(db, rows.map((r) => r.accountId), now);
    const people = rows
      .map((r) => personView(r, viewer, doors.get(r.accountId)))
      .filter((p): p is typeof p & { coord: NonNullable<typeof p.coord> } => p.coord !== null)
      .map((p) => ({ ...p, distanceMi: Math.round(distanceMi(center, p.coord) * 10) / 10 }))
      .filter((p) => p.distanceMi <= radiusMi)
      .sort((a, b) => a.distanceMi - b.distanceMi);
    return json({ people });
  } catch (e) {
    return apiError(e);
  }
}
