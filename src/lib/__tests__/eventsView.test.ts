import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventsView, type EventsViewInput } from '../eventsView';

const base: EventsViewInput = { locked: false, withDemo: false, saved: false, savedCount: 0, savedHidden: 0, loaded: true, failed: false, shown: 3, liveCount: 3 };
const v = (o: Partial<EventsViewInput>) => eventsView({ ...base, ...o });

test('locked with demo events off: the lock shows at once, never a spinner or "Nothing matches"', () => {
  assert.equal(v({ locked: true, loaded: false, shown: 0 }), 'locked');
  assert.equal(v({ locked: true, loaded: false, failed: true, shown: 0 }), 'locked');
  assert.equal(v({ locked: true, shown: 0, liveCount: 12 }), 'locked');
  assert.equal(v({ locked: true, shown: 0, liveCount: 0 }), 'locked');
});

test('saved tab while locked: saved events read as locked, not "Nothing saved yet"', () => {
  assert.equal(v({ locked: true, saved: true, savedCount: 2, shown: 0 }), 'savedLocked');
  assert.equal(v({ locked: true, withDemo: true, saved: true, savedCount: 2, savedHidden: 2, shown: 0 }), 'savedLocked');
  assert.equal(v({ locked: true, saved: true, savedCount: 0, shown: 0 }), 'savedEmpty', 'nothing saved is still nothing saved');
  assert.equal(v({ locked: true, withDemo: true, saved: true, savedCount: 1, savedHidden: 0, shown: 0 }), 'savedEmpty');
  assert.equal(v({ locked: true, withDemo: true, saved: true, savedCount: 2, savedHidden: 1, shown: 1 }), 'list');
});

test('loading and failure settle into their own states', () => {
  assert.equal(v({ loaded: false }), 'loading');
  assert.equal(v({ loaded: false, failed: true }), 'error');
  assert.equal(v({ locked: true, withDemo: true, loaded: false, failed: true }), 'error');
  assert.equal(v({ failed: true }), 'list', 'a failed refresh keeps the current list');
});

test('unlocked empty states keep their meaning', () => {
  assert.equal(v({ shown: 0, liveCount: 0 }), 'noLive');
  assert.equal(v({ shown: 0, liveCount: 0, withDemo: true }), 'noMatch');
  assert.equal(v({ shown: 0 }), 'noMatch');
  assert.equal(v({ saved: true, shown: 0 }), 'savedEmpty');
});
