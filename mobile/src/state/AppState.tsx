import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, AppState as RNAppState } from 'react-native';
import { ApiError, absolute, api, session, type ApiDoor, type ApiPerson } from '@/data/api';
import { DEMO_INCOMING } from '@/data/demo';
import { cachePeople, dataSource, setLiveData } from '@/data/source';
import type { ConnectionRequest, IncomingRequest, LatLng, Message, OpenDoor, Prefs, Profile, RequestStatus } from '@/data/types';
import { registerForPush, unregisterPush } from '@/lib/push';
import { prepareProfilePhoto } from '@/lib/photo';

const KEY = 'opendoor.state.v1';
const REPLY_DELAY_MS = 6000;
const INBOX_POLL_MS = 20_000;
const LOCATION_RENEW_MS = 45 * 60_000;

export type AppData = {
  onboarded: boolean;
  prefs: Prefs;
  profile: Profile;
  requests: ConnectionRequest[];
  messages: Record<string, Message[]>;
  incoming: IncomingRequest[];
  doors: OpenDoor[];
  savedEvents: string[];
  blocked: string[];
};

export const emptyPrefs: Prefs = {
  field: null, fromField: null, challenges: [], wantTraits: [], languages: ['English'], meetMode: 'either',
  interests: [], skills: [], goals: [], goalOther: '', travelMi: 5, mode: 'seeking', shareMode: 'public', discoverable: true, availability: ['week'],
};
const emptyProfile: Profile = { name: '', status: null, org: '', intro: '', offer: '', photoUri: null };

const fresh = (): AppData => ({
  onboarded: false, prefs: emptyPrefs, profile: emptyProfile, requests: [], messages: {}, incoming: DEMO_INCOMING, doors: [], savedEvents: [], blocked: [],
});
/** Live accounts start from server data only: no demo requests mixed in. */
const liveBlank = (d: AppData): AppData => ({ ...d, requests: [], messages: {}, incoming: [], doors: [], savedEvents: [], blocked: [] });

export const SAMPLE: Pick<AppData, 'prefs' | 'profile'> = {
  prefs: {
    field: 'finance', fromField: null, challenges: ['network', 'interviews', 'start'], wantTraits: ['firstgen', 'near'], languages: ['English', 'Spanish'], meetMode: 'either',
    interests: ['Fintech', 'Data & analytics', 'Investing'], skills: ['Excel', 'Spanish', 'Customer service'],
    goals: ['mentorship', 'advice', 'peers'], goalOther: '', travelMi: 5, mode: 'both', shareMode: 'public', discoverable: true, availability: ['week', 'evenings'],
  },
  profile: {
    name: 'Alex Rivera', status: 'student', org: 'UNC Charlotte', photoUri: null,
    intro: 'First-gen finance student, transferred from community college last year. Trying to break into banking without knowing anyone in it.',
    offer: 'Happy to help anyone navigating a community college transfer or job hunting in Spanish.',
  },
};

export type ReportReason = 'uncomfortable' | 'spam' | 'fake' | 'unsafe' | 'other';
type Account = { accountId: string; email: string };

type Ctx = AppData & {
  hydrated: boolean;
  now: number;
  /** Signed in to a real account (server data). False = demo / sample mode on this phone only. */
  live: boolean;
  account: Account | null;
  /** When live discovery ends (0 = not currently discoverable) and the neighborhood shown. */
  visibleUntil: number;
  areaName: string | null;
  /** Live data: display names for people you blocked (they no longer appear anywhere else). */
  blockedNames: Record<string, string>;
  setPrefs: (p: Partial<Prefs>) => void;
  setProfile: (p: Partial<Profile>) => void;
  finishOnboarding: () => Promise<void>;
  loadSample: () => void;
  sendRequest: (personId: string, message: string, doorId?: string) => void;
  cancelRequest: (id: string) => void;
  simulateReply: (id: string, status: Extract<RequestStatus, 'accepted' | 'declined'>) => void;
  sendMessage: (requestId: string, text: string) => void;
  respondIncoming: (id: string, state: IncomingRequest['state']) => void;
  saveDoor: (door: OpenDoor) => void;
  endDoor: (id: string) => void;
  toggleSavedEvent: (id: string) => void;
  block: (personId: string) => void;
  unblock: (personId: string) => void;
  report: (personId: string, reason: ReportReason) => void;
  reset: () => Promise<void>;
  // Accounts
  startSignIn: (email: string) => Promise<{ devCode?: string }>;
  verifySignIn: (email: string, code: string) => Promise<{ isNew: boolean; onboarded: boolean }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  setPhoto: (localUri: string | null) => Promise<void>;
  reportLocation: (coord: LatLng) => void;
  refresh: () => Promise<void>;
  syncChat: (requestId: string) => Promise<void>;
};

