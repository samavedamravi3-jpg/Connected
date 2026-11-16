import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BLOCKED_MESSAGE } from '../moderation';
import { createProfileSync, NOT_SAVED_MESSAGE, REJECTED_MESSAGE, saveIssue, type SyncState } from '../profileSync';

type Row = { id: string; name: string };

function harness(fail?: (row: Row) => unknown) {
  const saved: Row[] = [];
  const states: SyncState[] = [];
  const sync = createProfileSync<Row>(
    async (row) => {
      await new Promise((r) => setTimeout(r, 5));
      const e = fail?.(row);
      if (e) throw e;
      saved.push(row);
    },
    60_000, // a long debounce: only an explicit flush can save within the test
    (s) => states.push(s),
  );
  return { sync, saved, last: () => states.at(-1)! };
}

test('not ready until the server confirms; flush saves the pending row immediately', async () => {
  const h = harness();
  h.sync.schedule({ id: 'u1', name: 'Alex' });
  assert.equal(h.last().ready, false);
  assert.equal(await h.sync.flush(), true);
  assert.deepEqual(h.saved, [{ id: 'u1', name: 'Alex' }]);
  assert.equal(h.last().ready, true);
  assert.equal(await h.sync.flush(), true, 'nothing pending: stays ready, no second save');
  assert.equal(h.saved.length, 1);
});

test('nothing to save and nothing confirmed is not ready; loading the row confirms it', async () => {
  const h = harness();
  h.sync.setOwner('u1');
  assert.equal(await h.sync.flush(), false);
  h.sync.confirm('someone-else');
  assert.equal(h.last().ready, false);
  h.sync.confirm('u1');
  assert.equal(h.last().ready, true);
  assert.equal(await h.sync.flush(), true);
});

test('flush passes the latest row and concurrent flushes never double-save', async () => {
  const h = harness();
  h.sync.schedule({ id: 'u1', name: 'old' });
  const [a, b] = await Promise.all([h.sync.flush({ id: 'u1', name: 'new' }), h.sync.flush()]);
  assert.deepEqual([a, b], [true, true]);
  assert.deepEqual(h.saved, [{ id: 'u1', name: 'new' }]);
});

test('a failed save reports why, keeps the row, and Try again (flush) re-saves it', async () => {
  let down = true;
  const h = harness(() => (down ? new TypeError('Network request failed') : null));
  h.sync.schedule({ id: 'u1', name: 'Alex' });
  assert.equal(await h.sync.flush(), false);
  assert.deepEqual(h.last().issue, { message: NOT_SAVED_MESSAGE, rejected: false });
  assert.equal(h.last().ready, false);
  down = false;
  assert.equal(await h.sync.flush(), true);
  assert.equal(h.last().issue, null);
  assert.deepEqual(h.saved, [{ id: 'u1', name: 'Alex' }]);
});

test('moderation and validation rejections are marked rejected with the real reason', () => {
  assert.deepEqual(saveIssue(new Error(BLOCKED_MESSAGE)), { message: BLOCKED_MESSAGE, rejected: true });
  assert.deepEqual(saveIssue({ message: 'violates check constraint', code: '23514' }), { message: REJECTED_MESSAGE, rejected: true });
  assert.deepEqual(saveIssue({ message: 'value too long', code: '22001' }), { message: REJECTED_MESSAGE, rejected: true });
  assert.equal(saveIssue({ message: 'permission denied', code: '42501' }).rejected, false);
  assert.equal(saveIssue(null).rejected, false);
});

test('switching user drops the old queue and ignores a late result for the previous user', async () => {
  const h = harness();
  h.sync.schedule({ id: 'u1', name: 'Alex' });
  const p = h.sync.flush();
  h.sync.setOwner('u2');
  assert.equal(await p, false, 'u1 save finished after the switch');
  assert.equal(h.last().ready, false, 'u2 is not ready because of u1');
  h.sync.schedule({ id: 'u3', name: 'Sam' });
  h.sync.setOwner(null);
  assert.equal(await h.sync.flush(), false);
  assert.deepEqual(h.saved.map((r) => r.id), ['u1']);
});
