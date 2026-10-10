import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, format, unknownCharacters } from '../lib/ipa.js';
import { plan, markAt } from '../lib/planner.js';
import { renderScore, rms } from '../lib/render.js';
import { normalizeScore, frameAt } from '../lib/score.js';
import { VOWEL_SYMBOLS } from '../lib/vowels.js';
import { CONSONANT_SYMBOLS } from '../lib/consonants.js';
import { shapeOfSymbol } from '../lib/vowel-map.js';

const RATE = 44100;
const sound = (ipa, opts) => {
  const p = plan(ipa, opts);
  const out = renderScore(p.score, { sampleRate: RATE });
  return { p, samples: out.samples || out };
};

test('tokenizer reads marks, stress, ties and breaks', () => {
  const t = tokenize('ˈpʰiːt͡ʃ ã.ˌb');
  const segs = t.filter((x) => x.type !== 'break');
  assert.equal(segs[0].symbol, 'p'); assert.equal(segs[0].aspirated, true); assert.equal(segs[0].stress, 2);
  assert.equal(segs[1].symbol, 'i'); assert.equal(segs[1].long, true);
  assert.equal(segs[2].symbol, 't͡ʃ');
  assert.equal(segs[3].symbol, 'a'); assert.equal(segs[3].nasalized, true);
  assert.equal(segs[4].symbol, 'b'); assert.equal(segs[4].stress, 1);
  assert.deepEqual(t.filter((x) => x.type === 'break').map((x) => x.kind), ['word', 'syllable']);
});

test('affricates with and without the tie are the same segment; g is ɡ; ç stays one symbol', () => {
  assert.equal(tokenize('tʃ')[0].symbol, 't͡ʃ');
  assert.equal(tokenize('ʤ')[0].symbol, 'd͡ʒ');
  assert.equal(tokenize('g')[0].symbol, 'ɡ');
  assert.deepEqual(tokenize('ç').map((x) => x.symbol), ['ç']);
});

test('every vowel and consonant symbol tokenizes to itself', () => {
  for (const s of [...VOWEL_SYMBOLS, ...CONSONANT_SYMBOLS]) {
    const t = tokenize(s);
    assert.equal(t.length, 1, s);
    assert.equal(t[0].symbol, s);
  }
});

test('unknown characters are reported, not dropped silently, and never throw', () => {
  assert.deepEqual(unknownCharacters('a?b!'), ['?', '!']);
  assert.equal(format(tokenize('ˈhɛloʊ wɜːld')), 'ˈhɛloʊ wɜːld');
});

test('every symbol can be sounded in a sequence without breaking the engine', () => {
  const all = [...VOWEL_SYMBOLS, ...CONSONANT_SYMBOLS].join(' ');
  const { samples } = sound(all);
  assert.ok(samples.every(Number.isFinite));
  assert.ok(rms(samples) > 0.02);
});

test('marks are in order and cover each segment', () => {
  const p = plan('ˈhɛloʊ');
  assert.deepEqual(p.marks.map((m) => m.symbol), ['h', 'ɛ', 'l', 'o', 'ʊ']);
  for (let i = 1; i < p.marks.length; i++) assert.ok(p.marks[i].start >= p.marks[i - 1].start);
  assert.equal(markAt(p.marks, p.marks[2].start + 0.001).symbol, 'l');
});

test('coarticulation: the tongue moves from one vowel to the next across a bilabial', () => {
  const p = plan('ibu');
  const norm = normalizeScore(p.score);
  const [i, b, u] = p.marks;
  const before = frameAt(norm, i.end - 0.01).tongueIndex;
  const after = frameAt(norm, u.start + 0.12).tongueIndex;
  const during = frameAt(norm, (b.start + b.end) / 2).tongueIndex;
  assert.ok(Math.abs(before - shapeOfSymbol('i').tongueIndex) < 0.5);
  assert.ok(Math.abs(after - shapeOfSymbol('u').tongueIndex) < 1);
  assert.ok(during < before && during > after, 'mid-consonant the tongue is between the two vowels');
});

test('an utterance starting with a voiceless stop begins silent', () => {
  const { p, samples } = sound('paːt');
  assert.ok(rms(samples, 0, Math.floor(RATE * 0.06)) < 0.002);
  assert.ok(p.duration > 0.3);
});

test('long vowels are longer, stressed vowels higher', () => {
  const a = plan('ta'), b = plan('taː');
  assert.ok(b.duration > a.duration + 0.08);
  const stressed = normalizeScore(plan('ˈa', { declination: 0 }).score);
  const plain = normalizeScore(plan('a', { declination: 0 }).score);
  assert.ok(Math.max(...stressed.keyframes.map((k) => k.f0)) > Math.max(...plain.keyframes.map((k) => k.f0)));
});

test('pitch declines over the utterance', () => {
  const k = plan('a a a a a a', { declination: 0.2 }).score.keyframes.filter((x) => x.intensity > 0.9);
  assert.ok(k[k.length - 1].f0 < k[0].f0 * 0.9);
});
