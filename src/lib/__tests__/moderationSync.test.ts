// The generated SQL (schema.sql, the moderation migration, the parity block of supabase/tests/moderation.sql) must match
// supabase/functions/_shared/moderationRules.ts. If this fails: npx tsx scripts/gen-moderation-sql.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { splice, TARGETS } from '../../../scripts/gen-moderation-sql';

for (const t of TARGETS) {
  test(`generated moderation SQL is current: ${t.file}`, () => {
    const text = readFileSync(join(__dirname, '..', '..', '..', t.file), 'utf8');
    assert.equal(splice(text, t.start, t.end, t.build()), text);
  });
}
