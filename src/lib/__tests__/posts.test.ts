import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AREAS } from '../../data/options';
import { alertDigest, canRespond, emptyDraft, imageFrame, isDiscoverable, postState, responseAction, timeLeft, validateDraft, type NearbyPost, type ViewerRelation } from '../posts/model';

const area = (id: string) => AREAS.find((a) => a.id === id)!;
const T0 = 1_800_000_000_000;
const post = (over: Partial<NearbyPost> = {}): NearbyPost => ({
  id: 'p1',
  author: { id: 'maya', name: 'Maya', role: 'Banker', isDemo: true },
  image: { uri: 'x', width: 1200, height: 800 },
  caption: 'Practice interviews?',
  intent: 'help',
  area: area('southend'),
  radiusMi: 3,
  createdAt: T0,
  expiresAt: T0 + 6 * 3_600_000,
  closed: null,
  isDemo: true,
  ...over,
});
const rel = (over: Partial<ViewerRelation> = {}): ViewerRelation => ({ isAuthor: false, connected: false, pending: false, blocked: false, signedIn: true, ...over });

test('expiry boundary: open until the exact expiry time, expired at it', () => {
  const p = post();
  assert.equal(postState(p, p.expiresAt - 1), 'open');
  assert.equal(postState(p, p.expiresAt), 'expired');
  assert.equal(timeLeft(p, p.expiresAt), 'Expired');
  assert.equal(timeLeft(p, p.expiresAt - 30 * 60_000), '30m left');
});

test('deleted, missing and closed posts', () => {
  assert.equal(postState(null, T0), 'deleted');
  assert.equal(postState(post({ deleted: true }), T0), 'deleted');
  assert.equal(postState(post({ closed: 'found' }), T0), 'closed');
  // A deleted post stays deleted even after it would have expired.
  assert.equal(postState(post({ deleted: true }), T0 + 99 * 3_600_000), 'deleted');
});

test('expired and deleted posts leave discovery; closed ones stay visible', () => {
  const viewer = { center: area('southend').center, radiusMi: 3 };
  assert.equal(isDiscoverable(post(), viewer, T0), true);
  assert.equal(isDiscoverable(post(), viewer, T0 + 6 * 3_600_000), false);
  assert.equal(isDiscoverable(post({ deleted: true }), viewer, T0), false);
  assert.equal(isDiscoverable(post({ closed: 'sorted' }), viewer, T0), true);
});

test('both radii must cover the distance; the area is never widened silently', () => {
  const far = { center: area('ballantyne').center, radiusMi: 5 };
  assert.equal(isDiscoverable(post({ radiusMi: 1 }), far, T0), false);
  const near = { center: area('dilworth').center, radiusMi: 1 };
  assert.equal(isDiscoverable(post({ radiusMi: 5 }), near, T0), true);
  assert.equal(isDiscoverable(post({ radiusMi: 5 }), { center: area('university').center, radiusMi: 3 }, T0), false);
});

test('request flow reuses connection rules', () => {
  const p = post();
  assert.deepEqual(canRespond(p, rel(), T0), { ok: true, via: 'request' });
  assert.deepEqual(canRespond(p, rel({ connected: true }), T0), { ok: true, via: 'chat' });
  assert.equal(canRespond(p, rel({ pending: true }), T0).ok, false);
  assert.equal(canRespond(p, rel({ isAuthor: true }), T0).ok, false);
  assert.equal(canRespond(p, rel({ blocked: true }), T0).ok, false);
  assert.equal(canRespond(post({ closed: 'paused' }), rel(), T0).ok, false);
  assert.equal(canRespond(p, rel(), p.expiresAt).ok, false);
  assert.equal(canRespond(null, rel(), T0).ok, false);
  // Real (non-demo) posts need an account; demo posts can be tried as a guest.
  assert.equal(canRespond(post({ isDemo: false }), rel({ signedIn: false }), T0).ok, false);
});

test('contextual response actions', () => {
  assert.equal(responseAction('help'), 'help');
  assert.equal(responseAction('event'), 'join');
  assert.equal(responseAction('collab'), 'interested');
  assert.equal(responseAction(null), 'reply');
});

test('publishing needs an image, a caption and an area', () => {
  assert.equal(validateDraft(emptyDraft('uptown')).ok, false);
  assert.equal(validateDraft({ ...emptyDraft('uptown'), image: { uri: 'x', width: 1, height: 1 } }).ok, false);
  assert.equal(validateDraft({ ...emptyDraft('uptown'), image: { uri: 'x', width: 1, height: 1 }, caption: '  ' }).ok, false);
  assert.equal(validateDraft({ ...emptyDraft('uptown'), image: { uri: 'x', width: 1, height: 1 }, caption: 'Hi' }).ok, true);
  assert.equal(validateDraft({ ...emptyDraft(null), image: { uri: 'x', width: 1, height: 1 }, caption: 'Hi' }).ok, false);
});

test('image frame keeps natural proportions within limits', () => {
  assert.deepEqual(imageFrame(1200, 800, 300, 400), { width: 300, height: 200 });
  assert.deepEqual(imageFrame(800, 3000, 300, 400), { width: 300, height: 375 }); // clamped to 4:5
  assert.deepEqual(imageFrame(4000, 500, 300, 400), { width: 300, height: 157 }); // clamped to 1.91:1
});

test('nearby alerts are opt-in, grouped and rate-limited', () => {
  const ps = [post(), post({ id: 'p2', intent: 'event' }), post({ id: 'p3', author: { id: 'me', name: 'Me', role: '', isDemo: false } })];
  assert.equal(alertDigest(ps, { intents: [], lastAt: 0, seen: [], myId: 'me', now: T0 }), null);
  assert.deepEqual(alertDigest(ps, { intents: ['help'], lastAt: 0, seen: [], myId: 'me', now: T0 }), { count: 1, ids: ['p1'] });
  assert.equal(alertDigest(ps, { intents: ['help'], lastAt: T0 - 60_000, seen: [], myId: 'me', now: T0 }), null);
  assert.equal(alertDigest(ps, { intents: ['help'], lastAt: 0, seen: ['p1'], myId: 'me', now: T0 }), null);
});
