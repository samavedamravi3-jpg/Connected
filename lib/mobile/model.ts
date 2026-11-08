// Pure rules for the mobile (Expo) API: option lists, validation, public/private projection, location
// snapping, request/door/photo rules and rate-limit math. Imports only zod so tests can load it directly.
// Option IDs mirror mobile/src/data/options.ts and types.ts; keep the two in sync.
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Options (allow-lists)

export const FIELD_IDS = ['finance', 'tech', 'health', 'energy', 'design', 'public', 'education'] as const;
export const GOAL_IDS = ['mentorship', 'advice', 'peers', 'collab', 'recruiting', 'other'] as const;
export const STATUS_IDS = ['student', 'early', 'experienced', 'changing', 'between'] as const;
export const AUDIENCE_IDS = ['anyone', 'students', 'early', 'changing', 'same-field'] as const;
export const AVAILABILITY_IDS = ['today', 'week', 'weekends', 'evenings'] as const;
export const MODES = ['seeking', 'offering', 'both'] as const;
export const SHARE_MODES = ['area', 'public'] as const;
export const MEET_MODES = ['inperson', 'video', 'either'] as const;
export const CHALLENGE_IDS = ['start', 'network', 'interviews', 'resume', 'credentials', 'switching', 'hiring', 'skills', 'team'] as const;
export const TRAIT_IDS = ['firstgen', 'immigrant', 'switcher', 'senior', 'near', 'hiring'] as const;
export const TRAVEL_MI = [1, 3, 5, 10, 25] as const;
export const LANGUAGES = ['English', 'Spanish', 'Mandarin', 'Hindi', 'Arabic', 'French', 'Vietnamese', 'Portuguese', 'Korean', 'Polish', 'Russian', 'Yoruba', 'Tagalog'] as const;
export const INTERESTS = ['Fintech', 'Data & analytics', 'AI', 'Cybersecurity', 'Product', 'UX research', 'Startups', 'Sustainability', 'Public health', 'Community work', 'Sales', 'Investing', 'Teaching', 'Writing', 'Hackathons', 'Open source'] as const;
export const SKILLS = ['Excel', 'SQL', 'Python', 'JavaScript', 'Figma', 'Project management', 'Public speaking', 'Customer service', 'Spanish', 'Research', 'Writing', 'Financial modeling', 'Clinical care', 'CAD', 'Marketing', 'Teaching'] as const;

export type LatLng = { latitude: number; longitude: number };
export const AREAS: { id: string; name: string; center: LatLng }[] = [
  { id: 'uptown', name: 'Uptown', center: { latitude: 35.2271, longitude: -80.8431 } },
  { id: 'southend', name: 'South End', center: { latitude: 35.212, longitude: -80.859 } },
  { id: 'noda', name: 'NoDa', center: { latitude: 35.2465, longitude: -80.804 } },
  { id: 'plazamidwood', name: 'Plaza Midwood', center: { latitude: 35.223, longitude: -80.803 } },
  { id: 'dilworth', name: 'Dilworth', center: { latitude: 35.205, longitude: -80.848 } },
  { id: 'university', name: 'University City', center: { latitude: 35.307, longitude: -80.733 } },
  { id: 'southpark', name: 'SouthPark', center: { latitude: 35.153, longitude: -80.827 } },
  { id: 'ballantyne', name: 'Ballantyne', center: { latitude: 35.053, longitude: -80.849 } },
];
export const VENUE_IDS = ['main-library', 'railtrail-cafe', 'noda-coffee', 'campus-library', 'food-hall', 'southpark-library'] as const;
/** Public, staffed venues (coordinates are of the public building, not of any person). */
export const VENUE_COORDS: Record<(typeof VENUE_IDS)[number], LatLng & { area: string }> = {
  'main-library': { latitude: 35.2273, longitude: -80.8395, area: 'Uptown' },
  'railtrail-cafe': { latitude: 35.2125, longitude: -80.8575, area: 'South End' },
  'noda-coffee': { latitude: 35.2468, longitude: -80.8035, area: 'NoDa' },
  'campus-library': { latitude: 35.3058, longitude: -80.7322, area: 'University City' },
  'food-hall': { latitude: 35.2445, longitude: -80.8352, area: 'Camp North End' },
  'southpark-library': { latitude: 35.152, longitude: -80.829, area: 'SouthPark' },
};

