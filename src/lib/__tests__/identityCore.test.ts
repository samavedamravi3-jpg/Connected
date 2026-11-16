import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import {
  createKey, decide, isRealMember, parseSessionEvent, providerMode, resumeAction, reusable, sessionParams, statusFromStripe, verifyStripeSignature, SESSION_MAX_AGE_MS, type Row, type SessionEvent,
} from '../../../supabase/functions/_shared/identityCore.ts';
import { toIdStatus } from '../idStatus';

const SECRET = 'whsec_test_secret';
const sign = (body: string, t: number | string, secret = SECRET) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
const NOW = 1_800_000_000;

const row = (over: Partial<Row> = {}): Row => ({
  user_id: 'u1', session_id: 'vs_1', status: 'started', livemode: false, event_at: null, created_at: new Date(NOW * 1000).toISOString(), ...over,
});
const ev = (over: Partial<SessionEvent> = {}): SessionEvent => ({ sessionId: 'vs_1', userId: 'u1', status: 'verified', livemode: false, lastError: null, createdS: NOW, ...over });

test('missing configuration means unavailable; live keys need the explicit flag', () => {
  assert.deepEqual(providerMode({}), { available: false, test: false, liveEnabled: false });
  assert.equal(providerMode({ secretKey: 'sk_test_x' }).available, false, 'no webhook secret');
  assert.equal(providerMode({ webhookSecret: 'whsec' }).available, false, 'no key');
  assert.deepEqual(providerMode({ secretKey: 'rk_test_x', webhookSecret: 'whsec' }), { available: true, test: true, liveEnabled: false });
  assert.equal(providerMode({ secretKey: 'sk_live_x', webhookSecret: 'whsec' }).available, false, 'live disabled by default');
  assert.equal(providerMode({ secretKey: 'sk_live_x', webhookSecret: 'whsec', liveEnabled: 'yes' }).available, false);
  assert.deepEqual(providerMode({ secretKey: 'sk_live_x', webhookSecret: 'whsec', liveEnabled: 'true' }), { available: true, test: false, liveEnabled: true });
  assert.equal(providerMode({ secretKey: 'pk_test_x', webhookSecret: 'whsec' }).available, false, 'publishable key is not a secret key');
});

test('webhook signature: valid accepted, invalid / tampered / stale / missing rejected', async () => {
  const body = '{"id":"evt_1","type":"identity.verification_session.verified"}';
  assert.equal(await verifyStripeSignature(body, sign(body, NOW), SECRET, NOW), true);
  assert.equal(await verifyStripeSignature(body, `${sign(body, NOW)},v0=abc,secret=whsec_xx`, SECRET, NOW), true, 'unknown entries ignored');
  assert.equal(await verifyStripeSignature(body, `t=${NOW},v1=deadbeef,${sign(body, NOW).split(',')[1]}`, SECRET, NOW), true, 'any v1 may match');
  assert.equal(await verifyStripeSignature(body, sign(body, NOW, 'whsec_other'), SECRET, NOW), false, 'wrong secret');
  assert.equal(await verifyStripeSignature(body.replace('verified', 'canceled'), sign(body, NOW), SECRET, NOW), false, 'tampered body');
  assert.equal(await verifyStripeSignature(body, sign(body, NOW - 301), SECRET, NOW), false, 'outside tolerance');
  assert.equal(await verifyStripeSignature(body, sign(body, NOW + 301), SECRET, NOW), false, 'future beyond tolerance');
  assert.equal(await verifyStripeSignature(body, sign(body, NOW + 299), SECRET, NOW), true, 'small clock skew ok');
  for (const t of [`${NOW}.0`, '1.8e9', `+${NOW}`, '0x6B49D200', '']) {
    assert.equal(await verifyStripeSignature(body, sign(body, t), SECRET, NOW), false, `non-digit t "${t}"`);
  }
  assert.equal(await verifyStripeSignature(body, sign(body, `0${NOW}`), SECRET, NOW), true, 'the raw t string is what is signed');
  assert.equal(await verifyStripeSignature(body, `t=0${NOW},${sign(body, NOW).split(',')[1]}`, SECRET, NOW), false, 'signature over a different t string');
  assert.equal(await verifyStripeSignature(body, `t=${NOW}`, SECRET, NOW), false, 'no v1');
  assert.equal(await verifyStripeSignature(body, null, SECRET, NOW), false);
  assert.equal(await verifyStripeSignature(body, sign(body, NOW), undefined, NOW), false, 'no secret configured');
});

