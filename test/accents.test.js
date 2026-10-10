import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAccent, applyAccent, ACCENTS } from '../lib/accents.js';
import { tokenize } from '../lib/ipa.js';
import { plan } from '../lib/planner.js';
import { renderScore, rms } from '../lib/render.js';

const load = (id) => parseAccent(readFileSync(`data/accents/${id}.rules`, 'utf8'));
const apply = (ipa, rules) => applyAccent(ipa, parseAccent(rules)).ipa;
const SENTENCE = 'ðə ˈθɪŋ ɪz ˈvɛɹi ˈɡʊd ˈbʌtə ˈskuːl ˈɪŋɡlɪʃ ˈhɛloʊ ˈmɪlk ˈstɹiːt ˈʃiːp ˈwɔtə';

test('a plain rule replaces every occurrence', () => {
  assert.equal(apply('ˈθɪŋ ˈθɹiː', 'θ > t'), 'ˈtɪŋ ˈtɹiː');
});

test('contexts: between vowels, word-initial, word-final', () => {
  assert.equal(apply('ˈbʌtə ˈtɪn ˈkæt', 't > ʔ / V _ V'), 'ˈbʌʔə ˈtɪn ˈkæt');
  assert.equal(apply('ˈhɛloʊ ˈhɪt', 'h > ∅ / # _'), 'ˈɛloʊ ˈɪt');
  assert.equal(apply('ˈkæt ˈtæk', 't > d / _ #'), 'ˈkæd ˈtæk');
});

test('sets and classes', () => {
  assert.equal(apply('ˈmɪlk ˈmɪla', 'l > ʊ / V _ {C,#}'), 'ˈmɪʊk ˈmɪla');
  assert.equal(apply('pit bit', '{p,b} > f'), 'fit fit');
});

test('multi-segment patterns and diphthongs', () => {
  assert.equal(apply('ˈɡoʊ', 'o ʊ > ə ʊ'), 'ˈɡəʊ');
  assert.equal(apply('ˈmaɪ', 'aɪ > ɑɪ'), 'ˈmɑɪ');
});

test('deletion moves the stress mark on; insertion keeps it on the right segment', () => {
  assert.equal(apply('ˈhɛlp', 'h > ∅ / # _'), 'ˈɛlp');
  assert.equal(apply('ˈskuːl', '∅ > e / # _ s {p,t,k}'), 'eˈskuːl');
});

test('rules apply in order, each on the result of the last', () => {
  assert.equal(apply('a', 'a > b\nb > c'), 'c');
  assert.equal(apply('a', 'b > c\na > b'), 'b');
});

test('a rule cannot feed itself, and insertion terminates', () => {
  assert.equal(apply('ta', 't > t t'), 'tta');
  assert.equal(apply('ka', '∅ > a / # _ k'), 'aka');
});

test('modifiers survive a replacement of the same kind', () => {
  assert.equal(apply('ˈiː pʰa', 'i > e\np > b'), 'ˈeː bʰa');
});

test('broken rules are reported with line numbers, not thrown', () => {
  const a = parseAccent('θ > s\nnonsense\nq? > x\n@rhythm sideways\na > b / _ _');
  assert.equal(a.rules.length, 1);
  assert.deepEqual(a.errors.map((e) => e.line), [2, 3, 4, 5]);
});

test('the trace says which rule changed what', () => {
  const { trace } = applyAccent('ˈθɪŋ', parseAccent('θ > t\nŋ > n'));
  assert.deepEqual(trace.map((t) => [t.rule, t.before, t.after]), [[0, 'θ', 't'], [1, 'ŋ', 'n']]);
});

test('every shipped accent is listed, parses cleanly, and has a name', () => {
  for (const a of ACCENTS) {
    const acc = load(a.id);
    assert.deepEqual(acc.errors, [], a.id);
    assert.ok(acc.name, a.id);
    if (a.id !== 'none') assert.ok(acc.rules.length > 0, a.id);
  }
});

test('every accent changes the sentence (except none), stays playable, and renders sound', () => {
  for (const a of ACCENTS) {
    const out = applyAccent(SENTENCE, load(a.id));
    if (a.id === 'none') assert.equal(out.ipa, SENTENCE);
    else assert.notEqual(out.ipa, SENTENCE, a.id);
    assert.equal(tokenize(out.ipa).filter((t) => t.type === 'unknown').length, 0, `${a.id}: ${out.ipa}`);
    const o = renderScore(plan(out.ipa).score, { sampleRate: 44100 });
    const x = o.samples || o;
    assert.ok(x.every(Number.isFinite) && rms(x) > 0.02, a.id);
  }
});

test('the accents do what they say', () => {
  const t = (id, s) => applyAccent(s, load(id)).ipa;
  assert.match(t('spanish', 'ˈskuːl'), /^eˈskul$/);
  assert.equal(t('spanish', 'ðɪs'), 'dis');
  assert.equal(t('cockney', 'ˈbʌtə'), 'ˈbʌʔə');
  assert.equal(t('cockney', 'ˈhɛloʊ'), 'ˈɛloʊ');
  assert.equal(t('rp', 'ˈkɑːɹ'), 'ˈkɑː');
  assert.equal(t('rp', 'ˈɹɛd'), 'ˈɹɛd');
  assert.equal(t('american', 'ˈbʌtə'), 'ˈbʌɾə');
  assert.equal(t('german', 'ˈɡʊd'), 'ˈɡʊt');
  assert.equal(t('indian', 'ˈtɛn'), 'ˈʈɛn');
  for (const word of t('japanese', 'ˈbɛd ˈmɪlk ˈskuːl ˈʃɪp').split(' ')) assert.match(word, /[aeiou]$/, word);
});

test('accents can carry a rhythm', () => {
  assert.equal(load('spanish').rhythm, 'syllable');
  assert.equal(load('rp').rhythm, null);
});
