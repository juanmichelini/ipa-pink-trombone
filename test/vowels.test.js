import test from 'node:test';
import assert from 'node:assert/strict';
import { VOWELS, VOWEL_SYMBOLS, vowelBySymbol, chartPosition, fromChart, blendAnchors, jawOpening } from '../lib/vowels.js';
import { vowelShape, shapeOfSymbol, vowelFrame, vowelSequence, cursorAt } from '../lib/vowel-map.js';
import { FIT } from '../lib/vowel-fit.js';
import { formants, bandEnergy } from '../lib/analysis.js';
import { renderScore, peak } from '../lib/render.js';

const F = (symbol) => formants(shapeOfSymbol(symbol), { count: 3 });

test('the inventory has 28 vowels with unique symbols and sane coordinates', () => {
  assert.equal(VOWELS.length, 28);
  assert.equal(new Set(VOWEL_SYMBOLS).size, 28);
  for (const v of VOWELS) {
    assert.ok(v.b >= 0 && v.b <= 1 && v.h >= 0 && v.h <= 1, v.symbol);
    assert.ok(v.f1 > 150 && v.f1 < 1000 && v.f2 > v.f1 && v.f2 < 3000, v.symbol);
  }
});

test('chart geometry round-trips and is a trapezoid', () => {
  for (const [b, h] of [[0, 0], [1, 0], [0.5, 0.5], [1, 1], [0, 1]]) {
    const { x, y } = chartPosition(b, h);
    const back = fromChart(x, y);
    assert.ok(Math.abs(back.b - b) < 1e-9 && Math.abs(back.h - h) < 1e-9);
  }
  assert.equal(chartPosition(0, 1).x, 0.5, 'open front vowels sit mid-chart: the front edge slants');
  assert.equal(chartPosition(1, 1).x, 1);
});

test('blending returns an anchor exactly and stays inside the anchor range', () => {
  const a = FIT.anchors[3];
  const at = blendAnchors(FIT.anchors, a.b, a.h, ['tongueIndex', 'tongueDiameter']);
  assert.equal(at.tongueIndex, a.tongueIndex);
  const mid = blendAnchors(FIT.anchors, 0.3, 0.4, ['tongueIndex']);
  const idx = FIT.anchors.map((x) => x.tongueIndex);
  assert.ok(mid.tongueIndex >= Math.min(...idx) && mid.tongueIndex <= Math.max(...idx));
});

test('every vowel lands near its reference formants', () => {
  const failures = [];
  for (const v of VOWELS) {
    const [f1, f2] = F(v.symbol);
    const e1 = Math.abs(f1 / v.f1 - 1), e2 = Math.abs(f2 / v.f2 - 1);
    if (e1 > 0.16 || e2 > 0.25) failures.push(`${v.symbol}: got ${Math.round(f1)}/${Math.round(f2)}, want ${v.f1}/${v.f2}`);
  }
  assert.deepEqual(failures, []);
});

test('the sixteen cardinal vowels are tighter: within 10% on F1 and 25% on F2', () => {
  for (const s of ['i', 'e', 'ɛ', 'a', 'ɑ', 'ɔ', 'o', 'u', 'y', 'ø', 'œ', 'ɶ', 'ʌ', 'ɤ', 'ɯ']) {
    const v = vowelBySymbol(s);
    const [f1, f2] = F(s);
    assert.ok(Math.abs(f1 / v.f1 - 1) < 0.1, `${s} F1 ${Math.round(f1)} vs ${v.f1}`);
    assert.ok(Math.abs(f2 / v.f2 - 1) < 0.25, `${s} F2 ${Math.round(f2)} vs ${v.f2}`);
  }
});

