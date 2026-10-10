import test from 'node:test';
import assert from 'node:assert/strict';
import { CONSONANTS, CONSONANT_SYMBOLS, consonantBySymbol, consonantGesture, PLACES, MANNERS } from '../lib/consonants.js';
import { renderScore, rms } from '../lib/render.js';
import { bandEnergy } from '../lib/analysis.js';
import { normalizeScore } from '../lib/score.js';

const RATE = 44100;
const play = (symbol, opts) => {
  const g = consonantGesture(consonantBySymbol(symbol), opts);
  const out = renderScore(g.score, { sampleRate: RATE });
  return { g, samples: out.samples || out };
};
const slice = (s, t0, t1) => s.slice(Math.floor(t0 * RATE), Math.floor(t1 * RATE));

test('symbols are unique and every place and manner is known', () => {
  assert.equal(new Set(CONSONANT_SYMBOLS).size, CONSONANT_SYMBOLS.length);
  const places = new Set([...PLACES.map((p) => p.id), 'alveolo-palatal', 'labial-velar', 'labial-palatal']);
  for (const c of CONSONANTS) {
    assert.ok(places.has(c.place), c.symbol);
    assert.ok(MANNERS.includes(c.manner) || c.manner === 'affricate', c.symbol);
  }
});

test('every consonant renders finite, audible, bounded sound', () => {
  for (const c of CONSONANTS) {
    const { samples } = play(c.symbol, { carrier: { tongueIndex: 20, tongueDiameter: 3, lips: 1.5 } });
    assert.ok(samples.every(Number.isFinite), c.symbol);
    assert.ok(rms(samples) > 0.005, `${c.symbol} is silent`);
    assert.ok(samples.every((x) => Math.abs(x) <= 1.0001), `${c.symbol} clips`);
  }
});

test('a voiceless stop is silent during closure, a voiced one murmurs', () => {
  const p = play('p', { carrier: { tongueIndex: 20, tongueDiameter: 3, lips: 1.5 } });
  const b = play('b', { carrier: { tongueIndex: 20, tongueDiameter: 3, lips: 1.5 } });
  const { start, end } = p.g.hold;
  const mid = (a, g) => rms(slice(a, g.hold.start + 0.02, g.hold.end - 0.005));
  assert.ok(mid(p.samples, p.g) < 0.003, 'p closure should be silent');
  assert.ok(mid(b.samples, b.g) > 3 * mid(p.samples, p.g), 'b has a voice bar');
  assert.ok(end > start);
});

test('fricative hiss lives at high frequencies and s is higher than sh', () => {
  const s = play('s'), sh = play('ʃ');
  const seg = (r) => slice(r.samples, r.g.hold.start + 0.08, r.g.hold.end);
  const hi = (r) => bandEnergy(seg(r), RATE, 4000, 10000) / (bandEnergy(seg(r), RATE, 100, 1500) + 1e-12);
  assert.ok(hi(s) > 1, 's is mostly high-frequency');
  assert.ok(hi(s) > hi(sh), 's has relatively more high energy than sh');
});

test('a nasal radiates sound through the nose with the mouth closed', () => {
  const m = play('m');
  const frame = normalizeScore(m.g.score).keyframes.find((k) => k.t >= m.g.hold.start + 0.01);
  assert.ok(frame.velum > 0.3 && frame.c0d < 0.01);
  assert.ok(rms(slice(m.samples, m.g.hold.start + 0.08, m.g.hold.end)) > 0.02);
});

test('a trill modulates the amplitude over the hold', () => {
  const r = play('r');
  const seg = slice(r.samples, r.g.hold.start + 0.05, r.g.hold.end);
  const w = Math.floor(RATE * 0.005), env = [];
  for (let i = 0; i + w < seg.length; i += w) env.push(rms(seg, i, i + w));
  const mean = env.reduce((a, b) => a + b, 0) / env.length;
  const sd = Math.sqrt(env.reduce((a, b) => a + (b - mean) ** 2, 0) / env.length);
  assert.ok(sd / mean > 0.15, `trill envelope too flat: ${sd / mean}`);
});

test('aspirated stops have a longer voice onset time', () => {
  const plain = play('t', { carrier: { tongueIndex: 20, tongueDiameter: 3, lips: 1.5 } });
  const asp = play('t', { carrier: { tongueIndex: 20, tongueDiameter: 3, lips: 1.5 }, aspirated: true });
  assert.ok(asp.g.score.duration > plain.g.score.duration + 0.03);
});

import { cellSymbols, extraSymbols } from '../lib/ui/consonanttable.js';
import { demos } from '../lib/demos.js';
import { existsSync } from 'node:fs';

test('every consonant has a button, in the grid or in the extras', () => {
  const inGrid = new Set();
  for (const m of MANNERS) for (const p of PLACES) for (const s of cellSymbols(m, p.id)) inGrid.add(s);
  for (const s of extraSymbols()) inGrid.add(s);
  for (const c of CONSONANTS) assert.ok(inGrid.has(c.symbol), c.symbol);
});

test('a live demo has its page', () => {
  for (const d of demos.filter((x) => x.status === 'live')) assert.ok(existsSync(`demos/${d.slug}/index.html`) && existsSync(`demos/${d.slug}/main.js`), d.slug);
});
