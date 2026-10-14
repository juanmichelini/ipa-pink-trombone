import test from 'node:test';
import assert from 'node:assert/strict';
import { CONSONANTS, CONSONANT_SYMBOLS, consonantBySymbol, consonantGesture, PLACES, MANNERS } from '../lib/consonants.js';
import { renderScore, rms } from '../lib/render.js';
import { bandEnergy } from '../lib/analysis.js';
import { normalizeScore } from '../lib/score.js';
import { shapeOfSymbol } from '../lib/vowel-map.js';

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
  assert.ok(rms(slice(m.samples, m.g.hold.start + 0.08, m.g.hold.end)) > 0.01);
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
  assert.ok(asp.g.score.duration > plain.g.score.duration + 0.02);
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

// ## Every place can hiss, and voicing is one dial
//
// Fricatives differ in place and in voicing and in nothing else, so a voiceless fricative has to be
// audible at every place, and voicing it must keep the hiss.
const FRICATIVE_PAIRS = [['ɸ', 'β'], ['f', 'v'], ['θ', 'ð'], ['s', 'z'], ['ʃ', 'ʒ'], ['ç', 'ʝ'], ['x', 'ɣ'], ['χ', 'ʁ']];
// Energy above the voice: the second difference removes the low end, where the voice lives.
const highEnergy = (samples) => {
  let sum = 0;
  for (let i = 2; i < samples.length; i++) { const d = samples[i] - 2 * samples[i - 1] + samples[i - 2]; sum += d * d; }
  return Math.sqrt(sum / samples.length);
};
const held = (symbol) => {
  const { g, samples } = play(symbol);
  return samples.slice(Math.floor((g.hold.start + 0.04) * RATE), Math.floor(g.hold.end * RATE));
};

test('a voiceless fricative is audible at every place, the lips included', () => {
  for (const [voiceless] of FRICATIVE_PAIRS) {
    assert.ok(highEnergy(held(voiceless)) > 0.001, `${voiceless} hisses`);
  }
});

test('voicing a fricative keeps its hiss', () => {
  for (const [voiceless, voiced] of FRICATIVE_PAIRS) {
    const ratio = highEnergy(held(voiced)) / highEnergy(held(voiceless));
    assert.ok(ratio > 0.6 && ratio < 1.4, `${voiced} keeps the hiss of ${voiceless} (ratio ${ratio.toFixed(2)})`);
  }
});

test('a tap pressed on its own is a flick, not a whole vowel around it', () => {
  const alone = consonantGesture(consonantBySymbol('ɾ'));
  const between = consonantGesture(consonantBySymbol('ɾ'), { carrier: { tongueIndex: 20, tongueDiameter: 3, lips: 1.5 } });
  const length = (g) => normalizeScore(g.score).duration;
  assert.ok(length(alone) < 0.15, `alone lasts ${length(alone).toFixed(3)} s`);
  assert.ok(length(between) > length(alone) + 0.1);
});

// In the recordings (`scripts/compare-consonants.mjs`) the voice under a voiced fricative sits within a
// few dB of its hiss either way: `z` and `ʒ` have a little more hiss than voice, `ð` and `ɣ` a little
// more voice. Neither is lost.
test('in a voiced fricative the voice and the hiss are within 20 dB of each other, as in speech', () => {
  for (const symbol of ['z', 'ʒ', 'ð', 'ʝ', 'β', 'ɣ']) {
    const { g, samples } = play(symbol, { carrier: null });
    const seg = samples.slice(Math.floor((g.hold.start + 0.05) * RATE), Math.floor(g.hold.end * RATE));
    const dB = 10 * Math.log10(bandEnergy(seg, RATE, 2000, 10000) / bandEnergy(seg, RATE, 80, 500));
    assert.ok(Math.abs(dB) < 20, `${symbol}: hiss is ${dB.toFixed(1)} dB over the voice`);
  }
});

// ## Levels measured against recordings
//
// These hold the model to what `scripts/compare-consonants.mjs` found in the Wikipedia IPA chart
// recordings. They state relationships and wide margins, not the recordings' exact numbers.
const CARRIER_A = shapeOfSymbol('a');
const dbRe = (x, ref) => 20 * Math.log10(x / ref);
const vowelRms = (r) => rms(slice(r.samples, 0.04, 0.1));

test('sibilants hiss far louder than the other places, where the jet has nothing to hit', () => {
  const loud = Math.min(highEnergy(held('s')), highEnergy(held('ʃ')));
  for (const quiet of ['ɸ', 'θ', 'ç', 'x', 'χ', 'ħ']) {
    assert.ok(highEnergy(held(quiet)) < loud / 3, `${quiet} is not as loud as the sibilants`);
  }
});

test('nasals, glides and laterals are quieter than the vowel next to them', () => {
  for (const symbol of ['m', 'n', 'ŋ', 'j', 'w', 'l', 'ɹ']) {
    const r = play(symbol, { carrier: CARRIER_A });
    const mid = (r.g.hold.start + r.g.hold.end) / 2;
    const level = dbRe(rms(slice(r.samples, mid - 0.03, mid + 0.03)), vowelRms(r));
    assert.ok(level < -8 && level > -40, `${symbol} is ${level.toFixed(1)} dB re the vowel`);
  }
});

test('the voice bar of a voiced stop is well under the vowel, wherever the closure is', () => {
  for (const symbol of ['b', 'd', 'ɡ', 'ɖ']) {
    const r = play(symbol, { carrier: CARRIER_A });
    const mid = (r.g.hold.start + r.g.hold.end) / 2;
    const level = dbRe(rms(slice(r.samples, mid - 0.015, mid + 0.015)), vowelRms(r));
    assert.ok(level < -12, `${symbol} murmurs at ${level.toFixed(1)} dB re the vowel`);
  }
});

test('a release is a burst of hiss of about the same size at every place', () => {
  const burst = (symbol) => {
    const r = play(symbol, { carrier: CARRIER_A });
    return highEnergy(slice(r.samples, r.g.hold.end, r.g.hold.end + 0.03));
  };
  const levels = ['p', 't', 'k', 'q'].map(burst);
  assert.ok(Math.max(...levels) / Math.min(...levels) < 12, `bursts range over ${levels.map((x) => x.toFixed(4)).join(', ')}`);
});