test('parseSessionEvent keeps only minimal fields and ignores other events', () => {
  const e = {
    type: 'identity.verification_session.requires_input', created: NOW, livemode: false,
    data: { object: { object: 'identity.verification_session', id: 'vs_1', status: 'requires_input', livemode: false, metadata: { user_id: 'u1' }, last_error: { code: 'document_expired', reason: 'x' }, url: 'https://verify.stripe.com/x' } },
  };
  assert.deepEqual(parseSessionEvent(e), { sessionId: 'vs_1', userId: 'u1', status: 'rejected', livemode: false, lastError: 'document_expired', createdS: NOW });
  assert.equal(parseSessionEvent({ ...e, type: 'payment_intent.succeeded' }), null);
  assert.equal(parseSessionEvent({ ...e, data: { object: { ...e.data.object, metadata: {} } } }), null, 'no user id');
  assert.equal(parseSessionEvent(null), null);
});

test('status mapping from Stripe', () => {
  assert.equal(statusFromStripe('requires_input', null), 'started');
  assert.equal(statusFromStripe('requires_input', 'selfie_face_mismatch'), 'rejected');
  assert.equal(statusFromStripe('processing', null), 'pending');
  assert.equal(statusFromStripe('verified', null), 'verified');
  assert.equal(statusFromStripe('canceled', null), 'canceled');
  assert.equal(statusFromStripe('weird', null), null);
});

test('success: live verified grants the badge; test verified never does', () => {
  const live = decide(row({ livemode: true }), ev({ livemode: true }), true);
  assert.ok(live.apply && live.grantBadge && live.patch.status === 'verified');
  const t = decide(row(), ev(), false);
  assert.ok(t.apply && !t.grantBadge && t.patch.status === 'verified', 'test mode records verified privately only');
  assert.deepEqual(decide(row({ livemode: true }), ev({ livemode: true }), false), { apply: false, reason: 'live_disabled' });
});

test('processing, then rejected (retry), then verified on the same session', () => {
  let r = row();
  for (const [status, at] of [['pending', NOW], ['rejected', NOW + 5], ['pending', NOW + 60], ['verified', NOW + 70]] as const) {
    const d = decide(r, ev({ status, createdS: at, lastError: status === 'rejected' ? 'document_expired' : null }), false);
    assert.ok(d.apply, status);
    if (d.apply) r = { ...r, ...d.patch };
  }
  assert.equal(r.status, 'verified');
  assert.equal(r.last_error, null);
});

test('canceled applies and is final', () => {
  const d = decide(row({ status: 'rejected' }), ev({ status: 'canceled' }), false);
  assert.ok(d.apply && d.patch.status === 'canceled');
  assert.deepEqual(decide(row({ status: 'canceled' }), ev({ status: 'pending', createdS: NOW + 9 }), false), { apply: false, reason: 'final' });
});

