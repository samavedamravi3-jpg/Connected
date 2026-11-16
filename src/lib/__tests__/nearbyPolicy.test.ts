import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  POLICY_DEFAULTS, blockedReason, createNearbyController, emptyLedger, explainRec, ledgerKey, muteAlertsFor, parseLedger, parseRecs,
  pausedReason, pickRec, recordShown, sharedLabels, type NearbyRec, type Storage,
} from '../nearbyPolicy';

const H = 3_600_000;
const rec = (id: string, extra: Partial<NearbyRec> = {}): NearbyRec => ({ id, name: 'Kayla S.', distanceBucketMi: 0.5, sharedLabels: ['Fintech'], sharedIntents: [], ...extra });

test('explanation uses only the shared labels and intent, no score', () => {
  const t = explainRec({ name: 'Kayla S.', sharedLabels: ['Fintech'], sharedIntents: ['they_offer_mentorship'] });
  assert.equal(t, "Kayla S. is nearby. You both selected Fintech. Kayla is open to mentoring, which you're looking for. Want to connect?");
  assert.doesNotMatch(t, /%|match score|compatib/i);
  assert.equal(explainRec({ name: 'Sol S.', sharedLabels: [], sharedIntents: ['they_seek_mentorship'] }), 'Sol S. is nearby. Sol is looking for a mentor, and you offer help. Want to connect?');
  assert.match(explainRec({ name: 'A B.', sharedLabels: ['SQL', 'Fintech', 'AI'], sharedIntents: [] }), /You both selected SQL, Fintech and AI\./);
});

test('parseRecs drops malformed rows, rows with no reason, unknown intents and coffee; dedupes by id', () => {
  const out = parseRecs([
    { id: 'a', name: 'Kayla S.', distance_bucket_mi: '0.5', shared_labels: ['Fintech', ' fintech ', 'Coffee'], shared_intents: ['they_offer_mentorship', 'hack'] },
    { id: 'a', name: 'dup', distance_bucket_mi: 1, shared_labels: ['SQL'], shared_intents: [] },
    { id: 'b', name: 'Cora C.', distance_bucket_mi: 1, shared_labels: ['coffee'], shared_intents: [] },
    { id: 3, name: 'bad' },
    null,
  ]);
  assert.deepEqual(out, [{ id: 'a', name: 'Kayla S.', distanceBucketMi: 0.5, sharedLabels: ['Fintech'], sharedIntents: ['they_offer_mentorship'] }]);
  assert.deepEqual(parseRecs('nope'), []);
});

test('demo shared labels: normalised, deduped, coffee alone is nothing', () => {
  assert.deepEqual(sharedLabels(['Fintech', 'fintech', 'Coffee'], [' FINTECH', 'coffee']), ['Fintech']);
  assert.deepEqual(sharedLabels(['Coffee'], ['coffee']), []);
});

test('cooldown per person (24 h default), daily cap of 3, minimum gap, mute', () => {
  const p = POLICY_DEFAULTS;
  let l = emptyLedger();
  const t0 = 1_000 * H;
  assert.equal(blockedReason(l, 'a', t0, p), null);
  l = recordShown(l, 'a', t0);
  assert.equal(blockedReason(l, 'a', t0 + 23 * H, p), 'cooldown');
  assert.equal(blockedReason(l, 'b', t0 + 5 * 60_000, p), 'gap');
  assert.equal(blockedReason(l, 'b', t0 + 16 * 60_000, p), null);
  l = recordShown(recordShown(l, 'b', t0 + H), 'c', t0 + 2 * H);
  assert.equal(blockedReason(l, 'd', t0 + 3 * H, p), 'daily_cap');
  assert.equal(blockedReason(l, 'd', t0 + 25 * H, p), null, 'cap is a rolling 24 h');
  assert.equal(blockedReason(l, 'a', t0 + 24 * H, p), null, 'cooldown over');
  assert.equal(blockedReason({ ...l, muted: ['z'] }, 'z', t0 + 100 * H, p), 'muted');
  assert.equal(blockedReason(l, 'a', t0 + 30 * H, { ...p, cooldownH: 72 }), 'cooldown', 'configurable cooldown');
});

test('pickRec skips blocked people and never picks a demo rec', () => {
  const l = recordShown(emptyLedger(), 'a', 0);
  assert.equal(pickRec([rec('a'), rec('b')], l, 20 * 60_000, POLICY_DEFAULTS)?.id, 'b');
  assert.equal(pickRec([rec('x', { demo: true })], emptyLedger(), 0, POLICY_DEFAULTS), null);
});

