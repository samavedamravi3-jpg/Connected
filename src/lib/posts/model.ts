/**
 * Nearby posts: short-lived, image-first posts seen by people around a broad neighborhood.
 * Pure types and rules only (no React Native), so they can be tested and shared with a backend.
 *
 * Privacy model: a post is pinned to an approximate AREA chosen when it is published (a neighborhood centre),
 * never to the author's position. Moving afterwards changes nothing. Real audience checks must run on the server;
 * these client rules only decide what this phone shows.
 */
import { AREAS } from '../../data/options';
import type { Area, LatLng } from '../../data/types';
import { distanceMi } from '../geo';

export type PostIntent = 'working' | 'help' | 'collab' | 'event' | 'sharing';
export type FeedFilter = 'all' | 'collaborate' | 'advice' | 'events';
export type RadiusMi = 1 | 3 | 5;
export type ExpiryHours = 2 | 6 | 24;
export type CloseReason = 'found' | 'sorted' | 'paused';
export type ResponseAction = 'interested' | 'help' | 'join' | 'reply';
/** What the viewer can see about a post right now. */
export type PostState = 'open' | 'closed' | 'expired' | 'deleted';

export const INTENTS: { id: PostIntent; label: string; filter: FeedFilter }[] = [
  { id: 'working', label: 'Working on', filter: 'collaborate' },
  { id: 'help', label: 'Looking for help', filter: 'advice' },
  { id: 'collab', label: 'Open to collaborate', filter: 'collaborate' },
  { id: 'event', label: 'Going to an event', filter: 'events' },
  { id: 'sharing', label: 'Just sharing', filter: 'advice' },
];
export const FILTERS: { id: FeedFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'collaborate', label: 'Collaborate' },
  { id: 'advice', label: 'Advice' },
  { id: 'events', label: 'Events' },
];
export const RADII: RadiusMi[] = [1, 3, 5];
export const EXPIRIES: ExpiryHours[] = [2, 6, 24];
export const CLOSE_LABEL: Record<CloseReason, string> = { found: 'Found someone', sorted: 'Sorted', paused: 'Not taking new responses' };
export const RESPONSE_LABEL: Record<ResponseAction, string> = { interested: 'I’m interested', help: 'I can help', join: 'Join me', reply: 'Reply' };

export type PostAuthor = { id: string; name: string; role: string; photo?: string | null; isDemo: boolean };
export type PostImage = { uri: string; width: number; height: number; description?: string };
/** A broad neighborhood, fixed at publication. Only its name is ever shown. */
export type PostArea = Area;

export type NearbyPost = {
  id: string;
  author: PostAuthor;
  image: PostImage;
  caption: string;
  intent: PostIntent | null;
  area: PostArea;
  radiusMi: RadiusMi;
  createdAt: number;
  expiresAt: number;
  closed: CloseReason | null;
  deleted?: boolean;
  /** Sample content for exploring the app, always labeled. */
  isDemo: boolean;
};

/** The viewer's relationship to a post's author, from existing connection-request rules. */
export type ViewerRelation = {
  isAuthor: boolean;
  /** An accepted connection exists: continue in chat. */
  connected: boolean;
  /** A request between you is waiting for a reply. */
  pending: boolean;
  blocked: boolean;
  signedIn: boolean;
};

export type Draft = {
  image: PostImage | null;
  caption: string;
  intent: PostIntent | null;
  expiresH: ExpiryHours;
  radiusMi: RadiusMi;
  areaId: string | null;
};
export const CAPTION_MAX = 280;
export const emptyDraft = (areaId: string | null = null): Draft => ({ image: null, caption: '', intent: null, expiresH: 6, radiusMi: 3, areaId });

export function postState(p: NearbyPost | null | undefined, now: number): PostState {
  if (!p || p.deleted) return 'deleted';
  if (now >= p.expiresAt) return 'expired';
  return p.closed ? 'closed' : 'open';
}

export function responseAction(intent: PostIntent | null): ResponseAction {
  switch (intent) {
    case 'help': return 'help';
    case 'event': return 'join';
    case 'working':
    case 'collab': return 'interested';
    default: return 'reply';
  }
}

