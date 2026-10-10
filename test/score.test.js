import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FRAME, normalizeScore, frameAt, frame } from '../lib/score.js';

test('normalizeScore carries unmentioned fields forward and sorts by time', () => {
  const n = normalizeScore({ keyframes: [{ t: 0.2, lips: 0.6 }, { t: 0, intensity: 1, f0: 200 }] });
  assert.equal(n.keyframes[0].t, 0);
  assert.equal(n.keyframes[1].f0, 200, 'f0 persists');
  assert.equal(n.keyframes[1].intensity, 1, 'intensity persists');
  assert.equal(n.keyframes[1].lips, 0.6);
  assert.equal(n.keyframes[0].lips, DEFAULT_FRAME.lips);
  assert.equal(n.duration, 0.2);
});

test('frameAt interpolates linearly and clamps outside the range', () => {
  const n = normalizeScore({ keyframes: [{ t: 0, tongueIndex: 10 }, { t: 1, tongueIndex: 20 }] });
  assert.equal(frameAt(n, -1).tongueIndex, 10);
  assert.equal(frameAt(n, 0.5).tongueIndex, 15);
  assert.equal(frameAt(n, 2).tongueIndex, 20);
});

test('frameAt finds the right segment among many keyframes', () => {
  const n = normalizeScore({ keyframes: [0, 1, 2, 3, 4].map((t) => ({ t, f0: 100 + t * 100 })) });
  assert.equal(frameAt(n, 2.5).f0, 350);
  assert.equal(frameAt(n, 3.9).f0, 490);
});

test('frame merges overrides over a base', () => {
  assert.equal(frame({ lips: 1 }).lips, 1);
  assert.equal(frame({ lips: 1 }).f0, DEFAULT_FRAME.f0);
});

test('an empty score still gives a usable frame', () => {
  assert.deepEqual(frameAt(normalizeScore({ keyframes: [] }), 0), { ...DEFAULT_FRAME });
});
