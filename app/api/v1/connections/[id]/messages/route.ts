import { and, asc, eq, gt } from 'drizzle-orm';
import { getDb } from '@/db';
import { connections, messages } from '@/db/schema';
import { LIMITS, canMessage, isBlockedPair, messageInputSchema, otherParty } from '@/lib/mobile/model';
import { HttpError, apiError, blocksBetween, body, firstName, getMember, json, parseMember, pushTo, rateLimit, requireAccount } from '@/lib/mobile/server';

async function load(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const db = getDb();
  const { accountId } = await requireAccount(req, db);
  const { id } = await ctx.params;
  const [c] = await db.select().from(connections).where(eq(connections.id, id));
  if (!c || (c.senderId !== accountId && c.recipientId !== accountId)) throw new HttpError(404, 'Conversation not found.');
  const blocked = isBlockedPair(await blocksBetween(db, c.senderId, c.recipientId), c.senderId, c.recipientId);
  if (blocked) throw new HttpError(404, 'Conversation not found.');
  return { db, accountId, c };
}

/** GET /api/v1/connections/:id/messages?since=ms -> messages after `since` (both participants, unless blocked). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { db, accountId, c } = await load(req, ctx);
    const since = Number(new URL(req.url).searchParams.get('since')) || 0;
    const rows = await db.select().from(messages).where(and(eq(messages.connectionId, c.id), gt(messages.createdAt, since))).orderBy(asc(messages.createdAt)).limit(200);
    return json({
      status: c.status,
      messages: rows.map((m) => ({ id: m.id, from: m.senderId === accountId ? 'me' : 'them', text: m.text, at: m.createdAt })),
    });
  } catch (e) {
    return apiError(e);
  }
}

/** POST /api/v1/connections/:id/messages {text} -> only inside an accepted connection. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { db, accountId, c } = await load(req, ctx);
    if (!canMessage(c, accountId, false)) throw new HttpError(403, 'You can write here once your request is accepted.');
    const { text } = await body(req, messageInputSchema);
    const now = Date.now();
    await rateLimit(db, `messages:${accountId}`, LIMITS.messagesPerMinute, now);
    const m = { id: crypto.randomUUID(), connectionId: c.id, senderId: accountId, text, createdAt: now };
    await db.insert(messages).values(m);
    await db.update(connections).set({ updatedAt: now }).where(eq(connections.id, c.id));
    const me = await getMember(db, accountId);
    // Lock-screen text names the sender but never shows message content.
    await pushTo(db, otherParty(c, accountId), { title: 'New message', body: `${firstName(me ? parseMember(me).pub.name : 'Someone')} sent you a message.`, data: { type: 'message', connectionId: c.id } });
    return json({ message: { id: m.id, from: 'me', text, at: now } });
  } catch (e) {
    return apiError(e);
  }
}
