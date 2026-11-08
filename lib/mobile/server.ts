// Request helpers for the mobile API (/api/v1/*): bearer sessions, errors, rate limits, email, blocks,
// push notifications and the person view. Every private read/write goes through requireAccount().
import { env } from 'cloudflare:workers';
import { and, eq, inArray, isNotNull, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import type { getDb } from '@/db';
import { connections, memberBlocks, memberProfiles, openDoors, pushTokens, rateLimits, sessions } from '@/db/schema';
import { hashToken } from './crypto';
import { VENUE_COORDS, canSeeDoor, doorIsActive, nextWindow, type BlockRow, type LatLng, type MemberPrefs, type MemberProfileFields, type PublicMember } from './model';

export type Db = ReturnType<typeof getDb>;

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) { super(message); }
}

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

/** Map any thrown error to a safe JSON response. Never echoes internals. */
export function apiError(e: unknown) {
  if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status);
  if (e instanceof z.ZodError) return json({ error: e.issues[0]?.message ?? 'Check your input.' }, 400);
  if (e instanceof SyntaxError) return json({ error: 'The request body must be JSON.' }, 400);
  console.error('Mobile API error', e instanceof Error ? e.message : 'unknown');
  return json({ error: 'Something went wrong. Please try again.' }, 500);
}

export async function body<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T>> {
  return schema.parse(await req.json());
}

/** Local or private-network request (dev server reached from this Mac or a phone on the same Wi-Fi). */
export function isLocalRequest(req: Request) {
  const host = new URL(req.url).hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' ||
    /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith('.local');
}

export const clientIp = (req: Request) => req.headers.get('cf-connecting-ip') || 'local';

/** Pepper for code hashes. Required when deployed; a fixed dev value is allowed only for local requests. */
export function authSecret(req: Request) {
  if (env.AUTH_SECRET && env.AUTH_SECRET.length >= 16) return env.AUTH_SECRET;
  if (isLocalRequest(req)) return 'connected-local-dev-only';
  throw new HttpError(503, 'Sign-in is not configured on this server yet.');
}

/** Resolve the bearer token to an account id, or 401. Refreshes last-seen at most every 5 minutes. */
export async function requireAccount(req: Request, db: Db, now = Date.now()) {
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(req.headers.get('authorization') ?? '');
  if (!m) throw new HttpError(401, 'Please sign in again.');
  const tokenHash = await hashToken(m[1]);
  const [s] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash));
  if (!s || s.expiresAt <= now) throw new HttpError(401, 'Your session expired. Please sign in again.');
  if (now - s.lastSeenAt > 5 * 60_000) await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.tokenHash, tokenHash));
  return { accountId: s.accountId, tokenHash };
}

/** Count one hit against a fixed-window limit; 429 when exhausted. */
export async function rateLimit(db: Db, key: string, limit: { max: number; windowMs: number }, now = Date.now()) {
  const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, key));
  const next = nextWindow(row, now, limit);
  if (!next.allowed) {
    const mins = Math.max(1, Math.ceil((next.retryAfterMs ?? 60_000) / 60_000));
    throw new HttpError(429, `Too many tries. Please wait about ${mins} minute${mins === 1 ? '' : 's'}.`);
  }
  await db.insert(rateLimits).values({ key, ...next.row }).onConflictDoUpdate({ target: rateLimits.key, set: next.row });
}

/** Send the sign-in code. Returns false when no email provider is configured (dev). */
export async function sendCodeEmail(email: string, code: string) {
  if (!env.RESEND_API_KEY) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.MAIL_FROM || 'Connected <onboarding@resend.dev>',
      to: [email],
      subject: `${code} is your Connected code`,
      text: `Your Connected sign-in code is ${code}.\n\nIt expires in 10 minutes. If you didn't ask for it, you can ignore this email.`,
    }),
  });
  if (!res.ok) {
    console.error('Email send failed', res.status);
    throw new HttpError(502, 'We couldn’t send the email. Please try again in a minute.');
  }
  return true;
}

// ---------------------------------------------------------------------------
// Blocks

export const blocksFor = (db: Db, me: string): Promise<BlockRow[]> =>
  db.select({ accountId: memberBlocks.accountId, blockedId: memberBlocks.blockedId }).from(memberBlocks)
    .where(or(eq(memberBlocks.accountId, me), eq(memberBlocks.blockedId, me)));

export const blocksBetween = (db: Db, a: string, b: string): Promise<BlockRow[]> =>
  db.select({ accountId: memberBlocks.accountId, blockedId: memberBlocks.blockedId }).from(memberBlocks)
    .where(or(and(eq(memberBlocks.accountId, a), eq(memberBlocks.blockedId, b)), and(eq(memberBlocks.accountId, b), eq(memberBlocks.blockedId, a))));

// ---------------------------------------------------------------------------
// Members

export type MemberRow = typeof memberProfiles.$inferSelect;
export type Stored = { pub: PublicMember; priv: { prefs: MemberPrefs; profile: MemberProfileFields } };
export const parseMember = (row: MemberRow): Stored => ({ pub: JSON.parse(row.publicData), priv: JSON.parse(row.privateData) });

export async function getMember(db: Db, id: string) {
  const [row] = await db.select().from(memberProfiles).where(eq(memberProfiles.accountId, id));
  return row;
}

export async function requireMember(db: Db, id: string) {
  const row = await getMember(db, id);
  if (!row || !row.onboarded) throw new HttpError(409, 'Finish your profile first.');
  return row;
}

export const photoUrl = (photoId: string | null) => (photoId ? `/api/v1/photos/${photoId}` : undefined);

