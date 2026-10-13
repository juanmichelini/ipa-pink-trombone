import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { CONSONANTS, consonantGesture } from '../lib/consonants.js';
import { frameAt, normalizeScore, scaleTime } from '../lib/score.js';

// Lesson 2 rebuilt `lib/consonants.js` and `lib/score.js` in F#. The demos still run on the
// JavaScript, so the two must agree. These tests compare the *compiled F#* with the JavaScript,
// number for number, for every consonant under several sets of options. If someone changes one
// side only, this is where it shows.
//
// The compiled files exist only after the F# build (see `fsharp/README.md`). Without it the tests
// skip; the `fsharp` workflow sets REQUIRE_CORE so a missing build is a failure there.
const dir = new URL('../core/src/', import.meta.url);
const built = existsSync(new URL('02a-Score.js', dir)) && existsSync(new URL('02b-Consonants.js', dir));
if (!built && process.env.REQUIRE_CORE) throw new Error('Error: core/src/02a-Score.js or 02b-Consonants.js was not built');
const fs = built ? await import(new URL('02b-Consonants.js', dir).href) : null;
const fsScore = built ? await import(new URL('02a-Score.js', dir).href) : null;
const skip = built ? false : 'core/ is not built: see fsharp/README.md';

// F# fields are PascalCase: tongueIndex is TongueIndex, c0mHz is C0mHz, f0 is F0.
const field = (key) => key[0].toUpperCase() + key.slice(1);
const squash = (text) => text.toLowerCase().replace(/[^a-z]/g, '');
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);

function sameFrame(js, compiled, what) {
  const keys = Object.keys(js).filter((k) => k !== 't');
  assert.equal(Object.keys(compiled).length, keys.length, `${what}: same number of fields`);
  for (const key of keys) near(compiled[field(key)], js[key], `${what} ${key}`);
}

const vowelI = { tongueIndex: 27.5, tongueDiameter: 2.05, lips: 1.5 };
const cases = [
  ['on its own', {}],
  ['around an i', { carrier: vowelI }],
  ['aspirated', { carrier: vowelI, aspirated: true }],
  ['held for 0.2 s', { carrier: vowelI, holdFor: 0.2 }],
  ['at running speed', { carrier: vowelI, transitionScale: 0.5 }],
  ['at 220 Hz, alone', { f0: 220 }],
];

// A carrier is an F# function `Frame -> Frame`. Fable may compile `carrierOf a b c = fun frame -> ...`
// as one four-argument function or as a three-argument one that returns a function, so handle both.
function compiledCarrier({ tongueIndex, tongueDiameter, lips }) {
  return fs.carrierOf.length >= 4
    ? (frame) => fs.carrierOf(tongueIndex, tongueDiameter, lips, frame)
    : fs.carrierOf(tongueIndex, tongueDiameter, lips);
}

function compiledOptions(o) {
  return {
    Pitch: o.f0 ?? 130,
    Carrier: o.carrier ? compiledCarrier(o.carrier) : undefined,
    Aspirated: o.aspirated ?? false,
    HoldFor: o.holdFor,
    TransitionScale: o.transitionScale ?? 1,
  };
}

test('the F# inventory is the JavaScript inventory', { skip }, () => {
  const compiled = Array.from(fs.consonants);
  assert.equal(compiled.length, CONSONANTS.length);
  for (const [i, c] of CONSONANTS.entries()) {
    assert.equal(compiled[i].Symbol, c.symbol);
    assert.equal(squash(compiled[i].Place.name), squash(c.place), c.symbol);
    assert.equal(squash(compiled[i].Manner.name), squash(c.manner), c.symbol);
    assert.equal(compiled[i].Voiced, c.voiced, c.symbol);
  }
});

for (const [name, options] of cases) {
  test(`every consonant's gesture matches the JavaScript: ${name}`, { skip }, () => {
    const o = compiledOptions(options);
    for (const c of CONSONANTS) {
      const js = consonantGesture(c, options);
      const g = fs.gestureWith(o, fs.bySymbol(c.symbol));
      const what = `/${c.symbol}/ ${name}`;
      const keys = Array.from(g.Score.Keyframes);
      assert.equal(keys.length, js.score.keyframes.length, `${what}: keyframe count`);
      keys.forEach((k, i) => {
        near(k.T, js.score.keyframes[i].t, `${what} key ${i} time`);
        sameFrame(js.score.keyframes[i], k.Frame, `${what} key ${i}`);
      });
      near(g.Score.Duration, js.score.duration, `${what} duration`);
      assert.equal(g.Kind.name.toLowerCase(), js.kind, `${what} kind`);
      near(g.Core.Start, js.core.start, `${what} core start`);
      near(g.Core.End, js.core.end, `${what} core end`);
      if (js.hold) {
        near(g.Hold.Start, js.hold.start, `${what} hold start`);
        near(g.Hold.End, js.hold.end, `${what} hold end`);
        sameFrame(js.steady, g.Steady, `${what} steady`);
      } else {
        assert.equal(g.Hold, undefined, `${what} has no hold`);
        assert.equal(g.Steady, undefined, `${what} has no steady frame`);
      }
    }
  });
}

test('frameAt and scaleTime agree with score.js on real gestures', { skip }, () => {
  for (const symbol of ['p', 's', 'm', 'r', 't͡ʃ', 'ɾ', 'w']) {
    const js = consonantGesture(CONSONANTS.find((c) => c.symbol === symbol), { carrier: vowelI });
    const g = fs.gestureWith(compiledOptions({ carrier: vowelI }), fs.bySymbol(symbol));
    const normalized = normalizeScore(js.score);
    const end = js.score.duration;
    for (let i = -2; i <= 40; i++) {
      const t = (end * i) / 37;
      sameFrame(frameAt(normalized, t), fsScore.frameAt(g.Score.Keyframes, t), `/${symbol}/ at ${t.toFixed(3)}`);
    }
    const slow = fsScore.scaleTime(2.5, g.Score);
    const jsSlow = scaleTime(js.score, 2.5);
    near(slow.Duration, jsSlow.duration, `/${symbol}/ scaled duration`);
    Array.from(slow.Keyframes).forEach((k, i) => near(k.T, jsSlow.keyframes[i].t, `/${symbol}/ scaled key ${i}`));
  }
});

test('identify reads the held shape of a consonant back as that consonant', { skip }, () => {
  const held = Array.from(fs.held);
  assert.equal(held.length, 71);
  for (const [c, frame] of held) {
    const [found, distance] = fs.identify(frame);
    assert.equal(found.Symbol, c.Symbol);
    assert.equal(distance, 0);
  }
});
