// The assistant server's request trust helpers (server/src/net.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientIp, tokenOk } from '../../../server/src/net';

test('tokens: exact match only; an unset expected token never matches (fail closed)', () => {
  assert.equal(tokenOk('s3cret-token', 's3cret-token'), true);
  assert.equal(tokenOk('s3cret-tokeN', 's3cret-token'), false);
  assert.equal(tokenOk('short', 's3cret-token'), false);
  assert.equal(tokenOk(undefined, 's3cret-token'), false);
  assert.equal(tokenOk(['s3cret-token'], 's3cret-token'), false);
  assert.equal(tokenOk('', ''), false);
  assert.equal(tokenOk('anything', ''), false);
});

test('client address: x-forwarded-for is ignored unless proxies are trusted, then read from the right', () => {
  assert.equal(clientIp('6.6.6.6', '10.0.0.5', 0), '10.0.0.5'); // spoofed header, no proxy: socket wins
  assert.equal(clientIp(undefined, undefined, 0), 'unknown');
  assert.equal(clientIp('6.6.6.6, 203.0.113.7', '10.0.0.5', 1), '203.0.113.7'); // one proxy appended the real client
  assert.equal(clientIp('6.6.6.6, 203.0.113.7, 10.1.1.1', '10.0.0.5', 2), '203.0.113.7');
  assert.equal(clientIp(['6.6.6.6', '203.0.113.7'], '10.0.0.5', 1), '203.0.113.7');
  assert.equal(clientIp('', '10.0.0.5', 1), '10.0.0.5'); // header missing behind a proxy: fall back, never trust less
});
