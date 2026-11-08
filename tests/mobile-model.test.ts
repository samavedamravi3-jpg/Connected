import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AREAS, canChange, canMessage, canSeeDoor, checkPhoto, distanceMi, doorInputSchema, doorWindowError, emailSchema, hiddenFor,
  isBlockedPair, meInputSchema, nextWindow, prefsSchema, pushTokenSchema, requestInputSchema, snapToArea, toPublic,
} from '../lib/mobile/model.ts';
import { hashCode, hashToken, randomCode, randomToken, safeEqual } from '../lib/mobile/crypto.ts';
import { senderForAi, targetForAi } from '../lib/mobile/ai-context.ts';

const profile = { name: 'Alex Rivera', status: 'student' as const, org: 'UNC Charlotte', intro: 'First-gen finance student.', offer: 'Community college transfers' };
const prefs = prefsSchema.parse({ field: 'finance', fromField: 'health', challenges: ['network', 'interviews'], wantTraits: ['firstgen'], goals: ['mentorship', 'advice', 'other'], goalOther: 'my secret plan', mode: 'both', travelMi: 10, languages: ['English', 'Spanish'], interests: ['Fintech'], skills: ['Excel'] });

test('emails are normalized and validated', () => {
  assert.equal(emailSchema.parse('  Alex@Example.COM '), 'alex@example.com');
  for (const bad of ['', 'nope', 'a@', '@b.com', 'a b@c.com']) assert.equal(emailSchema.safeParse(bad).success, false, bad);
});

test('preferences accept only the app’s option ids and dedupe lists', () => {
  assert.deepEqual(prefsSchema.parse({ goals: ['peers', 'peers'] }).goals, ['peers']);
  assert.equal(prefsSchema.parse({}).travelMi, 5);
  for (const bad of [{ field: 'astrology' }, { goals: ['dating'] }, { interests: ['<script>'] }, { travelMi: 7 }, { challenges: ['start', 'network', 'resume', 'skills'] }, { mode: 'admin' }])
    assert.equal(prefsSchema.safeParse(bad).success, false, JSON.stringify(bad));
  assert.equal(meInputSchema.safeParse({ prefs: {}, profile: { name: '   ' } }).success, false, 'name required');
});

test('the public projection never includes private answers', () => {
  const pub = toPublic(profile, prefs);
  const wire = JSON.stringify(pub);
  for (const secret of ['network', 'interviews', 'firstgen', 'my secret plan', 'health', '"travelMi"', '"shareMode"', '"discoverable"', 'challenges', 'wantTraits'])
    assert.ok(!wire.includes(secret), `${secret} must stay private`);
  assert.deepEqual(pub.offers, ['mentorship', 'advice'], 'helpers offer their goals (minus "other")');
  assert.deepEqual(pub.helpsWith, ['Community college transfers']);
  assert.equal(pub.role, 'Student');
  assert.equal(pub.meets, 'both');
  const seeker = toPublic(profile, { ...prefs, mode: 'seeking' });
  assert.deepEqual(seeker.offers, [], 'seekers offer nothing');
  assert.deepEqual(seeker.helpsWith, []);
});

test('locations snap to a neighborhood center or a coarse grid, never the raw point', () => {
  const nearUptown = { latitude: 35.22893, longitude: -80.84517 };
  const s = snapToArea(nearUptown);
  assert.equal(s.areaName, 'Uptown');
  assert.deepEqual(s.coord, AREAS[0].center);
  const far = snapToArea({ latitude: 40.74151, longitude: -73.98954 });
  assert.equal(far.areaName, 'Nearby');
  assert.deepEqual(far.coord, { latitude: 40.74, longitude: -73.98 });
  assert.ok(distanceMi({ latitude: 40.74151, longitude: -73.98954 }, far.coord) < 1.2);
});

test('blocks hide in both directions', () => {
  const blocks = [{ accountId: 'a', blockedId: 'b' }];
  assert.deepEqual([...hiddenFor(blocks, 'a')], ['b']);
  assert.deepEqual([...hiddenFor(blocks, 'b')], ['a']);
  assert.equal(hiddenFor(blocks, 'c').size, 0);
  assert.equal(isBlockedPair(blocks, 'b', 'a'), true);
});

test('request changes follow who sent and who received it', () => {
  const c = { id: '1', senderId: 'a', recipientId: 'b', status: 'requested' };
  assert.equal(canChange(c, 'a', 'cancelled', false), true);
  assert.equal(canChange(c, 'b', 'cancelled', false), false);
  assert.equal(canChange(c, 'b', 'accepted', false), true);
  assert.equal(canChange(c, 'b', 'declined', false), true);
  assert.equal(canChange(c, 'a', 'accepted', false), false, 'cannot accept your own request');
  assert.equal(canChange(c, 'x', 'declined', false), false, 'outsider');
  assert.equal(canChange(c, 'b', 'accepted', true), false, 'never accept across a block');
  assert.equal(canChange(c, 'b', 'declined', true), true, 'declining still works');
  assert.equal(canChange({ ...c, status: 'accepted' }, 'b', 'declined', false), false);
  assert.equal(canChange(undefined, 'b', 'accepted', false), false);
});

test('only accepted, unblocked participants can message', () => {
  const c = { id: '1', senderId: 'a', recipientId: 'b', status: 'accepted' };
  assert.equal(canMessage(c, 'a', false), true);
  assert.equal(canMessage(c, 'b', false), true);
  assert.equal(canMessage(c, 'x', false), false);
  assert.equal(canMessage({ ...c, status: 'requested' }, 'a', false), false);
  assert.equal(canMessage(c, 'a', true), false);
});

