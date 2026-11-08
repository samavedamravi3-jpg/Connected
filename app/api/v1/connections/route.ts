import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { getDb } from '@/db';
import { connections, memberProfiles, messages } from '@/db/schema';
import { LIMITS, hiddenFor, isBlockedPair, otherParty, requestInputSchema } from '@/lib/mobile/model';
import {
  HttpError, activeDoors, apiError, blocksBetween, blocksFor, body, firstName, getMember, json, parseMember, personView,
  pushTo, rateLimit, requireAccount, requireMember, viewerOf,
} from '@/lib/mobile/server';

/** GET /api/v1/connections -> your requests (sent and received) with the other person and the latest message. */
export async function GET(req: Request) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    const hidden = hiddenFor(await blocksFor(db, accountId), accountId);
    const rows = (await db.select().from(connections)
      .where(or(eq(connections.senderId, accountId), eq(connections.recipientId, accountId)))
      .orderBy(desc(connections.updatedAt))).filter((c) => !hidden.has(otherParty(c, accountId)));
    const otherIds = [...new Set(rows.map((c) => otherParty(c, accountId)))];
    const people = otherIds.length ? await db.select().from(memberProfiles).where(inArray(memberProfiles.accountId, otherIds)) : [];
    const doors = await activeDoors(db, otherIds);
    const viewer = viewerOf(await getMember(db, accountId));
    const latest = new Map<string, typeof messages.$inferSelect>();
    if (rows.length) {
      for (const m of await db.select().from(messages).where(inArray(messages.connectionId, rows.map((c) => c.id))).orderBy(desc(messages.createdAt)))
        if (!latest.has(m.connectionId)) latest.set(m.connectionId, m);
    }
    return json({
      connections: rows.map((c) => {
        const other = people.find((p) => p.accountId === otherParty(c, accountId));
        const last = latest.get(c.id);
        return {
          id: c.id,
          personId: otherParty(c, accountId),
          direction: c.senderId === accountId ? 'outgoing' : 'incoming',
          status: c.status,
          message: c.message,
          doorId: c.doorId,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          person: other ? personView(other, viewer, doors.get(other.accountId)) : null,
          lastMessage: last ? { text: last.text, at: last.createdAt, fromMe: last.senderId === accountId } : null,
        };
      }),
    });
  } catch (e) {
    return apiError(e);
  }
}

/** POST /api/v1/connections {personId, message, doorId?} -> sends a request to someone you can currently reach. */
export async function POST(req: Request) {
  try {
    const db = getDb();
    const { accountId } = await requireAccount(req, db);
    const input = await body(req, requestInputSchema);
    const me = await requireMember(db, accountId);
    const unavailable = new HttpError(409, 'This person isn’t available right now.');
    if (input.personId === accountId) throw new HttpError(400, 'Choose someone else to connect with.');
    const target = await getMember(db, input.personId);
    if (!target || !target.onboarded) throw unavailable;
    if (isBlockedPair(await blocksBetween(db, accountId, input.personId), accountId, input.personId)) throw unavailable;

    const now = Date.now();
    const door = (await activeDoors(db, [input.personId], now)).get(input.personId);
    if (input.doorId && door?.id !== input.doorId) throw new HttpError(409, 'That Open Door has ended.');
    if (!(target.visibleUntil > now) && !door) throw unavailable;

    const existing = await db.select().from(connections).where(and(
      or(and(eq(connections.senderId, accountId), eq(connections.recipientId, input.personId)), and(eq(connections.senderId, input.personId), eq(connections.recipientId, accountId))),
      inArray(connections.status, ['requested', 'accepted']),
    ));
    if (existing.some((c) => c.status === 'accepted')) throw new HttpError(409, 'You’re already connected. Open your conversation in the Inbox.');
    if (existing.length) throw new HttpError(409, 'There’s already a pending request between you.');
    await rateLimit(db, `requests:${accountId}`, LIMITS.requestsPerDay, now);

    const id = crypto.randomUUID();
    const row = { id, senderId: accountId, recipientId: input.personId, message: input.message, status: 'requested', doorId: input.doorId ?? null, createdAt: now, updatedAt: now };
    await db.insert(connections).values(row);
    await db.insert(messages).values({ id: crypto.randomUUID(), connectionId: id, senderId: accountId, text: input.message, createdAt: now });
    await pushTo(db, input.personId, { title: 'New connection request', body: `${firstName(parseMember(me).pub.name)} would like a short conversation.`, data: { type: 'request', connectionId: id } });
    return json({ connection: { ...row, personId: input.personId, direction: 'outgoing' } });
  } catch (e) {
    return apiError(e);
  }
}
