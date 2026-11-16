import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASK_H, CONTROLS_H, railFit } from '../mapRail';

const KEY = 36 + 8; // one-line key plus gap

test('plenty of room: everything shows', () => {
  assert.deepEqual(railFit(400, KEY), { controls: true, key: true, ask: true });
  assert.deepEqual(railFit(CONTROLS_H + KEY + ASK_H, KEY), { controls: true, key: true, ask: true }, 'exact fit counts');
});

test('short phone at the middle stop: the assistant goes first, Recenter and Layers stay', () => {
  // iPhone SE-class: 618pt scene, sheet top at 309, header ~120, 12pt lift -> 177pt.
  assert.deepEqual(railFit(177, KEY), { controls: true, key: true, ask: false });
  // Same phone with the status pill under the chips (header ~168) -> 129pt: the key gives way to the controls.
  assert.deepEqual(railFit(129, KEY), { controls: true, key: false, ask: false });
});

test('hotspots off: the controls and assistant use the room the key would take', () => {
  assert.deepEqual(railFit(CONTROLS_H + ASK_H, 0), { controls: true, key: false, ask: true });
});

test('no room for the controls: only the key if it fits, never the assistant', () => {
  assert.deepEqual(railFit(60, KEY), { controls: false, key: true, ask: false });
  assert.deepEqual(railFit(20, KEY), { controls: false, key: false, ask: false });
});

test('a tall wrapped key (large text) is dropped before the controls', () => {
  assert.deepEqual(railFit(CONTROLS_H + 60, 100), { controls: true, key: false, ask: true });
});