test('ledger parsing survives junk and keeps a week of history', () => {
  assert.deepEqual(parseLedger('{"last":{"a":"x","b":5},"sent":[1,"2"],"muted":["m","m",3]}'), { last: { b: 5 }, sent: [1], muted: ['m'] });
  assert.deepEqual(parseLedger(null), emptyLedger());
  const l = recordShown({ last: { old: 0 }, sent: [0], muted: [] }, 'new', 200 * H);
  assert.deepEqual(Object.keys(l.last), ['new']);
  assert.deepEqual(l.sent, [200 * H]);
});

test('paused reasons, in the order to fix them', () => {
  const ok = { signedIn: true, realMember: true, alertsOn: true, discoverable: true, sharingArea: true, fieldSet: true, locationGranted: true, mapLive: true };
  assert.equal(pausedReason(ok), null);
  assert.match(pausedReason({ ...ok, realMember: false })!, /Verify your ID/);
  assert.match(pausedReason({ ...ok, discoverable: false })!, /Discovery is paused/);
  assert.match(pausedReason({ ...ok, locationGranted: false })!, /Allow location/);
});

// --- controller with injected fakes ------------------------------------------------------------------------------

function fakes(recs: NearbyRec[] | (() => Promise<NearbyRec[]>), notifyOk = true) {
  const store = new Map<string, string>();
  const storage: Storage = { getItem: async (k) => store.get(k) ?? null, setItem: async (k, v) => void store.set(k, v) };
  const timers = new Set<number>();
  let next = 1;
  let clock = 1_000 * H;
  const shown: string[] = [];
  const notified: string[] = [];
  const results: (string | null)[] = [];
  const deps = {
    userId: 'u1', policy: POLICY_DEFAULTS, everyMs: 60_000,
    now: () => clock,
    setInterval: () => { const h = next++; timers.add(h); return h; },
    clearInterval: (h: unknown) => void timers.delete(h as number),
    storage,
    fetchRecs: typeof recs === 'function' ? recs : async () => recs,
    onRecommend: (r: NearbyRec) => void shown.push(r.id),
    notify: async (r: NearbyRec) => { if (notifyOk) notified.push(r.id); return notifyOk; },
    onResult: (_: NearbyRec[], e: string | null) => void results.push(e),
  };
  return { deps, store, timers, shown, notified, results, advance: (ms: number) => { clock += ms; } };
}

test('controller: one alert per tick, persisted; a restart keeps the cooldown', async () => {
  const f = fakes([rec('a'), rec('b')]);
  const c = createNearbyController(f.deps);
  await c.start();
  assert.deepEqual(f.shown, ['a']);
  assert.deepEqual(f.notified, ['a']);
  c.stop();
  // "Restart": a new controller with the same storage.
  const c2 = createNearbyController(f.deps);
  await c2.start();
  assert.deepEqual(f.shown, ['a'], 'gap blocks b right after a; a is in cooldown');
  f.advance(16 * 60_000);
  await c2.tick();
  assert.deepEqual(f.shown, ['a', 'b']);
  c2.stop();
  assert.ok(f.store.has(ledgerKey('u1')));
});

test('controller: notifications denied still shows the in-app card', async () => {
  const f = fakes([rec('a')], false);
  const c = createNearbyController(f.deps);
  await c.start();
  assert.deepEqual(f.shown, ['a']);
  assert.deepEqual(f.notified, []);
  c.stop();
});

test('controller cleanup: stop clears the timer and drops in-flight answers', async () => {
  let release!: (r: NearbyRec[]) => void;
  const f = fakes(() => new Promise<NearbyRec[]>((res) => { release = res; }));
  const c = createNearbyController(f.deps);
  void c.start();
  assert.equal(f.timers.size, 1);
  c.stop();
  assert.equal(f.timers.size, 0, 'interval cleared');
  assert.equal(c.running, false);
  release([rec('a')]);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(f.shown, [], 'answer after stop is ignored');
  assert.deepEqual(f.notified, []);
  assert.equal(f.store.size, 0, 'nothing recorded after stop');
  await c.tick();
  assert.deepEqual(f.shown, [], 'tick after stop does nothing');
});

test('controller: a failed check shows nothing and reports the error', async () => {
  const f = fakes(async () => { throw new Error('rate limit exceeded'); });
  const c = createNearbyController(f.deps);
  await c.start();
  assert.deepEqual(f.shown, []);
  assert.ok(f.results.includes('rate limit exceeded'));
  c.stop();
});

test('mute alerts for a person is per user and persists', async () => {
  const f = fakes([rec('a')]);
  await muteAlertsFor(f.deps.storage, 'u1', 'a');
  const c = createNearbyController(f.deps);
  await c.start();
  assert.deepEqual(f.shown, []);
  c.stop();
  assert.deepEqual(parseLedger(f.store.get(ledgerKey('u1'))).muted, ['a']);
  assert.equal(f.store.get(ledgerKey('u2')), undefined);
});
