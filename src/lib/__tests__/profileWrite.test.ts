// The profile-write function's pure rules (supabase/functions/_shared/profileWriteCore.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aiFieldsToCheck, handleProfileWrite, moderationEndpoint, pickRow, reviewFields, withHeld, type LogRow, type WriteDeps } from '../../../supabase/functions/_shared/profileWriteCore';

test('only allowlisted columns survive: id, badges, hidden and unknown keys are dropped', () => {
  const { row, errors } = pickRow({ id: 'someone-else', first_name: 'Ana', hidden: false, verified: true, id_verified: true, updated_at: 'x', evil: 1, discoverable: true, area_lat: 35.2 });
  assert.deepEqual(row, { first_name: 'Ana', discoverable: true, area_lat: 35.2 });
  assert.deepEqual(errors, {});
  assert.deepEqual(pickRow(null).row, {});
  assert.deepEqual(pickRow(['x']).row, {});
});

test('types and rules are checked per column', () => {
  const { errors } = pickRow({ discoverable: 'yes', area_lat: 999, area_lng: Number.NaN, intro: 'DM me on Telegram', skills: 'Excel', first_name: 'Dick' });
  assert.deepEqual(errors, { discoverable: 'invalid', area_lat: 'invalid', area_lng: 'invalid', intro: 'scams', skills: 'invalid' });
  assert.deepEqual(pickRow({ area_lat: null, area_lng: null, status: null, area_name: null }).errors, {});
});

test('AI review: only changed, non-empty org/intro/offer; held text keeps the public value', () => {
  const current = { org: 'Acme', intro: 'Old bio', offer: '' };
  assert.deepEqual(aiFieldsToCheck({ org: 'Acme', intro: 'New bio', offer: '', first_name: 'Ana' }, current), ['intro']);
  assert.deepEqual(aiFieldsToCheck({ intro: 'x', offer: 'y', org: 'z' }, null), ['org', 'intro', 'offer']);
  assert.deepEqual(aiFieldsToCheck({ discoverable: false }, current), []);
  assert.deepEqual(withHeld({ intro: 'New bio', first_name: 'Ana' }, current, ['intro']), { intro: 'Old bio', first_name: 'Ana' });
  assert.deepEqual(withHeld({ offer: 'Help' }, null, ['offer']), { offer: '' });
});

test('option columns take only the app catalog ids', () => {
  const ok = pickRow({ status: 'student', field: 'tech', from_field: null, mode: 'both', meet_mode: 'video', share_mode: 'area', goals: ['mentorship'], foods: [], diet: ['halal'], availability: ['week'] });
  assert.deepEqual(ok.errors, {});
  const bad = pickRow({ status: 'CEO', field: 'crypto', mode: null, meet_mode: 'my place', share_mode: 'exact', goals: ['mentorship', 'dates'], challenges: 'network', want_traits: ['rich'], foods: ['steak'], diet: [1], availability: ['never'] });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['availability', 'challenges', 'diet', 'field', 'foods', 'goals', 'meet_mode', 'mode', 'share_mode', 'status', 'want_traits']);
  assert.ok(Object.values(bad.errors).every((e) => e === 'invalid'));
});

test('all chips together are capped', () => {
  const thirty = (p: string) => Array.from({ length: 30 }, (_, i) => `${p} ${i}`.padEnd(60, 'x'));
  assert.deepEqual(pickRow({ interests: thirty('Topic') }).errors, {});
  assert.deepEqual(pickRow({ interests: thirty('Topic'), skills: thirty('Skill') }).errors, { interests: 'too_long' });
});

test('AI review: area_name and new custom chips are reviewed; catalog and already-public chips are not', () => {
  const current = { area_name: 'NoDa', interests: ['Fintech', 'Bird watching'], skills: [], languages: ['English'] };
  assert.deepEqual(aiFieldsToCheck({ area_name: 'NoDa', interests: ['Fintech', 'bird  watching', 'AI'], languages: ['English', 'Spanish'] }, current), []);
  assert.deepEqual(aiFieldsToCheck({ area_name: 'Uptown' }, current), []);
  assert.deepEqual(aiFieldsToCheck({ area_name: 'this area' }, current), []);
  assert.deepEqual(aiFieldsToCheck({ area_name: 'Joe’s place, text me' }, current), ['area_name']);
  const row = { interests: ['Fintech', 'Crypto signals'], skills: ['Excel', 'Tarot', 'Lockpicking'], languages: ['Klingon'] };
  assert.deepEqual(aiFieldsToCheck(row, current), ['interests', 'skills', 'languages']);
  assert.deepEqual(reviewFields(row, current, ['interests', 'skills']), { interests: 'Crypto signals', skills: 'Tarot, Lockpicking' });
  // Held: text keeps the public value, lists drop only the new custom chips.
  assert.deepEqual(withHeld({ ...row, area_name: 'Somewhere' }, current, ['interests', 'skills', 'area_name']), { ...row, interests: ['Fintech'], skills: ['Excel'], area_name: 'NoDa' });
  assert.deepEqual(withHeld({ area_name: 'Somewhere' }, null, ['area_name']), { area_name: null });
});

