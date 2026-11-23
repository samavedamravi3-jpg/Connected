/**
 * Profile photo rules with no React Native imports, so node tests can check them (see __tests__/avatar.test.ts).
 * Photos live in the private `profile-photos` bucket as `<uid>/avatar.jpg` (512 px) and `<uid>/thumb.jpg` (128 px);
 * others read them through short-lived signed URLs that storage only signs for people allowed to read the owner's
 * profile row (supabase/migrations/20261123143230_profile_photos.sql). ID-verification images never come here.
 */
export const AVATAR_BUCKET = 'profile-photos';
export const FULL_PX = 512;
/** Map markers draw at most 46 pt, so 128 px stays sharp at 3x without loading the full photo. */
export const THUMB_PX = 128;
export const SIGN_TTL_S = 3600;
/** Reuse a signed URL until 10 minutes before it expires, so image caches keep hitting the same URL. */
const REUSE_MARGIN_MS = 10 * 60_000;
/** "No photo" (or not allowed) answers are re-asked after this long. */
export const MISS_TTL_MS = 10 * 60_000;

export const avatarPaths = (uid: string) => ({ full: `${uid}/avatar.jpg`, thumb: `${uid}/thumb.jpg` });

/** Centered square crop for any picture size. */
export function squareCrop(width: number, height: number) {
  const side = Math.min(width, height);
  return { originX: Math.floor((width - side) / 2), originY: Math.floor((height - side) / 2), width: side, height: side };
}

/** A signed URL (or a remembered miss: url null) and when it stops being usable, in epoch ms. */
export type Signed = { url: string | null; exp: number };

export const isFresh = (s: Signed | undefined, now: number) => !!s && now < s.exp;

/** One item of storage's createSignedUrls answer, turned into a cache entry. Only https URLs are kept. */
export function toSigned(item: { signedUrl?: string | null; error?: string | null }, now: number): Signed {
  const url = !item.error && item.signedUrl && item.signedUrl.startsWith('https://') ? item.signedUrl : null;
  return url ? { url, exp: now + SIGN_TTL_S * 1000 - REUSE_MARGIN_MS } : { url: null, exp: now + MISS_TTL_MS };
}

/** The photo fields for one person from the cache. Missing thumb means no marker photo (never the full image). */
export function photoFields(uid: string, cache: Map<string, Signed>): { photo?: string; photoThumb?: string } {
  const { full, thumb } = avatarPaths(uid);
  const photo = cache.get(full)?.url ?? undefined;
  const photoThumb = cache.get(thumb)?.url ?? undefined;
  return { ...(photo ? { photo } : {}), ...(photoThumb ? { photoThumb } : {}) };
}

/**
 * What to do with your own photo on the server. `synced` is what this phone last pushed (persisted). A new phone that
 * never pushed anything must not delete a photo another phone uploaded, so only a removal seen here deletes.
 */
export function photoSyncAction(synced: { userId: string; uri: string | null } | null | undefined, userId: string, uri: string | null): 'upload' | 'delete' | 'none' {
  const mine = synced?.userId === userId ? synced : null;
  if (uri) return mine?.uri === uri ? 'none' : 'upload';
  return mine?.uri ? 'delete' : 'none';
}

/**
 * react-native-maps snapshots custom markers (Android, Google Maps): keep tracking while the map is settling, and while
 * this marker's photo has neither loaded nor failed, then stop so panning stays smooth.
 */
export const markerTracks = (settling: boolean, uri: string | null | undefined, settledUri: string | null) => settling || (!!uri && settledUri !== uri);
