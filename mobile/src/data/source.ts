/**
 * Data layer. Screens only talk to `dataSource`. To connect a real backend, implement
 * `DataSource` against your API and export it here instead of `demoSource`.
 */
import { buildDemoEvents, buildDemoPeople } from './demo';
import { distanceMi } from '@/lib/geo';
import type { CommunityEvent, LatLng, NearbyPerson, Person } from './types';

export interface DataSource {
  /** People who opted in to nearby discovery, within `radiusMi` of `center`. */
  listNearbyPeople(center: LatLng, radiusMi: number): Promise<NearbyPerson[]>;
  getPerson(id: string): Person | undefined;
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
  async listEvents() {
    return events.filter((e) => e.end > Date.now());
  },
  getEvent: (id) => events.find((e) => e.id === id),
};

export const dataSource: DataSource = demoSource;
