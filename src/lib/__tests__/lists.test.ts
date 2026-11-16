import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanExperience, effectiveSkills } from '../experience';
import { cleanPrefLists, labelKey, uniqueLabels } from '../lists';
import type { Experience, Prefs } from '@/data/types';

const exp = (id: string, title: string, skills: string[]): Experience => ({ id, title, org: 'Acme', start: '2021-01', end: null, description: '', skills });

test('repeated Spanish collapses to one label, first spelling kept', () => {
  assert.deepEqual(uniqueLabels(['Spanish', 'spanish', ' SPANISH ', 'Spanish']), ['Spanish']);
});

test('trims, collapses inner whitespace and drops empties', () => {
  assert.deepEqual(uniqueLabels(['  Data   &  analytics ', 'data & analytics', '', '   ', 'Excel']), ['Data & analytics', 'Excel']);
});

test('NFKC-equivalent spellings are one label', () => {
  // Fullwidth letters and a decomposed accent normalise to the same key.
  assert.deepEqual(uniqueLabels(['Ｓｐａｎｉｓｈ', 'Spanish']), ['Ｓｐａｎｉｓｈ']);
  assert.deepEqual(uniqueLabels(['Français', 'Français']), ['Français']);
  assert.equal(labelKey(' Ｓｐａｎｉｓｈ '), 'spanish');
});

test('order is kept and empty input is fine', () => {
  assert.deepEqual(uniqueLabels(['b', 'a', 'B', 'c', 'A']), ['b', 'a', 'c']);
  assert.deepEqual(uniqueLabels([]), []);
  assert.deepEqual(uniqueLabels(null), []);
});

test('person chips: Spanish as skill and language renders once, shared highlight still matches', () => {
  const chips = uniqueLabels([...effectiveSkills(['Excel', 'Spanish'], [exp('1', 'Teller', ['spanish', 'Excel '])]), ...['Fintech'], ...['English', 'Spanish'].filter((l) => l !== 'English')]);
  assert.deepEqual(chips, ['Excel', 'Spanish', 'Fintech']);
  assert.equal(new Set(chips).size, chips.length); // unique React keys
  const shared = new Set(['spanish', 'Fintech'].map(labelKey));
  assert.deepEqual(chips.filter((x) => shared.has(labelKey(x))), ['Spanish', 'Fintech']);
});

test('cleanPrefLists cleans persisted duplicates without touching other prefs', () => {
  const saved = { field: 'finance', languages: ['English', 'Spanish', 'spanish '], skills: ['Spanish', 'Spanish'], interests: ['Fintech', 'fintech'], foods: ['coffee', 'coffee'], travelMi: 7, goalOther: '  keep me  ' } as Partial<Prefs>;
  const out = cleanPrefLists(saved);
  assert.deepEqual(out.languages, ['English', 'Spanish']);
  assert.deepEqual(out.skills, ['Spanish']);
  assert.deepEqual(out.interests, ['Fintech']);
  assert.deepEqual(out.foods, ['coffee']);
  assert.equal(out.field, 'finance');
  assert.equal(out.travelMi, 7);
  assert.equal(out.goalOther, '  keep me  ');
  assert.ok(!('diet' in out), 'absent fields stay absent so a partial update does not wipe them');
});

test('languages default to English when empty, but only when the field is given', () => {
  assert.deepEqual(cleanPrefLists({ languages: [] }).languages, ['English']);
  assert.deepEqual(cleanPrefLists({ languages: [' ', ''] }).languages, ['English']);
  assert.ok(!('languages' in cleanPrefLists({ skills: ['x'] })));
});

test('add then remove a skill through cleaned updates', () => {
  let prefs = cleanPrefLists({ skills: ['Excel'] });
  prefs = { ...prefs, ...cleanPrefLists({ skills: [...prefs.skills!, 'excel', 'Spanish'] }) };
  assert.deepEqual(prefs.skills, ['Excel', 'Spanish']);
  prefs = { ...prefs, ...cleanPrefLists({ skills: prefs.skills!.filter((s) => s !== 'Excel') }) };
  assert.deepEqual(prefs.skills, ['Spanish']);
});

test('save/reload round trip is stable', () => {
  const once = cleanPrefLists({ languages: ['Spanish', 'spanish'], skills: ['A', 'a'], experience: [exp('1', 'Intern', ['SQL', 'sql'])] });
  const reloaded = cleanPrefLists(JSON.parse(JSON.stringify(once)) as Partial<Prefs>);
  assert.deepEqual(reloaded, once);
});

test('two distinct experience records with the same title are both kept; only their skills are deduped', () => {
  const out = cleanPrefLists({ experience: [exp('a', 'Intern', ['SQL', 'sql', ' SQL']), exp('b', 'Intern', ['Excel', 'Excel'])] });
  assert.deepEqual(out.experience!.map((e) => e.id), ['a', 'b']);
  assert.deepEqual(out.experience!.map((e) => e.skills), [['SQL'], ['Excel']]);
});

test('resume/backend import: cleanExperience dedupes skills and keeps the id', () => {
  const e = cleanExperience({ id: 'x1', title: 'Teller', org: 'Bank', start: '2020-05', skills: ['Spanish', 'spanish', '  Customer   service ', 'customer service'] });
  assert.equal(e.id, 'x1');
  assert.deepEqual(e.skills, ['Spanish', 'Customer service']);
});