test('duplicate and out-of-order events are harmless; verified is never downgraded', () => {
  const at = new Date(NOW * 1000).toISOString();
  assert.deepEqual(decide(row({ status: 'verified', event_at: at }), ev(), false), { apply: false, reason: 'final' }, 'duplicate verified');
  assert.deepEqual(decide(row({ status: 'verified', event_at: at }), ev({ status: 'rejected', createdS: NOW + 10 }), false), { apply: false, reason: 'final' });
  assert.deepEqual(decide(row({ status: 'verified', event_at: at }), ev({ status: 'canceled', createdS: NOW + 10 }), false), { apply: false, reason: 'final' });
  assert.deepEqual(decide(row({ status: 'rejected', event_at: at }), ev({ status: 'pending', createdS: NOW - 1 }), false), { apply: false, reason: 'stale' });
  assert.deepEqual(decide(row({ status: 'rejected', event_at: at }), ev({ status: 'pending', createdS: NOW }), false), { apply: false, reason: 'stale' }, 'same second: later stage wins');
  assert.deepEqual(decide(row({ status: 'pending', event_at: at }), ev({ status: 'pending', createdS: NOW }), false), { apply: false, reason: 'stale' }, 'exact duplicate');
  const tie = decide(row({ status: 'pending', event_at: at }), ev({ status: 'rejected', createdS: NOW }), false);
  assert.ok(tie.apply);
});

test('forged or mismatched events are ignored', () => {
  assert.deepEqual(decide(null, ev(), false), { apply: false, reason: 'unknown_session' });
  assert.deepEqual(decide(row({ session_id: 'vs_new' }), ev(), false), { apply: false, reason: 'unknown_session' }, 'old session');
  assert.deepEqual(decide(row({ user_id: 'u2' }), ev(), false), { apply: false, reason: 'user_mismatch' });
  assert.deepEqual(decide(row(), ev({ livemode: true }), true), { apply: false, reason: 'mode_mismatch' }, 'live event for a test row');
});

test('session reuse: open sessions resume, expired / final / other-mode ones do not', () => {
  const nowMs = NOW * 1000;
  assert.equal(reusable(null, false, nowMs), false);
  for (const s of ['started', 'rejected', 'pending'] as const) assert.equal(reusable(row({ status: s }), false, nowMs), true, s);
  for (const s of ['verified', 'canceled', 'unverified'] as const) assert.equal(reusable(row({ status: s }), false, nowMs), false, s);
  assert.equal(reusable(row(), true, nowMs), false, 'test session not reused for live');
  assert.equal(reusable(row(), false, nowMs + SESSION_MAX_AGE_MS + 1), false, 'expired');
  assert.equal(resumeAction({ status: 'requires_input', url: 'https://verify.stripe.com/start/x', metadata: { user_id: 'u1' } }, 'u1'), 'open');
  assert.equal(resumeAction({ status: 'requires_input', url: null, metadata: { user_id: 'u1' } }, 'u1'), 'new');
  assert.equal(resumeAction({ status: 'processing', metadata: { user_id: 'u1' } }, 'u1'), 'processing');
  assert.equal(resumeAction({ status: 'canceled', metadata: { user_id: 'u1' } }, 'u1'), 'new');
  assert.equal(resumeAction({ status: 'requires_input', url: 'https://verify.stripe.com/x', metadata: { user_id: 'u2' } }, 'u1'), 'new', 'never hand out another user’s session');
});

test('concurrent creates share one idempotency key; a new session gets a new key', () => {
  assert.equal(createKey('u1', null), createKey('u1', null));
  assert.equal(createKey('u1', row()), createKey('u1', row()));
  assert.notEqual(createKey('u1', row()), createKey('u1', row({ session_id: 'vs_2' })));
  assert.notEqual(createKey('u1', null), createKey('u2', null));
  // Keys made before the options changed must not be replayed with the new parameters (Stripe would reject them).
  assert.ok(createKey('u1', null).startsWith('idv2:'));
  assert.notEqual(createKey('u1', null), 'idv:u1:first');
});

