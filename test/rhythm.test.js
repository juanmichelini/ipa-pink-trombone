import test from 'node:test';
import assert from 'node:assert/strict';
import { syllabify, describe, rhythmPlan, nPVI, vowelDurations, syllableDurations, segmentsOf } from '../lib/rhythm.js';
import { plan } from '../lib/planner.js';
import { renderScore, rms } from '../lib/render.js';
import { LANGUAGES } from '../lib/languages.js';

const SENTENCE = 'ðə ˈkæts ɑː ˈtʃeɪsɪŋ ðə ˈmaɪs ɪn ðə ˈɡɑːdən';
const run = (ipa, mode, extra = {}) => {
  const r = rhythmPlan(ipa, mode, extra);
  return { ...r, ...plan(ipa, { overrides: r.overrides }) };
};
const cv = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) / m; };

test('syllabification: maximal onsets, diphthongs, stress boundaries', () => {
  assert.equal(describe('ˈhɛloʊ'), 'ˈhɛ.loʊ');
  assert.equal(describe('əˈstɹɔŋ'), 'ə.ˈstɹɔŋ');
  assert.equal(describe('ˈsɪŋə'), 'ˈsɪŋ.ə');
  assert.equal(describe('ˈbɛɹi ˈkaza'), 'ˈbɛ.ɹi ˈka.za');
  assert.equal(describe('ˈtʃeɪsɪŋ'), 'ˈt͡ʃeɪ.sɪŋ');
  assert.equal(describe('pɑː.ɾa'), 'pɑː.ɾa');
});

test('every syllable has exactly one nucleus group and every vowel is in one', () => {
  const s = syllabify(SENTENCE);
  const vowels = segmentsOf(SENTENCE).map((x, i) => (x.type === 'vowel' ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(s.flatMap((x) => x.nucleus).sort((a, b) => a - b), vowels);
  for (const x of s) assert.ok(x.nucleus.length >= 1 && x.nucleus.length <= 2);
});

test('syllable-timed: syllables are nearly equal in length', () => {
  const r = run('ˈkasa ˈpero ˈnino ˈlibɾo', 'syllable');
  const d = syllableDurations(r.syllables, r.marks);
  assert.ok(cv(d) < 0.12, `cv ${cv(d).toFixed(2)}`);
});

test('stress-timed: the intervals between stressed syllables are nearly equal, whatever is between them', () => {
  const ipa = 'ˈkæts ˈtʃeɪs ˈmaɪs ˈkæts ɑː ˈtʃeɪsɪŋ ðə ˈmaɪs';
  const r = run(ipa, 'stress');
  const syl = r.syllables;
  const segs = segmentsOf(ipa);
  const starts = syl.filter((s) => s.stressed).map((s) => r.marks.find((m) => m.index === s.nucleus[0]).start);
  const gaps = starts.slice(1).map((t, i) => t - starts[i]);
  const first = gaps.slice(0, 3);   // monosyllabic feet
  const long = gaps[3];             // a foot with two extra syllables
  assert.ok(long < first[0] * 1.6, `a foot with extra syllables (${long.toFixed(2)}) is not much longer than a bare one (${first[0].toFixed(2)})`);
  assert.ok(segs.length > 0);
});

test('stress-timed rhythm is more uneven than syllable-timed rhythm (nPVI)', () => {
  const score = (mode) => { const r = run(SENTENCE, mode); return nPVI(syllableDurations(r.syllables, r.marks)); };
  const a = score('stress'), b = score('syllable');
  assert.ok(a > b + 15, `stress ${a.toFixed(0)} vs syllable ${b.toFixed(0)}`);
  assert.ok(a > 35 && b < 20);
});

test('unstressed vowels in a squeezed stress-timed syllable reduce toward schwa', () => {
  const r = run('ˈkæts ɑː ˈtʃeɪsɪŋ ðə ˈmaɪs', 'stress');
  const reduced = Object.values(r.overrides).filter((o) => o.symbol === 'ə').length;
  assert.ok(reduced >= 1);
  assert.ok(r.marks.some((m) => m.symbol === 'ə'));
  const none = rhythmPlan('ˈkæts ɑː ˈtʃeɪsɪŋ', 'syllable');
  assert.equal(Object.values(none.overrides).filter((o) => o.symbol).length, 0);
});

test('rhythm and rate compose; the output is finite and audible at every setting', () => {
  for (const mode of ['stress', 'syllable']) for (const rate of [0.6, 1, 2]) {
    const r = rhythmPlan(SENTENCE, mode);
    const p = plan(SENTENCE, { overrides: r.overrides, rate });
    const o = renderScore(p.score, { sampleRate: 44100 });
    const x = o.samples || o;
    assert.ok(x.every(Number.isFinite) && rms(x) > 0.02, `${mode} ${rate}`);
  }
  const slow = plan(SENTENCE, { overrides: rhythmPlan(SENTENCE, 'stress').overrides, rate: 1 }).duration;
  const fast = plan(SENTENCE, { overrides: rhythmPlan(SENTENCE, 'stress').overrides, rate: 2 }).duration;
  assert.ok(fast < slow * 0.8);
});

test('every language declares its rhythm class', () => {
  for (const l of LANGUAGES) assert.ok(l.rhythm === 'stress' || l.rhythm === 'syllable', l.code);
  assert.equal(LANGUAGES.find((l) => l.code === 'en').rhythm, 'stress');
  assert.equal(LANGUAGES.find((l) => l.code === 'es').rhythm, 'syllable');
});

test('the classic demonstration: extra syllables barely lengthen a stress-timed sentence, but do lengthen a syllable-timed one', () => {
  const dur = (ipa, mode) => run(ipa, mode).duration;
  const short = 'ˈkæts ˈtʃeɪs ˈmaɪs', long = 'ˈkæts ɑː ˈtʃeɪsɪŋ ðə ˈmaɪs';
  const stress = dur(long, 'stress') / dur(short, 'stress');
  const syllable = dur(long, 'syllable') / dur(short, 'syllable');
  assert.ok(stress < 1.3, `stress-timed grew by ${stress.toFixed(2)}`);
  assert.ok(syllable > 1.5, `syllable-timed grew by ${syllable.toFixed(2)}`);
});
