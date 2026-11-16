// Pure ID-verification rules shared by the `identity` and `identity-webhook` edge functions.
// No Deno or Node APIs (only Web Crypto), so node:test can import it: src/lib/__tests__/identityCore.test.ts.

/** What we store in id_verifications.status. Stripe's own statuses are mapped by statusFromStripe(). */
export type DbStatus = 'unverified' | 'started' | 'pending' | 'verified' | 'rejected' | 'canceled';

export type Row = { user_id: string; session_id: string; status: DbStatus; livemode: boolean; event_at: string | null; created_at: string };

export type Env = { secretKey?: string; webhookSecret?: string; liveEnabled?: string };

/** A session older than this is not resumed; a new one is created. Stripe re-issues the URL on retrieve, so this is our own cap. */
export const SESSION_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
export const SIGNATURE_TOLERANCE_S = 300;

/**
 * Is a provider configured, and in which mode? Test keys (sk_test_/rk_test_) work by default.
 * Live keys work only when IDENTITY_LIVE_ENABLED=true is set on the server (default off). No webhook secret = unavailable.
 */
export function providerMode(env: Env): { available: boolean; test: boolean; liveEnabled: boolean } {
  const key = env.secretKey ?? '';
  const liveEnabled = env.liveEnabled === 'true';
  const test = /^(sk|rk)_test_/.test(key);
  const live = /^(sk|rk)_live_/.test(key) && liveEnabled;
  return { available: !!env.webhookSecret && (test || live), test, liveEnabled };
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sameLen = (a: string, b: string) => a.length === b.length && [...a].reduce((d, c, i) => d | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

/**
 * Stripe-Signature: "t=<unix>,v1=<hex>[,v1=<hex>...][,other=...]". HMAC-SHA256 of "<t>.<raw body>" with the endpoint secret.
 * Accepts any matching v1 (several are sent while a secret is being rolled); rejects outside the timestamp tolerance.
 */
export async function verifyStripeSignature(raw: string, header: string | null, secret: string | undefined, nowS: number, toleranceS = SIGNATURE_TOLERANCE_S): Promise<boolean> {
  if (!header || !secret) return false;
  let t = '';
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    const k = part.slice(0, at).trim();
    const v = part.slice(at + 1).trim();
    if (k === 't') t = v;
    else if (k === 'v1') v1.push(v);
  }
  // Digits only, and the exact string Stripe sent is what gets signed (no Number() round-trip). abs() also rejects future t.
  if (!/^\d+$/.test(t) || !v1.length || Math.abs(nowS - Number(t)) > toleranceS) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${raw}`)));
  return v1.some((s) => sameLen(mac, s));
}

/** Stripe session status (+ last_error code) to ours. A fresh session is requires_input with no error: "started". */
export function statusFromStripe(status: string, lastErrorCode: string | null | undefined): DbStatus | null {
  if (status === 'requires_input') return lastErrorCode ? 'rejected' : 'started';
  if (status === 'processing') return 'pending';
  if (status === 'verified') return 'verified';
  if (status === 'canceled') return 'canceled';
  return null;
}

export type SessionEvent = { sessionId: string; userId: string; status: DbStatus; livemode: boolean; lastError: string | null; createdS: number };

const EVENT_TYPES = new Set([
  'identity.verification_session.verified',
  'identity.verification_session.requires_input',
  'identity.verification_session.processing',
  'identity.verification_session.canceled',
]);

/** Picks only the minimum fields out of an (already signature-checked) event. Null for anything we don't handle. */
export function parseSessionEvent(ev: unknown): SessionEvent | null {
  const e = ev as { type?: unknown; created?: unknown; livemode?: unknown; data?: { object?: Record<string, unknown> } } | null;
  if (!e || typeof e.type !== 'string' || !EVENT_TYPES.has(e.type)) return null;
  const o = e.data?.object;
  if (!o || o.object !== 'identity.verification_session' || typeof o.id !== 'string') return null;
  const userId = (o.metadata as { user_id?: unknown } | undefined)?.user_id;
  const code = (o.last_error as { code?: unknown } | null | undefined)?.code;
  const status = statusFromStripe(String(o.status ?? ''), typeof code === 'string' ? code : null);
  if (typeof userId !== 'string' || !userId || !status || typeof e.created !== 'number') return null;
  return { sessionId: o.id, userId, status, livemode: o.livemode === true && e.livemode === true, lastError: typeof code === 'string' ? code.slice(0, 64) : null, createdS: e.created };
}

// Same-second ties: a later stage wins (processing -> requires_input/verified; anything -> canceled).
const RANK: Record<DbStatus, number> = { unverified: 0, started: 0, pending: 1, rejected: 2, canceled: 3, verified: 4 };

export type Decision =
  | { apply: true; patch: { status: DbStatus; last_error: string | null; event_at: string }; grantBadge: boolean }
  | { apply: false; reason: 'unknown_session' | 'user_mismatch' | 'mode_mismatch' | 'live_disabled' | 'final' | 'stale' };

/**
 * Should this webhook event change the row? Idempotent and order-safe:
 * - the event must name the session we created for that user (row.session_id) and metadata.user_id must be that user;
 * - verified and canceled are final (no downgrade; duplicates are no-ops);
 * - older events never overwrite newer ones (event.created vs row.event_at);
 * - only a live-mode verification grants the public badge (profiles.id_verified). Test mode never does.
 */
export function decide(row: Row | null, ev: SessionEvent, liveEnabled: boolean): Decision {
  if (!row || row.session_id !== ev.sessionId) return { apply: false, reason: 'unknown_session' };
  if (row.user_id !== ev.userId) return { apply: false, reason: 'user_mismatch' };
  if (row.livemode !== ev.livemode) return { apply: false, reason: 'mode_mismatch' };
  if (ev.livemode && !liveEnabled) return { apply: false, reason: 'live_disabled' };
  if (row.status === 'verified' || row.status === 'canceled') return { apply: false, reason: 'final' };
  const prevS = row.event_at ? Math.floor(Date.parse(row.event_at) / 1000) : -1;
  if (ev.createdS < prevS || (ev.createdS === prevS && RANK[ev.status] <= RANK[row.status])) return { apply: false, reason: 'stale' };
  return {
    apply: true,
    patch: { status: ev.status, last_error: ev.status === 'rejected' ? ev.lastError : null, event_at: new Date(ev.createdS * 1000).toISOString() },
    grantBadge: ev.status === 'verified' && ev.livemode,
  };
}

/** Can we resume the user's stored session instead of creating a new one? (Stripe still has the final say on retrieve.) */
export function reusable(row: Row | null, wantLive: boolean, nowMs: number): boolean {
  if (!row || !row.session_id || row.livemode !== wantLive) return false;
  if (!['started', 'rejected', 'pending'].includes(row.status)) return false;
  return nowMs - Date.parse(row.created_at) < SESSION_MAX_AGE_MS;
}

/** What to do with a retrieved Stripe session for this user. */
export function resumeAction(s: { status?: string; url?: string | null; metadata?: { user_id?: string } } | null, userId: string): 'open' | 'processing' | 'new' {
  if (!s || s.metadata?.user_id !== userId) return 'new';
  if (s.status === 'requires_input' && typeof s.url === 'string' && s.url.startsWith('https://')) return 'open';
  if (s.status === 'processing' || s.status === 'verified') return 'processing'; // the webhook finalizes it
  return 'new';
}

/**
 * Stripe Idempotency-Key for creating a session. Concurrent taps see the same stored row, so they send the same key and
 * Stripe returns one session instead of two. A new key only appears after the stored session changes.
 */
export const createKey = (userId: string, row: Row | null) => `idv:${userId}:${row?.session_id || 'first'}`;