test('MODERATION_URL must be https without credentials', () => {
  assert.equal(moderationEndpoint('https://mod.example.com/'), 'https://mod.example.com/moderate');
  assert.equal(moderationEndpoint('https://mod.example.com/api'), 'https://mod.example.com/api/moderate');
  for (const bad of [undefined, '', 'http://mod.example.com', 'ftp://mod.example.com', 'https://user:pw@mod.example.com', 'not a url', 'javascript:alert(1)']) {
    assert.equal(moderationEndpoint(bad), null, String(bad));
  }
});

// The request flow with fakes: what runs, and in which order.
function fakeDeps(over: Partial<WriteDeps> & { limits?: { write?: boolean | null; ai?: boolean | null }; current?: Record<string, unknown> | null } = {}) {
  const calls: string[] = [];
  const logged: LogRow[] = [];
  const deps: WriteDeps = {
    rate: async (kind) => {
      calls.push(`rate:${kind}`);
      return over.limits?.[kind] === undefined ? true : (over.limits[kind] as boolean | null);
    },
    readCurrent: async () => {
      calls.push('read');
      return { data: over.current ?? null, error: null };
    },
    review: async (fields) => {
      calls.push(`review:${Object.keys(fields).join(',')}`);
      return Object.keys(fields).map((f) => ({ field: f as never, decision: 'allow' as const, category: 'none' as const }));
    },
    upsert: async () => {
      calls.push('upsert');
      return { error: null };
    },
    saveDraft: async () => {
      calls.push('draft');
      return { error: null };
    },
    clearDraft: async () => {
      calls.push('clear');
    },
    log: async (rows) => {
      calls.push('log');
      logged.push(...rows);
    },
    ...over,
  };
  return { deps, calls, logged };
}
const body = (row: unknown) => async () => ({ row });

test('the write limit runs first for every request: over it, nothing else happens (no body, no log, no review)', async () => {
  const f = fakeDeps({ limits: { write: false } });
  let read = false;
  const res = await handleProfileWrite(f.deps, async () => ((read = true), { row: { intro: 'DM me on Telegram' } }));
  assert.equal(res.status, 429);
  assert.deepEqual(f.calls, ['rate:write']);
  assert.equal(read, false);
  assert.equal((await handleProfileWrite(fakeDeps({ limits: { write: null } }).deps, body({}))).status, 503);
});

test('rule and option rejections are counted by the write limit before they are logged', async () => {
  const f = fakeDeps();
  const res = await handleProfileWrite(f.deps, body({ intro: 'DM me on Telegram', mode: 'dating' }));
  assert.equal(res.status, 422);
  assert.deepEqual(f.calls, ['rate:write', 'log']);
  assert.deepEqual(f.logged.map((l) => l.field).sort(), ['intro', 'mode']);
  assert.equal((await handleProfileWrite(fakeDeps().deps, async () => { throw new SyntaxError('bad json'); })).status, 400);
});

test('the AI limit is taken only when something needs review, and before the review', async () => {
  const unchanged = fakeDeps({ current: { intro: 'Same bio' } });
  assert.equal((await handleProfileWrite(unchanged.deps, body({ intro: 'Same bio', discoverable: true }))).status, 200);
  assert.deepEqual(unchanged.calls, ['rate:write', 'read', 'upsert', 'clear', 'log']);

  // Over the AI cap: no review is spent; the new text is held privately and the rest (here: discovery off) still saves.
  const over = fakeDeps({ limits: { ai: false } });
  const res = await handleProfileWrite(over.deps, body({ intro: 'New bio', discoverable: false }));
  assert.equal(res.status, 202);
  assert.deepEqual(over.calls, ['rate:write', 'read', 'rate:ai', 'upsert', 'draft', 'log']);
  assert.deepEqual(over.logged, [{ field: 'intro', decision: 'held', reason: 'ai_limit' }]);

  const ok = fakeDeps();
  assert.equal((await handleProfileWrite(ok.deps, body({ intro: 'New bio', skills: ['Excel', 'Tarot'] }))).status, 200);
  assert.deepEqual(ok.calls, ['rate:write', 'read', 'rate:ai', 'review:intro,skills', 'upsert', 'clear', 'log']);
});

test('review unavailable: held text and new custom chips stay private, the rest is published', async () => {
  let written: Record<string, unknown> = {};
  let draft: Record<string, unknown> = {};
  const f = fakeDeps({
    current: { intro: 'Old bio', skills: ['Excel'] },
    review: async () => null,
    upsert: async (row) => ((written = row), { error: null }),
    saveDraft: async (fields) => ((draft = fields), { error: null }),
  });
  const res = await handleProfileWrite(f.deps, body({ intro: 'New bio', skills: ['Excel', 'Tarot'], first_name: 'Ana' }));
  assert.equal(res.status, 202);
  assert.deepEqual(res.body, { status: 'draft', held: ['intro', 'skills'] });
  assert.deepEqual(written, { intro: 'Old bio', skills: ['Excel'], first_name: 'Ana' });
  assert.deepEqual(draft, { intro: 'New bio', skills: ['Excel', 'Tarot'] });
});
