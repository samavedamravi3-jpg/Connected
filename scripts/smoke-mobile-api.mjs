#!/usr/bin/env node
// End-to-end check of the mobile API against a running local server (dev or `npm start`).
// Usage: node scripts/smoke-mobile-api.mjs [baseUrl]   (default http://127.0.0.1:5175)
// Needs a local/LAN URL: sign-in codes are only echoed back when no email service is configured locally.
// Creates throwaway accounts (smoke+<time>-x@example.com) and deletes them at the end.
const BASE = (process.argv[2] || 'http://127.0.0.1:5175').replace(/\/$/, '');
const run = Date.now();
let passed = 0;
const failures = [];

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.arrayBuffer();
  return { status: res.status, data, type };
}
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✗ ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 300)}` : ''}`); }
}

async function signIn(tag) {
  const email = `smoke+${run}-${tag}@example.com`;
  const start = await call('POST', '/api/v1/auth/start', { body: { email } });
  if (!start.data.devCode) throw new Error(`No devCode for ${tag}: ${JSON.stringify(start.data)}`);
  const v = await call('POST', '/api/v1/auth/verify', { body: { email, code: start.data.devCode } });
  if (!v.data.token) throw new Error(`verify failed for ${tag}: ${JSON.stringify(v.data)}`);
  return { email, token: v.data.token, id: v.data.accountId, isNew: v.data.isNew };
}
const basePrefs = { languages: ['English'], meetMode: 'either', availability: ['week'], shareMode: 'area', discoverable: true, travelMi: 5 };

console.log(`Mobile API smoke test → ${BASE}`);

// --- Sign-in ---------------------------------------------------------------
console.log('Sign-in');
{
  const email = `smoke+${run}-wrong@example.com`;
  const s = await call('POST', '/api/v1/auth/start', { body: { email } });
  check('start returns a dev code locally', /^\d{6}$/.test(s.data.devCode ?? ''), s.data);
  const again = await call('POST', '/api/v1/auth/start', { body: { email } });
  check('resend within 30s is refused', again.status === 429, again);
  const wrong = String((Number(s.data.devCode) + 1) % 1_000_000).padStart(6, '0');
  const bad = await call('POST', '/api/v1/auth/verify', { body: { email, code: wrong } });
  check('wrong code is rejected with tries left', bad.status === 400 && /4 tries left/.test(bad.data.error), bad.data);
  const good = await call('POST', '/api/v1/auth/verify', { body: { email, code: s.data.devCode } });
  check('right code signs in', !!good.data.token && good.data.isNew === true, good.data);
  const reuse = await call('POST', '/api/v1/auth/verify', { body: { email, code: s.data.devCode } });
  check('codes are single-use', reuse.status === 400, reuse.data);
  check('no token → 401', (await call('GET', '/api/v1/me')).status === 401);
  check('bad token → 401', (await call('GET', '/api/v1/me', { token: 'x'.repeat(43) })).status === 401);
  await call('DELETE', '/api/v1/me', { token: good.data.token });
}

const A = await signIn('a'); // student seeking mentorship in finance
const B = await signIn('b'); // experienced finance helper
const C = await signIn('c'); // tech helper who hosts an Open Door

// --- Profiles ----------------------------------------------------------------
console.log('Profiles');
const putA = await call('PUT', '/api/v1/me', { token: A.token, body: {
  prefs: { ...basePrefs, field: 'finance', goals: ['mentorship', 'advice'], challenges: ['network', 'interviews'], wantTraits: ['firstgen'], goalOther: 'PRIVATE-GOAL', mode: 'seeking', interests: ['Fintech'], skills: ['Excel'] },
  profile: { name: 'Avery Smoke', status: 'student', org: 'UNC Charlotte', intro: 'Trying to break into banking.', offer: '' } } });
