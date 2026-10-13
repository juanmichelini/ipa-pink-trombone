import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { VOWEL_SYMBOLS } from '../lib/vowels.js';
import { CONSONANT_SYMBOLS } from '../lib/consonants.js';
import { plan } from '../lib/planner.js';
import { syllabify, describe, rhythmPlan, nPVI, vowelDurations, syllableDurations } from '../lib/rhythm.js';

// Lesson 7 rebuilt `lib/rhythm.js` in F#. The JavaScript builds syllables by changing objects as it
// walks the segments; the F# folds over an immutable state. They must still give the same
// syllables, durations and planner overrides, for hand-picked phrases and hundreds of random ones.
//
// The compiled files exist only after the F# build (see `fsharp/README.md`). Without it the tests
// skip; the `fsharp` workflow sets REQUIRE_CORE so a missing build is a failure there.
const dir = new URL('../core/src/', import.meta.url);
const files = ['03c-Planner.js', '04b-Languages.js', '07-Rhythm.js'];
const built = files.every((f) => existsSync(new URL(f, dir)));
if (!built && process.env.REQUIRE_CORE) throw new Error(`Error: core/src/ is missing one of ${files.join(', ')}`);
const skip = built ? false : 'core/ is not built: see fsharp/README.md';
const [planner, languages, fs] = built ? await Promise.all(files.map((f) => import(new URL(f, dir).href))) : [];
// The F# list type comes from Fable's own library; the test needs it to hand a list to `nPVI`.
let ofArray = null;
if (built) {
  const modules = new URL('../core/fable_modules/', import.meta.url);
  const library = readdirSync(modules).find((d) => d.startsWith('fable-library'));
  ({ ofArray } = await import(new URL(`${library}/List.js`, modules).href));
}
// The rhythm class of a language is how a mode is spelled in F#.
const MODES = built ? { stress: languages.languageByCode('en').Rhythm, syllable: languages.languageByCode('es').Rhythm } : {};

const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9 || (Number.isNaN(a) && Number.isNaN(b)), `${what}: ${a} vs ${b}`);

const phrases = [
  'ðə ˈkæts ɑː ˈtʃeɪsɪŋ ðə ˈmaɪs ɪn ðə ˈɡɑːdən', 'ˈkasa ˈpero ˈnino ˈlibɾo', 'ˈkæts ˈtʃeɪs ˈmaɪs', 'ˈkæts ɑː ˈtʃeɪsɪŋ ðə ˈmaɪs',
  'ˈhɛloʊ', 'əˈstɹɔŋ', 'ˈsɪŋə', 'ˈbɛɹi ˈkaza', 'ˈtʃeɪsɪŋ', 'pɑː.ɾa', 'el ˈɡato ˈkome pesˈkado', 'ʒə sɥi dɑ̃ la mɛˈzɔ̃',
  'ə ˈbjuːtɪfəl ˌɑːftəˈnuːn', 'la ˈbɛlla ˈvita', 'ma˥˩ ni˧ ta', 'a|ba‖ɡi', 'ˈkstɹa ˈsplɪt ˈstɹɔŋ', 'ˈa a ˈa', 'ˌaˈa', 'b', '', 'a?b',
];

test('syllables agree: segments, nucleus, stress, word and consonant count', { skip }, () => {
  for (const text of phrases) {
    const js = syllabify(text);
    const compiled = Array.from(fs.syllabify(text));
    assert.equal(compiled.length, js.length, `${text}: syllable count`);
    js.forEach((s, i) => {
      const c = compiled[i];
      assert.deepEqual(Array.from(c.Segments), s.segments, `${text}: syllable ${i} segments`);
      assert.deepEqual(Array.from(c.Nucleus), s.nucleus, `${text}: syllable ${i} nucleus`);
      assert.equal(c.Stressed, s.stressed, `${text}: syllable ${i} stressed`);
      assert.equal(c.Secondary, s.secondary, `${text}: syllable ${i} secondary`);
      assert.equal(c.Word, s.word, `${text}: syllable ${i} word`);
      assert.equal(c.Consonants, s.consonants, `${text}: syllable ${i} consonants`);
    });
    assert.equal(fs.describe(text), describe(text), `describe ${text}`);
  }
});

