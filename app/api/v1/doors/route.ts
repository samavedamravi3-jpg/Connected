import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { openDoors } from '@/db/schema';
import { MAX_ACTIVE_DOORS, doorInputSchema, doorIsActive, doorWindowError } from '@/lib/mobile/model';
import { HttpError, apiError, body, doorView, json, requireAccount, requireMember } from '@/lib/mobile/server';

/** GET /api/v1/doors -> your Open Doors, newest first. */
export async function GET(req: Request) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    const rows = await db.select().from(openDoors).where(eq(openDoors.accountId, accountId)).orderBy(desc(openDoors.createdAt)).limit(20);
    return json({ doors: rows.map((d) => doorView(d)) });
  } catch (e) {
    return apiError(e);
  }
}

/** POST /api/v1/doors {venueId, start, end, lengthMin, topics, audience} -> offer a short talk at a public venue. */
export async function POST(req: Request) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    await requireMember(db, accountId);
    const d = await body(req, doorInputSchema);
    const now = Date.now();
    const err = doorWindowError(d.start, d.end, now);
    if (err) throw new HttpError(400, err);
    const mine = await db.select().from(openDoors).where(eq(openDoors.accountId, accountId));
    if (mine.filter((x) => doorIsActive(x, now)).length >= MAX_ACTIVE_DOORS) throw new HttpError(409, `You can have up to ${MAX_ACTIVE_DOORS} Open Doors at a time. End one first.`);
    const row = { id: crypto.randomUUID(), accountId, venueId: d.venueId, startAt: d.start, endAt: d.end, lengthMin: d.lengthMin, topics: JSON.stringify(d.topics), audience: JSON.stringify(d.audience), endedAt: null, createdAt: now };
    await db.insert(openDoors).values(row);
    return json({ door: doorView(row) });
  } catch (e) {
    return apiError(e);
  }
}