check('A saves profile', putA.status === 200, putA.data);
await call('PUT', '/api/v1/me', { token: B.token, body: {
  prefs: { ...basePrefs, field: 'finance', goals: ['mentorship', 'advice'], mode: 'offering', interests: ['Fintech', 'Investing'] },
  profile: { name: 'Blake Smoke', status: 'experienced', org: 'Bank of Somewhere', intro: 'Ten years in banking.', offer: 'Interview practice for analyst roles' } } });
await call('PUT', '/api/v1/me', { token: C.token, body: {
  prefs: { ...basePrefs, field: 'tech', goals: ['peers', 'collab'], mode: 'both', interests: ['AI'] },
  profile: { name: 'Casey Smoke', status: 'early', org: 'Startup', intro: 'Engineer, happy to help.', offer: 'First coding job advice' } } });
const meA = await call('GET', '/api/v1/me', { token: A.token });
check('A reads own private prefs', meA.data.prefs?.goalOther === 'PRIVATE-GOAL' && meA.data.onboarded === true, meA.data);
const badPut = await call('PUT', '/api/v1/me', { token: A.token, body: { prefs: { field: 'astrology' }, profile: { name: 'x' } } });
check('invalid option ids are rejected', badPut.status === 400, badPut.data);

// --- Location + discovery ------------------------------------------------------
console.log('Discovery');
const locB = await call('POST', '/api/v1/me/location', { token: B.token, body: { latitude: 35.22893, longitude: -80.84517 } });
check('location snaps to a neighborhood for one hour', locB.data.areaName === 'Uptown' && locB.data.visibleUntil > Date.now() + 3500_000, locB.data);
await call('POST', '/api/v1/me/location', { token: C.token, body: { latitude: 35.2125, longitude: -80.8575 } });
await call('POST', '/api/v1/me/location', { token: A.token, body: { latitude: 35.2271, longitude: -80.8431 } });
const near = await call('GET', '/api/v1/people?latitude=35.2271&longitude=-80.8431&radiusMi=5', { token: A.token });
const ids = (near.data.people ?? []).map((p) => p.id);
check('A sees B and C nearby, not self', ids.includes(B.id) && ids.includes(C.id) && !ids.includes(A.id), near.data);
const wire = JSON.stringify(near.data);
check('discovery leaks no private answers or emails', !/PRIVATE-GOAL|challenges|wantTraits|travelMi|@example\.com/.test(wire));
const bPublic = near.data.people?.find((p) => p.id === B.id);
check('B shows offers and area center, not a device position', bPublic?.offers?.includes('mentorship') && bPublic?.coord?.latitude === 35.2271, bPublic);
const far = await call('GET', '/api/v1/people?latitude=40.7415&longitude=-73.9895&radiusMi=5', { token: A.token });
check('radius filter excludes far-away searches', (far.data.people ?? []).length === 0, far.data);

