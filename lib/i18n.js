// # Translating the interface
//
// The pages are translated into the ten languages of Demo 4, and the right one is chosen
// automatically. There is nothing to configure: a visitor whose browser says Portuguese gets
// Portuguese, and can change it with the language menu at the bottom of any page.
//
// ## How a string gets translated
//
// Every sentence lives in a **catalogue**, a flat JSON file `data/i18n/<code>.json` that maps an id
// to text. English (`en.json`) is the source: it is complete, and every other catalogue is checked
// against it by the tests. If a string is missing from a language, English is shown instead, so a
// half-finished translation never breaks a page.
//
// - In HTML, put the id on the element: `data-i18n="d01.h11"` replaces the text,
//   `data-i18n-html` replaces markup (for sentences with `<code>` or `<em>` inside), and
//   `data-i18n-attr="title:some.id,aria-label:other.id"` translates attributes.
// - In scripts, call `t('some.id', { name: 'value' })`. Placeholders are written `{name}`.
//
// ## Choosing the language
//
// In order of priority: `?lang=xx` in the address, the choice saved from the last visit, then the
// languages the browser asks for (`navigator.languages`), in the visitor's order of preference.
// Regional forms count as their base language, so `pt-BR` and `zh-Hans-CN` find `pt` and `zh`.
// If nothing matches, English.
//
// Changing the language reloads the page. That is deliberately simple: a page is built once, in one
// language, with nothing to update afterwards.

export const LOCALES = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'es', name: 'Español', dir: 'ltr' },
  { code: 'zh', name: '中文', dir: 'ltr' },
  { code: 'hi', name: 'हिन्दी', dir: 'ltr' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
  { code: 'fr', name: 'Français', dir: 'ltr' },
  { code: 'bn', name: 'বাংলা', dir: 'ltr' },
  { code: 'pt', name: 'Português', dir: 'ltr' },
  { code: 'ru', name: 'Русский', dir: 'ltr' },
  { code: 'id', name: 'Bahasa Indonesia', dir: 'ltr' },
];

const CODES = new Set(LOCALES.map((l) => l.code));
// Old or alternative codes some browsers still send.
const ALIASES = { in: 'id', iw: 'he', nb: 'no', cmn: 'zh', yue: 'zh', wuu: 'zh' };

// The supported locale for one language tag such as `pt-BR`, or `null`.
export function matchTag(tag) {
  if (!tag) return null;
  const base = String(tag).toLowerCase().split(/[-_]/)[0];
  const code = ALIASES[base] || base;
  return CODES.has(code) ? code : null;
}

// ## Detection
//
// A pure function of its inputs, so it can be tested: `query` is the `lang` parameter, `stored`
// the saved choice, `languages` the browser's list.
export function detectLocale({ query = null, stored = null, languages = [] } = {}) {
  for (const candidate of [query, stored]) {
    const hit = matchTag(candidate);
    if (hit) return hit;
  }
  for (const tag of languages) {
    const hit = matchTag(tag);
    if (hit) return hit;
  }
  return 'en';
}

export const directionOf = (code) => (LOCALES.find((l) => l.code === code) || LOCALES[0]).dir;

// ## Looking up a string
let catalogue = {};
let fallback = {};
let current = 'en';

export const currentLocale = () => current;

// `{name}` placeholders are replaced from `vars`. A missing id shows the id itself, which makes a
// typo obvious on the page instead of blank, unless the caller passes `backup`, the text to show
// when no catalogue has the id (for example when the catalogues could not be loaded at all).
export function t(id, vars = {}, backup = id) {
  const text = catalogue[id] ?? fallback[id] ?? backup;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

// Phonetic terms (`bilabial`, `plosive`, `close`) fall back to themselves, so a term that has not
// been translated reads as the standard English one rather than as an id.
export function tp(term) {
  const id = `ph.${term}`;
  return catalogue[id] ?? fallback[id] ?? term;
}

// Install catalogues directly. Used by `init` and by tests.
export function setCatalogues(main, base = main, code = 'en') {
  catalogue = main;
  fallback = base;
  current = code;
}

// ## Translating a page
//
// Walks the document once and applies the three kinds of marker described above.
export function applyDom(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(',')) {
      const [attr, id] = pair.split(':');
      if (attr && id) el.setAttribute(attr, t(id));
    }
  }
}

// ## Loading
async function loadCatalogue(code, fetchImpl) {
  const url = new URL(`../data/i18n/${code}.json`, import.meta.url);
  // `no-cache` makes the browser ask the server whether its copy is still current, so a catalogue
  // that was updated by a new release is never read from a stale copy.
  const response = await fetchImpl(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`could not load the ${code} catalogue (${response.status})`);
  return response.json();
}

const storage = {
  get() { try { return localStorage.getItem('locale'); } catch { return null; } },
  set(code) { try { localStorage.setItem('locale', code); } catch { /* private mode */ } },
};

// The language menu: a small select in a footer at the very bottom of the page, where it does not
// crowd the title. The lesson buttons (see `lessonnav.js`) put themselves just above it.
function addSwitcher(code) {
  if (document.getElementById('lang')) return;
  const select = document.createElement('select');
  select.id = 'lang';
  select.setAttribute('aria-label', t('i18n.language'));
  for (const l of LOCALES) {
    const option = document.createElement('option');
    option.value = l.code;
    option.textContent = l.name;
    option.selected = l.code === code;
    select.append(option);
  }
  select.addEventListener('change', () => {
    storage.set(select.value);
    const url = new URL(location.href);
    url.searchParams.delete('lang');
    location.href = url.href;
  });
  const footer = document.createElement('footer');
  footer.className = 'lang';
  const label = document.createElement('label');
  label.append(`${t('i18n.language')} `, select);
  footer.append(label);
  document.body.append(footer);
}

// Detects, loads, applies. Pages call nothing: importing this module in a browser runs it, and
// modules that import `t` wait for it (top-level await), so no script ever sees an empty catalogue.
export async function init({ fetchImpl = fetch, query, languages, stored } = {}) {
  const code = detectLocale({
    query: query ?? new URLSearchParams(location.search).get('lang'),
    stored: stored ?? storage.get(),
    languages: languages ?? (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]),
  });
  // If even English cannot be loaded the page keeps its built-in English text and scripts fall back
  // to their own wording, instead of the whole module failing and taking the page's scripts with it.
  const base = await loadCatalogue('en', fetchImpl).catch((error) => { console.error(error); return {}; });
  const main = code === 'en' ? base : await loadCatalogue(code, fetchImpl).catch(() => base);
  setCatalogues(main, base, code);
  document.documentElement.lang = code;
  document.documentElement.dir = directionOf(code);
  applyDom(document);
  addSwitcher(code);
  return code;
}

if (typeof document !== 'undefined' && typeof location !== 'undefined') await init();
