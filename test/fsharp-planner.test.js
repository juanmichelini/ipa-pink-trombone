import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { VOWELS, VOWEL_SYMBOLS } from '../lib/vowels.js';
import { CONSONANT_SYMBOLS } from '../lib/consonants.js';
import { tokenize, format, unknownCharacters } from '../lib/ipa.js';
import { shapeOfSymbol, vowelShape, vowelFrame } from '../lib/vowel-map.js';
import { plan, markAt, scaleForRate, undershoot, TIMING } from '../lib/planner.js';

// Lesson 3 rebuilt the vowel shapes (`lib/vowel-map.js`), the tokenizer (`lib/ipa.js`) and the
// planner (`lib/planner.js`) in F#. The demos still run on the JavaScript, so the two must agree.
// These tests compare the *compiled F#* with the JavaScript: every vowel, a grid of the chart,
// a few hundred random strings through the tokenizer, and whole plans, keyframe by keyframe.
//
// The compiled files exist only after the F# build (see `fsharp/README.md`). Without it the tests
// skip; the `fsharp` workflow sets REQUIRE_CORE so a missing build is a failure there.
const dir = new URL('../core/src/', import.meta.url);
const files = ['03a-VowelShape.js', '03b-Ipa.js', '03c-Planner.js'];
const built = files.every((f) => existsSync(new URL(f, dir)));
if (!built && process.env.REQUIRE_CORE) throw new Error(`Error: core/src/ is missing one of ${files.join(', ')}`);
const skip = built ? false : 'core/ is not built: see fsharp/README.md';
const [shapeFs, ipaFs, plannerFs] = built ? await Promise.all(files.map((f) => import(new URL(f, dir).href))) : [];
// The F# list type comes from Fable's own library; the test needs it to hand a list to the planner.
let ofArray = null;
if (built) {
  const modules = new URL('../core/fable_modules/', import.meta.url);
  const library = readdirSync(modules).find((d) => d.startsWith('fable-library'));
  ({ ofArray } = await import(new URL(`${library}/List.js`, modules).href));
}

const field = (key) => key[0].toUpperCase() + key.slice(1);
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);
const nearShape = (compiled, js, what) => {
  near(compiled.TongueIndex, js.tongueIndex, `${what} tongueIndex`);
  near(compiled.TongueDiameter, js.tongueDiameter, `${what} tongueDiameter`);
  near(compiled.Lips, js.lips, `${what} lips`);
};

test('every vowel has the same shape in F# as in JavaScript', { skip }, () => {
  for (const v of VOWELS) nearShape(shapeFs.shapeOfSymbol(v.symbol), shapeOfSymbol(v.symbol), `/${v.symbol}/`);
  assert.equal(shapeFs.shapeOfSymbol('x'), undefined);
});

test('the whole chart agrees, rounded or not', { skip }, () => {
  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      for (const r of [0, 0.5, 1]) nearShape(shapeFs.vowelShape(i / 10, j / 10, r), vowelShape(i / 10, j / 10, r), `b=${i / 10} h=${j / 10} r=${r}`);
    }
  }
  for (const [b, h] of [[0.123, 0.456], [0.5, 0.77], [0.91, 0.04], [0.33, 0.33]]) nearShape(shapeFs.vowelShape(b, h, 0.3), vowelShape(b, h, 0.3), `${b},${h}`);
});

test('a vowel frame has the same twenty numbers', { skip }, () => {
  const js = vowelFrame(shapeOfSymbol('ɛ'), { f0: 150, tenseness: 0.7 });
  const compiled = shapeFs.vowelFrame(150, 0.7, shapeFs.shapeOfSymbol('ɛ'));
  const keys = Object.keys(js);
  assert.equal(Object.keys(compiled).length, keys.length);
  for (const key of keys) near(compiled[field(key)], js[key], key);
});

// ## The tokenizer
//
// A compiled token is a union: `Sound` of a segment, `Break` of a kind of break, or `Unknown`.
// Turn it into the shape the JavaScript tokenizer produces, so the two can be compared directly.
function project(t) {
  if (t.name === 'Sound') {
    const s = t.fields[0];
    return {
      type: s.Kind.name.toLowerCase(), symbol: s.Symbol, long: s.Long, half: s.Half, aspirated: s.Aspirated, nasalized: s.Nasalized,
      voicing: s.Voicing === undefined ? null : s.Voicing, stress: s.Stress, tone: s.Tone === undefined ? undefined : Array.from(s.Tone),
    };
  }
  if (t.name === 'Break') {
    const b = t.fields[0];
    const kind = b.name.toLowerCase();
    return kind === 'pause' ? { type: 'break', kind, seconds: b.fields[0] } : { type: 'break', kind };
  }
  return { type: 'unknown', text: t.fields[0] };
}
// JSON drops `undefined`, so a missing tone and an undefined one are the same. The JavaScript
// tokenizer also writes a tone onto an unknown character it follows; that is lost by `format`
// anyway, so it is not compared.
const plain = (tokens) => JSON.parse(JSON.stringify(tokens.map((t) => (t.type === 'unknown' ? { type: 'unknown', text: t.text } : t))));

const phrases = [
  'ˈhɛloʊ wɜːld', 'ibu', 'aba', 'paːt', 'ˈpʰiːt͡ʃ ã.ˌb', 'ma˥˩ ni˧ ta˩˥', 'sɔ̥ ʃa|ba‖ɡi', 'bˈanana', 'tʰa ʔa ɾa r̥a',
  'a?b!', 'tʃaʤ ʧ ts t͡s dʒ', 'ʊŋ˥ kʰaː˧˥', 'ɛ̃ õ ũ ĩ ẽ', 'ɚ ɝ ɫ g', '˥', '?˥ a', 'mˈiːˌt', 'a̬ː b̥ˑ',
];