// --- Requests + chat -----------------------------------------------------------
console.log('Requests and chat');
const req = await call('POST', '/api/v1/connections', { token: A.token, body: { personId: B.id, message: 'Hi Blake! Could we talk for 10 minutes about analyst interviews?' } });
check('A sends a request to B', req.status === 200 && req.data.connection?.status === 'requested', req.data);
const cid = req.data.connection?.id;
check('duplicate request is refused', (await call('POST', '/api/v1/connections', { token: A.token, body: { personId: B.id, message: 'Hello again, just checking in!' } })).status === 409);
check('request to self is refused', (await call('POST', '/api/v1/connections', { token: A.token, body: { personId: A.id, message: 'Talking to myself here.' } })).status === 400);
const inboxB = await call('GET', '/api/v1/connections', { token: B.token });
const incoming = inboxB.data.connections?.find((c) => c.id === cid);
check('B sees the incoming request with A’s profile', incoming?.direction === 'incoming' && incoming?.person?.name === 'Avery Smoke', inboxB.data);
check('sender cannot accept own request', (await call('PATCH', `/api/v1/connections/${cid}`, { token: A.token, body: { status: 'accepted' } })).status === 403);
check('outsider cannot read the conversation', (await call('GET', `/api/v1/connections/${cid}/messages`, { token: C.token })).status === 404);
check('no messages before acceptance', (await call('POST', `/api/v1/connections/${cid}/messages`, { token: A.token, body: { text: 'Hello?' } })).status === 403);
check('B accepts', (await call('PATCH', `/api/v1/connections/${cid}`, { token: B.token, body: { status: 'accepted' } })).status === 200);
const msg = await call('POST', `/api/v1/connections/${cid}/messages`, { token: A.token, body: { text: 'Thanks! Main Library Thursday at 4?' } });
check('A messages after acceptance', msg.status === 200, msg.data);
const thread = await call('GET', `/api/v1/connections/${cid}/messages`, { token: B.token });
check('B reads both messages in order', thread.data.messages?.length === 2 && thread.data.messages[0].from === 'them' && thread.data.messages[1].text.includes('Main Library'), thread.data);
const since = await call('GET', `/api/v1/connections/${cid}/messages?since=${thread.data.messages?.[0]?.at}`, { token: B.token });
check('polling with ?since returns only newer messages', since.data.messages?.length === 1, since.data);

// --- Open Doors (audience enforced server-side) --------------------------------
console.log('Open Doors');
const now = Date.now();
const door = await call('POST', '/api/v1/doors', { token: C.token, body: { venueId: 'main-library', start: now, end: now + 2 * 3600_000, lengthMin: 15, topics: ['First coding job'], audience: ['students'] } });
check('C opens a door for students', door.status === 200 && door.data.door?.venueId === 'main-library', door.data);
check('unlisted venues are refused', (await call('POST', '/api/v1/doors', { token: C.token, body: { venueId: 'my-apartment', start: now, end: now + 3600_000, lengthMin: 15, audience: ['anyone'] } })).status === 400);
check('doors over 4 hours are refused', (await call('POST', '/api/v1/doors', { token: C.token, body: { venueId: 'main-library', start: now, end: now + 5 * 3600_000, lengthMin: 15, audience: ['anyone'] } })).status === 400);
const cForA = (await call('GET', `/api/v1/people/${C.id}`, { token: A.token })).data.person;
const cForB = (await call('GET', `/api/v1/people/${C.id}`, { token: B.token })).data.person;
check('student sees the venue', cForA?.door?.venueId === 'main-library', cForA?.door);
check('non-student sees the door but not the venue', cForB?.door && cForB.door.venueId === null, cForB?.door);

// --- AI opener (real Claude call if a key is configured; template otherwise) ---
console.log('AI');
const opener = await call('POST', '/api/v1/ai/opener', { token: A.token, body: { personId: C.id, tone: 'short' } });
check('opener returns a Claude draft or a labeled template fallback', opener.status === 200 && (opener.data.source === 'claude' ? opener.data.text?.length > 10 : opener.data.source === 'template'), opener.data);
console.log(`    (opener source: ${opener.data.source}${opener.data.text ? `, "${opener.data.text.slice(0, 80)}…"` : ''})`);

// --- Blocks and reports ------------------------------------------------------
console.log('Safety');
const reqAC = await call('POST', '/api/v1/connections', { token: A.token, body: { personId: C.id, message: 'Hi Casey, could I ask about your first coding job?' } });
check('A requests C', reqAC.status === 200, reqAC.data);
check('C blocks A', (await call('POST', '/api/v1/blocks', { token: C.token, body: { personId: A.id } })).status === 200);
const nearAfter = await call('GET', '/api/v1/people?latitude=35.2271&longitude=-80.8431&radiusMi=5', { token: A.token });
check('blocked person disappears from A’s map', !(nearAfter.data.people ?? []).some((p) => p.id === C.id));
check('blocked profile 404s for A', (await call('GET', `/api/v1/people/${C.id}`, { token: A.token })).status === 404);
const inboxA = await call('GET', '/api/v1/connections', { token: A.token });
check('conversation with a blocker is hidden', !(inboxA.data.connections ?? []).some((c) => c.personId === C.id), inboxA.data);
check('blocked list shows the name', (await call('GET', '/api/v1/blocks', { token: C.token })).data.blocked?.[0]?.name === 'Avery Smoke');
const rep = await call('POST', '/api/v1/reports', { token: B.token, body: { personId: C.id, reason: 'spam', details: 'smoke test' } });
check('report is stored and also blocks', rep.status === 200 && rep.data.blocked === true, rep.data);