/**
 * Whether a viewer matches the audience a door host chose (mirrors canSeeDoor in mobile/src/lib/match.ts,
 * but enforced here so the exact venue never leaves the server for non-matching viewers).
 */
export function canSeeDoor(audience: string[], host: { field: string | null }, viewer: { status: string | null; field: string | null }) {
  return audience.some((a) =>
    a === 'anyone' ||
    (a === 'students' && viewer.status === 'student') ||
    (a === 'early' && viewer.status === 'early') ||
    (a === 'changing' && (viewer.status === 'changing' || viewer.status === 'between')) ||
    (a === 'same-field' && !!viewer.field && viewer.field === host.field));
}

const STATUS_ROLE: Record<(typeof STATUS_IDS)[number], string> = {
  student: 'Student', early: 'Early in their career', experienced: 'Experienced professional', changing: 'Changing careers', between: 'Between roles',
};

// ---------------------------------------------------------------------------
// Validation

const pick = <T extends readonly string[]>(values: T) => z.enum(values as unknown as [T[number], ...T[number][]]);
const uniqueList = <S extends z.ZodTypeAny>(item: S, max: number) => z.array(item).max(max).transform((xs) => [...new Set(xs)] as z.infer<S>[]);
const text = (max: number) => z.string().trim().max(max);

/** Normalize and validate an email address. */
export const emailSchema = z.string().trim().toLowerCase().max(254).email('Enter a valid email address.');

export const prefsSchema = z.object({
  field: pick(FIELD_IDS).nullable().default(null),
  fromField: pick(FIELD_IDS).nullable().default(null),
  challenges: uniqueList(pick(CHALLENGE_IDS), 3).default([]),
  wantTraits: uniqueList(pick(TRAIT_IDS), 6).default([]),
  languages: uniqueList(pick(LANGUAGES), 8).default(['English']),
  meetMode: pick(MEET_MODES).default('either'),
  interests: uniqueList(pick(INTERESTS), 10).default([]),
  skills: uniqueList(pick(SKILLS), 10).default([]),
  goals: uniqueList(pick(GOAL_IDS), 6).default([]),
  goalOther: text(80).default(''),
  travelMi: z.number().refine((v) => (TRAVEL_MI as readonly number[]).includes(v), 'Choose one of the listed travel distances.').default(5),
  mode: pick(MODES).default('seeking'),
  shareMode: pick(SHARE_MODES).default('area'),
  discoverable: z.boolean().default(true),
  availability: uniqueList(pick(AVAILABILITY_IDS), 4).default(['week']),
});
export type MemberPrefs = z.infer<typeof prefsSchema>;

export const profileFieldsSchema = z.object({
  name: text(60).min(1, 'Add your name.'),
  status: pick(STATUS_IDS).nullable().default(null),
  org: text(80).default(''),
  intro: text(300).default(''),
  offer: text(200).default(''),
});
export type MemberProfileFields = z.infer<typeof profileFieldsSchema>;

export const meInputSchema = z.object({
  prefs: prefsSchema,
  profile: profileFieldsSchema,
  onboarded: z.boolean().default(true),
});

export const locationInputSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const requestInputSchema = z.object({
  personId: z.string().min(3).max(64),
  message: text(600).min(10, 'Write a short message (at least 10 characters).'),
  doorId: z.string().max(64).optional(),
});

export const messageInputSchema = z.object({ text: text(1000).min(1, 'Write a message.') });

export const reportInputSchema = z.object({
  personId: z.string().min(3).max(64),
  reason: z.enum(['uncomfortable', 'spam', 'fake', 'unsafe', 'other']),
  details: text(500).default(''),
});

export const doorInputSchema = z.object({
  venueId: pick(VENUE_IDS),
  start: z.number().int(),
  end: z.number().int(),
  lengthMin: z.number().int().min(10).max(60),
  topics: uniqueList(text(40).min(1), 5).default([]),
  audience: uniqueList(pick(AUDIENCE_IDS), 5).refine((a) => a.length > 0, 'Choose who can see this.'),
});

