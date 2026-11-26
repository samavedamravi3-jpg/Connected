/**
 * Local state for Nearby: your own posts (demo mode), saved posts, responses you sent, viewing area, alert
 * preferences and the composer draft. Persisted with AsyncStorage on this phone only.
 * A backend replaces `mine` and the post lists; the rest stays per-device preference.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import type { CloseReason, Draft, NearbyPost, PostIntent, RadiusMi } from './model';

const KEY = 'connected.nearby.v1';

export type PostsLocal = {
  mine: NearbyPost[];
  /** Post ids you saved. Previews disappear once the post expires. */
  saved: string[];
  /** Posts you responded to → the author you contacted. */
  responded: Record<string, string>;
  /** Posts you reported or hid. */
  hidden: string[];
  /** Your manual viewing area (null = use location if allowed). */
  areaId: string | null;
  radiusMi: RadiusMi;
  alerts: { on: boolean; intents: PostIntent[]; lastAt: number; seen: string[] };
  /** Acceptances you have already looked at in Activity. */
  activitySeen: string[];
  draft: Draft | null;
};

let state: PostsLocal = {
  mine: [], saved: [], responded: {}, hidden: [], areaId: null, radiusMi: 3,
  alerts: { on: false, intents: [], lastAt: 0, seen: [] }, activitySeen: [], draft: null,
};
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
}
export function setPosts(update: (s: PostsLocal) => PostsLocal) {
  state = update(state);
  emit();
}
export const getPosts = () => state;

export async function loadPosts() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) state = { ...state, ...(JSON.parse(raw) as Partial<PostsLocal>) };
  } catch {
    /* start fresh */
  }
  listeners.forEach((l) => l());
}

export function usePostsLocal(): PostsLocal {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      void loadPosts();
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export const toggleSaved = (id: string) => setPosts((s) => ({ ...s, saved: s.saved.includes(id) ? s.saved.filter((x) => x !== id) : [...s.saved, id] }));
export const hidePost = (id: string) => setPosts((s) => ({ ...s, hidden: [...new Set([...s.hidden, id])] }));
export const markResponded = (postId: string, authorId: string) => setPosts((s) => ({ ...s, responded: { ...s.responded, [postId]: authorId } }));
export const setArea = (areaId: string | null) => setPosts((s) => ({ ...s, areaId }));
export const setRadius = (radiusMi: RadiusMi) => setPosts((s) => ({ ...s, radiusMi }));
export const setDraft = (draft: Draft | null) => setPosts((s) => ({ ...s, draft }));
export const setAlerts = (a: Partial<PostsLocal['alerts']>) => setPosts((s) => ({ ...s, alerts: { ...s.alerts, ...a } }));
export const markActivitySeen = (ids: string[]) => setPosts((s) => ({ ...s, activitySeen: [...new Set([...s.activitySeen, ...ids])] }));
export const closeMine = (id: string, closed: CloseReason | null) => setPosts((s) => ({ ...s, mine: s.mine.map((p) => (p.id === id ? { ...p, closed } : p)) }));
export const deleteMine = (id: string) => setPosts((s) => ({ ...s, mine: s.mine.map((p) => (p.id === id ? { ...p, deleted: true } : p)) }));
export const addMine = (p: NearbyPost) => setPosts((s) => ({ ...s, mine: [p, ...s.mine] }));
