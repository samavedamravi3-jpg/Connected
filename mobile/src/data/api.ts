/**
 * Client for the Connected backend (/api/v1 on the Cloudflare Worker in the repo root).
 * The session token lives in the device keychain (expo-secure-store), never in AsyncStorage.
 */
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { FIELDS } from './options';
import type { CommunityEvent, OpenDoor, Person } from './types';

const TOKEN_KEY = 'connected.session.v1';

/**
 * Where the backend lives:
 * 1. EXPO_PUBLIC_API_URL (set it in mobile/.env.local, or for builds) — e.g. https://connected.example.workers.dev
 * 2. In development, the computer running `expo start` on port 5175 (so a phone on the same Wi-Fi reaches the
 *    local backend started with `npm run dev:lan` in the repo root).
 */
export function apiBase(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:5175` : 'http://localhost:5175';
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const session = {
  async load() {
    token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
    return token;
  },
  async save(t: string) {
    token = t;
    await SecureStore.setItemAsync(TOKEN_KEY, t, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  },
  async clear() {
    token = null;
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
  },
  get token() { return token; },
  /** Called when the server says the session is gone (expired, revoked or account deleted). */
  onUnauthorized(fn: (() => void) | null) { onUnauthorized = fn; },
};

export async function api<T = Record<string, unknown>>(method: string, path: string, body?: unknown, opts: { timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000);
  let res: Response;
  try {
    res = await fetch(apiBase() + path, {
      method,
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Can’t reach Connected right now. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401 && token) onUnauthorized?.();
  if (!res.ok) throw new ApiError(res.status, data.error || 'Something went wrong. Please try again.');
  return data;
}

/** Absolute URL for a server path such as /api/v1/photos/:id. */
export const absolute = (path?: string | null) => (path ? (path.startsWith('http') ? path : apiBase() + path) : undefined);

// ---------------------------------------------------------------------------
// Server shapes -> app types

export type ApiDoor = Omit<OpenDoor, 'venueId'> & { venueId: string | null };
export type ApiPerson = {
  id: string; name: string; status: Person['status'] | null; role: string; org: string; field: Person['field'] | null;
  interests: string[]; skills: string[]; languages: string[]; availability: Person['availability'];
  meets: Person['meets']; mode: 'seeking' | 'offering' | 'both'; offers: Person['offers']; lookingFor: Person['offers'];
  helpsWith: string[]; bio: string; traits: Person['traits']; areaName: string;
  coord: Person['coord'] | null; photo?: string; door?: ApiDoor; distanceMi?: number;
};

/** Turn a server person into the app's Person (fills display-only fields the server doesn't store). */
export function toPerson(p: ApiPerson): Person {
  const field = p.field ?? 'tech';
  const fieldName = FIELDS.find((f) => f.id === field)?.label.toLowerCase() ?? 'their field';
  const firstSentence = p.bio.split(/(?<=[.!?])\s/)[0] ?? '';
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    org: p.org || 'Independent',
    status: p.status ?? 'early',
    field,
    fieldPhrase: fieldName,
    interests: p.interests,
    skills: p.skills,
    helpsWith: p.helpsWith,
    offers: p.offers,
    availability: p.availability,
    areaName: p.areaName,
    coord: p.coord ?? { latitude: 35.2271, longitude: -80.8431 },
    meets: p.meets,
    hook: p.helpsWith[0] ? `Happy to help with ${p.helpsWith[0].charAt(0).toLowerCase()}${p.helpsWith[0].slice(1)}` : firstSentence,
    questions: [],
    bio: p.bio,
    traits: p.traits,
    helpTags: [],
    languages: p.languages,
    yearsExp: 0,
    photo: absolute(p.photo),
    door: p.door ? { ...p.door, venueId: p.door.venueId ?? '', venueHidden: p.door.venueId === null } : undefined,
    isDemo: false,
  };
}

export type ApiEvent = Omit<CommunityEvent, 'isDemo'> & { sourceUrl?: string; checkedAt?: string; isDemo: false };
export const toEvent = (e: ApiEvent): CommunityEvent => ({ ...e, isDemo: false });
