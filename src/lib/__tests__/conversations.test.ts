import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conversations, isUnread } from '../conversations';
import type { ConnectionRequest, IncomingRequest, Message } from '@/data/types';

const req = (id: string, personId: string, status: ConnectionRequest['status'], remote = true): ConnectionRequest => ({
  id, personId, status, remote, message: `hi from ${id}`, createdAt: 1, updatedAt: 2, respondAt: 0,
});
const msg = (id: string, from: Message['from'], at: number, demo?: boolean): Message => ({ id, from, at, text: `${id} text`, demo });
const demoIn = (id: string, state: IncomingRequest['state']): IncomingRequest => ({ id, name: `Demo ${id}`, role: '', status: 'student', field: 'finance', message: `request ${id}`, state });

const base = {
  requests: [req('a', 'pa', 'accepted'), req('b', 'pb', 'accepted'), req('p', 'pp', 'requested'), req('d', 'pd', 'declined'), req('x', 'blocked', 'accepted')],
  incoming: [demoIn('in1', 'accepted'), demoIn('in2', 'new')],
  messages: {
    a: [msg('a0', 'me', 10), msg('a1', 'them', 50)],
    b: [msg('b0', 'them', 10), msg('b1', 'me', 80)],
    x: [msg('x0', 'me', 10), msg('x1', 'them', 99)],
    in1: [msg('in1-0', 'them', 30)],
  },
  showDemo: true,
  blocked: ['blocked'],
  lastRead: {},
  nameOf: (id: string) => id.toUpperCase(),
};

test('only accepted, unblocked chats, newest first, with demo marked', () => {
  const out = conversations(base);
  assert.deepEqual(out.map((c) => c.id), ['b', 'a', 'in1']);
  assert.equal(out.find((c) => c.id === 'in1')?.demo, true);
  assert.equal(out.find((c) => c.id === 'a')?.demo, false);
});

test('own latest message is prefixed with "You: "', () => {
  const out = conversations(base);
  assert.equal(out.find((c) => c.id === 'b')?.preview, 'You: b1 text');
  assert.equal(out.find((c) => c.id === 'a')?.preview, 'a1 text');
});

test('demo chats hide when demo people are off', () => {
  assert.deepEqual(conversations({ ...base, showDemo: false }).map((c) => c.id), ['b', 'a']);
});

test('unread: their newer message counts until read; demo and the opening request never count', () => {
  assert.equal(conversations(base).find((c) => c.id === 'a')?.unread, true);
  assert.equal(conversations({ ...base, lastRead: { a: 50 } }).find((c) => c.id === 'a')?.unread, false);
  assert.equal(isUnread([msg('first', 'them', 10)]), false, 'the request itself is not unread');
  assert.equal(isUnread([msg('m', 'me', 1), msg('r', 'them', 9, true)], 0, false), false, 'demo auto-reply');
  assert.equal(isUnread([msg('m', 'them', 1), msg('r', 'me', 9)]), false, 'you replied last');
});
