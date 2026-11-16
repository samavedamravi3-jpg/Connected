// The profile-write function's pure rules (supabase/functions/_shared/profileWriteCore.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aiFieldsToCheck, pickRow, withHeld } from '../../../supabase/functions/_shared/profileWriteCore';

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
