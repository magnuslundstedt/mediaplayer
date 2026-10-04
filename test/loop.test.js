import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_LOOP,
  clampLoop,
  withStart,
  withEnd,
  nudge,
  crossed,
  formatTime,
  nextLoopName,
} from '../js/loop.js';

const D = 200;

test('clampLoop keeps a valid loop and its other fields', () => {
  assert.deepEqual(clampLoop({ id: 'a', name: 'x', start: 10, end: 20 }, D), {
    id: 'a',
    name: 'x',
    start: 10,
    end: 20,
  });
});

test('clampLoop pulls a loop back inside the track', () => {
  assert.deepEqual(clampLoop({ start: -5, end: 250 }, D), { start: 0, end: D });
});

test('clampLoop enforces the minimum length', () => {
  const loop = clampLoop({ start: 10, end: 10.1 }, D);
  assert.equal(loop.end - loop.start, MIN_LOOP);
});

test('clampLoop enforces the minimum length at the end of the track', () => {
  assert.deepEqual(clampLoop({ start: D, end: D }, D), { start: D - MIN_LOOP, end: D });
});

test('clampLoop rounds away float noise', () => {
  assert.deepEqual(clampLoop({ start: 0.1 + 0.2, end: 42.300000000000004 }, D), { start: 0.3, end: 42.3 });
});

test('withStart moves the start and keeps the end', () => {
  assert.deepEqual(withStart({ start: 10, end: 20 }, 12, D), { start: 12, end: 20 });
});

test('withStart past the end releases the end to the end of the track', () => {
  assert.deepEqual(withStart({ start: 10, end: 20 }, 30, D), { start: 30, end: D });
});

test('withEnd moves the end and keeps the start', () => {
  assert.deepEqual(withEnd({ start: 10, end: 20 }, 18, D), { start: 10, end: 18 });
});

test('withEnd before the start releases the start to the beginning', () => {
  assert.deepEqual(withEnd({ start: 10, end: 20 }, 5, D), { start: 0, end: 5 });
});

test('nudge moves one edge only', () => {
  assert.deepEqual(nudge({ start: 10, end: 20 }, 'start', 0.1, D), { start: 10.1, end: 20 });
  assert.deepEqual(nudge({ start: 10, end: 20 }, 'end', -1, D), { start: 10, end: 19 });
});

test('nudge stops at the track bounds', () => {
  assert.deepEqual(nudge({ start: 0.05, end: 20 }, 'start', -1, D), { start: 0, end: 20 });
  assert.deepEqual(nudge({ start: 10, end: D - 0.05 }, 'end', 1, D), { start: 10, end: D });
});

test('nudge cannot push one edge through the other', () => {
  assert.deepEqual(nudge({ start: 10, end: 11 }, 'start', 1, D), { start: 10.5, end: 11 });
  assert.deepEqual(nudge({ start: 10, end: 11 }, 'end', -1, D), { start: 10, end: 10.5 });
});

test('repeated 0.1 nudges do not drift', () => {
  let loop = { start: 10, end: 20 };
  for (let i = 0; i < 10; i++) loop = nudge(loop, 'start', 0.1, D);
  assert.equal(loop.start, 11);
});

test('crossed is true only when playback moves across the end', () => {
  assert.equal(crossed(19.9, 20.0, 20), true);
  assert.equal(crossed(19.9, 20.2, 20), true);
  assert.equal(crossed(19.8, 19.9, 20), false);
  // Already past the end, e.g. after a seek beyond the loop.
  assert.equal(crossed(25, 25.1, 20), false);
  // Wrapped back to the start.
  assert.equal(crossed(20.1, 10, 20), false);
});

test('formatTime', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(59.9), '0:59');
  assert.equal(formatTime(60), '1:00');
  assert.equal(formatTime(225.4), '3:45');
  assert.equal(formatTime(42.3, true), '0:42.3');
  assert.equal(formatTime(102.3, true), '1:42.3');
  assert.equal(formatTime(5.04, true), '0:05.0');
  assert.equal(formatTime(59.99, true), '0:59.9');
  assert.equal(formatTime(NaN), '0:00');
  assert.equal(formatTime(-3, true), '0:00.0');
});

test('nextLoopName counts past the highest default name', () => {
  assert.equal(nextLoopName([]), 'Loop 1');
  assert.equal(nextLoopName([{ name: 'Loop 1' }, { name: 'chorus' }]), 'Loop 2');
  assert.equal(nextLoopName([{ name: 'Loop 3' }, { name: 'Loop 1' }]), 'Loop 4');
});
