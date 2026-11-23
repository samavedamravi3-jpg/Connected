import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withDevHost } from '../assistantUrl';

test('dev: a private-LAN assistant URL follows the Metro host', () => {
  assert.equal(withDevHost('http://192.168.86.34:8787/assistant', '10.106.1.0:8081', true), 'http://10.106.1.0:8787/assistant');
});

test('left alone: release builds, public URLs, tunnels, missing host', () => {
  assert.equal(withDevHost('http://192.168.86.34:8787/assistant', '10.106.1.0:8081', false), 'http://192.168.86.34:8787/assistant');
  assert.equal(withDevHost('https://api.example.com/assistant', '10.106.1.0:8081', true), 'https://api.example.com/assistant');
  assert.equal(withDevHost('http://192.168.86.34:8787/assistant', 'abc-anonymous-8081.exp.direct', true), 'http://192.168.86.34:8787/assistant');
  assert.equal(withDevHost('http://192.168.86.34:8787/assistant', undefined, true), 'http://192.168.86.34:8787/assistant');
  assert.equal(withDevHost(undefined, '10.106.1.0:8081', true), undefined);
});