test('door venues are shown only to the audience the host chose', () => {
  const host = { field: 'finance' };
  assert.equal(canSeeDoor(['anyone'], host, { status: null, field: null }), true);
  assert.equal(canSeeDoor(['students'], host, { status: 'student', field: null }), true);
  assert.equal(canSeeDoor(['students'], host, { status: 'experienced', field: null }), false);
  assert.equal(canSeeDoor(['changing'], host, { status: 'between', field: null }), true);
  assert.equal(canSeeDoor(['same-field'], host, { status: 'early', field: 'finance' }), true);
  assert.equal(canSeeDoor(['same-field'], { field: null }, { status: 'early', field: null }), false, 'unset fields never match');
});

test('door windows must be upcoming, short and soon', () => {
  const now = Date.UTC(2026, 10, 8, 15);
  assert.equal(doorWindowError(now, now + 3600_000, now), null);
  assert.match(doorWindowError(now + 3600_000, now, now)!, /after the start/);
  assert.match(doorWindowError(now - 7200_000, now - 3600_000, now)!, /passed/);
  assert.match(doorWindowError(now, now + 5 * 3600_000, now)!, /4 hours/);
  assert.match(doorWindowError(now + 8 * 86400_000, now + 8 * 86400_000 + 3600_000, now)!, /7 days/);
  assert.equal(doorInputSchema.safeParse({ venueId: 'my-house', start: now, end: now + 1, lengthMin: 15, audience: ['anyone'] }).success, false, 'only listed public venues');
  assert.equal(doorInputSchema.safeParse({ venueId: 'main-library', start: now, end: now + 1, lengthMin: 15, audience: [] }).success, false, 'audience required');
});

test('photos must be small JPEG, PNG or WebP (never SVG)', () => {
  const b64 = (bytes: number[], pad = 120) => btoa(String.fromCharCode(...bytes, ...new Array(pad).fill(0)));
  assert.deepEqual(checkPhoto(b64([0xff, 0xd8, 0xff, 0xe0])), { mime: 'image/jpeg' });
  assert.deepEqual(checkPhoto(b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), { mime: 'image/png' });
  assert.deepEqual(checkPhoto(btoa('RIFF\0\0\0\0WEBPVP8 ' + '\0'.repeat(100))), { mime: 'image/webp' });
  assert.ok('error' in checkPhoto(btoa('<svg xmlns="http://www.w3.org/2000/svg"></svg>' + ' '.repeat(80))));
  assert.ok('error' in checkPhoto(btoa('GIF89a' + '\0'.repeat(100))));
  assert.ok('error' in checkPhoto('not base64 at all!!'));
  const bigJpeg = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 0, 0)) + 'A'.repeat(420_000);
  assert.match((checkPhoto(bigJpeg) as { error: string }).error, /too large/);
});

test('fixed-window rate limits allow max hits then reset', () => {
  const lim = { max: 2, windowMs: 1000 };
  let r = nextWindow(undefined, 0, lim);
  assert.equal(r.allowed, true);
  r = nextWindow(r.row, 100, lim);
  assert.equal(r.allowed, true);
  const blocked = nextWindow(r.row, 200, lim);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, 800);
  assert.equal(nextWindow(r.row, 1000, lim).allowed, true, 'new window');
});

test('requests need a real message; push tokens must be Expo tokens', () => {
  assert.equal(requestInputSchema.safeParse({ personId: 'u_123', message: 'hi' }).success, false);
  assert.equal(requestInputSchema.safeParse({ personId: 'u_123', message: 'Hi! Could we talk for 10 minutes?' }).success, true);
  assert.equal(pushTokenSchema.safeParse({ token: 'ExponentPushToken[abcdefghijklmnop]', platform: 'ios' }).success, true);
  assert.equal(pushTokenSchema.safeParse({ token: 'https://evil.example', platform: 'ios' }).success, false);
});

test('codes are 6 digits, tokens are long and random, hashes compare safely', async () => {
  const codes = new Set(Array.from({ length: 200 }, randomCode));
  for (const c of codes) assert.match(c, /^\d{6}$/);
  assert.ok(codes.size > 190, 'codes vary');
  const t = randomToken();
  assert.match(t, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(t, randomToken());
  const h1 = await hashCode('pepper', 'a@b.co', '123456');
  assert.equal(h1, await hashCode('pepper', 'a@b.co', '123456'));
  assert.notEqual(h1, await hashCode('pepper', 'c@b.co', '123456'), 'bound to email');
  assert.notEqual(h1, await hashCode('other', 'a@b.co', '123456'), 'bound to secret');
  assert.match(await hashToken(t), /^[0-9a-f]{64}$/);
  assert.equal(safeEqual(h1, h1), true);
  assert.equal(safeEqual(h1, h1.replace(/.$/, h1.endsWith('0') ? '1' : '0')), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
});

test('AI context carries goals and public help only', () => {
  const s = senderForAi(profile, prefs);
  assert.match(s.goal, /a mentor, career advice, a useful conversation in finance and banking \(my secret plan\)/, 'the sender’s own goals, incl. their own text');
  const t = targetForAi(toPublic(profile, prefs));
  const wire = JSON.stringify(t);
  for (const leak of ['network', 'interviews', 'firstgen', 'my secret plan', 'UNC Charlotte'.toLowerCase()]) assert.ok(!wire.toLowerCase().includes(leak) || leak === 'unc charlotte', leak);
  assert.deepEqual(Object.keys(t).sort(), ['company', 'goal', 'help', 'name', 'role']);
});
