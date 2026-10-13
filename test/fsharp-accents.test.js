import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseAccent, applyAccent, ACCENTS } from '../lib/accents.js';
import { VOWEL_SYMBOLS } from '../lib/vowels.js';
import { CONSONANT_SYMBOLS } from '../lib/consonants.js';

// Lesson 8 rebuilt `lib/accents.js` in F#. The demos still run on the JavaScript, so the two must
// agree: how a rule file is read (rules and error messages), and what the rules do to a text,
// including the trace. The tests use every shipped accent, hand-written rules, and thousands of
// random rules and texts.
//
// The compiled files exist only after the F# build (see `fsharp/README.md`). Without it the tests
// skip; the `fsharp` workflow sets REQUIRE_CORE so a missing build is a failure there.
const dir = new URL('../core/src/', import.meta.url);
const built = existsSync(new URL('08-Accents.js', dir));
if (!built && process.env.REQUIRE_CORE) throw new Error('Error: core/src/08-Accents.js was not built');
const skip = built ? false : 'core/ is not built: see fsharp/README.md';
const fs = built ? await import(new URL('08-Accents.js', dir).href) : null;

// Turn a compiled pattern element into the shape the JavaScript parser produces.
function element(e) {
  switch (e.name) {
    case 'Empty': return { kind: 'empty' };
    case 'Boundary': return { kind: 'boundary' };
    case 'Class': return { kind: 'class', name: e.fields[0].name === 'AnyVowel' ? 'V' : 'C' };
    case 'OneOf': return { kind: 'set', items: Array.from(e.fields[0]).map(element) };
    default: return { kind: 'sym', symbol: e.fields[0] };
  }
}
// The JavaScript elements also remember the token they were read from (and a `#` inside a set
// carries its name); only the meaning is compared.
function plainElement(e) {
  if (e.kind === 'boundary') return { kind: 'boundary' };
  if (e.kind === 'set') return { kind: 'set', items: e.items.map(plainElement) };
  if (e.kind === 'sym') return { kind: 'sym', symbol: e.symbol };
  return e;
}

function compare(text, what) {
  const js = parseAccent(text);
  const compiled = fs.parseAccent(text);
  assert.equal(compiled.Name, js.name, `${what}: name`);
  assert.equal(compiled.About, js.about, `${what}: about`);
  assert.equal(compiled.Rhythm === undefined ? null : compiled.Rhythm.name.toLowerCase(), js.rhythm, `${what}: rhythm`);
  assert.deepEqual(Array.from(compiled.Strip), js.strip, `${what}: strip`);
  assert.deepEqual(Array.from(compiled.Errors).map((e) => ({ line: e.Line, text: e.Text, message: e.Message })), js.errors, `${what}: errors`);
  const rules = Array.from(compiled.Rules);
  assert.equal(rules.length, js.rules.length, `${what}: rule count`);
  rules.forEach((r, i) => {
    const j = js.rules[i];
    assert.equal(r.Text, j.text, `${what}: rule ${i} text`);
    assert.equal(r.Line, j.line, `${what}: rule ${i} line`);
    for (const [side, key] of [['From', 'from'], ['To', 'to'], ['Left', 'left'], ['Right', 'right']]) {
      assert.deepEqual(Array.from(r[side]).map(element), j[key].map(plainElement), `${what}: rule ${i} ${key}`);
    }
  });
  return { js, compiled };
}

function sameApplication(parsed, text, what) {
  const js = applyAccent(text, parsed.js);
  const compiled = fs.applyAccent(parsed.compiled, text);
  assert.equal(compiled.Ipa, js.ipa, `${what}: ipa of ${JSON.stringify(text)}`);
  const trace = Array.from(compiled.Trace).map((s) => ({ rule: s.Rule, text: s.Text, at: s.At, before: s.Before, after: s.After }));
  assert.deepEqual(trace, js.trace, `${what}: trace of ${JSON.stringify(text)}`);
}

const SENTENCES = [
  'ðə ˈθɪŋ ɪz ˈvɛɹi ˈɡʊd ˈbʌtə ˈskuːl ˈɪŋɡlɪʃ ˈhɛloʊ ˈmɪlk ˈstɹiːt ˈʃiːp ˈwɔtə', 'ˈhɛ.loʊ ˈwɜːld', 'ˈθɹiː ˈtʃeɪnz', 'ˈkɑːɹ ˈɹɛd ˈbɛd',
  'ˈbʌtə ˈlɪtl̩ ˈwɔtə', 'ˈsɪŋə', 'a|ba‖ɡi', 'ˈmaɪ ˈɡoʊ ˈkʰæt', 'ma˥˩ ni˧', '',
];

