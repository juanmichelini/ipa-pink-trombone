import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { plan } from '../lib/planner.js';
import { scaleTime, normalizeScore, frameAt } from '../lib/score.js';

// Lesson 6 compares two ways of going fast. The demo (`demos/06-tempo/main.js`) builds them in
// JavaScript; here the compiled F# versions are checked against exactly that construction.
//
// The compiled files exist only after the F# build (see `fsharp/README.md`). Without it the tests
// skip; the `fsharp` workflow sets REQUIRE_CORE so a missing build is a failure there.
const dir = new URL('../core/src/', import.meta.url);
const built = existsSync(new URL('06-Tempo.js', dir));
if (!built && process.env.REQUIRE_CORE) throw new Error('Error: core/src/06-Tempo.js was not built');
const skip = built ? false : 'core/ is not built: see fsharp/README.md';
const fs = built ? await import(new URL('06-Tempo.js', dir).href) : null;

const field = (key) => key[0].toUpperCase() + key.slice(1);
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);

// The demo's own construction of the naive utterance.
function naive(text, r) {
  const base = plan(text);
  const score = scaleTime(base.score, 1 / r);
  return { ...base, score, duration: score.duration, marks: base.marks.map((x) => ({ ...x, start: x.start / r, end: x.end / r })) };
}

function samePlan(compiled, js, what) {
  const marks = Array.from(compiled.Marks);
  assert.equal(marks.length, js.marks.length, `${what}: mark count`);
  marks.forEach((m, i) => {
    assert.equal(m.Symbol, js.marks[i].symbol, `${what}: mark ${i}`);
    near(m.Start, js.marks[i].start, `${what}: mark ${i} start`);
    near(m.End, js.marks[i].end, `${what}: mark ${i} end`);
  });
  const keys = Array.from(compiled.Score.Keyframes);
  assert.equal(keys.length, js.score.keyframes.length, `${what}: keyframe count`);
  keys.forEach((k, i) => {
    const expected = js.score.keyframes[i];
    near(k.T, expected.t, `${what}: keyframe ${i} time`);
    for (const key of Object.keys(expected).filter((x) => x !== 't')) near(k.Frame[field(key)], expected[key], `${what}: keyframe ${i} ${key}`);
  });
  near(compiled.Duration, js.duration, `${what}: duration`);
}

const phrases = ['ˈhɛloʊ ˈmaɪ ˈneɪm ɪz ˈkætʃ', 'apa', 'ti', 'ˈbanana ʃa'];
const rates = [0.4, 1, 2, 3.5];

test('the speech-like way is the planner at that rate', { skip }, () => {
  for (const text of phrases) for (const r of rates) samePlan(fs.speechLike(r, text), plan(text, { rate: r }), `${text} at ${r}`);
});

test('the naive way is the demo\'s naive utterance', { skip }, () => {
  for (const text of phrases) for (const r of rates) samePlan(fs.naive(r, text), naive(text, r), `${text} at ${r}`);
});

test('the squeeze ratios and the silent closure agree', { skip }, () => {
  // A union case with no fields is built from its tag: `Naive` is 0 and `SpeechLike` is 1.
  const ways = [[new fs.Way(0, []), (t, r) => naive(t, r)], [new fs.Way(1, []), (t, r) => plan(t, { rate: r })]];
  const time = (marks, type) => marks.filter((m) => m.type === type).reduce((a, m) => a + m.end - m.start, 0);
  for (const [way, js] of ways) {
    for (const text of phrases) {
      for (const r of rates) {
        const normal = js(text, 1);
        const fast = js(text, r);
        const s = fs.squeeze(way, r, text);
        near(s.Whole, fast.duration / normal.duration, `${way.name} ${text} at ${r}: whole`);
        near(s.Vowels, time(fast.marks, 'vowel') / time(normal.marks, 'vowel'), `${way.name} ${text} at ${r}: vowels`);
        near(s.Consonants, time(fast.marks, 'consonant') / time(normal.marks, 'consonant'), `${way.name} ${text} at ${r}: consonants`);
      }
    }
  }

  const closure = (p, symbol) => {
    const n = normalizeScore(p.score);
    const c = p.marks.find((m) => m.symbol === symbol);
    let silent = 0;
    for (let k = 0; c.start + k * 0.002 < c.end; k++) {
      const f = frameAt(n, c.start + k * 0.002);
      if (f.intensity < 0.05 && f.c0d < 0.02) silent += 0.002;
    }
    return silent;
  };
  for (const r of rates) {
    near(fs.silentClosure('p', fs.speechLike(r, 'apa')), closure(plan('apa', { rate: r }), 'p'), `speech-like closure at ${r}`);
    near(fs.silentClosure('p', fs.naive(r, 'apa')), closure(naive('apa', r), 'p'), `naive closure at ${r}`);
  }
});
