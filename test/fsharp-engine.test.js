import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { Glottis, makeRng, tractSections } from '../lib/pinktrombone.js';
import { renderScore } from '../lib/render.js';
import { shapeOf } from '../lib/tractshape.js';
import { plan } from '../lib/planner.js';
import { speak, VOICES } from '../lib/voices.js';
import { DEFAULT_FRAME, normalizeScore } from '../lib/score.js';

// Lesson 9 rebuilt the engine (`lib/pinktrombone.js`, `lib/render.js`, `lib/tractshape.js`) in F#.
// The demos still run on the JavaScript, so the two must agree. These tests compare the *compiled
// F#* with the JavaScript: the random numbers, the glottal pulse, the tract sections and shapes,
// and whole renders, sample by sample.
//
// The compiled files exist only after the F# build (see `fsharp/README.md`). Without it the tests
// skip; the `fsharp` workflow sets REQUIRE_CORE so a missing build is a failure there.
const dir = new URL('../core/src/', import.meta.url);
const files = ['03c-Planner.js', '05-Voices.js', '09a-Glottis.js', '09b-Tract.js', '09c-Render.js'];
const built = files.every((f) => existsSync(new URL(f, dir)));
if (!built && process.env.REQUIRE_CORE) throw new Error(`Error: core/src/ is missing one of ${files.join(', ')}`);
const skip = built ? false : 'core/ is not built: see fsharp/README.md';
const [plannerFs, voicesFs, glottalFs, tractFs, renderFs] = built ? await Promise.all(files.map((f) => import(new URL(f, dir).href))) : [];