test('client status: only the flag plus a live verified row is verified', () => {
  assert.equal(toIdStatus({ status: 'verified', livemode: false }, false), 'test_verified');
  assert.equal(toIdStatus({ status: 'verified', livemode: true }, false), 'pending', 'webhook still finishing');
  assert.equal(toIdStatus({ status: 'verified', livemode: true }, true), 'verified');
  assert.equal(toIdStatus(null, false), 'unverified');
  assert.equal(toIdStatus({ status: 'canceled' }, false), 'canceled');
  assert.equal(toIdStatus({ status: 'bogus' }, false), 'unverified');
});

test('forged or stale flags never make a member (same rule as SQL is_real_member)', () => {
  assert.equal(isRealMember(true, { status: 'verified', livemode: true }), true);
  assert.equal(isRealMember(true, null), false, 'flag without a row');
  assert.equal(isRealMember(true, { status: 'verified', livemode: false }), false, 'flag + test-mode pass');
  assert.equal(isRealMember(false, { status: 'verified', livemode: true }), false, 'live row, webhook not finished');
  assert.equal(isRealMember(true, { status: 'pending', livemode: true }), false);
  assert.equal(isRealMember('true' as unknown as boolean, { status: 'verified', livemode: 'true' as unknown as boolean }), false, 'truthy strings are not true');
  assert.equal(toIdStatus(null, true), 'unverified', 'client flag alone is not verified');
  assert.equal(toIdStatus({ status: 'verified', livemode: false }, true), 'test_verified', 'flag + test pass stays a test result');
});

test('sandbox success can never grant the badge, whatever the order or repeats', () => {
  let r = row();
  for (const e of [ev({ status: 'pending', createdS: NOW }), ev({ status: 'verified', createdS: NOW + 1 }), ev({ status: 'verified', createdS: NOW + 1 }), ev({ status: 'pending', createdS: NOW - 5 })]) {
    for (const live of [false, true]) {
      const d = decide(r, e, live);
      if (d.apply) assert.equal(d.grantBadge, false, 'test-mode event granted the badge');
    }
    const d = decide(r, e, false);
    if (d.apply) r = { ...r, ...d.patch };
  }
  assert.equal(r.status, 'verified');
  assert.equal(isRealMember(false, r), false);
});

test('live: duplicate and out-of-order webhooks grant once and never downgrade', () => {
  const live = row({ livemode: true });
  const first = decide(live, ev({ livemode: true, createdS: NOW + 10 }), true);
  assert.ok(first.apply && first.grantBadge);
  const after = { ...live, ...(first.apply ? first.patch : {}) };
  assert.deepEqual(decide(after, ev({ livemode: true, createdS: NOW + 10 }), true), { apply: false, reason: 'final' }, 'duplicate');
  assert.deepEqual(decide(after, ev({ livemode: true, status: 'pending', createdS: NOW + 2 }), true), { apply: false, reason: 'final' }, 'late processing');
  assert.deepEqual(decide(after, ev({ livemode: true, status: 'rejected', createdS: NOW + 20, lastError: 'x' }), true), { apply: false, reason: 'final' });
  const rejectedLate = decide(row({ livemode: true, status: 'rejected', event_at: new Date((NOW + 30) * 1000).toISOString() }), ev({ livemode: true, status: 'pending', createdS: NOW + 5 }), true);
  assert.deepEqual(rejectedLate, { apply: false, reason: 'stale' });
});

test('session options: live capture, matching selfie, three ID types; no ID number, no return_url', () => {
  const p = sessionParams('u1');
  assert.equal(p.get('type'), 'document');
  assert.equal(p.get('metadata[user_id]'), 'u1');
  assert.equal(p.get('options[document][require_live_capture]'), 'true');
  assert.equal(p.get('options[document][require_matching_selfie]'), 'true');
  assert.deepEqual(p.getAll('options[document][allowed_types][]'), ['driving_license', 'passport', 'id_card']);
  assert.equal(p.has('options[document][require_id_number]'), false);
  assert.equal(p.has('return_url'), false);
  assert.equal([...p.keys()].some((k) => k.startsWith('provided_details')), false, 'no personal details sent');
});
