import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultFilters, withinRange } from '../filters';
import { distanceMi } from '../geo';
import type { NearbyPerson } from '@/data/types';

const person = (id: string, latitude: number, staleDistance: number) =>
  ({ id, coord: { latitude, longitude: -80.84 }, distanceMi: staleDistance, field: 'tech', interests: [], offers: [], availability: [] }) as unknown as NearbyPerson;

test('"Within 5 mi" uses the origin the list displays, not a stale search-center distance', () => {
  const me = { latitude: 35.2, longitude: -80.84 }; // user's live position
  const near = person('near', 35.22, 99); // ~1.4 mi from me, stale value says 99
  const far = person('far', 35.42, 1); // ~15 mi from me, stale value says 1 (was 1 mi from the search center)
  const out = withinRange([near, far], me, defaultFilters(5), []);
  assert.deepEqual(out.map((p) => p.id), ['near']);
  assert.ok(out.every((p) => p.distanceMi <= 5));
  assert.ok(distanceMi(me, far.coord) > 13);
});

test('blocked people are removed', () => {
  const me = { latitude: 35.2, longitude: -80.84 };
  assert.equal(withinRange([person('a', 35.21, 0)], me, defaultFilters(5), ['a']).length, 0);
});