test('every shipped accent is read the same way and does the same to a text', { skip }, () => {
  assert.equal(Array.from(fs.accents).length, ACCENTS.length);
  Array.from(fs.accents).forEach(([id, label], i) => {
    assert.equal(id, ACCENTS[i].id);
    assert.equal(label, ACCENTS[i].label);
  });
  for (const { id } of ACCENTS) {
    const source = readFileSync(`data/accents/${id}.rules`, 'utf8');
    const parsed = compare(source, id);
    for (const text of SENTENCES) sameApplication(parsed, text, id);
  }
});

test('broken rules give the same errors', { skip }, () => {
  for (const source of [
    'θ > s\nnonsense\nq? > x\n@rhythm sideways\na > b / _ _', '@ x\n@name', '@bogus thing', '> b', 'a >', 'a > ', 'a > b /', 'a > b / _', 'a > b / x y _ z',
    '∅ > ∅', '# > a', 'a # > b', 'a > V', 'a > {b,c}', '{p,q?} > a', '{} > a', '0 > a / # _', 'a > b / # _ # # _', 'ˈ > a', 'a . b > c',
    '@name  Spaced   Name  \r\nθ > s\r\n# comment\r\n\r\nþ > s', '@strip length\n@strip other', '  θ  >  s  /  V  _  V  ', 'a>b/_', 'a > /b', 'a > b / c / d _ e',
  ]) compare(source, JSON.stringify(source));
});

test('hand-written rules do the same thing', { skip }, () => {
  for (const rules of [
    'θ > t', 't > ʔ / V _ V', 'h > ∅ / # _', 't > d / _ #', 'l > ʊ / V _ {C,#}', '{p,b} > f', 'o ʊ > ə ʊ', 'aɪ > ɑɪ', '∅ > e / # _ s {p,t,k}', 'a > b\nb > c',
    't > t t', '∅ > a / # _ k', 'i > e\np > b', 'ɹ > ∅ / _ {C,#}', 'ə > ∅ / V _ C', 'ʃ > s\ntʃ > ts', '∅ > ə / C _ C', 'ɪ > ∅', 'ˈ > a', 'V > ə / _ #',
    '# > a', 'C > ∅ / # _', 'ɛ > ɛː / _ ɹ', 'tʃ > ʃ', 'ʌ > ə / _ {C,#}', '@strip length\nθ > s', 'd > t / _ {#}', '∅ > ʔ / # _ V', '∅ > ʔ / V _ V',
  ]) {
    const parsed = compare(rules, rules);
    for (const text of SENTENCES) sameApplication(parsed, text, JSON.stringify(rules));
  }
});

test('three thousand random rules and texts agree', { skip }, () => {
  let seed = 4242;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const symbols = ['θ', 't', 's', 'p', 'b', 'a', 'i', 'ʊ', 'ɪ', 'ə', 'o', 'l', 'k', 'ɹ', 'ŋ', 'ʃ', 'h', 'aɪ', 'tʃ', 'ɛː'];
  const things = [...symbols, ...symbols, 'V', 'C', '#', '{p,b}', '{V,#}', '{C,#}', '{a,i,u}', '{t,k}'];
  const phrase = (pool, max) => Array.from({ length: 1 + Math.floor(rnd() * max) }, () => pick(pool)).join(' ');
  const alphabet = [...VOWEL_SYMBOLS, ...CONSONANT_SYMBOLS, ' ', ' ', 'ˈ', 'ˌ', 'ː', '.', '|'];
  const texts = () => Array.from({ length: 4 }, () => Array.from({ length: 1 + Math.floor(rnd() * 9) }, () => pick(alphabet)).join(''));
  for (let n = 0; n < 3000; n++) {
    const kind = rnd();
    const from = kind < 0.12 ? '∅' : phrase(things, 3);
    const to = kind > 0.9 ? '∅' : phrase(symbols, 3);
    const context = rnd() < 0.7 ? ` / ${rnd() < 0.8 ? phrase(things, 3) : ''} _ ${rnd() < 0.8 ? phrase(things, 3) : ''}` : '';
    const line = `${from} > ${to}${context}`;
    const parsed = compare(line, line);
    for (const text of texts()) sameApplication(parsed, text, line);
  }
});
