// Pure privacy, blocking, preference and radius policy.
// Imports only zod (no framework, database or path aliases) so tests can load it directly.
import { z } from 'zod';

export type BlockRow = { userId: string; personId: string };
export type RequestRow = { id: string; sender: string; recipient: string; status: string };
export type RequestStatus = 'accepted' | 'declined' | 'cancelled';

/** Discovery is visible only while the one-hour window is open. */
export function isDiscoverable(visibleUntil: number, now = Date.now()) {
  return visibleUntil > now;
}

/** Remove the stored coarse location from a profile document once discovery has expired. */
export function scrubLocation<T extends Record<string, unknown>>(data: T): Omit<T, 'latitude' | 'longitude' | 'discovery'> & { latitude: null; longitude: null; discovery: false } {
  return { ...data, latitude: null, longitude: null, discovery: false };
}

/** IDs hidden from `userId` in either direction: people they blocked and people who blocked them. */
export function hiddenFor(blocks: BlockRow[], userId: string) {
  const hidden = new Set<string>();
  for (const b of blocks) {
    if (b.userId === userId) hidden.add(b.personId);
    else if (b.personId === userId) hidden.add(b.userId);
  }
  return hidden;
}

/** True when either person has blocked the other. */
export function isBlockedPair(blocks: BlockRow[], a: string, b: string) {
  return blocks.some(x => (x.userId === a && x.personId === b) || (x.userId === b && x.personId === a));
}

export function counterpart(r: Pick<RequestRow, 'sender' | 'recipient'>, userId: string) {
  return r.sender === userId ? r.recipient : r.sender;
}

/** Requests a user may see: their own, minus any with a blocked counterpart. */
export function visibleRequests<T extends RequestRow>(requests: T[], blocks: BlockRow[], userId: string) {
  const hidden = hiddenFor(blocks, userId);
  return requests.filter(r => (r.sender === userId || r.recipient === userId) && !hidden.has(counterpart(r, userId)));
}

/**
 * Who may move a request out of `pending`: only the sender may cancel; only the recipient may accept or decline.
 * Accepting is refused when either side has blocked the other. Declining or cancelling stays allowed so people can clean up.
 */
export function canTransition(r: RequestRow | undefined, userId: string, status: RequestStatus, blocks: BlockRow[]) {
  if (!r || r.status !== 'pending') return false;
  if (status === 'cancelled') return r.sender === userId;
  if (r.recipient !== userId) return false;
  if (status === 'accepted' && isBlockedPair(blocks, r.sender, r.recipient)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Location math. Kept local (and tested for parity with lib/network.ts) so this module has no app imports.

/** Same ~0.005° rounding as `coarseLocation` in lib/network.ts. */
export function coarse(lat: number, lng: number): [number, number] {
  return [Math.round(lat * 200) / 200, Math.round(lng * 200) / 200];
}

/** Haversine distance in km, identical to `distanceKm` in lib/network.ts. */
export function kmBetween(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// ---------------------------------------------------------------------------
// Profile preferences

/** Allowed "who can discover me" radii, in km (≈ 0.5, 1, 3, 5, 10 miles). */
export const VISIBILITY_KM = [0.8, 1.6, 4.8, 8, 16.1] as const;
export const DEFAULT_VISIBILITY_KM = 1.6;
export const MEETING_STYLES = ['Either', 'In person', 'Online'] as const;
export const EXPERIENCE_LEVELS = ['Student', 'Early career', 'Experienced'] as const;
export const AVAILABILITY = ['Now', 'This week', 'Flexible'] as const;
export const PHOTO_MAX_CHARS = 180_000;
export const SOCIAL_DOMAINS = { linkedin: 'linkedin.com', instagram: 'instagram.com', github: 'github.com' } as const;
export type SocialProvider = keyof typeof SOCIAL_DOMAINS;
export type Socials = Record<SocialProvider, string>;

export const preferenceDefaults = {
  visibilityKm: DEFAULT_VISIBILITY_KM,
  meetingStyle: 'Either' as (typeof MEETING_STYLES)[number],
  experience: 'Student' as (typeof EXPERIENCE_LEVELS)[number],
  availability: 'Flexible' as (typeof AVAILABILITY)[number],
  photoUrl: '',
  socials: { linkedin: '', instagram: '', github: '' } as Socials,
  onboardingVersion: 1,
};

export function isAllowedVisibilityKm(v: unknown): v is number {
  return typeof v === 'number' && (VISIBILITY_KM as readonly number[]).includes(v);
}

function httpsUrl(value: string) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname) return null;
    return u;
  } catch { return null; }
}

/** Empty, or an HTTPS URL on the provider's exact domain or one of its subdomains. */
export function isAllowedSocialUrl(provider: SocialProvider, value: string) {
  if (value === '') return true;
  if (value.length > 300) return false;
  const u = httpsUrl(value);
  if (!u) return false;
  const host = u.hostname.toLowerCase(), domain = SOCIAL_DOMAINS[provider];
  return host === domain || host.endsWith('.' + domain);
}