function sameRhythm(text, mode, options, what) {
  const js = rhythmPlan(text, mode, options);
  const compiled = fs.rhythmPlan(MODES[mode], { Beat: options.beat, ReduceBelow: options.reduceBelow }, text);
  const durations = Array.from(compiled.Durations);
  assert.equal(durations.length, js.durations.length, `${what}: duration count`);
  durations.forEach((d, i) => near(d, js.durations[i], `${what}: duration ${i}`));
  const overrides = new Map(Array.from(compiled.Overrides));
  assert.deepEqual([...overrides.keys()].sort((a, b) => a - b), Object.keys(js.overrides).map(Number).sort((a, b) => a - b), `${what}: overridden segments`);
  for (const [k, o] of Object.entries(js.overrides)) {
    const c = overrides.get(Number(k));
    assert.equal(c.Symbol, o.symbol, `${what}: override ${k} symbol`);
    if (o.seconds === undefined) assert.equal(c.Seconds, undefined, `${what}: override ${k} seconds`); else near(c.Seconds, o.seconds, `${what}: override ${k} seconds`);
    if (o.scale === undefined) assert.equal(c.Scale, undefined, `${what}: override ${k} scale`); else near(c.Scale, o.scale, `${what}: override ${k} scale`);
  }
  return { js, compiled };
}

for (const mode of ['stress', 'syllable']) {
  test(`${mode}-timed durations and planner overrides agree`, { skip }, () => {
    for (const text of phrases) {
      sameRhythm(text, mode, {}, `${text} / ${mode}`);
      sameRhythm(text, mode, { beat: 0.3, reduceBelow: 0.1 }, `${text} / ${mode} / beat 0.3`);
    }
  });
}

test('the rhythm measures agree', { skip }, () => {
  for (const text of phrases.filter(Boolean)) {
    for (const mode of ['stress', 'syllable']) {
      const r = rhythmPlan(text, mode);
      const p = plan(text, { overrides: r.overrides });
      const cr = fs.rhythmPlan(MODES[mode], { Beat: undefined, ReduceBelow: undefined }, text);
      const cp = planner.plan({ ...planner.defaultPlanOptions, Overrides: cr.Overrides }, text);
      // The same plan, number for number: the overrides did their job in both.
      near(cp.Duration, p.duration, `${text}/${mode}: duration of the rhythmic plan`);
      near(fs.nPVI(fs.syllableDurations(cr.Syllables, cp.Marks)), nPVI(syllableDurations(r.syllables, p.marks)), `${text}/${mode}: nPVI of syllables`);
      const a = Array.from(fs.vowelDurations(cp.Marks));
      const b = vowelDurations(p.marks);
      assert.equal(a.length, b.length, `${text}/${mode}: vowel intervals`);
      a.forEach((x, i) => near(x, b[i], `${text}/${mode}: vowel interval ${i}`));
    }
  }
});

test('nPVI agrees on small lists', { skip }, () => {
  for (const list of [[], [0.1], [0.1, 0.1], [0.05, 0.15, 0.05, 0.15], [0.1, 0.2, 0.3], [0.09, 0.31, 0.12, 0.4, 0.07]]) near(fs.nPVI(ofArray(list)), nPVI(list), JSON.stringify(list));
});

test('six hundred random phrases agree on syllables, durations and overrides', { skip }, () => {
  const alphabet = [...VOWEL_SYMBOLS, ...CONSONANT_SYMBOLS, ' ', '.', '|', 'ˈ', 'ˌ', 'ː', ' ', 'ɪ', 'ʊ', 'ə', 's', 't', 'k', 'l'];
  let seed = 99;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let k = 0; k < 600; k++) {
    let text = '';
    const length = 1 + Math.floor(rnd() * 12);
    for (let i = 0; i < length; i++) text += alphabet[Math.floor(rnd() * alphabet.length)];
    const js = syllabify(text);
    const compiled = Array.from(fs.syllabify(text));
    assert.equal(compiled.length, js.length, `${JSON.stringify(text)}: syllable count`);
    js.forEach((s, i) => {
      assert.deepEqual(Array.from(compiled[i].Segments), s.segments, `${JSON.stringify(text)}: syllable ${i}`);
      assert.deepEqual(Array.from(compiled[i].Nucleus), s.nucleus, `${JSON.stringify(text)}: nucleus ${i}`);
    });
    assert.equal(fs.describe(text), describe(text), JSON.stringify(text));
    for (const mode of ['stress', 'syllable']) sameRhythm(text, mode, {}, `${JSON.stringify(text)} / ${mode}`);
  }
});
