import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { memberProfiles } from '@/db/schema';
import { DISCOVERY_MS, locationInputSchema, snapToArea } from '@/lib/mobile/model';
import { apiError, body, json, parseMember, requireAccount, requireMember } from '@/lib/mobile/server';

/**
 * POST /api/v1/me/location {latitude, longitude} -> if the member chose to be discoverable, store only the
 * neighborhood center for one hour (the app renews this while it is open). The raw position is never stored.
 */
export async function POST(req: Request) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    const pos = await body(req, locationInputSchema);
    const row = await requireMember(db, accountId);
    if (!parseMember(row).priv.prefs.discoverable) return json({ visible: false, visibleUntil: 0, areaName: null });
    const { areaName, coord } = snapToArea(pos);
    const visibleUntil = Date.now() + DISCOVERY_MS;
    await db.update(memberProfiles).set({ lat: coord.latitude, lng: coord.longitude, areaName, visibleUntil }).where(eq(memberProfiles.accountId, accountId));
    return json({ visible: true, visibleUntil, areaName });
  } catch (e) {
    return apiError(e);
  }
}

/** DELETE /api/v1/me/location -> hide now and forget the stored area. */
export async function DELETE(req: Request) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    await db.update(memberProfiles).set({ lat: null, lng: null, areaName: null, visibleUntil: 0 }).where(eq(memberProfiles.accountId, accountId));
    return json({ visible: false, visibleUntil: 0, areaName: null });
  } catch (e) {
    return apiError(e);
  }
}