export const pushTokenSchema = z.object({
  token: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,}\]$/, 'Not an Expo push token.'),
  platform: z.enum(['ios', 'android']),
});

// ---------------------------------------------------------------------------
// Public / private projection

export type PublicMember = {
  name: string; status: MemberProfileFields['status']; role: string; org: string; field: MemberPrefs['field'];
  interests: string[]; skills: string[]; languages: string[]; availability: string[];
  meets: 'public' | 'video' | 'both'; mode: MemberPrefs['mode']; offers: string[]; lookingFor: string[];
  helpsWith: string[]; bio: string; traits: string[];
};

/**
 * What other members may see. Challenges, wanted traits, travel distance, "something else" text and the
 * career-switch origin stay private; "offers" only exist for people who chose to give help.
 */
export function toPublic(profile: MemberProfileFields, prefs: MemberPrefs): PublicMember {
  const helper = prefs.mode !== 'seeking';
  const traits: string[] = [];
  if (profile.status === 'changing') traits.push('switcher');
  if (profile.status === 'experienced') traits.push('senior');
  return {
    name: profile.name,
    status: profile.status,
    role: profile.status ? STATUS_ROLE[profile.status] : 'Member',
    org: profile.org,
    field: prefs.field,
    interests: prefs.interests,
    skills: prefs.skills,
    languages: prefs.languages,
    availability: prefs.availability,
    meets: prefs.meetMode === 'inperson' ? 'public' : prefs.meetMode === 'video' ? 'video' : 'both',
    mode: prefs.mode,
    offers: helper ? prefs.goals.filter((g) => g !== 'other') : [],
    lookingFor: prefs.mode !== 'offering' ? prefs.goals.filter((g) => g !== 'other') : [],
    helpsWith: helper && profile.offer ? [profile.offer] : [],
    bio: profile.intro,
    traits,
  };
}

// ---------------------------------------------------------------------------
// Location