const DATA_IMAGE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Empty, an HTTPS URL (not an SVG), or a base64 JPEG/PNG/WebP data URL, at most 180,000 characters. */
export function isAllowedPhotoUrl(value: string) {
  if (value === '') return true;
  if (value.length > PHOTO_MAX_CHARS) return false;
  if (value.startsWith('data:')) return DATA_IMAGE.test(value);
  const u = httpsUrl(value);
  return !!u && !/\.svgz?$/i.test(u.pathname);
}

const socialField = (p: SocialProvider) => z.string().trim().max(300).default('').refine(v => isAllowedSocialUrl(p, v), `Use an https://${SOCIAL_DOMAINS[p]} link.`);

/** Server-side profile schema. New fields default, so older clients and stored profiles stay valid. */
export const profileSchema = z.object({
  name: z.string().trim().min(1).max(60),
  role: z.string().trim().min(1).max(80),
  company: z.string().trim().max(80),
  industry: z.enum(['Technology', 'Finance', 'Design', 'Entrepreneurship', 'Marketing']),
  goal: z.string().trim().min(5).max(500),
  help: z.array(z.string().max(60)).max(6),
  interests: z.array(z.string().max(60)).max(6),
  discovery: z.boolean(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  visibilityKm: z.number().default(DEFAULT_VISIBILITY_KM).refine(isAllowedVisibilityKm, 'Choose one of the listed discovery distances.'),
  meetingStyle: z.enum(MEETING_STYLES).default('Either'),
  experience: z.enum(EXPERIENCE_LEVELS).default('Student'),
  availability: z.enum(AVAILABILITY).default('Flexible'),
  photoUrl: z.string().trim().max(PHOTO_MAX_CHARS).default('').refine(isAllowedPhotoUrl, 'Use an https photo link or a JPEG, PNG or WebP image.'),
  socials: z.object({ linkedin: socialField('linkedin'), instagram: socialField('instagram'), github: socialField('github') }).default({}),
  onboardingVersion: z.number().int().min(1).max(100).default(1),
}).refine(p => !p.discovery || (p.latitude !== null && p.longitude !== null), 'Choose a location before turning on discovery.');
export type ServerProfile = z.infer<typeof profileSchema>;

/**
 * Merge defaults into a stored profile document and drop any stored preference value that no longer passes policy.
 * Use on every read so profiles saved before these fields existed (or with bad data) stay safe to return.
 */
export function withProfileDefaults<T extends Record<string, unknown>>(data: T) {
  const d = data as Record<string, unknown>;
  const pick = <V>(value: unknown, ok: (v: unknown) => boolean, fallback: V) => (ok(value) ? value as V : fallback);
  const str = (v: unknown): v is string => typeof v === 'string';
  const rawSocials = (d.socials && typeof d.socials === 'object' ? d.socials : {}) as Record<string, unknown>;
  const socials = Object.fromEntries((Object.keys(SOCIAL_DOMAINS) as SocialProvider[]).map(p => {
    const v = rawSocials[p];
    return [p, str(v) && isAllowedSocialUrl(p, v) ? v : ''];
  })) as Socials;
  return {
    ...data,
    visibilityKm: pick(d.visibilityKm, isAllowedVisibilityKm, preferenceDefaults.visibilityKm),
    meetingStyle: pick(d.meetingStyle, v => (MEETING_STYLES as readonly unknown[]).includes(v), preferenceDefaults.meetingStyle),
    experience: pick(d.experience, v => (EXPERIENCE_LEVELS as readonly unknown[]).includes(v), preferenceDefaults.experience),
    availability: pick(d.availability, v => (AVAILABILITY as readonly unknown[]).includes(v), preferenceDefaults.availability),
    photoUrl: pick(d.photoUrl, v => str(v) && isAllowedPhotoUrl(v), ''),
    socials,
    onboardingVersion: pick(d.onboardingVersion, v => Number.isInteger(v) && (v as number) >= 1, preferenceDefaults.onboardingVersion),
  };
}

// ---------------------------------------------------------------------------
// Search area and discovery radius
//
// The search center comes from the client. It bounds which area a search covers; it is NOT proof that the
// searcher is physically there. The radius check stops casual wide-area browsing, not a determined spoofer.

/** Parse a client-supplied search center and round it to the same coarse grid as stored profiles. Null if invalid. */
export function parseSearchCenter(latitude: unknown, longitude: unknown): [number, number] | null {
  const toNum = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  const lat = toNum(latitude), lng = toNum(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return coarse(lat, lng);
}

/** True when the search center lies inside the target's chosen visibility radius (default 1.6 km). */
export function withinVisibility(center: [number, number], target: { lat: number | null; lng: number | null; visibilityKm?: unknown }) {
  if (target.lat === null || target.lng === null) return false;
  const radius = isAllowedVisibilityKm(target.visibilityKm) ? target.visibilityKm : DEFAULT_VISIBILITY_KM;
  return kmBetween(center, [target.lat, target.lng]) <= radius;
}

/**
 * Shared availability rule for discovery, new requests, icebreaker drafts and coaching.
 * Demo people are exempt from the radius (they are fictional); live people need a valid search center inside their radius.
 */
export function canReach(center: [number, number] | null, target: { sample: boolean; lat: number | null; lng: number | null; visibilityKm?: unknown }) {
  if (target.sample) return true;
  return center !== null && withinVisibility(center, target);
}
