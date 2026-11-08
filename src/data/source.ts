/**
 * Data layer. Screens only talk to `dataSource`. To connect a real backend, implement
 * `DataSource` against your API and export it here instead of `demoSource`.
 */
import { buildDemoEvents, buildDemoPeople } from './demo';
import { distanceMi } from '@/lib/geo';
import { CHALLENGES, FIELDS, FOODS } from './options';
import type { CommunityEvent, LatLng, NearbyPerson, Person } from './types';

export type SearchHit = { person: Person; score: number; matched: string[] };

export interface DataSource {
  /** People who opted in to nearby discovery, within `radiusMi` of `center`. */
  listNearbyPeople(center: LatLng, radiusMi: number): Promise<NearbyPerson[]>;
  /** Free-text search over opted-in people: name, role, company, field, skills, interests, languages, area, bio. */
  searchPeople(query: string): Promise<SearchHit[]>;
  /** Everyone opted in (used by the assistant to recommend people). */
  listPeople(): Promise<Person[]>;
  getPerson(id: string): Person | undefined;
  listEvents(): Promise<CommunityEvent[]>;
  getEvent(id: string): CommunityEvent | undefined;
  readonly isDemo: boolean;
}

const people = buildDemoPeople();
const events = buildDemoEvents();

/** Searchable text for each person, grouped by how much a hit there should count. */
function fieldsFor(p: Person): { label: string; text: string; weight: number }[] {
  return [
    { label: 'Name', text: p.name, weight: 6 },
    { label: 'Role', text: p.role, weight: 4 },
    { label: 'Company', text: p.org, weight: 3 },
    { label: 'Field', text: `${FIELDS.find((f) => f.id === p.field)?.label ?? ''} ${p.fieldPhrase}`, weight: 3 },
    { label: 'Skills', text: p.skills.join(' | '), weight: 3 },
    { label: 'Interests', text: p.interests.join(' | '), weight: 2 },
    { label: 'Helps with', text: `${p.helpsWith.join(' | ')} | ${p.helpTags.map((t) => CHALLENGES.find((c) => c.id === t)?.theyHelp ?? '').join(' | ')}`, weight: 2 },
    { label: 'Languages', text: p.languages.join(' | '), weight: 3 },
    { label: 'Area', text: p.areaName, weight: 3 },
    { label: 'Food', text: p.foods.map((f) => FOODS.find((x) => x.id === f)?.label ?? f).join(' | '), weight: 1 },
    { label: 'About', text: p.bio, weight: 1 },
  ];
}

function search(query: string): SearchHit[] {
  const terms = query.toLowerCase().split(/[\s,]+/).map((t) => t.trim()).filter((t) => t.length > 1);
  if (!terms.length) return [];
  const hits: SearchHit[] = [];
  for (const p of people) {
    let score = 0;
    const matched = new Set<string>();
    let allFound = true;
    for (const term of terms) {
      let found = false;
      for (const f of fieldsFor(p)) {
        const text = f.text.toLowerCase();
        const idx = text.indexOf(term);
        if (idx === -1) continue;
        found = true;
        const wordStart = idx === 0 || /[\s|,(-]/.test(text[idx - 1]);
        score += f.weight * (wordStart ? 1 : 0.4);
        matched.add(f.label);
      }
      if (!found) allFound = false;
    }
    if (score > 0 && allFound) hits.push({ person: p, score, matched: [...matched] });
  }
  return hits.sort((a, b) => b.score - a.score);
}

export const demoSource: DataSource = {
  isDemo: true,
  async listNearbyPeople(center, radiusMi) {
    return people
      .map((p) => ({ ...p, distanceMi: distanceMi(center, p.coord) }))
      .filter((p) => p.distanceMi <= radiusMi)
      .sort((a, b) => a.distanceMi - b.distanceMi);
  },
  async searchPeople(query) {
    return search(query);
  },
  async listPeople() {
    return people;
  },
  getPerson: (id) => people.find((p) => p.id === id),
  async listEvents() {
    return events.filter((e) => e.end > Date.now());
  },
  getEvent: (id) => events.find((e) => e.id === id),
};

export const dataSource: DataSource = demoSource;
