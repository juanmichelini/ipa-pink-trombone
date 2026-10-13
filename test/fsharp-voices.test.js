import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { VOICES, voiceById, speak, whisperScore, formantScale } from '../lib/voices.js';

// Lesson 5 rebuilt `lib/voices.js` in F#. The demos still run on the JavaScript, so the two must
// agree: the presets, `speak` for every voice (keyframe by keyframe) and the formant ratio.
//
// The compiled files exist only after the F# build (see `fsharp/README.md`). Without it the tests
// skip; the `fsharp` workflow sets REQUIRE_CORE so a missing build is a failure there.
const dir = new URL('../core/src/', import.meta.url);
const built = existsSync(new URL('05-Voices.js', dir)) && existsSync(new URL('03c-Planner.js', dir));
if (!built && process.env.REQUIRE_CORE) throw new Error('Error: core/src/05-Voices.js was not built');
const skip = built ? false : 'core/ is not built: see fsharp/README.md';
const fs = built ? await import(new URL('05-Voices.js', dir).href) : null;

const field = (key) => key[0].toUpperCase() + key.slice(1);
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);

test('the presets match', { skip }, () => {
  const compiled = Array.from(fs.voices);
  assert.equal(compiled.length, VOICES.length);
  VOICES.forEach((v, i) => {
    const c = compiled[i];
    assert.equal(c.Id, v.id);
    assert.equal(c.Label, v.label);
    near(c.TractCm, v.tractCm, `${v.id} tract`);
    near(c.F0, v.f0, `${v.id} f0`);
    near(c.Tenseness, v.tenseness, `${v.id} tenseness`);
    near(c.VibratoDepth, v.vibratoDepth, `${v.id} vibrato depth`);
    near(c.VibratoRate, v.vibratoRate ?? 5.5, `${v.id} vibrato rate`);
    near(c.Jitter, v.jitter, `${v.id} jitter`);
    near(c.Range, v.range, `${v.id} range`);
    near(c.Declination, v.declination ?? 0.08, `${v.id} declination`);
    assert.equal(c.Whisper, Boolean(v.whisper), `${v.id} whisper`);
  });
  assert.equal(fs.voiceById('nobody'), undefined);
});

for (const v of VOICES) {
  test(`${v.label} says the same thing in F# and JavaScript`, { skip }, () => {
    for (const ipa of ['ˈhɛloʊ wɜːld', 'aːaː', 'ma˥˩ pʰa']) {
      const js = speak(ipa, v);
      const compiled = fs.speak(fs.voiceById(v.id), ipa);
      near(compiled.TractCm, js.tractLength, `${v.id} tract length`);
      const keys = Array.from(compiled.Plan.Score.Keyframes);
      assert.equal(keys.length, js.score.keyframes.length, `${v.id} ${ipa}: keyframes`);
      keys.forEach((k, i) => {
        const expected = js.score.keyframes[i];
        near(k.T, expected.t, `${v.id} ${ipa} keyframe ${i} time`);
        for (const key of Object.keys(expected).filter((x) => x !== 't')) near(k.Frame[field(key)], expected[key], `${v.id} ${ipa} keyframe ${i} ${key}`);
      });
      near(compiled.Plan.Duration, js.duration, `${v.id} ${ipa}: duration`);
    }
  });
}

test('tract length ratios agree', { skip }, () => {
  for (const cm of [8.55, 9.5, 11.5, 14.2, 17.1, 19, 26]) near(fs.formantScale(cm), formantScale(cm), `${cm} cm`);
});
