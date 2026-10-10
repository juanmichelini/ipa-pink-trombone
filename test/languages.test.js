import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANGUAGES, languageByCode, parseDictionary, lookupWord, textToIpa, normalizeWord } from '../lib/languages.js';
import { spanishToIpa, indonesianToIpa } from '../lib/g2p.js';
import { tokenize } from '../lib/ipa.js';
import { plan } from '../lib/planner.js';
import { renderScore, rms } from '../lib/render.js';

const load = (code) => parseDictionary(readFileSync(`data/dictionaries/${code}.tsv`, 'utf8'));

test('there are ten languages, including English and Spanish, with unique codes', () => {
  assert.equal(LANGUAGES.length, 10);
  assert.equal(new Set(LANGUAGES.map((l) => l.code)).size, 10);
  assert.ok(languageByCode('en') && languageByCode('es'));
});

for (const lang of LANGUAGES) {
  test(`${lang.name}: dictionary has words, and every one is fully playable`, () => {
    const d = load(lang.code);
    assert.ok(d.size >= 25, `only ${d.size} entries`);
    for (const [word, ipa] of d) {
      const unknown = tokenize(ipa).filter((t) => t.type === 'unknown');
      assert.equal(unknown.length, 0, `${lang.code}:${word} = ${ipa} has unknown ${unknown.map((u) => u.text)}`);
      assert.ok(tokenize(ipa).some((t) => t.type === 'vowel' || t.type === 'consonant'), word);
    }
  });

  test(`${lang.name}: the sample phrase renders audible, finite sound`, () => {
    const d = load(lang.code);
    const { ipa, words } = textToIpa(lang.sample, d, lang);
    assert.ok(words.every((w) => w.ipa), `sample has unknown words: ${words.filter((w) => !w.ipa).map((w) => w.word)}`);
    const out = renderScore(plan(ipa).score, { sampleRate: 44100 });
    const samples = out.samples || out;
    assert.ok(samples.every(Number.isFinite));
    assert.ok(rms(samples) > 0.02);
  });
}

test('lookup normalises case and punctuation and ignores accents', () => {
  const es = load('es');
  assert.equal(normalizeWord('¡Hola!'), 'hola');
  assert.equal(lookupWord('Días,', es, languageByCode('es')).ipa, es.get('días'));
  assert.equal(lookupWord('dias', es, languageByCode('es')).source, 'dictionary');
});

test('unknown words are reported, and languages with rules fall back to them', () => {
  const en = load('en'), es = load('es');
  assert.equal(lookupWord('zxqv', en, languageByCode('en')).source, 'unknown');
  assert.equal(lookupWord('zapato', es, languageByCode('es')).source, 'rules');
});

test('Spanish rules agree with the hand-written dictionary on regular words', () => {
  const es = load('es');
  for (const w of ['hola', 'mundo', 'gracias', 'buenos', 'noches', 'cuatro', 'cinco', 'siete', 'nueve', 'amigo', 'agua', 'perro', 'gato', 'rojo', 'llamo', 'cómo', 'estás', 'mañana', 'español', 'bonito']) {
    assert.equal(spanishToIpa(w), es.get(w), w);
  }
  assert.equal(spanishToIpa('pingüino'), 'piŋˈɡwino');
  assert.equal(spanishToIpa('quien'), 'kjen');
});

test('Indonesian rules agree with the dictionary on regular words', () => {
  const id = load('id');
  for (const w of ['halo', 'terima', 'kasih', 'selamat', 'pagi', 'tidak', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'saya', 'kucing', 'anjing', 'nama', 'bahasa', 'dunia', 'lima']) {
    assert.equal(indonesianToIpa(w), id.get(w), w);
  }
});

test('Mandarin tones become pitch contours', () => {
  const fall = plan('ma˥˩').score.keyframes.filter((k) => k.intensity > 0.9);
  const rise = plan('ma˧˥').score.keyframes.filter((k) => k.intensity > 0.9);
  const f0s = (ks) => ks.map((k) => k.f0);
  assert.ok(Math.max(...f0s(fall)) > fall[fall.length - 1].f0 * 1.15, 'tone 4 falls');
  assert.ok(Math.max(...f0s(rise)) > rise[0].f0 * 1.1, 'tone 2 rises');
});