const near = (a, b, what, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${what}: ${a} vs ${b}`);
const field = (key) => key[0].toUpperCase() + key.slice(1);

// A JavaScript frame as the plain object the F# reads (PascalCase fields).
const toFs = (frame) => Object.fromEntries(Object.keys(frame).map((key) => [field(key), frame[key]]));

const same = (compiled, js, what, eps = 1e-6) => {
  assert.equal(compiled.length, js.length, `${what}: length`);
  let worst = 0;
  for (let i = 0; i < js.length; i++) worst = Math.max(worst, Math.abs(compiled[i] - js[i]));
  assert.ok(worst < eps, `${what}: worst sample difference ${worst}`);
};

test('random numbers agree', { skip }, () => {
  for (const seed of [0, 1, 2, 42, 12345, 2 ** 31 + 5]) {
    const js = makeRng(seed), fs = glottalFs.makeRng(seed | 0);
    for (let i = 0; i < 500; i++) near(glottalFs.nextFloat(fs), js(), `seed ${seed} number ${i}`, 0);
  }
});

test('the glottal pulse agrees for every tenseness', { skip }, () => {
  for (let k = 0; k <= 20; k++) {
    const tenseness = k / 20;
    const g = new Glottis(44100, makeRng(1));
    g.tenseness = tenseness; g.setupWaveform();
    const lf = glottalFs.lfParameters(tenseness);
    near(lf.Te, g.lf.Te, `Te at ${tenseness}`);
    near(lf.Alpha, g.lf.alpha, `alpha at ${tenseness}`);
    for (let i = 0; i <= 50; i++) near(glottalFs.waveform(lf, i / 50), g.waveform(i / 50), `pulse at ${tenseness}, ${i / 50}`);
  }
});

test('tract sections agree', { skip }, () => {
  for (const rate of [8000, 16000, 22050, 44100, 48000, 96000]) {
    for (const cm of [3, 8.55, 9.5, 11.5, 14.2, 17.1, 19, 26]) assert.equal(tractFs.tractSections(rate, cm), tractSections(rate, cm), `${cm} cm at ${rate}`);
  }
});

test('shapes agree for the frames of a real phrase', { skip }, () => {
  const p = plan('ˈhɛloʊ ˈmaɪ ˈneɪm ɪz ˈkætʃ ˈθɪŋk');
  const js = normalizeScore(p.score).keyframes;
  assert.ok(js.length > 40);
  for (const frame of js) {
    const compiled = tractFs.shapeOf(44100, 17.1, toFs(frame));
    const expected = shapeOf(frame);
    assert.equal(compiled.Sections, expected.n);
    assert.equal(compiled.NoseLength, expected.noseLength);
    assert.equal(compiled.NoseStart, expected.noseStart);
    near(compiled.Velum, expected.velum, 'velum');
    expected.diameter.forEach((d, i) => near(compiled.Diameter[i], d, `diameter ${i} at ${frame.t}`));
    expected.noseDiameter.forEach((d, i) => near(compiled.NoseDiameter[i], d, `nose ${i}`));
    const pinches = Array.from(compiled.Pinches);
    assert.equal(pinches.length, expected.constrictions.length);
    pinches.forEach((c, i) => {
      near(c.Gap, expected.constrictions[i].diameter, 'gap');
      near(c.Position, expected.constrictions[i].position, 'position');
    });
  }
});

test('shapes agree for random frames, other lengths and other sample rates', { skip }, () => {
  let seed = 7;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let n = 0; n < 300; n++) {
    const frame = {
      ...DEFAULT_FRAME,
      tongueIndex: 12 + random() * 18, tongueDiameter: 2 + random() * 1.6, lips: random() * 1.6, velum: random() * 0.5,
      c0i: random() * 44, c0d: random() * 3.5, c0n: random(), c1i: random() * 44, c1d: random() * 3.5, c1n: random(),
    };
    const rate = [22050, 44100, 48000][n % 3], cm = [8.55, 14.2, 17.1, 19, 26][n % 5];
    const compiled = tractFs.shapeOf(rate, cm, toFs(frame));
    const expected = shapeOf(frame, { sampleRate: rate, tractLength: cm });
    expected.diameter.forEach((d, i) => near(compiled.Diameter[i], d, `random frame ${n} diameter ${i}`));
    expected.noseDiameter.forEach((d, i) => near(compiled.NoseDiameter[i], d, `random frame ${n} nose ${i}`));
  }
});

test('a vowel renders to the same samples', { skip }, () => {
  const text = 'ˈɑ';
  const compiled = renderFs.render(renderFs.defaultRenderOptions, plannerFs.plan(plannerFs.defaultPlanOptions, text).Score);
  same(compiled, renderScore(plan(text).score), 'ɑ');
});

test('consonants, nasals, trills and hiss render to the same samples', { skip }, () => {
  for (const text of ['ˈapa', 'ˈasa', 'ˈama ˈana', 'ˈara', 'ˈaʃa', 'ˈhɛloʊ ˈmaɪ ˈneɪm']) {
    const compiled = renderFs.render(renderFs.defaultRenderOptions, plannerFs.plan(plannerFs.defaultPlanOptions, text).Score);
    same(compiled, renderScore(plan(text).score), text);
  }
});

for (const v of VOICES) {
  test(`${v.label} renders to the same samples in F# and JavaScript`, { skip }, () => {
    const ipa = 'ˈhɛloʊ ˈwɜːld';
    const js = speak(ipa, v);
    const speech = voicesFs.speak(voicesFs.voiceById(v.id), ipa);
    const options = { ...renderFs.defaultRenderOptions, TractCm: speech.TractCm };
    same(renderFs.render(options, speech.Plan.Score), renderScore(js.score, { tractLength: js.tractLength }), v.id);
  });
}

test('other sample rates, seeds and gains render to the same samples', { skip }, () => {
  const text = 'ˈasa ˈma';
  const score = plannerFs.plan(plannerFs.defaultPlanOptions, text).Score;
  const jsScore = plan(text).score;
  for (const [sampleRate, seed, gain, tail] of [[22050, 1, 2, 0.15], [48000, 9, 2, 0.15], [44100, 3, 1, 0.3], [44100, 5, 4, 0]]) {
    const options = { ...renderFs.defaultRenderOptions, SampleRate: sampleRate, Seed: seed, Gain: gain, Tail: tail };
    same(renderFs.render(options, score), renderScore(jsScore, { sampleRate, seed, gain, tail }), `${sampleRate} Hz seed ${seed} gain ${gain}`);
  }
});

test('the level measures agree', { skip }, () => {
  const samples = renderFs.render(renderFs.defaultRenderOptions, plannerFs.plan(plannerFs.defaultPlanOptions, 'ˈɑ').Score);
  let p = 0, sum = 0;
  for (const s of samples) { p = Math.max(p, Math.abs(s)); sum += s * s; }
  near(renderFs.peak(samples), p, 'peak');
  near(renderFs.rms(samples, 0, samples.length), Math.sqrt(sum / samples.length), 'rms', 1e-9);
});
