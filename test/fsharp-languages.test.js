import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { LANGUAGES, languageByCode, parseDictionary, lookupWord, textToIpa, normalizeWord } from '../lib/languages.js';
import { spanishToIpa, indonesianToIpa } from '../lib/g2p.js';

// Lesson 4 rebuilt `lib/g2p.js` and the pure half of `lib/languages.js` in F#. The demos still run
// on the JavaScript, so the two must agree. These tests compare the *compiled F#* with the
// JavaScript on every word of every dictionary, on variations of them (capitals, punctuation,
// missing accents) and on thousands of random spellings.
//
// The compiled files exist only after the F# build (see `fsharp/README.md`). Without it the tests
// skip; the `fsharp` workflow sets REQUIRE_CORE so a missing build is a failure there.
const dir = new URL('../core/src/', import.meta.url);
const files = ['04a-G2p.js', '04b-Languages.js'];
const built = files.every((f) => existsSync(new URL(f, dir)));
if (!built && process.env.REQUIRE_CORE) throw new Error(`Error: core/src/ is missing one of ${files.join(', ')}`);
const skip = built ? false : 'core/ is not built: see fsharp/README.md';
const [g2p, fs] = built ? await Promise.all(files.map((f) => import(new URL(f, dir).href))) : [];

const text = (code) => readFileSync(`data/dictionaries/${code}.tsv`, 'utf8');
const compiledLanguage = (code) => fs.languageByCode(code);
const same = (compiled, js, what) => {
  assert.equal(compiled === undefined ? null : compiled.Ipa ?? null, js.ipa, `${what}: ipa`);
  assert.equal(compiled.Source.name, { dictionary: 'FromDictionary', rules: 'FromRules', unknown: 'Missing' }[js.source], `${what}: source`);
  assert.equal(compiled.Word, js.word, `${what}: word`);
};

test('the ten languages match', { skip }, () => {
  const compiled = Array.from(fs.languages);
  assert.equal(compiled.length, LANGUAGES.length);
  LANGUAGES.forEach((l, i) => {
    assert.equal(compiled[i].Code, l.code);
    assert.equal(compiled[i].Rhythm.name.toLowerCase(), l.rhythm, l.code);
    assert.equal(compiled[i].Name, l.name);
    assert.equal(compiled[i].Native, l.native);
    assert.equal(compiled[i].Sample, l.sample);
    assert.equal(compiled[i].Rules !== undefined, l.rules !== null, `${l.code} rules`);
  });
  assert.equal(fs.languageByCode('xx'), undefined);
});

for (const lang of LANGUAGES) {
  test(`${lang.name}: the dictionary parses to the same entries, in the same order`, { skip }, () => {
    const js = [...parseDictionary(text(lang.code))];
    const compiled = Array.from(fs.parseDictionary(text(lang.code)));
    assert.deepEqual(compiled, js);
  });

  test(`${lang.name}: lookups agree, with capitals, punctuation and missing accents`, { skip }, () => {
    const dictionary = parseDictionary(text(lang.code));
    const compiledDictionary = fs.parseDictionary(text(lang.code));
    const words = [];
    for (const key of dictionary.keys()) {
      words.push(key, key[0].toUpperCase() + key.slice(1), `${key},`, `¿${key}?`, key.normalize('NFD').replace(/\p{M}/gu, ''));
    }
    words.push('zxqv', 'zapato', 'amigos', 'computadora', "don't", '...', '', '42', 'x-y');
    for (const word of words) {
      const js = lookupWord(word, dictionary, lang);
      const compiled = fs.lookupWord(compiledLanguage(lang.code), compiledDictionary, word);
      if (js === null) assert.equal(compiled, undefined, `"${word}" has nothing to look up`);
      else same(compiled, js, `${lang.code} "${word}"`);
    }
  });

  test(`${lang.name}: text becomes the same IPA`, { skip }, () => {
    const dictionary = parseDictionary(text(lang.code));
    const compiledDictionary = fs.parseDictionary(text(lang.code));
    const keys = [...dictionary.keys()];
    for (const phrase of [lang.sample, keys.slice(0, 6).join(' '), `${keys[0]}, ${keys[1]}!  zxqv  ${keys[2]}.`, '']) {
      const js = textToIpa(phrase, dictionary, lang);
      const compiled = fs.textToIpa(compiledLanguage(lang.code), compiledDictionary, phrase);
      assert.equal(compiled.Ipa, js.ipa, phrase);
      assert.equal(Array.from(compiled.Words).length, js.words.length, phrase);
    }
  });
}

test('normalizeWord agrees', { skip }, () => {
  for (const w of ['¡Hola!', "Don't", '...', 'Привет,', 'ÁRBOL', '  x  ', '(42)', 'a-b-', '', 'ñandú']) {
    assert.equal(fs.normalizeWord(w), normalizeWord(w), JSON.stringify(w));
  }
});

// ## Spelling rules
const words = (code) => [...parseDictionary(text(code)).keys()];
const random = (alphabet, count, seed) => {
  let state = seed;
  const next = () => (state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296;
  return Array.from({ length: count }, () => {
    let w = '';
    const length = 1 + Math.floor(next() * 9);
    for (let i = 0; i < length; i++) w += alphabet[Math.floor(next() * alphabet.length)];
    return w;
  });
};

test('Spanish rules agree on every dictionary word and four thousand random spellings', { skip }, () => {
  const spellings = [...words('es'), ...words('pt'), ...words('en'), ...random('aeiouáéíóúüaeiouyhbcdgjlmnñpqrstvxz', 4000, 7)];
  for (const w of spellings) assert.equal(g2p.spanishToIpa(w), spanishToIpa(w), w);
});

test('Indonesian rules agree on every dictionary word and four thousand random spellings', { skip }, () => {
  const spellings = [...words('id'), ...words('es'), ...words('en'), ...random('aaiueoéaiueobcdfghjklmnprstwyk', 4000, 11)];
  for (const w of spellings) assert.equal(g2p.indonesianToIpa(w), indonesianToIpa(w), w);
});
