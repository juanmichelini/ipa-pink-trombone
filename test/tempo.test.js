import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, scaleForRate, TIMING, undershoot, syllableRate } from '../lib/planner.js';
import { renderScore, rms } from '../lib/render.js';
import { shapeOfSymbol } from '../lib/vowel-map.js';
import { normalizeScore, frameAt } from '../lib/score.js';

const PHRASE = 'ˈhɛloʊ ˈmaɪ ˈneɪm ɪz ˈkætʃ';
const time = (marks, type) => marks.filter((m) => m.type === type).reduce((a, m) => a + m.end - m.start, 0);

test('twice the rate is shorter, but less than twice as short (consonants resist)', () => {
  const slow = plan(PHRASE, { rate: 1 }), fast = plan(PHRASE, { rate: 2 });
  assert.ok(fast.duration < slow.duration * 0.8, 'faster is shorter');
  assert.ok(fast.duration > slow.duration * 0.5, 'but not simply halved');
});

test('vowels compress more than consonants', () => {
  const a = plan(PHRASE, { rate: 1 }), b = plan(PHRASE, { rate: 2 });
  const vRatio = time(b.marks, 'vowel') / time(a.marks, 'vowel');
  const cRatio = time(b.marks, 'consonant') / time(a.marks, 'consonant');
  assert.ok(vRatio < cRatio, `vowels ${vRatio.toFixed(2)} vs consonants ${cRatio.toFixed(2)}`);
});

test('rate scaling is monotonic', () => {
  let last = Infinity;
  for (const r of [0.5, 0.75, 1, 1.5, 2, 3]) {
    const d = plan(PHRASE, { rate: r }).duration;
    assert.ok(d < last, `rate ${r}`);
    last = d;
  }
});

test('undershoot: short vowels fall short of their target, long ones do not', () => {
  const target = shapeOfSymbol('i');
  const full = undershoot(target, 0.2), short = undershoot(target, 0.04);
  assert.deepEqual(full, target);
  assert.ok(Math.abs(short.tongueIndex - target.tongueIndex) > 1, 'moved toward neutral');
  const fast = normalizeScore(plan('ti', { rate: 3.5 }).score);
  const slow = normalizeScore(plan('ti', { rate: 1 }).score);
  const reach = (n) => Math.max(...n.keyframes.map((k) => k.tongueIndex));
  assert.ok(reach(fast) < reach(slow), 'the fast /i/ is less front');
});

test('every rate from slow to very fast renders finite audible sound', () => {
  for (const r of [0.3, 0.6, 1, 2, 3, 4]) {
    const o = renderScore(plan(PHRASE, { rate: r }).score, { sampleRate: 44100 });
    const x = o.samples || o;
    assert.ok(x.every(Number.isFinite), `rate ${r}`);
    assert.ok(rms(x) > 0.02, `rate ${r}`);
  }
});

test('even at high rate a voiceless stop keeps a silent closure of at least 30 ms', () => {
  const p = plan('apa', { rate: 3 });
  const n = normalizeScore(p.score);
  const c = p.marks.find((m) => m.symbol === 'p');
  let silent = 0, last = null;
  for (let t = c.start; t < c.end; t += 0.002) {
    const f = frameAt(n, t);
    if (f.intensity < 0.05 && f.c0d < 0.01) silent += 0.002;
    last = f;
  }
  assert.ok(silent >= 0.03, `closure ${(silent * 1000).toFixed(0)} ms`);
  assert.ok(last);
});

test('syllable rate rises with the rate setting', () => {
  const r = (x) => { const p = plan(PHRASE, { rate: x }); return syllableRate(p.marks, p.duration); };
  assert.ok(r(2) > r(1) * 1.4);
  assert.ok(r(1) > 2 && r(1) < 7, `${r(1)} syllables per second at rate 1`);
  assert.equal(scaleForRate(TIMING, 1).vowel, TIMING.vowel);
});

import { scaleTime } from '../lib/score.js';
test('scaleTime stretches every keyframe uniformly', () => {
  const s = plan('ta').score, h = scaleTime(s, 0.5);
  assert.equal(h.keyframes.length, s.keyframes.length);
  assert.ok(Math.abs(h.duration - s.duration / 2) < 1e-9);
  assert.ok(h.keyframes.every((k, i) => Math.abs(k.t - s.keyframes[i].t / 2) < 1e-9));
});
