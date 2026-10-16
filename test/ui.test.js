import test from 'node:test';
import assert from 'node:assert/strict';
import { toPixels, fromPixels, nearestVowel, interpret, symbolPlacement, CHART } from '../lib/ui/vowelchart.js';
import { tractGeometry, centerline } from '../lib/ui/tractview.js';
import { shapeOf } from '../lib/tractshape.js';
import { vowelShape, vowelFrame } from '../lib/vowel-map.js';
import { VOWELS } from '../lib/vowels.js';

test('chart pixel conversions are inverses', () => {
  const { px, py } = toPixels(0.3, 0.7);
  const { x, y } = fromPixels(px, py);
  assert.ok(Math.abs(x - 0.3) < 1e-9 && Math.abs(y - 0.7) < 1e-9);
  assert.ok(px > CHART.x0 && py > CHART.y0);
});

test('pressing on a symbol snaps to that vowel, rounding included', () => {
  for (const v of VOWELS) {
    const p = symbolPlacement(v);
    const hit = interpret(p.textX, p.py);
    assert.equal(hit.symbol, v.symbol, `${v.symbol} should be hit by its own label`);
    assert.equal(hit.rounded, v.rounded ? 1 : 0);
  }
});

test('pressing in empty space gives a free position inside the chart', () => {
  const far = interpret(CHART.x0 + 200, CHART.y0 + 20);
  assert.equal(far.snapped, false);
  assert.ok(far.b >= 0 && far.b <= 1 && far.h >= 0 && far.h <= 1);
  const outside = interpret(-50, 500);
  assert.ok(outside.b >= 0 && outside.b <= 1 && outside.h === 1);
  assert.equal(nearestVowel(-100, -100), null);
});

test('the centre line is continuous and starts at the glottis end', () => {
  const a = centerline(0), b = centerline(300), c = centerline(700);
  assert.ok(a.y > b.y && b.y > c.y - 1, 'the path climbs and then levels off');
  let last = centerline(0);
  for (let s = 5; s <= 700; s += 5) {
    const p = centerline(s);
    assert.ok(Math.hypot(p.x - last.x, p.y - last.y) < 8, `jump at s=${s}`);
    last = p;
  }
});

test('tract geometry is finite and follows the diameters', () => {
  const wide = tractGeometry(shapeOf({ tongueIndex: 14, tongueDiameter: 3.4 }));
  const narrow = tractGeometry(shapeOf({ tongueIndex: 27, tongueDiameter: 2.05 }));
  for (const g of [wide, narrow]) {
    for (const p of [...g.outer, ...g.inner, ...g.noseTop, ...g.noseBottom]) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    assert.equal(g.outer.length, g.inner.length);
  }
  const gap = (g, i) => Math.hypot(g.outer[i].x - g.inner[i].x, g.outer[i].y - g.inner[i].y);
  const iTop = 27 + 1;
  assert.ok(gap(narrow, iTop) < gap(wide, iTop), 'a tall tongue narrows the passage at the palate');
});

test('an open velum widens the nasal connector', () => {
  const shut = tractGeometry(shapeOf({ velum: 0.01 }));
  const open = tractGeometry(shapeOf({ velum: 0.4 }));
  assert.ok(open.connector.width > 10 * shut.connector.width);
});

test('shapeOf copies, so later shapes do not change earlier ones', () => {
  const a = shapeOf(vowelFrame(vowelShape(0, 0)));
  const keep = a.diameter[30];
  shapeOf(vowelFrame(vowelShape(1, 1)));
  assert.equal(a.diameter[30], keep);
  assert.equal(a.n, 44);
});

import { cordsPose, lipPose, velumFlap, tongueBody, TOOTH_FROM_END } from '../lib/ui/tractview.js';
import { consonantGesture, consonantBySymbol } from '../lib/consonants.js';
import { normalizeScore, frameAt } from '../lib/score.js';

const holdFrame = (symbol) => {
  const g = consonantGesture(consonantBySymbol(symbol), { carrier: { tongueIndex: 20, tongueDiameter: 3, lips: 1.5 } });
  return frameAt(normalizeScore(g.score), (g.hold.start + g.hold.end) / 2);
};

test('vocal cords: p keeps them open, b vibrates them, h breathes, the glottal stop presses them shut', () => {
  const state = (s) => cordsPose(shapeOf(holdFrame(s)).source);
  assert.equal(state('p').state, 'open');
  assert.equal(state('b').state, 'voiced');
  assert.ok(state('p').gap > 0.7 && state('b').gap < 0.5);
  assert.equal(state('h').state, 'breath');
  assert.equal(state('ʔ').state, 'closed');
  assert.equal(cordsPose({ intensity: 1 }, 0).vibrating, true);
});

test('lips: closed for p, pouting for u, spread for i; soft palate lowers for m', () => {
  const lips = (f) => lipPose(shapeOf(f));
  assert.ok(lips(holdFrame('p')).opening < 1);
  assert.ok(lips(vowelFrame(vowelShape(1, 0, 1))).protrusion > lips(vowelFrame(vowelShape(0, 0, 0))).protrusion);
  assert.ok(velumFlap(shapeOf(holdFrame('m'))).angle > velumFlap(shapeOf(holdFrame('p'))).angle + 0.5);
});

