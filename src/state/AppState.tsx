import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEMO_INCOMING } from '@/data/demo';
import { dataSource } from '@/data/source';
import type { ConnectionRequest, IncomingRequest, LatLng, Message, OpenDoor, Prefs, Profile, RequestStatus } from '@/data/types';

const KEY = 'opendoor.state.v1';
const REPLY_DELAY_MS = 6000;

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
  field: null, fromField: null, challenges: [], wantTraits: [], languages: ['English'], meetMode: 'either', foods: [], diet: [],
  interests: [], skills: [], goals: [], goalOther: '', travelMi: 5, mode: 'seeking', shareMode: 'public', discoverable: true, availability: ['week'],
};
const emptyProfile: Profile = { name: '', status: null, org: '', intro: '', offer: '', photoUri: null };

const fresh = (): AppData => ({
  onboarded: false, prefs: emptyPrefs, profile: emptyProfile, requests: [], messages: {}, incoming: DEMO_INCOMING, doors: [], savedEvents: [], blocked: [],
});

export const SAMPLE: Pick<AppData, 'prefs' | 'profile'> = {
  prefs: {
    field: 'finance', fromField: null, challenges: ['network', 'interviews', 'start'], wantTraits: ['firstgen', 'near'], languages: ['English', 'Spanish'], meetMode: 'either',
    foods: ['coffee', 'mediterranean', 'mexican'], diet: [],
    interests: ['Fintech', 'Data & analytics', 'Investing'], skills: ['Excel', 'Spanish', 'Customer service'],
    goals: ['mentorship', 'advice', 'peers'], goalOther: '', travelMi: 5, mode: 'both', shareMode: 'public', discoverable: true, availability: ['week', 'evenings'],
  },
  profile: {
    name: 'Alex Rivera', status: 'student', org: 'UNC Charlotte', photoUri: null,
    intro: 'First-gen finance student, transferred from community college last year. Trying to break into banking without knowing anyone in it.',
    offer: 'Happy to help anyone navigating a community college transfer or job hunting in Spanish.',
  },
};

/** Where you're looking from: your GPS position or the area you picked. Kept in memory only, never saved or shared. */
export type Here = { coord: LatLng; label: string; isGps: boolean };

type Ctx = AppData & {
  hydrated: boolean;
  now: number;
  here: Here | null;
  setHere: (h: Here) => void;
  setPrefs: (p: Partial<Prefs>) => void;
  setProfile: (p: Partial<Profile>) => void;
  finishOnboarding: () => void;
  loadSample: () => void;
  sendRequest: (personId: string, message: string) => void;
  cancelRequest: (id: string) => void;
  simulateReply: (id: string, status: Extract<RequestStatus, 'accepted' | 'declined'>) => void;
  sendMessage: (requestId: string, text: string) => void;
  respondIncoming: (id: string, state: IncomingRequest['state']) => void;
  saveDoor: (door: OpenDoor) => void;
  endDoor: (id: string) => void;
  toggleSavedEvent: (id: string) => void;
  block: (personId: string) => void;
  unblock: (personId: string) => void;
  reset: () => Promise<void>;
};

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(fresh);
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [here, setHere] = useState<Here | null>(null);
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as Partial<AppData>;
        setData((d) => ({ ...d, ...saved, prefs: { ...emptyPrefs, ...saved.prefs }, profile: { ...emptyProfile, ...saved.profile } }));
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (hydrated) AsyncStorage.setItem(KEY, JSON.stringify(data)).catch(() => {});
  }, [data, hydrated]);

  const resolve = useCallback((id: string, forced: 'accepted' | 'declined' | undefined, at: number) => {
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

  // Demo replies to pending requests, and a clock so Open Doors expire on screen.
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      const due = dataRef.current.requests.filter((r) => r.status === 'requested' && r.respondAt <= n);
      due.forEach((r) => resolve(r.id, undefined, n));
    }, 1000);
    return () => clearInterval(t);
  }, [resolve]);

  const setPrefs = useCallback((p: Partial<Prefs>) => setData((d) => ({ ...d, prefs: { ...d.prefs, ...p } })), []);
  const setProfile = useCallback((p: Partial<Profile>) => setData((d) => ({ ...d, profile: { ...d.profile, ...p } })), []);

  const value = useMemo<Ctx>(
    () => ({
      ...data,
      hydrated,
      now,
      here,
      setHere,
      setPrefs,
      setProfile,
      finishOnboarding: () => setData((d) => ({ ...d, onboarded: true })),
      loadSample: () => setData((d) => ({ ...d, ...SAMPLE, onboarded: true })),
      sendRequest: (personId, message) => {
        const t = Date.now();
        const id = `r${t}`;
        setData((d) => ({
          ...d,
          requests: [...d.requests.filter((r) => !(r.personId === personId && r.status === 'cancelled')), { id, personId, message, status: 'requested', createdAt: t, updatedAt: t, respondAt: t + REPLY_DELAY_MS }],
          messages: { ...d.messages, [id]: [{ id: `m${t}`, from: 'me', text: message, at: t }] },
        }));
      },
      cancelRequest: (id) => setData((d) => ({ ...d, requests: d.requests.map((r) => (r.id === id ? { ...r, status: 'cancelled', updatedAt: Date.now() } : r)) })),
      simulateReply: (id, status) => resolve(id, status, Date.now()),
      sendMessage: (requestId, text) => {
        const t = Date.now();
        setData((d) => ({ ...d, messages: { ...d.messages, [requestId]: [...(d.messages[requestId] ?? []), { id: `m${t}`, from: 'me', text, at: t }] } }));
      },
      respondIncoming: (id, state) => setData((d) => ({ ...d, incoming: d.incoming.map((x) => (x.id === id ? { ...x, state } : x)) })),
      saveDoor: (door) => setData((d) => ({ ...d, doors: d.doors.some((x) => x.id === door.id) ? d.doors.map((x) => (x.id === door.id ? door : x)) : [...d.doors, door] })),
      endDoor: (id) => setData((d) => ({ ...d, doors: d.doors.map((x) => (x.id === id ? { ...x, endedAt: Date.now() } : x)) })),
      toggleSavedEvent: (id) => setData((d) => ({ ...d, savedEvents: d.savedEvents.includes(id) ? d.savedEvents.filter((x) => x !== id) : [...d.savedEvents, id] })),
      block: (personId) =>
        setData((d) => ({
          ...d,
          blocked: d.blocked.includes(personId) ? d.blocked : [...d.blocked, personId],
          requests: d.requests.map((r) => (r.personId === personId && r.status === 'requested' ? { ...r, status: 'cancelled', updatedAt: Date.now() } : r)),
        })),
      unblock: (personId) => setData((d) => ({ ...d, blocked: d.blocked.filter((x) => x !== personId) })),
      reset: async () => {
        await AsyncStorage.removeItem(KEY).catch(() => {});
        setData(fresh());
      },
    }),
    [data, hydrated, now, here, setPrefs, setProfile, resolve],
  );

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