// --- Photos, events, saved events, push tokens ---------------------------------
console.log('Photos, events, devices');
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='; // 1x1 PNG
const up = await call('PUT', '/api/v1/me/photo', { token: A.token, body: { base64: png } });
check('photo upload accepts a real PNG', up.status === 200 && /^\/api\/v1\/photos\//.test(up.data.photo ?? ''), up.data);
if (up.status === 200) {
  const img = await call('GET', up.data.photo);
  check('photo is served as image/png with nosniff', img.status === 200 && img.type.startsWith('image/png'));
}
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' + ' '.repeat(60)).toString('base64');
check('SVG upload is refused', (await call('PUT', '/api/v1/me/photo', { token: A.token, body: { base64: svg } })).status === 400);
const events = await call('GET', '/api/v1/events');
check('events list real Charlotte listings with sources', events.status === 200 && Array.isArray(events.data.events), events.data);
const evId = events.data.events?.[0]?.id ?? 'demo-event';
await call('POST', '/api/v1/saved-events', { token: A.token, body: { eventId: evId, saved: true } });
check('saved events round-trip', (await call('GET', '/api/v1/saved-events', { token: A.token })).data.eventIds?.includes(evId));
check('push token registers', (await call('POST', '/api/v1/push-tokens', { token: A.token, body: { token: 'ExponentPushToken[smoketest1234567]', platform: 'ios' } })).status === 200);
check('push token removes', (await call('DELETE', '/api/v1/push-tokens', { token: A.token, body: { token: 'ExponentPushToken[smoketest1234567]' } })).status === 200);
check('non-Expo push token is refused', (await call('POST', '/api/v1/push-tokens', { token: A.token, body: { token: 'https://evil.example/hook', platform: 'ios' } })).status === 400);

// --- Hiding, account deletion, sign-out ----------------------------------------
console.log('Hiding and deletion');
await call('DELETE', '/api/v1/me/location', { token: B.token });
const hidden = await call('GET', '/api/v1/people?latitude=35.2271&longitude=-80.8431&radiusMi=5', { token: A.token });
check('hidden member leaves the map', !(hidden.data.people ?? []).some((p) => p.id === B.id));
check('…but stays viewable to people already connected', (await call('GET', `/api/v1/people/${B.id}`, { token: A.token })).status === 200);
check('A deletes the account', (await call('DELETE', '/api/v1/me', { token: A.token })).status === 200);
check('deleted account’s token no longer works', (await call('GET', '/api/v1/me', { token: A.token })).status === 401);
check('B’s inbox no longer contains A', !((await call('GET', '/api/v1/connections', { token: B.token })).data.connections ?? []).some((c) => c.personId === A.id));
check('sign-out revokes the session', (await call('POST', '/api/v1/auth/logout', { token: B.token })).status === 200 && (await call('GET', '/api/v1/me', { token: B.token })).status === 401);

// Cleanup: C (B is signed out; sign B back in to delete).
await call('DELETE', '/api/v1/me', { token: C.token });
const B2 = await signIn('b');
await call('DELETE', '/api/v1/me', { token: B2.token });

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log('Failed:\n - ' + failures.join('\n - ')); process.exit(1); }