test('the tongue body sits below its upper surface and follows it', () => {
  const g = tractGeometry(shapeOf({ tongueIndex: 20, tongueDiameter: 2.5 }));
  const body = tongueBody(g);
  assert.equal(body.top.length, body.bottom.length);
  assert.ok(body.bottom.every((p, i) => Math.hypot(p.x - body.top[i].x, p.y - body.top[i].y) > 4));
});

test('the tongue ends in a rounded tip that starts and ends on the body, for any jaw and lips', () => {
  for (const frame of [{ tongueIndex: 20, tongueDiameter: 2.5, lips: 1.5 }, { tongueIndex: 14, tongueDiameter: 3.5, lips: 3.2 }, { tongueIndex: 27, tongueDiameter: 2.05, lips: 0.2 }]) {
    const body = tongueBody(tractGeometry(shapeOf(frame)));
    assert.ok(body.cap.length >= 5);
    const end = body.top.length - 1;
    const width = Math.hypot(body.top[end].x - body.bottom[end].x, body.top[end].y - body.bottom[end].y);
    assert.ok(width > 12, `blunt tip: ${width}`);
    // every point of the cap is on a circle round the middle of the tip
    const mx = (body.top[end].x + body.bottom[end].x) / 2, my = (body.top[end].y + body.bottom[end].y) / 2;
    for (const p of body.cap) assert.ok(Math.abs(Math.hypot(p.x - mx, p.y - my) - width / 2) < 1e-6);
  }
});

test('for a tongue-tip closure the tongue body reaches the ridge and the jaw stays at the lip opening', () => {
  const t = shapeOf({ tongueIndex: 20, tongueDiameter: 3, lips: 1.5, c0i: 39, c0d: 0, c0n: 0 });
  const g = tractGeometry(t);
  const rest = tractGeometry(shapeOf({ tongueIndex: 20, tongueDiameter: 3, lips: 1.5 }));
  assert.ok(g.tongue.to > rest.tongue.to, 'the body is carried forward by the tip');
  const body = tongueBody(g);
  assert.ok(g.tongue.to >= 40, 'at least as far as the ridge (section 39)');
  assert.ok(body.top.some((p) => Math.hypot(p.x - g.outer[40].x, p.y - g.outer[40].y) < 1), 'and its top touches the palate there');
  assert.deepEqual(g.jaw.slice(g.jawFrom).map((p) => [p.x, p.y]), rest.jaw.slice(rest.jawFrom).map((p) => [p.x, p.y]), 'the jaw line did not move');
});

test('the tongue can never pass the teeth, for any frame the continuous space can make', () => {
  let seed = 3;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let n = 0; n < 400; n++) {
    const frame = { tongueIndex: 12 + random() * 18, tongueDiameter: 2 + random() * 1.6, lips: random() * 3.4, c0i: 13 + random() * 31, c0d: random() * 3, c0n: random(), c1i: 13 + random() * 31, c1d: random() * 3, c1n: random() };
    const g = tractGeometry(shapeOf(frame));
    const body = tongueBody(g);
    const last = g.inner.length - 1, tooth = g.outer[last - TOOTH_FROM_END];
    // The path runs left to right along the mouth: the tooth's back face is 7 pixels behind its centre.
    const farthest = Math.max(...body.top.concat(body.cap, body.bottom).map((p) => p.x));
    assert.ok(farthest < tooth.x - 7, `frame ${n}: tongue reaches x=${farthest.toFixed(1)}, tooth back face at ${tooth.x - 7}`);
  }
});

test('f and ɱ draw the lower lip against the teeth, m draws it against the upper lip', async () => {
  const { consonantBySymbol, consonantGesture } = await import('../lib/consonants.js');
  const { frameAt, normalizeScore } = await import('../lib/score.js');
  const shapeFor = (symbol) => {
    const g = consonantGesture(consonantBySymbol(symbol), { carrier: null });
    const mid = (g.hold.start + g.hold.end) / 2;
    return shapeOf(frameAt(normalizeScore(g.score), mid));
  };
  const lowest = (shape) => {
    const floor = shape.floor, last = shape.n - 1;
    let at = last;
    for (let i = last; i >= last - TOOTH_FROM_END; i--) if (floor[i] < floor[at] - 0.05) at = i;
    return at;
  };
  assert.equal(lowest(shapeFor('m')), shapeFor('m').n - 1, 'm closes at the lips');
  assert.ok(lowest(shapeFor('ɱ')) < shapeFor('ɱ').n - 1, 'ɱ closes behind the lips, at the teeth');
  assert.ok(lowest(shapeFor('f')) < shapeFor('f').n - 1, 'f closes at the teeth');
});

// Pressing and sliding on a picture must never select the text near it (labels, the page).
test('the instruments cannot be selected by pressing and sliding on them', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../css/site.css', import.meta.url), 'utf8');
  for (const selector of ['.place-axis', 'svg.vowel-chart', 'button']) {
    const rule = css.split('\n').find((line) => line.trimStart().startsWith(selector + ' {') && /user-select: none/.test(line));
    assert.ok(rule, `${selector} has user-select: none`);
  }
  assert.match(css, /\.place-axis text \{[^}]*user-select: none/);
});