/** Whether this viewer may start a conversation from the post, and why not. */
export function canRespond(p: NearbyPost | null, rel: ViewerRelation, now: number): { ok: true; via: 'chat' | 'request' } | { ok: false; reason: string } {
  const st = postState(p, now);
  if (st === 'deleted') return { ok: false, reason: 'This post is no longer available.' };
  if (st === 'expired') return { ok: false, reason: 'This post has expired.' };
  if (rel.isAuthor) return { ok: false, reason: 'This is your post.' };
  if (rel.blocked) return { ok: false, reason: 'You blocked this person.' };
  if (st === 'closed') return { ok: false, reason: `Closed · ${CLOSE_LABEL[p!.closed!]}` };
  if (!rel.signedIn && !p!.isDemo) return { ok: false, reason: 'Sign in to respond.' };
  if (rel.connected) return { ok: true, via: 'chat' };
  if (rel.pending) return { ok: false, reason: 'You already have a request open with them.' };
  return { ok: true, via: 'request' };
}

/**
 * Should this viewer discover the post? Both ranges must cover the distance between the two neighborhoods:
 * the author's audience radius and the viewer's chosen radius. Expired and deleted posts never show.
 * (The server must make the same check; a client filter alone is not privacy.)
 */
export function isDiscoverable(p: NearbyPost, viewer: { center: LatLng; radiusMi: number }, now: number): boolean {
  const st = postState(p, now);
  if (st === 'expired' || st === 'deleted') return false;
  const d = distanceMi(viewer.center, p.area.center);
  return d <= p.radiusMi && d <= viewer.radiusMi;
}

export function matchesFilter(p: NearbyPost, f: FeedFilter) {
  if (f === 'all') return true;
  return !!p.intent && INTENTS.find((i) => i.id === p.intent)!.filter === f;
}

export function validateDraft(d: Draft): { ok: true } | { ok: false; reason: string } {
  if (!d.image) return { ok: false, reason: 'Add a photo to post. Screenshots and sketches work too.' };
  if (!d.caption.trim()) return { ok: false, reason: 'Write a caption so people know what it’s about.' };
  if (d.caption.length > CAPTION_MAX) return { ok: false, reason: `Keep the caption under ${CAPTION_MAX} characters.` };
  if (!d.areaId) return { ok: false, reason: 'Choose a neighborhood for your post.' };
  return { ok: true };
}

export const draftHasContent = (d: Draft) => !!d.image || !!d.caption.trim();

export function timeLeft(p: NearbyPost, now: number): string {
  const ms = p.expiresAt - now;
  if (ms <= 0) return 'Expired';
  const h = Math.floor(ms / 3_600_000);
  if (h >= 1) return `${h}h left`;
  return `${Math.max(1, Math.round(ms / 60_000))}m left`;
}

export function ago(t: number, now: number): string {
  const m = Math.max(0, Math.round((now - t) / 60_000));
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

/** Natural proportions, clamped between 4:5 (tall) and 1.91:1 (wide), then capped at maxH. */
export function imageFrame(w: number, h: number, width: number, maxH: number): { width: number; height: number } {
  const ratio = Math.min(1.91, Math.max(0.8, w > 0 && h > 0 ? w / h : 1));
  return { width, height: Math.min(maxH, Math.round(width / ratio)) };
}

/** The broad neighborhood a position falls in (nearest neighborhood centre). Used only to pick an area. */
export function nearestArea(c: LatLng): Area {
  return AREAS.reduce((best, a) => (distanceMi(c, a.center) < distanceMi(c, best.center) ? a : best), AREAS[0]);
}

/**
 * Opt-in nearby-post alerts, quiet by default: at most one grouped alert per `gapMs`, only for posts with an
 * intent the person chose, never for their own posts or ones already alerted.
 */
export function alertDigest(posts: NearbyPost[], opts: { intents: PostIntent[]; lastAt: number; seen: string[]; myId: string | null; now: number; gapMs?: number }) {
  const gap = opts.gapMs ?? 6 * 3_600_000;
  if (!opts.intents.length || opts.now - opts.lastAt < gap) return null;
  const fresh = posts.filter((p) => p.intent && opts.intents.includes(p.intent) && p.author.id !== opts.myId && !opts.seen.includes(p.id) && postState(p, opts.now) === 'open');
  return fresh.length ? { count: fresh.length, ids: fresh.map((p) => p.id) } : null;
}