/** Great-circle distance in miles (same formula as mobile/src/lib/geo.ts). */
export function distanceMi(a: LatLng, b: LatLng) {
  const r = Math.PI / 180, R = 3958.8;
  const dLat = (b.latitude - a.latitude) * r, dLon = (b.longitude - a.longitude) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Snap a device position to a neighborhood center (within 4 mi), else to a ~2 km grid. Never stores the raw point. */
export function snapToArea(p: LatLng): { areaName: string; coord: LatLng } {
  let best: (typeof AREAS)[number] | null = null, bestMi = Infinity;
  for (const a of AREAS) {
    const d = distanceMi(p, a.center);
    if (d < bestMi) { best = a; bestMi = d; }
  }
  if (best && bestMi <= 4) return { areaName: best.name, coord: best.center };
  const grid = (v: number) => Math.round(v * 50) / 50;
  return { areaName: 'Nearby', coord: { latitude: grid(p.latitude), longitude: grid(p.longitude) } };
}

export const DISCOVERY_MS = 60 * 60 * 1000;
export const isVisible = (visibleUntil: number, now = Date.now()) => visibleUntil > now;

// ---------------------------------------------------------------------------
// Blocks and requests

export type BlockRow = { accountId: string; blockedId: string };
export function hiddenFor(blocks: BlockRow[], me: string) {
  const hidden = new Set<string>();
  for (const b of blocks) {
    if (b.accountId === me) hidden.add(b.blockedId);
    else if (b.blockedId === me) hidden.add(b.accountId);
  }
  return hidden;
}
export const isBlockedPair = (blocks: BlockRow[], a: string, b: string) =>
  blocks.some((x) => (x.accountId === a && x.blockedId === b) || (x.accountId === b && x.blockedId === a));

export type ConnectionRow = { id: string; senderId: string; recipientId: string; status: string };
export type ConnectionChange = 'accepted' | 'declined' | 'cancelled';
export const otherParty = (c: Pick<ConnectionRow, 'senderId' | 'recipientId'>, me: string) => (c.senderId === me ? c.recipientId : c.senderId);

/** Sender may cancel a pending request; recipient may accept or decline it. Never accept across a block. */
export function canChange(c: ConnectionRow | undefined, me: string, to: ConnectionChange, blocked: boolean) {
  if (!c || c.status !== 'requested') return false;
  if (to === 'cancelled') return c.senderId === me;
  if (c.recipientId !== me) return false;
  return !(to === 'accepted' && blocked);
}

/** Only the two people in an accepted, unblocked connection can read or write messages. */
export function canMessage(c: ConnectionRow | undefined, me: string, blocked: boolean) {
  return !!c && c.status === 'accepted' && (c.senderId === me || c.recipientId === me) && !blocked;
}

// ---------------------------------------------------------------------------
// Open Doors

export const DOOR_MAX_HOURS = 4;
export const DOOR_MAX_AHEAD_DAYS = 7;
export const MAX_ACTIVE_DOORS = 2;

/** Window must be in the future (or now), at most 4 hours long, and start within 7 days. */
export function doorWindowError(start: number, end: number, now = Date.now()) {
  if (end <= start) return 'The end time must be after the start.';
  if (end <= now) return 'Pick a time that hasn’t passed.';
  if (end - start > DOOR_MAX_HOURS * 3600_000) return `Keep it to ${DOOR_MAX_HOURS} hours or less.`;
  if (start - now > DOOR_MAX_AHEAD_DAYS * 86400_000) return `Pick a time within the next ${DOOR_MAX_AHEAD_DAYS} days.`;
  return null;
}
export const doorIsActive = (d: { endAt: number; endedAt: number | null }, now = Date.now()) => d.endedAt == null && d.endAt > now;

// ---------------------------------------------------------------------------
// Photos

export const PHOTO_MAX_BYTES = 300_000;
/** Validate a base64 photo by size and magic bytes (JPEG/PNG/WebP only; never SVG). Returns the mime or an error. */
export function checkPhoto(base64: string): { mime: string } | { error: string } {
  const clean = base64.replace(/^data:image\/[a-z]+;base64,/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return { error: 'That photo could not be read.' };
  const bytes = Math.floor((clean.length * 3) / 4) - (clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0);
  if (bytes > PHOTO_MAX_BYTES) return { error: 'That photo is too large. Try a smaller one.' };
  const head = atob(clean.slice(0, 24));
  const b = (i: number) => head.charCodeAt(i);
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { mime: 'image/jpeg' };
  if (b(0) === 0x89 && head.slice(1, 4) === 'PNG') return { mime: 'image/png' };
  if (head.slice(0, 4) === 'RIFF' && head.slice(8, 12) === 'WEBP') return { mime: 'image/webp' };
  return { error: 'Use a JPEG, PNG or WebP photo.' };
}

// ---------------------------------------------------------------------------
// Rate limits

export const LIMITS = {
  codeSendPerEmail: { max: 5, windowMs: 3600_000 },
  codeSendPerIp: { max: 20, windowMs: 3600_000 },
  codeVerifyPerIp: { max: 40, windowMs: 3600_000 },
  requestsPerDay: { max: 20, windowMs: 86400_000 },
  messagesPerMinute: { max: 20, windowMs: 60_000 },
  reportsPerDay: { max: 10, windowMs: 86400_000 },
  photoPerHour: { max: 10, windowMs: 3600_000 },
} as const;

/** Fixed-window counter: returns whether this hit is allowed and the row to store. */
export function nextWindow(row: { windowStart: number; count: number } | undefined, now: number, limit: { max: number; windowMs: number }) {
  if (!row || now - row.windowStart >= limit.windowMs) return { allowed: true, row: { windowStart: now, count: 1 } };
  if (row.count >= limit.max) return { allowed: false, row, retryAfterMs: row.windowStart + limit.windowMs - now };
  return { allowed: true, row: { windowStart: row.windowStart, count: row.count + 1 } };
}

// ---------------------------------------------------------------------------
// Sign-in codes

export const CODE_TTL_MS = 10 * 60_000;
export const CODE_MAX_ATTEMPTS = 5;
export const CODE_RESEND_MS = 30_000;
export const SESSION_TTL_MS = 30 * 86400_000;
