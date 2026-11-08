import { eq, or } from 'drizzle-orm';
import { getDb } from '@/db';
import { accounts, connections, loginCodes, memberBlocks, memberProfiles, messages, openDoors, photos, pushTokens, savedEvents, sessions } from '@/db/schema';
import { meInputSchema, toPublic } from '@/lib/mobile/model';
import { apiError, body, getMember, json, parseMember, photoUrl, requireAccount } from '@/lib/mobile/server';
import { inArray } from 'drizzle-orm';

/** GET /api/v1/me -> the signed-in member's own profile and private preferences. */
export async function GET(req: Request) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    const row = await getMember(db, accountId);
    const now = Date.now();
    return json({
      accountId,
      email: account?.email,
      onboarded: !!row?.onboarded,
      prefs: row ? parseMember(row).priv.prefs : null,
      profile: row ? parseMember(row).priv.profile : null,
      photo: photoUrl(row?.photoId ?? null),
      visibleUntil: row && row.visibleUntil > now ? row.visibleUntil : 0,
      areaName: row && row.visibleUntil > now ? row.areaName : null,
    });
  } catch (e) {
    return apiError(e);
  }
}

/** PUT /api/v1/me {prefs, profile, onboarded} -> saves both; others only ever see the public projection. */
export async function PUT(req: Request) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    const input = await body(req, meInputSchema);
    const now = Date.now();
    const existing = await getMember(db, accountId);
    const hide = !input.prefs.discoverable;
    const values = {
      accountId,
      publicData: JSON.stringify(toPublic(input.profile, input.prefs)),
      privateData: JSON.stringify({ prefs: input.prefs, profile: input.profile }),
      onboarded: input.onboarded || existing?.onboarded ? 1 : 0,
      updatedAt: now,
      // Turning discovery off clears the stored area immediately.
      ...(hide ? { lat: null, lng: null, areaName: null, visibleUntil: 0 } : {}),
    };
    await db.insert(memberProfiles).values(values).onConflictDoUpdate({ target: memberProfiles.accountId, set: values });
    return json({ ok: true, prefs: input.prefs, profile: input.profile, onboarded: values.onboarded === 1 });
  } catch (e) {
    return apiError(e);
  }
}

/**
 * DELETE /api/v1/me -> permanently deletes the account and everything tied to it (profile, photo, requests,
 * messages, blocks they made, doors, saved events, devices, sessions). Safety reports about others are kept.
 */
export async function DELETE(req: Request) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    const mine = await db.select({ id: connections.id }).from(connections).where(or(eq(connections.senderId, accountId), eq(connections.recipientId, accountId)));
    if (mine.length) await db.delete(messages).where(inArray(messages.connectionId, mine.map((c) => c.id)));
    await db.delete(connections).where(or(eq(connections.senderId, accountId), eq(connections.recipientId, accountId)));
    await db.delete(memberBlocks).where(eq(memberBlocks.accountId, accountId));
    await db.delete(openDoors).where(eq(openDoors.accountId, accountId));
    await db.delete(savedEvents).where(eq(savedEvents.accountId, accountId));
    await db.delete(photos).where(eq(photos.accountId, accountId));
    await db.delete(pushTokens).where(eq(pushTokens.accountId, accountId));
    await db.delete(memberProfiles).where(eq(memberProfiles.accountId, accountId));
    await db.delete(sessions).where(eq(sessions.accountId, accountId));
    if (account) await db.delete(loginCodes).where(eq(loginCodes.email, account.email));
    await db.delete(accounts).where(eq(accounts.id, accountId));
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
