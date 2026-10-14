import test from 'node:test';
import assert from 'node:assert/strict';
import { CONSONANTS, consonantBySymbol, consonantGesture } from '../lib/consonants.js';
import { betweenVowels } from '../lib/between.js';
import { shapeOfSymbol } from '../lib/vowel-map.js';
import { renderScore, rms } from '../lib/render.js';
import { bandEnergy } from '../lib/analysis.js';
import { frameAt, normalizeScore } from '../lib/score.js';

const RATE = 44100;
const carrier = shapeOfSymbol('a');

test('a C a C a: two consonants with the vowel shared between them', () => {
  for (const c of CONSONANTS) {
    const g = betweenVowels(c, { carrier });
    const times = g.score.keyframes.map((k) => k.t);
    assert.deepEqual([...times].sort((a, b) => a - b), times, `${c.symbol} keyframes in order`);
    const [first, second] = g.cores;
    assert.ok(first.start > 0.1 && first.end < second.start, `${c.symbol} consonants are apart`);
    assert.ok(second.start - first.end > 0.15, `${c.symbol} has a vowel between them`);
    assert.ok(g.score.duration > second.end + 0.1, `${c.symbol} ends on a vowel`);
    const last = g.score.keyframes.at(-1);
    assert.equal(last.intensity, 1, `${c.symbol} ends voiced`);
  }
});

test('both consonants are the same gesture', () => {
  const g = betweenVowels(consonantBySymbol('s'), { carrier });
  const one = consonantGesture(consonantBySymbol('s'), { carrier });
  const n = normalizeScore(g.score);
  const [a, b] = g.cores;
  const at = (core, k) => frameAt(n, core.start + k * (core.end - core.start));
  for (const k of [0.25, 0.5, 0.75]) {
    for (const key of ['c0i', 'c0d', 'c0n', 'intensity']) {
      assert.ok(Math.abs(at(a, k)[key] - at(b, k)[key]) < 1e-9, `${key} at ${k}`);
    }
  }
  assert.ok(Math.abs((b.end - b.start) - (one.core.end - one.core.start)) < 1e-9);
});

test('a gap closes in equal ratios, so the formants move across the whole transition', () => {
  const g = consonantGesture(consonantBySymbol('n'), { carrier });
  const n = normalizeScore(g.score);
  const t0 = g.core.start, t1 = g.hold.start;
  const gap = (u) => frameAt(n, t0 + (t1 - t0) * u).c0d;
  // Halfway through, a straight line would still be at about 1.5; equal ratios are well under 0.5.
  assert.ok(gap(0.5) < 0.5, `gap at the middle is ${gap(0.5).toFixed(2)}`);
  assert.ok(gap(0.25) < gap(0) && gap(0.5) < gap(0.25) && gap(0.75) < gap(0.5));
});

test('the voice is rolled off above a few kHz, as in speech', () => {
  const g = consonantGesture(consonantBySymbol('s'), { carrier });
  const x = renderScore({ keyframes: [g.score.keyframes[0], { ...g.score.keyframes[0], t: 0.5 }], duration: 0.5 });
  const low = bandEnergy(x, RATE, 500, 1500), high = bandEnergy(x, RATE, 6500, 8000);
  assert.ok(10 * Math.log10(high / low) < -35, `${(10 * Math.log10(high / low)).toFixed(1)} dB between 6.5-8 kHz and 0.5-1.5 kHz`);
  assert.ok(rms(x) > 0.02);
});

test('trills and taps flutter without popping at every beat', () => {
  for (const symbol of ['r', 'ʙ', 'ʀ', 'ɾ', 'ⱱ']) {
    const g = consonantGesture(consonantBySymbol(symbol), { carrier });
    assert.ok(g.score.keyframes.every((k) => k.c0d > 0.001), `${symbol} never seals completely`);
  }
});

test('through a shut or narrow gap the voice is tensed and carries some breath, in a vowel it does not', () => {
  const steady = (symbol) => consonantGesture(consonantBySymbol(symbol), { carrier }).steady;
  for (const symbol of ['m', 'n', 'l']) {
    const f = steady(symbol);
    assert.equal(f.tenseness, 1, `${symbol} is tensed`);
    assert.ok(f.aspiration > 0.3, `${symbol} has breath`);
  }
  const j = steady('j');
  assert.ok(j.tenseness < 0.7 && j.aspiration > 0, 'a glide keeps an ordinary voice, with some breath');
  const first = consonantGesture(consonantBySymbol('m'), { carrier }).score.keyframes[0];
  assert.ok(first.tenseness < 0.7 && first.aspiration === 0, 'the vowel around it is ordinary');
});

test('the burst of a coronal stop is not brighter than the recordings (about 3 kHz, not 5 to 6)', () => {
  // The release peels back along the blade, so the noise is made further from the lips than the closure was.
  for (const v of ['a', 'i']) {
    for (const symbol of ['d', 't']) {
      const g = betweenVowels(consonantBySymbol(symbol), { carrier: shapeOfSymbol(v) });
      const x = renderScore(g.score);
      const at = g.holds[0].end, seg = x.slice(Math.round(at * RATE), Math.round((at + 0.03) * RATE));
      const mid = bandEnergy(seg, RATE, 1500, 4500), high = bandEnergy(seg, RATE, 4500, 12000);
      assert.ok(mid > high, `${symbol} after ${v}: ${(10 * Math.log10(mid / high)).toFixed(1)} dB between the 1.5-4.5 and 4.5-12 kHz bands`);
    }
  }
});
