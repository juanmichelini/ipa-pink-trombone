// # Tests for the translations
//
// The catalogues are data, so the tests are about their shape: every language has every string,
// placeholders survive translation, and every id used by a page or a script exists.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { LOCALES, matchTag, detectLocale, directionOf, setCatalogues, t, tp, applyDom } from '../lib/i18n.js';

const load = (code) => JSON.parse(readFileSync(`data/i18n/${code}.json`, 'utf8'));
const english = load('en');
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const tags = (s) => [...s.matchAll(/<\/?[a-z]+/g)].map((m) => m[0]).join(',');

test('region and script subtags find the base language', () => {
  assert.equal(matchTag('pt-BR'), 'pt');
  assert.equal(matchTag('zh-Hans-CN'), 'zh');
  assert.equal(matchTag('es_MX'), 'es');
  assert.equal(matchTag('in'), 'id');
  assert.equal(matchTag('de'), null);
  assert.equal(matchTag(''), null);
});

test('detection prefers the address, then the saved choice, then the browser, then English', () => {
  assert.equal(detectLocale({ query: 'fr', stored: 'es', languages: ['ru'] }), 'fr');
  assert.equal(detectLocale({ query: 'xx', stored: 'es', languages: ['ru'] }), 'es');
  assert.equal(detectLocale({ languages: ['de-DE', 'pt-PT', 'ru'] }), 'pt');
  assert.equal(detectLocale({ languages: ['de'] }), 'en');
  assert.equal(detectLocale(), 'en');
});

test('Arabic is right to left and the rest are left to right', () => {
  assert.equal(directionOf('ar'), 'rtl');
  for (const l of LOCALES.filter((x) => x.code !== 'ar')) assert.equal(directionOf(l.code), 'ltr', l.code);
});

test('every language has exactly the strings English has, with the same placeholders and tags', () => {
  for (const { code } of LOCALES) {
    const c = load(code);
    assert.deepEqual(Object.keys(c).sort(), Object.keys(english).sort(), code);
    for (const [id, text] of Object.entries(english)) {
      assert.equal(typeof c[id], 'string', `${code} ${id}`);
      assert.ok(c[id].length > 0, `${code} ${id} is empty`);
      assert.equal(placeholders(c[id]), placeholders(text), `${code} ${id} placeholders`);
      assert.equal(tags(c[id]), tags(text), `${code} ${id} markup`);
    }
  }
});

test('the translated languages actually differ from English', () => {
  for (const { code } of LOCALES.filter((l) => l.code !== 'en')) {
    const c = load(code);
    const same = Object.keys(english).filter((id) => c[id] === english[id]).length;
    assert.ok(same < Object.keys(english).length * 0.25, `${code} leaves ${same} strings in English`);
  }
});

test('t fills placeholders, falls back to English, and shows the id when nothing matches', () => {
  setCatalogues({ 'a': 'hola {n}' }, { 'a': 'hello {n}', 'b': 'only english' });
  assert.equal(t('a', { n: 3 }), 'hola 3');
  assert.equal(t('b'), 'only english');
  assert.equal(t('c'), 'c');
  assert.equal(t('a'), 'hola {n}');
  assert.equal(tp('bilabial'), 'bilabial');
  setCatalogues({ 'ph.bilabial': 'bilabial (es)' });
  assert.equal(tp('bilabial'), 'bilabial (es)');
});

test('applyDom writes text, markup and attributes from the markers', () => {
  setCatalogues({ x: 'texto', y: '<b>negrita</b>', z: 'etiqueta' });
  const attrs = {};
  const el = (data) => ({ dataset: data, textContent: '', innerHTML: '', setAttribute: (k, v) => { attrs[k] = v; } });
  const a = el({ i18n: 'x' }), b = el({ i18nHtml: 'y' }), c = el({ i18nAttr: 'aria-label:z' });
  const root = {
    querySelectorAll: (sel) => ({ '[data-i18n]': [a], '[data-i18n-html]': [b], '[data-i18n-attr]': [c] }[sel]),
  };
  applyDom(root);
  assert.equal(a.textContent, 'texto');
  assert.equal(b.innerHTML, '<b>negrita</b>');
  assert.equal(attrs['aria-label'], 'etiqueta');
});

// ## Every id that is used exists
function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = `${dir}/${name}`;
    if (statSync(path).isDirectory()) files(path, out); else out.push(path);
  }
  return out;
}
const all = files('.');
const known = (id) => id in english;

test('every data-i18n id in the pages is in the English catalogue', () => {
  for (const f of all.filter((x) => x.endsWith('.html'))) {
    const html = readFileSync(f, 'utf8');
    for (const m of html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) assert.ok(known(m[1]), `${f}: ${m[1]}`);
    for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
      for (const pair of m[1].split(',')) assert.ok(known(pair.split(':')[1]), `${f}: ${pair}`);
    }
  }
});

test('every literal t(...) id in the scripts is in the English catalogue', () => {
  for (const f of all.filter((x) => x.endsWith('.js') && !x.startsWith('./test/') && !x.includes('i18n.js'))) {
    const js = readFileSync(f, 'utf8');
    for (const m of js.matchAll(/\bt\(\s*(['"`])([^'"`$]+)\1/g)) assert.ok(known(m[2]), `${f}: ${m[2]}`);
  }
});

test('the language menu lists the locales that have a catalogue', () => {
  const files = readdirSync('data/i18n').map((n) => n.replace('.json', '')).sort();
  assert.deepEqual(files, LOCALES.map((l) => l.code).sort());
});
