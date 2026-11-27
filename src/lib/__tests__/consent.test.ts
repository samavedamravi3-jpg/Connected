import assert from 'node:assert/strict';
import test from 'node:test';
import { LEGAL } from '../../legal/config';
import { canStartIdCheck, consentCurrent, makeConsent, needsConsentSync } from '../consent';

test('accepting records the versions, a timestamp and the adult confirmation', () => {
  const c = makeConsent(new Date('2026-11-27T10:00:00Z'));
  assert.equal(c.termsVersion, LEGAL.versions.terms);
  assert.equal(c.privacyVersion, LEGAL.versions.privacy);
  assert.equal(c.acceptedAt, '2026-11-27T10:00:00.000Z');
  assert.equal(c.adult, true);
});

test('an older terms version is no longer current, so the user is asked again', () => {
  assert.equal(consentCurrent(makeConsent()), true);
  assert.equal(consentCurrent({ ...makeConsent(), termsVersion: '2020-01-01' }), false);
  assert.equal(consentCurrent(null), false);
});

test('the ID check cannot start without the adult confirmation', () => {
  assert.equal(canStartIdCheck(null), false);
  assert.equal(canStartIdCheck({ ...makeConsent(), adult: false }), false);
  assert.equal(canStartIdCheck(makeConsent()), true);
});

test('consent syncs once per account, and again for a different account', () => {
  const c = makeConsent();
  assert.equal(needsConsentSync(c, null), false);
  assert.equal(needsConsentSync(c, 'u1'), true);
  assert.equal(needsConsentSync({ ...c, syncedFor: 'u1' }, 'u1'), false);
  assert.equal(needsConsentSync({ ...c, syncedFor: 'u1' }, 'u2'), true);
});
