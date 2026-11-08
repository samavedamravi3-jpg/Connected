/**
 * Data layer. Screens only talk to `dataSource`. It serves the built-in demo data until someone signs in,
 * then real members and events from the Connected backend (`setLiveData(true)` from AppState).
 */
import { api, toEvent, toPerson, type ApiEvent, type ApiPerson } from './api';
import { buildDemoEvents, buildDemoPeople } from './demo';
import { distanceMi } from '@/lib/geo';
import type { CommunityEvent, LatLng, NearbyPerson, Person } from './types';

export interface DataSource {
  /** People who opted in to nearby discovery, within `radiusMi` of `center`. */
  listNearbyPeople(center: LatLng, radiusMi: number): Promise<NearbyPerson[]>;
  /** Synchronous lookup from what has been loaded so far (map, inbox, profile visits). */
  getPerson(id: string): Person | undefined;
  /** Load one person from the server into the cache (live mode); resolves undefined if unavailable. */
  fetchPerson(id: string): Promise<Person | undefined>;
  listEvents(): Promise<CommunityEvent[]>;
  getEvent(id: string): CommunityEvent | undefined;
  readonly isDemo: boolean;
}

const people = buildDemoPeople();
const events = buildDemoEvents();

export const demoSource: DataSource = {
  isDemo: true,
  async listNearbyPeople(center, radiusMi) {
    return people
      .map((p) => ({ ...p, distanceMi: distanceMi(center, p.coord) }))
      .filter((p) => p.distanceMi <= radiusMi)
      .sort((a, b) => a.distanceMi - b.distanceMi);
  },
  getPerson: (id) => people.find((p) => p.id === id),
  fetchPerson: async (id) => people.find((p) => p.id === id),
  async listEvents() {
    return events.filter((e) => e.end > Date.now());
  },
  getEvent: (id) => events.find((e) => e.id === id),
};

const personCache = new Map<string, Person>();
const eventCache = new Map<string, CommunityEvent>();

/** Remember people the server already sent (e.g. inside the connections list). */
export function cachePeople(list: ApiPerson[]) {
  for (const p of list) personCache.set(p.id, toPerson(p));
}

export const liveSource: DataSource = {
  isDemo: false,
  async listNearbyPeople(center, radiusMi) {
    const q = `latitude=${center.latitude}&longitude=${center.longitude}&radiusMi=${Math.min(25, radiusMi)}`;
    const { people: list } = await api<{ people: ApiPerson[] }>('GET', `/api/v1/people?${q}`);
    return list.map((p) => {
      const person = toPerson(p);
      personCache.set(p.id, person);
      return { ...person, distanceMi: p.distanceMi ?? distanceMi(center, person.coord) };
    });
  },
  getPerson: (id) => personCache.get(id),
  async fetchPerson(id) {
    try {
      const { person } = await api<{ person: ApiPerson }>('GET', `/api/v1/people/${encodeURIComponent(id)}`);
      const p = toPerson(person);
      personCache.set(id, p);
      return p;
    } catch {
      personCache.delete(id);
      return undefined;
    }
  },
  async listEvents() {
    const { events: list } = await api<{ events: ApiEvent[] }>('GET', '/api/v1/events');
    return list.map((e) => {
      const ev = toEvent(e);
      eventCache.set(ev.id, ev);
      return ev;
    });
  },
  getEvent: (id) => eventCache.get(id),
};

let current: DataSource = demoSource;
export function setLiveData(live: boolean) {
  current = live ? liveSource : demoSource;
  if (!live) { personCache.clear(); eventCache.clear(); }
}

/** Always delegates to the active source, so screens keep importing one stable object. */
export const dataSource: DataSource = {
  get isDemo() { return current.isDemo; },
  listNearbyPeople: (c, r) => current.listNearbyPeople(c, r),
  getPerson: (id) => current.getPerson(id),
  fetchPerson: (id) => current.fetchPerson(id),
  listEvents: () => current.listEvents(),
  getEvent: (id) => current.getEvent(id),
};
