import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { memberBlocks, memberProfiles } from '@/db/schema';
import { HttpError, apiError, blockMember, body, json, parseMember, requireAccount } from '@/lib/mobile/server';

const target = z.object({ personId: z.string().min(3).max(64) });

/** GET /api/v1/blocks -> people you blocked (so you can unblock them in Profile). */
export async function GET(req: Request) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    const rows = await db.select().from(memberBlocks).where(eq(memberBlocks.accountId, accountId));
    const ids = rows.map((r) => r.blockedId);
    const profiles = ids.length ? await db.select().from(memberProfiles).where(inArray(memberProfiles.accountId, ids)) : [];
    return json({ blocked: ids.map((id) => ({ personId: id, name: (() => { const p = profiles.find((x) => x.accountId === id); return p ? parseMember(p).pub.name : 'Former member'; })() })) });
  } catch (e) {
    return apiError(e);
  }
}

/** POST /api/v1/blocks {personId} -> they disappear for you, you for them, and pending requests close. */
export async function POST(req: Request) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    const { personId } = await body(req, target);
    if (personId === accountId) throw new HttpError(400, 'You can’t block yourself.');
    await blockMember(db, accountId, personId);
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

/** DELETE /api/v1/blocks {personId} -> undo your own block (their block on you, if any, stays). */
export async function DELETE(req: Request) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    const { personId } = await body(req, target);
    await db.delete(memberBlocks).where(and(eq(memberBlocks.accountId, accountId), eq(memberBlocks.blockedId, personId)));
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
