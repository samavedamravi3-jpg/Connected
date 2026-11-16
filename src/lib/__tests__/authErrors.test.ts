import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authMessage } from '../authErrors';

test('keeps the code and explains unconfirmed accounts', () => {
  const f = authMessage({ code: 'email_not_confirmed', message: 'Email not confirmed' });
  assert.equal(f.code, 'email_not_confirmed');
  assert.match(f.message, /resend/i);
});

test('a send failure reads as a send failure, not a bad password', () => {
  assert.match(authMessage({ code: 'unexpected_failure' }).message, /confirmation email/);
  assert.match(authMessage({ status: 500 }).message, /confirmation email/);
});

test('unknown errors keep their text and a code', () => {
  const f = authMessage({ message: 'weird' });
  assert.equal(f.code, 'unknown');
  assert.match(f.message, /weird/);
});
