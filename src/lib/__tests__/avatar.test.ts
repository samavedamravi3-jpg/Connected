import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MISS_TTL_MS, avatarPaths, isFresh, markerTracks, photoFields, photoSyncAction, squareCrop, toSigned, type Signed } from '../avatar';
import { initials } from '../match';

const UID = '0b5c3a52-1f7e-4c1e-9a52-6d2f8d7b9e01';

test('initials: up to two letters, uppercase, "?" when empty', () => {
  assert.equal(initials('maya chen'), 'MC');
  assert.equal(initials('  Ana  María  López '), 'AM');
  assert.equal(initials('Q'), 'Q');
  assert.equal(initials('   '), '?');
});

test('paths are exactly <uid>/avatar.jpg and <uid>/thumb.jpg', () => {
  assert.deepEqual(avatarPaths(UID), { full: `${UID}/avatar.jpg`, thumb: `${UID}/thumb.jpg` });
});

test('square crop is centered', () => {
  assert.deepEqual(squareCrop(1200, 800), { originX: 200, originY: 0, width: 800, height: 800 });
  assert.deepEqual(squareCrop(600, 1001), { originX: 0, originY: 200, width: 600, height: 600 });
});

test('signed URLs: https only, errors become a short-lived miss', () => {
  const now = 1_000_000;
  const ok = toSigned({ signedUrl: 'https://x.supabase.co/storage/v1/object/sign/profile-photos/a?token=t', error: null }, now);
  assert.ok(ok.url && ok.exp > now + MISS_TTL_MS);
  assert.deepEqual(toSigned({ signedUrl: null, error: 'Either the object does not exist or you do not have access' }, now), { url: null, exp: now + MISS_TTL_MS });
  assert.equal(toSigned({ signedUrl: 'http://insecure/a', error: null }, now).url, null);
  assert.ok(isFresh(ok, now) && !isFresh(ok, ok.exp) && !isFresh(undefined, now));
});

test('photo fields: the marker thumb is never the full photo', () => {
  const { full, thumb } = avatarPaths(UID);
  const cache = new Map<string, Signed>([[full, { url: 'https://s/full', exp: 9 }], [thumb, { url: null, exp: 9 }]]);
  assert.deepEqual(photoFields(UID, cache), { photo: 'https://s/full' });
  cache.set(thumb, { url: 'https://s/thumb', exp: 9 });
  assert.deepEqual(photoFields(UID, cache), { photo: 'https://s/full', photoThumb: 'https://s/thumb' });
  assert.deepEqual(photoFields('other', cache), {});
});

test('photo sync: upload new, delete only a removal this phone saw, never touch another account', () => {
  assert.equal(photoSyncAction(null, 'u1', 'file:///a.jpg'), 'upload');
  assert.equal(photoSyncAction({ userId: 'u1', uri: 'file:///a.jpg' }, 'u1', 'file:///a.jpg'), 'none');
  assert.equal(photoSyncAction({ userId: 'u1', uri: 'file:///a.jpg' }, 'u1', 'file:///b.jpg'), 'upload');
  assert.equal(photoSyncAction({ userId: 'u1', uri: 'file:///a.jpg' }, 'u1', null), 'delete');
  assert.equal(photoSyncAction(null, 'u1', null), 'none');
  assert.equal(photoSyncAction({ userId: 'u2', uri: 'file:///a.jpg' }, 'u1', null), 'none');
  assert.equal(photoSyncAction({ userId: 'u2', uri: 'file:///a.jpg' }, 'u1', 'file:///a.jpg'), 'upload');
});

test('markers track while settling or until their photo loads or fails', () => {
  assert.equal(markerTracks(true, undefined, null), true);
  assert.equal(markerTracks(false, undefined, null), false);
  assert.equal(markerTracks(false, 'https://s/t', null), true);
  assert.equal(markerTracks(false, 'https://s/t', 'https://s/t'), false);
  assert.equal(markerTracks(false, 'https://s/new', 'https://s/t'), true);
});