test('the tokenizer agrees on hand-picked phrases', { skip }, () => {
  for (const text of phrases) {
    assert.deepEqual(plain(Array.from(ipaFs.tokenize(text)).map(project)), plain(tokenize(text)), text);
    assert.equal(ipaFs.format(ipaFs.tokenize(text)), format(tokenize(text)), `format ${text}`);
  }
  assert.deepEqual(Array.from(ipaFs.unknownCharacters('a?b!')), unknownCharacters('a?b!'));
});

test('the tokenizer agrees on four thousand random strings', { skip }, () => {
  const alphabet = [...VOWEL_SYMBOLS, ...CONSONANT_SYMBOLS, 'ː', 'ˑ', 'ʰ', '̃', '̥', '̬', 'ˈ', 'ˌ', ' ', '.', '|', '‖', '˥', '˦', '˧', '˨', '˩', 'g', 'ɫ', 'ɚ', 'ʧ', 'tʃ', 'ts', '?', 'x1', 'ã'];
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let k = 0; k < 4000; k++) {
    let text = '';
    const length = 1 + Math.floor(rnd() * 8);
    for (let i = 0; i < length; i++) text += alphabet[Math.floor(rnd() * alphabet.length)];
    assert.deepEqual(plain(Array.from(ipaFs.tokenize(text)).map(project)), plain(tokenize(text)), JSON.stringify(text));
    assert.equal(ipaFs.format(ipaFs.tokenize(text)), format(tokenize(text)), `format ${JSON.stringify(text)}`);
  }
});

// ## The planner
const optionSets = [
  ['defaults', {}],
  ['twice as fast', { rate: 2 }],
  ['slow and high', { rate: 0.5, f0: 200 }],
  ['flat voice', { declination: 0, range: 0.5 }],
  ['custom timing', { timing: { vowel: 0.2, endFade: 0.3, wordGap: 0.1 } }],
  ['rhythm overrides', { overrides: { 1: { seconds: 0.3, symbol: 'u' }, 2: { scale: 2 }, 4: { seconds: 0.08 } } }],
  ['a wobbly voice', { vibratoDepth: 0.1, jitter: 0.2, tenseness: 0.8 }],
];

function compiledOptions(o) {
  const overrides = Object.entries(o.overrides || {}).map(([k, v]) => [Number(k), { Seconds: v.seconds, Symbol: v.symbol, Scale: v.scale }]);
  const t = o.timing || {};
  return {
    F0: o.f0 ?? 130, Tenseness: o.tenseness ?? 0.6, Declination: o.declination ?? 0.08,
    Timing: { ...plannerFs.timing, ...Object.fromEntries(Object.entries(t).map(([k, v]) => [field(k), v])) },
    Rate: o.rate ?? 1, Overrides: ofArray(overrides), VibratoDepth: o.vibratoDepth ?? 0, VibratoRate: o.vibratoRate ?? 5.5,
    Jitter: o.jitter ?? 0, Range: o.range ?? 1,
  };
}

function samePlan(compiled, js, what) {
  const marks = Array.from(compiled.Marks);
  assert.equal(marks.length, js.marks.length, `${what}: mark count`);
  marks.forEach((m, i) => {
    assert.equal(m.Index, js.marks[i].index, `${what}: mark ${i} index`);
    assert.equal(m.Symbol, js.marks[i].symbol, `${what}: mark ${i} symbol`);
    assert.equal(m.Kind.name.toLowerCase(), js.marks[i].type, `${what}: mark ${i} type`);
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

for (const [name, options] of optionSets) {
  test(`plans agree with the JavaScript planner: ${name}`, { skip }, () => {
    const o = compiledOptions(options);
    for (const text of phrases) {
      samePlan(plannerFs.plan(o, text), plan(text, options), `${text} / ${name}`);
    }
  });
}

test('a plan of every symbol agrees', { skip }, () => {
  const all = [...VOWEL_SYMBOLS, ...CONSONANT_SYMBOLS].join(' ');
  samePlan(plannerFs.plan(compiledOptions({}), all), plan(all), 'all symbols');
});

test('tempo helpers agree', { skip }, () => {
  for (const rate of [0.1, 0.5, 1, 2, 3.7, 9]) {
    const js = scaleForRate(TIMING, rate);
    const compiled = plannerFs.scaleForRate(plannerFs.timing, rate);
    for (const key of Object.keys(js)) near(compiled[field(key)], js[key], `${key} at ${rate}`);
  }
  for (const d of [0.02, 0.04, 0.06, 0.09, 0.2]) {
    const shape = shapeOfSymbol('i');
    nearShape(plannerFs.undershoot(0.09, d, shapeFs.shapeOfSymbol('i')), undershoot(shape, d, 0.09), `undershoot at ${d}`);
  }
});

test('markAt agrees', { skip }, () => {
  const p = plan('ˈhɛloʊ');
  const compiled = plannerFs.plan(compiledOptions({}), 'ˈhɛloʊ');
  for (const t of [0, 0.05, 0.1, 0.2, 0.3, 0.5, 5]) {
    const a = markAt(p.marks, t);
    const b = plannerFs.markAt(compiled.Marks, t);
    assert.equal(b ? b.Symbol : null, a ? a.symbol : null, `at ${t}`);
  }
});
