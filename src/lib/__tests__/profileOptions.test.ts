// The server's option allowlist (supabase/functions/_shared/profileOptions.ts) must match the app's catalog
// (src/data/options.ts, src/data/types.ts) and the database check constraints (migration 20261116175809 and schema.sql).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { AREAS, AVAILABILITY, CHALLENGES, DIETS, FIELDS, FOODS, GOALS, MEET_MODES, STATUSES, TRAITS } from '../../data/options';
import { ENUM_COLUMNS, ENUM_LISTS, AREA_NAMES } from '../../../supabase/functions/_shared/profileOptions';

const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort();
const sorted = (xs: readonly string[]) => [...xs].sort();

test('server allowlist = app catalog', () => {
  assert.deepEqual(sorted(ENUM_COLUMNS.field.ids), ids(FIELDS));
  assert.deepEqual(sorted(ENUM_COLUMNS.from_field.ids), ids(FIELDS));
  assert.deepEqual(sorted(ENUM_COLUMNS.status.ids), ids(STATUSES));
  assert.deepEqual(sorted(ENUM_COLUMNS.meet_mode.ids), ids(MEET_MODES));
  assert.deepEqual(sorted(ENUM_LISTS.goals), ids(GOALS));
  assert.deepEqual(sorted(ENUM_LISTS.challenges), ids(CHALLENGES));
  assert.deepEqual(sorted(ENUM_LISTS.want_traits), ids(TRAITS));
  assert.deepEqual(sorted(ENUM_LISTS.foods), ids(FOODS));
  assert.deepEqual(sorted(ENUM_LISTS.diet), ids(DIETS));
  assert.deepEqual(sorted(ENUM_LISTS.availability), ids(AVAILABILITY));
  // Mode and ShareMode are type-only in the app (src/data/types.ts).
  const types = readFileSync(join(__dirname, '..', '..', 'data', 'types.ts'), 'utf8');
  const union = (name: string) => sorted([...types.match(new RegExp(`export type ${name} = ([^;]+);`))![1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
  assert.deepEqual(sorted(ENUM_COLUMNS.mode.ids), union('Mode'));
  assert.deepEqual(sorted(ENUM_COLUMNS.share_mode.ids), union('ShareMode'));
  for (const a of AREAS) assert.ok(AREA_NAMES.includes(a.name), a.name);
});

for (const file of ['supabase/migrations/20261116175809_review_fixes.sql', 'supabase/schema.sql']) {
  test(`database check constraints = server allowlist: ${file}`, () => {
    const sql = readFileSync(join(__dirname, '..', '..', '..', file), 'utf8');
    const all: Record<string, readonly string[]> = { ...Object.fromEntries(Object.entries(ENUM_COLUMNS).map(([k, v]) => [k, v.ids])), ...ENUM_LISTS };
    for (const [col, want] of Object.entries(all)) {
      const line = sql.split('\n').find((l) => l.includes(`add constraint profiles_${col}_ok check`));
      assert.ok(line, `profiles_${col}_ok missing`);
      assert.deepEqual(sorted([...line.matchAll(/'([^']+)'/g)].map((m) => m[1])), sorted(want), col);
      assert.equal(line.includes(`${col} is null or`), !!ENUM_COLUMNS[col]?.nullable, `${col} nullability`);
    }
  });
}