const AppContext = createContext<Ctx | null>(null);

type ApiConnection = {
  id: string; personId: string; direction: 'outgoing' | 'incoming'; status: RequestStatus; message: string; doorId: string | null;
  createdAt: number; updatedAt: number; person: ApiPerson | null; lastMessage: { text: string; at: number; fromMe: boolean } | null;
};
type MeResponse = { accountId: string; email: string; onboarded: boolean; prefs: Prefs | null; profile: Omit<Profile, 'photoUri'> | null; photo?: string; visibleUntil: number; areaName: string | null };

const showError = (e: unknown, title = 'That didn’t work') => Alert.alert(title, e instanceof Error ? e.message : 'Please try again.');
const serverPrefs = (p: Prefs) => p; // same shape; the server validates every field
const serverProfile = ({ photoUri: _omit, ...rest }: Profile) => rest;

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(fresh);
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [account, setAccount] = useState<Account | null>(null);
  const [visibleUntil, setVisibleUntil] = useState(0);
  const [areaName, setAreaName] = useState<string | null>(null);
  const [blockedNames, setBlockedNames] = useState<Record<string, string>>({});
  const live = !!account;
  const dataRef = useRef(data);
  const liveRef = useRef(live);
  const lastCoord = useRef<LatLng | null>(null);
  const lastLocationPost = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef<Ctx | null>(null);
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { liveRef.current = live; setLiveData(live); }, [live]);

  // ---------------------------------------------------------------- server sync (live mode)
  const loadConnections = useCallback(async () => {
    const { connections } = await api<{ connections: ApiConnection[] }>('GET', '/api/v1/connections');
    cachePeople(connections.map((c) => c.person).filter((p): p is ApiPerson => !!p));
    setData((d) => {
      const requests: ConnectionRequest[] = connections.map((c) => ({
        id: c.id, personId: c.personId, message: c.message, status: c.status, createdAt: c.createdAt, updatedAt: c.updatedAt,
        respondAt: Number.MAX_SAFE_INTEGER, direction: c.direction,
      }));
      const incoming: IncomingRequest[] = connections.filter((c) => c.direction === 'incoming' && c.status !== 'cancelled').map((c) => ({
        id: c.id, personId: c.personId, name: c.person?.name ?? 'Connected member', role: c.person?.role ?? '',
        status: c.person?.status ?? 'early', field: c.person?.field ?? 'tech', message: c.message, doorId: c.doorId ?? undefined,
        state: c.status === 'accepted' ? 'accepted' : c.status === 'declined' ? 'declined' : 'new',
      }));
      // Keep loaded threads; seed new ones with the request message so the inbox preview isn't empty.
      const messages = { ...d.messages };
      for (const c of connections) if (!messages[c.id]) messages[c.id] = [{ id: `req-${c.id}`, from: c.direction === 'outgoing' ? 'me' : 'them', text: c.message, at: c.createdAt }];
      return { ...d, requests, incoming, messages };
    });
  }, []);

  const loadAll = useCallback(async () => {
    const me = await api<MeResponse>('GET', '/api/v1/me');
    setAccount({ accountId: me.accountId, email: me.email });
    setVisibleUntil(me.visibleUntil);
    setAreaName(me.areaName);
    if (me.onboarded && me.prefs && me.profile) {
      setData((d) => ({ ...d, onboarded: true, prefs: { ...emptyPrefs, ...me.prefs }, profile: { ...emptyProfile, ...me.profile, photoUri: absolute(me.photo) ?? null } }));
    }
    const [blocks, doors, saved] = await Promise.all([
      api<{ blocked: { personId: string; name: string }[] }>('GET', '/api/v1/blocks'),
      api<{ doors: ApiDoor[] }>('GET', '/api/v1/doors'),
      api<{ eventIds: string[] }>('GET', '/api/v1/saved-events'),
    ]);
    setBlockedNames(Object.fromEntries(blocks.blocked.map((b) => [b.personId, b.name])));
    setData((d) => ({
      ...d,
      blocked: blocks.blocked.map((b) => b.personId),
      doors: doors.doors.map((x) => ({ ...x, venueId: x.venueId ?? '' })),
      savedEvents: saved.eventIds,
    }));
    await loadConnections();
    return me;
  }, [loadConnections]);

  const endLive = useCallback(async () => {
    await session.clear();
    setAccount(null);
    setVisibleUntil(0);
    setAreaName(null);
    setData(fresh());
  }, []);

  // ---------------------------------------------------------------- hydrate
  useEffect(() => {
    session.onUnauthorized(() => {
      void endLive();
      Alert.alert('Signed out', 'Your session ended. Please sign in again.');
    });
    (async () => {
      const token = await session.load();
      if (token) {
        try {
          await loadAll();
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 401)) showError(e, 'Couldn’t load your account');
        }
      } else {
        const raw = await AsyncStorage.getItem(KEY).catch(() => null);
        if (raw) {
          try {
            const saved = JSON.parse(raw) as Partial<AppData>;
            setData((d) => ({ ...d, ...saved, prefs: { ...emptyPrefs, ...saved.prefs }, profile: { ...emptyProfile, ...saved.profile } }));
          } catch { /* ignore corrupt local state */ }
        }
      }
      setHydrated(true);
    })();
    return () => session.onUnauthorized(null);
  }, [loadAll, endLive]);

  // Demo/sample state stays on the phone; live accounts keep nothing here but the keychain token.
  useEffect(() => {
    if (hydrated && !live) AsyncStorage.setItem(KEY, JSON.stringify(data)).catch(() => {});
  }, [data, hydrated, live]);

  // ---------------------------------------------------------------- clocks, polling, location renewal
  const resolveDemo = useCallback((id: string, forced: 'accepted' | 'declined' | undefined, at: number) => {
    setData((d) => {
      const r = d.requests.find((x) => x.id === id);
      if (!r || r.status !== 'requested') return d;
      const person = dataSource.getPerson(r.personId);
      const status = forced ?? (person?.demoResponse === 'decline' ? 'declined' : 'accepted');
      const msgs = d.messages[id] ?? [];
      const reply: Message | null =
        status === 'accepted'
          ? { id: `m${at}`, from: 'them', at, demo: true, text: `Thanks for reaching out! Happy to talk.${person?.door ? ' Come find me at my Open Door, or' : ''} Suggest a time that works and a public spot near you.` }
          : null;
      return {
        ...d,
        requests: d.requests.map((x) => (x.id === id ? { ...x, status, updatedAt: at } : x)),
        messages: reply ? { ...d.messages, [id]: [...msgs, reply] } : d.messages,
      };
    });
  }, []);

  const postLocation = useCallback(async (coord: LatLng) => {
    if (!liveRef.current || !dataRef.current.onboarded || !dataRef.current.prefs.discoverable) return;
    lastLocationPost.current = Date.now();
    try {
      const r = await api<{ visibleUntil: number; areaName: string | null }>('POST', '/api/v1/me/location', coord);
      setVisibleUntil(r.visibleUntil);
      setAreaName(r.areaName);
    } catch { /* retried on the next renewal */ }
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (!liveRef.current) {
        dataRef.current.requests.filter((r) => r.status === 'requested' && r.respondAt <= n).forEach((r) => resolveDemo(r.id, undefined, n));
      } else if (lastCoord.current && n - lastLocationPost.current > LOCATION_RENEW_MS) {
        void postLocation(lastCoord.current);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [resolveDemo, postLocation]);

  useEffect(() => {
    if (!live) return;
    const poll = setInterval(() => { if (RNAppState.currentState === 'active') loadConnections().catch(() => {}); }, INBOX_POLL_MS);
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      loadConnections().catch(() => {});
      if (lastCoord.current) void postLocation(lastCoord.current);
    });
    void registerForPush();
    return () => { clearInterval(poll); sub.remove(); };
  }, [live, loadConnections, postLocation]);

  // ---------------------------------------------------------------- profile saves (debounced in live mode)
  const saveMe = useCallback(async (onboarded: boolean) => {
    const d = dataRef.current;
    await api('PUT', '/api/v1/me', { prefs: serverPrefs(d.prefs), profile: serverProfile(d.profile), onboarded });
  }, []);
  const queueSave = useCallback(() => {
    if (!liveRef.current || !dataRef.current.onboarded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveMe(true).then(() => {
        // Turning discovery off clears the stored area right away on the server.
        if (!dataRef.current.prefs.discoverable) { setVisibleUntil(0); setAreaName(null); }
        else if (lastCoord.current) void postLocation(lastCoord.current);
      }).catch((e) => showError(e, 'Couldn’t save your changes'));
    }, 800);
  }, [saveMe, postLocation]);

  const setPrefs = useCallback((p: Partial<Prefs>) => { setData((d) => ({ ...d, prefs: { ...d.prefs, ...p } })); queueSave(); }, [queueSave]);
  const setProfile = useCallback((p: Partial<Profile>) => {
    setData((d) => ({ ...d, profile: { ...d.profile, ...p } }));
    if (!('photoUri' in p) || Object.keys(p).length > 1) queueSave();
  }, [queueSave]);

  // ---------------------------------------------------------------- optimistic helper
  const optimistic = useCallback(async (apply: (d: AppData) => AppData, request: () => Promise<unknown>, after?: () => Promise<unknown>) => {
    const before = dataRef.current;
    setData(apply);
    try {
      await request();
      if (after) await after();
    } catch (e) {
      setData(before);
      showError(e);
    }
  }, []);

  const value = useMemo<Ctx>(() => ({
    ...data,
    hydrated,
    now,
    live,
    account,
    visibleUntil,
    areaName,
    blockedNames,
    setPrefs,
    setProfile,

    finishOnboarding: async () => {
      if (!liveRef.current) { setData((d) => ({ ...d, onboarded: true })); return; }
      await saveMe(true);
      setData((d) => ({ ...d, onboarded: true }));
      const photo = dataRef.current.profile.photoUri;
      if (photo && !photo.startsWith('http')) {
        try {
          const { photo: url } = await api<{ photo: string }>('PUT', '/api/v1/me/photo', { base64: await prepareProfilePhoto(photo) });
          setData((d) => ({ ...d, profile: { ...d.profile, photoUri: absolute(url) ?? null } }));
        } catch (e) { showError(e, 'Your photo didn’t upload'); }
      }
      if (lastCoord.current) void postLocation(lastCoord.current);
    },
    loadSample: () => setData((d) => ({ ...d, ...SAMPLE, onboarded: true })),

    sendRequest: (personId, message, doorId) => {
      if (!liveRef.current) {
        const t = Date.now();
        const id = `r${t}`;
        setData((d) => ({
          ...d,
          requests: [...d.requests.filter((r) => !(r.personId === personId && r.status === 'cancelled')), { id, personId, message, status: 'requested', createdAt: t, updatedAt: t, respondAt: t + REPLY_DELAY_MS }],
          messages: { ...d.messages, [id]: [{ id: `m${t}`, from: 'me', text: message, at: t }] },
        }));
        return;
      }
      const t = Date.now(), temp = `pending-${t}`;
      void optimistic(
        (d) => ({ ...d, requests: [...d.requests, { id: temp, personId, message, status: 'requested', createdAt: t, updatedAt: t, respondAt: Number.MAX_SAFE_INTEGER, direction: 'outgoing' }] }),
        () => api('POST', '/api/v1/connections', { personId, message, ...(doorId ? { doorId } : {}) }),
        loadConnections,
      );
    },
    cancelRequest: (id) => {
      const apply = (d: AppData) => ({ ...d, requests: d.requests.map((r) => (r.id === id ? { ...r, status: 'cancelled' as const, updatedAt: Date.now() } : r)) });
      if (!liveRef.current) return setData(apply);
      void optimistic(apply, () => api('PATCH', `/api/v1/connections/${id}`, { status: 'cancelled' }));
    },
    simulateReply: (id, status) => { if (!liveRef.current) resolveDemo(id, status, Date.now()); },
    sendMessage: (requestId, text) => {
      const t = Date.now();
      const msg: Message = { id: `m${t}`, from: 'me', text, at: t };
      const apply = (d: AppData) => ({ ...d, messages: { ...d.messages, [requestId]: [...(d.messages[requestId] ?? []), msg] } });
      if (!liveRef.current) return setData(apply);
      void optimistic(apply, () => api('POST', `/api/v1/connections/${requestId}/messages`, { text }), () => valueRef.current!.syncChat(requestId));
    },
    respondIncoming: (id, state) => {
      const apply = (d: AppData) => ({ ...d, incoming: d.incoming.map((x) => (x.id === id ? { ...x, state } : x)) });
      if (!liveRef.current) return setData(apply);
      if (state === 'new') return; // a real reply can't be taken back
      void optimistic(apply, () => api('PATCH', `/api/v1/connections/${id}`, { status: state }), loadConnections);
    },
    saveDoor: (door) => {
      const apply = (d: AppData) => ({ ...d, doors: d.doors.some((x) => x.id === door.id) ? d.doors.map((x) => (x.id === door.id ? door : x)) : [...d.doors, door] });
      if (!liveRef.current) return setData(apply);
      const editing = dataRef.current.doors.some((x) => x.id === door.id && !x.endedAt);
      void optimistic(apply, async () => {
        // No in-place edits on the server: end the old offer, then post the updated one.
        if (editing) await api('DELETE', `/api/v1/doors/${door.id}`);
        const { door: saved } = await api<{ door: ApiDoor }>('POST', '/api/v1/doors', { venueId: door.venueId, start: door.start, end: door.end, lengthMin: door.lengthMin, topics: door.topics, audience: door.audience });
        setData((d) => ({ ...d, doors: d.doors.map((x) => (x.id === door.id ? { ...saved, venueId: saved.venueId ?? door.venueId } : x)) }));
      });
    },
    endDoor: (id) => {
      const apply = (d: AppData) => ({ ...d, doors: d.doors.map((x) => (x.id === id ? { ...x, endedAt: Date.now() } : x)) });
      if (!liveRef.current) return setData(apply);
      void optimistic(apply, () => api('DELETE', `/api/v1/doors/${id}`));
    },
    toggleSavedEvent: (id) => {
      const saved = !dataRef.current.savedEvents.includes(id);
      const apply = (d: AppData) => ({ ...d, savedEvents: saved ? [...d.savedEvents, id] : d.savedEvents.filter((x) => x !== id) });
      if (!liveRef.current) return setData(apply);
      void optimistic(apply, () => api('POST', '/api/v1/saved-events', { eventId: id, saved }));
    },
    block: (personId) => {
      const known = dataSource.getPerson(personId)?.name;
      if (known) setBlockedNames((m) => ({ ...m, [personId]: known }));
      const apply = (d: AppData) => ({
        ...d,
        blocked: d.blocked.includes(personId) ? d.blocked : [...d.blocked, personId],
        requests: d.requests.map((r) => (r.personId === personId && r.status === 'requested' ? { ...r, status: 'cancelled' as const, updatedAt: Date.now() } : r)),
      });
      if (!liveRef.current) return setData(apply);
      void optimistic(apply, () => api('POST', '/api/v1/blocks', { personId }), loadConnections);
    },
    unblock: (personId) => {
      const apply = (d: AppData) => ({ ...d, blocked: d.blocked.filter((x) => x !== personId) });
      if (!liveRef.current) return setData(apply);
      void optimistic(apply, () => api('DELETE', '/api/v1/blocks', { personId }));
    },
    report: (personId, reason) => {
      const known = dataSource.getPerson(personId)?.name;
      if (known) setBlockedNames((m) => ({ ...m, [personId]: known }));
      const apply = (d: AppData) => ({ ...d, blocked: d.blocked.includes(personId) ? d.blocked : [...d.blocked, personId] });
      if (!liveRef.current) return setData(apply);
      void optimistic(apply, () => api('POST', '/api/v1/reports', { personId, reason }), loadConnections);
    },
    reset: async () => {
      if (liveRef.current) return; // live accounts use Sign out / Delete account
      await AsyncStorage.removeItem(KEY).catch(() => {});
      setData(fresh());
    },

    startSignIn: (email) => api<{ devCode?: string }>('POST', '/api/v1/auth/start', { email }),
    verifySignIn: async (email, code) => {
      const r = await api<{ token: string; isNew: boolean; onboarded: boolean }>('POST', '/api/v1/auth/verify', { email, code });
      await session.save(r.token);
      const draft = dataRef.current;
      setData(liveBlank);
      const me = await loadAll();
      // New account mid-onboarding: keep the answers they just gave on this phone.
      if (!me.onboarded) setData((d) => ({ ...d, prefs: draft.prefs, profile: draft.profile, onboarded: false }));
      return { isNew: r.isNew, onboarded: me.onboarded };
    },
    signOut: async () => {
      await unregisterPush();
      await api('POST', '/api/v1/auth/logout').catch(() => {});
      await endLive();
    },
    deleteAccount: async () => {
      await unregisterPush();
      await api('DELETE', '/api/v1/me');
      await endLive();
    },
    setPhoto: async (localUri) => {
      if (!liveRef.current || !dataRef.current.onboarded) { setData((d) => ({ ...d, profile: { ...d.profile, photoUri: localUri } })); return; }
      if (!localUri) {
        await api('DELETE', '/api/v1/me/photo');
        setData((d) => ({ ...d, profile: { ...d.profile, photoUri: null } }));
        return;
      }
      const { photo } = await api<{ photo: string }>('PUT', '/api/v1/me/photo', { base64: await prepareProfilePhoto(localUri) });
      setData((d) => ({ ...d, profile: { ...d.profile, photoUri: absolute(photo) ?? null } }));
    },
    reportLocation: (coord) => {
      lastCoord.current = coord;
      if (Date.now() - lastLocationPost.current > 60_000) void postLocation(coord);
    },
    refresh: async () => { if (liveRef.current) await loadConnections(); },
    syncChat: async (requestId) => {
      if (!liveRef.current || requestId.startsWith('pending-')) return;
      const { messages } = await api<{ messages: Message[] }>('GET', `/api/v1/connections/${requestId}/messages`);
      setData((d) => ({ ...d, messages: { ...d.messages, [requestId]: messages } }));
    },
  }), [data, hydrated, now, live, account, visibleUntil, areaName, blockedNames, setPrefs, setProfile, saveMe, loadAll, loadConnections, endLive, postLocation, resolveDemo, optimistic]);

  useEffect(() => { valueRef.current = value; }, [value]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp must be used inside AppProvider');
  return c;
}

/** Latest request for a person (ignores cancelled ones so a new request can be sent). */
export function latestRequest(requests: ConnectionRequest[], personId: string) {
  return [...requests].reverse().find((r) => r.personId === personId && r.status !== 'cancelled');
}

/** Keep an open chat fresh: loads now, then every few seconds while the screen is open (live mode only). */
export function useChatSync(requestId: string | undefined, everyMs = 4000) {
  const { live, syncChat } = useApp();
  const sync = useRef(syncChat);
  useEffect(() => { sync.current = syncChat; }, [syncChat]);
  useEffect(() => {
    if (!live || !requestId) return;
    sync.current(requestId).catch(() => {});
    const t = setInterval(() => { if (RNAppState.currentState === 'active') sync.current(requestId).catch(() => {}); }, everyMs);
    return () => clearInterval(t);
  }, [live, requestId, everyMs]);
}