type DoorRow = typeof openDoors.$inferSelect;
/** `venueId` is null when the viewer isn't in the host's chosen audience (the venue never leaves the server). */
export const doorView = (d: DoorRow, showVenue = true) => ({
  id: d.id, venueId: showVenue ? d.venueId : null, start: d.startAt, end: d.endAt, lengthMin: d.lengthMin,
  topics: JSON.parse(d.topics) as string[], audience: JSON.parse(d.audience) as string[], ...(d.endedAt ? { endedAt: d.endedAt } : {}),
});
export type Viewer = { status: string | null; field: string | null };
export const viewerOf = (row: MemberRow | undefined): Viewer =>
  row ? { status: parseMember(row).priv.profile.status, field: parseMember(row).priv.prefs.field } : { status: null, field: null };

/** Active doors for many accounts at once (the newest one per account is shown on the profile). */
export async function activeDoors(db: Db, ids: string[], now = Date.now()) {
  if (!ids.length) return new Map<string, DoorRow>();
  const rows = await db.select().from(openDoors).where(inArray(openDoors.accountId, ids));
  const map = new Map<string, DoorRow>();
  for (const d of rows.filter((r) => doorIsActive(r, now)).sort((a, b) => a.startAt - b.startAt)) if (!map.has(d.accountId)) map.set(d.accountId, d);
  return map;
}

/** The person object the app renders (mirrors mobile Person, minus demo-only fields). */
export function personView(row: MemberRow, viewer: Viewer, door?: DoorRow, distanceMi?: number) {
  const { pub } = parseMember(row);
  const showVenue = !!door && canSeeDoor(JSON.parse(door.audience), { field: pub.field }, viewer);
  const visible = row.lat != null && row.lng != null && row.visibleUntil > Date.now();
  // Map position: their neighborhood if discoverable, else the public venue of a door they may see.
  const venue = door && showVenue ? VENUE_COORDS[door.venueId as keyof typeof VENUE_COORDS] : undefined;
  const coord: LatLng | null = visible ? { latitude: row.lat!, longitude: row.lng! } : venue ? { latitude: venue.latitude, longitude: venue.longitude } : null;
  return {
    id: row.accountId,
    ...pub,
    areaName: visible ? row.areaName ?? 'Charlotte' : venue?.area ?? 'Charlotte',
    coord,
    photo: photoUrl(row.photoId),
    door: door ? doorView(door, showVenue) : undefined,
    ...(distanceMi != null ? { distanceMi: Math.round(distanceMi * 10) / 10 } : {}),
    isDemo: false as const,
  };
}

// ---------------------------------------------------------------------------
// Push notifications (Expo push service). Best effort: never throws, drops dead tokens.

export async function pushTo(db: Db, accountId: string, msg: { title: string; body: string; data?: Record<string, string> }) {
  try {
    const tokens = await db.select().from(pushTokens).where(eq(pushTokens.accountId, accountId));
    if (!tokens.length) return;
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.map((t) => ({ to: t.token, title: msg.title, body: msg.body, data: msg.data ?? {}, sound: 'default' }))),
    });
    if (!res.ok) return;
    const out = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
    const dead = (out.data ?? []).map((r, i) => (r.status === 'error' && r.details?.error === 'DeviceNotRegistered' ? tokens[i].token : null)).filter(Boolean) as string[];
    if (dead.length) await db.delete(pushTokens).where(inArray(pushTokens.token, dead));
  } catch {
    // Notifications are a convenience; the in-app inbox is the source of truth.
  }
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'Someone';

/** Forget neighborhoods whose one-hour discovery window has closed (lazy cleanup on reads; no cron). */
export async function clearExpiredAreas(db: Db, now = Date.now()) {
  await db.update(memberProfiles).set({ lat: null, lng: null, areaName: null })
    .where(and(lte(memberProfiles.visibleUntil, now), isNotNull(memberProfiles.lat)));
}

/** Whether `me` and `other` share any connection (any status) — lets the inbox show people after discovery ends. */
export async function haveConnection(db: Db, me: string, other: string) {
  const rows = await db.select({ id: connections.id }).from(connections).where(or(
    and(eq(connections.senderId, me), eq(connections.recipientId, other)),
    and(eq(connections.senderId, other), eq(connections.recipientId, me)),
  )).limit(1);
  return rows.length > 0;
}

/** Block `other` for `me` and close any pending request between them (theirs declined, mine cancelled). */
export async function blockMember(db: Db, me: string, other: string, now = Date.now()) {
  await db.insert(memberBlocks).values({ id: `${me}:${other}`, accountId: me, blockedId: other, createdAt: now }).onConflictDoNothing();
  await db.update(connections).set({ status: 'cancelled', updatedAt: now })
    .where(and(eq(connections.senderId, me), eq(connections.recipientId, other), eq(connections.status, 'requested')));
  await db.update(connections).set({ status: 'declined', updatedAt: now })
    .where(and(eq(connections.senderId, other), eq(connections.recipientId, me), eq(connections.status, 'requested')));
}

/** A member `me` may currently see and contact for AI help: not blocked; discoverable, hosting a door, or connected. */
export async function reachableMember(db: Db, me: string, id: string, now = Date.now()) {
  if (id === me) return null;
  const row = await getMember(db, id);
  if (!row || !row.onboarded) return null;
  const blocks = await blocksBetween(db, me, id);
  if (blocks.length) return null;
  const door = (await activeDoors(db, [id], now)).get(id);
  if (!(row.visibleUntil > now) && !door && !(await haveConnection(db, me, id))) return null;
  return row;
}