test('F1 follows height and F2 follows backness', () => {
  assert.ok(F('i')[0] < F('e')[0] && F('e')[0] < F('ɛ')[0] && F('ɛ')[0] < F('a')[0], 'front column: F1 rises as the mouth opens');
  assert.ok(F('u')[0] < F('o')[0] && F('o')[0] < F('ɔ')[0], 'back rounded column: F1 rises');
  assert.ok(F('i')[1] > F('ɨ')[1] && F('ɨ')[1] > F('ɯ')[1] && F('ɯ')[1] > F('u')[1], 'close row: F2 falls front to back');
  assert.ok(F('a')[1] > F('ɑ')[1], 'open row: F2 falls front to back');
  const lowest = [...VOWEL_SYMBOLS].sort((x, y) => F(x)[0] - F(y)[0])[0];
  assert.ok(['i', 'y', 'ɨ', 'ʉ', 'u'].includes(lowest), `lowest F1 should be a close vowel, got ${lowest}`);
});

test('rounding lowers F2 for every rounded/unrounded pair on the same chart spot', () => {
  let pairs = 0;
  for (const r of VOWELS.filter((v) => v.rounded)) {
    const u = VOWELS.find((v) => !v.rounded && v.b === r.b && v.h === r.h);
    if (!u) continue;
    pairs++;
    assert.ok(F(r.symbol)[1] < F(u.symbol)[1], `${r.symbol} should have a lower F2 than ${u.symbol}`);
  }
  assert.ok(pairs >= 10, `expected many pairs, found ${pairs}`);
});

test('between the symbols the chart is smooth: F1 rises with height, F2 falls with backness', () => {
  const steps = [0, 0.25, 0.5, 0.75, 1];
  for (const b of steps) {
    const f1 = steps.map((h) => formants(vowelShape(b, h, 0), { count: 2 })[0]);
    for (let i = 1; i < f1.length; i++) assert.ok(f1[i] > f1[i - 1], `b=${b}: F1 should rise with height ${f1.map(Math.round)}`);
  }
  for (const h of steps) {
    const f2 = steps.map((b) => formants(vowelShape(b, h, 0), { count: 2 })[1]);
    for (let i = 1; i < f2.length; i++) assert.ok(f2[i] < f2[i - 1], `h=${h}: F2 should fall with backness ${f2.map(Math.round)}`);
  }
});

test('rounding is a continuous control: half rounded sits between', () => {
  const f = (r) => formants(vowelShape(0, 0, r), { count: 2 })[1];
  assert.ok(f(0) > f(0.5) && f(0.5) > f(1));
});

test('the jaw opens with height', () => {
  assert.equal(jawOpening(0), 1.5);
  assert.ok(jawOpening(1) > jawOpening(0.5));
});

test('heard end to end: rendered [i] and [u] differ in the spectrum the way they should', () => {
  const render = (s) => renderScore({ keyframes: [{ t: 0, ...vowelFrame(shapeOfSymbol(s), { f0: 110 }) }], duration: 0.6 });
  const i = render('i'), u = render('u');
  assert.ok(peak(i) > 0.02 && peak(u) > 0.02, 'both audible');
  const ratio = (x) => bandEnergy(x, 44100, 1800, 3200) / bandEnergy(x, 44100, 100, 900);
  assert.ok(ratio(i) > 8 * ratio(u), `[i] should have far more high-F2 energy: ${ratio(i)} vs ${ratio(u)}`);
});

test('vowelSequence builds a playable, ordered score with cursor marks', () => {
  const seq = vowelSequence(['i', 'a', 'u'], { hold: 0.3, glide: 0.1 });
  assert.equal(seq.marks.length, 3);
  assert.ok(Math.abs(seq.duration - (0.3 * 3 + 0.1 * 2)) < 1e-9);
  const times = seq.keyframes.map((k) => k.t);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.equal(cursorAt(seq, 0.1).symbol, 'i');
  assert.equal(cursorAt(seq, 0.4 + 0.3 + 0.05).symbol, 'a');
  const mid = cursorAt(seq, 0.3 + 0.05);
  assert.ok(mid.h > 0 && mid.h < 1, 'glides between vowels');
  assert.throws(() => vowelSequence(['i', 'ʘ']), /unknown vowel/);
  const out = renderScore(seq);
  assert.ok(out.every(Number.isFinite) && peak(out) > 0.02);
});
