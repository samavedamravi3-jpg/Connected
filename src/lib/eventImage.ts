/**
 * Event photo rules with no React Native imports (tested in __tests__/eventImage.test.ts). Only images the source API
 * itself returns are shown: Meetup's featured event photo and Devpost's listing thumbnail. Nothing is scraped or
 * invented; demo events and anything else get the category tile.
 */
import type { CommunityEvent } from '@/data/types';

/** Image hosts the two feeds use. Anything else (or plain http) falls back to the category tile. */
const HOSTS = [/^([a-z0-9-]+\.)*meetupstatic\.com$/, /^d112y698adiu2z\.cloudfront\.net$/, /^([a-z0-9-]+\.)*devpost\.com$/];

export function safeImageUrl(u: string | null | undefined): string | undefined {
  if (!u || u.length > 2048) return undefined;
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && !url.username && !url.password && HOSTS.some((h) => h.test(url.hostname)) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Meetup's own sized rendition (baseUrl + id + /WxH.webp, from the API's PhotoInfo) is about a quarter of the
 * highres file; 1080x608 covers the 16:9-ish card and the detail header at 3x.
 */
export function meetupPhotoUrl(p: { id?: string; baseUrl?: string; highResUrl?: string } | null | undefined): string | undefined {
  if (!p) return undefined;
  const sized = p.id && p.baseUrl && /^\d+$/.test(p.id) ? `${p.baseUrl.replace(/\/?$/, '/')}${p.id}/1080x608.webp` : undefined;
  return safeImageUrl(sized) ?? safeImageUrl(p.highResUrl);
}

/** The photo to try for an event, or undefined for the tile. Demo events never show a photo. */
export const eventImageUrl = (e: Pick<CommunityEvent, 'image' | 'isDemo'>) => (e.isDemo ? undefined : safeImageUrl(e.image));

/** Devpost thumbnails are square logos, so they sit whole on the tile; event photos fill the frame. */
export const eventImageFit = (e: Pick<CommunityEvent, 'source'>): 'cover' | 'contain' => (e.source === 'Devpost' ? 'contain' : 'cover');
