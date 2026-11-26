/**
 * Data access for Nearby. Screens only call `postsSource`; a backend implementation can replace `mockSource`
 * without changing them. See docs/nearby-posts.md for what the server must enforce.
 *
 * MOCK: demo posts are generated on the phone; your own posts are stored on this phone and nobody else sees them.
 */
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { buildDemoPosts } from '@/data/demoPosts';
import type { Area, LatLng } from '@/data/types';
import { isDiscoverable, type CloseReason, type Draft, type NearbyPost, type PostAuthor, type RadiusMi } from './model';
import { addMine, closeMine, deleteMine, getPosts } from './store';

export class OfflineError extends Error {
  constructor() {
    super('You’re offline.');
  }
}

export interface PostsSource {
  /** Posts this viewer may discover around their area. Never widens the area on its own. */
  list(viewer: { center: LatLng; radiusMi: number }, now: number): Promise<NearbyPost[]>;
  /** One post by id, or null when it was deleted or never existed. Expiry is decided by the caller. */
  get(id: string): Promise<NearbyPost | null>;
  publish(draft: Draft, author: PostAuthor, area: Area, onProgress: (p: number) => void): Promise<NearbyPost>;
  close(id: string, reason: CloseReason | null): Promise<void>;
  remove(id: string): Promise<void>;
}

const started = Date.now();
const demo = buildDemoPosts(started);

/** A quick reachability check so the feed can say "offline" instead of showing blank photos. */
async function online(): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    // Any HTTP answer means the network works; only a failed request means offline.
    await fetch('https://picsum.photos/id/4/8/8', { signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** Re-encodes the photo: strips EXIF (camera details and GPS), caps the size, keeps proportions. */
async function prepareImage(uri: string): Promise<{ uri: string; width: number; height: number }> {
  const src = await ImageManipulator.manipulate(uri).renderAsync();
  const width = Math.min(1600, src.width);
  const out = await ImageManipulator.manipulate(src).resize({ width }).renderAsync();
  try {
    const saved = await out.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
    const target = new File(Paths.document, `nearby-${Date.now()}.jpg`);
    await new File(saved.uri).copy(target, { overwrite: true });
    return { uri: target.uri, width: saved.width, height: saved.height };
  } finally {
    src.release();
    out.release();
  }
}

export const mockSource: PostsSource = {
  async list(viewer, now) {
    if (!(await online())) throw new OfflineError();
    const { mine, hidden } = getPosts();
    return [...mine, ...demo].filter((p) => !hidden.includes(p.id) && isDiscoverable(p, viewer, now)).sort((a, b) => b.createdAt - a.createdAt);
  },
  async get(id) {
    const p = getPosts().mine.find((x) => x.id === id) ?? demo.find((x) => x.id === id);
    return p && !p.deleted ? p : null;
  },
  async publish(draft, author, area, onProgress) {
    if (!draft.image) throw new Error('A photo is required.');
    onProgress(0.15);
    const img = await prepareImage(draft.image.uri);
    onProgress(0.7);
    const now = Date.now();
    const post: NearbyPost = {
      id: `mine-${now}`,
      author,
      image: { ...img, description: draft.image.description?.trim() || undefined },
      caption: draft.caption.trim(),
      intent: draft.intent,
      area,
      radiusMi: draft.radiusMi as RadiusMi,
      createdAt: now,
      expiresAt: now + draft.expiresH * 3_600_000,
      closed: null,
      isDemo: false,
    };
    addMine(post);
    onProgress(1);
    return post;
  },
  async close(id, reason) {
    closeMine(id, reason);
  },
  async remove(id) {
    deleteMine(id);
  },
};

export const postsSource: PostsSource = mockSource;
