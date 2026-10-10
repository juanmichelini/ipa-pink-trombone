// # Accents as rewrite rules
//
// An accent is, to a first approximation, a systematic way of pronouncing the *same* words: a
// Spanish speaker says English `θ` as `s`, a Cockney speaker says `t` between vowels as a glottal
// stop. Linguists write such facts as **rewrite rules**, and so does this file:
//
//     θ > s                 every θ becomes s
//     t > ʔ / V _ V         t becomes ʔ between two vowels
//     h > ∅ / # _           h is deleted at the start of a word
//     ∅ > e / # _ s C       an e is inserted before a word-initial s + consonant
//
// Read `A > B / L _ R` as "A becomes B when it follows L and precedes R". `∅` means nothing, so
// `A > ∅` deletes and `∅ > B` inserts. The pieces of a pattern are separated by spaces:
//
// - an IPA symbol (or a few written together, like `aɪ`), matched exactly
// - `V` any vowel, `C` any consonant, `#` a word boundary (or the end of the text)
// - `{a,b,c}` any one of those symbols; the set may also contain `V`, `C` or `#`
//
// Rules are applied **in order**, each to the whole text, so a later rule sees what an earlier one
// made. That is how real sound change is described, and it is why the order of lines matters.
//
// A file of rules can also carry directives, one per line:
//
//     @name   Spanish accent (English)
//     @about  One sentence about the accent
//     @rhythm syllable            the timing the accent tends to (Demo 7)
//     @strip  length              drop vowel length (some accents have none)
//
// Everything else is a comment (`#` at the start of a line) or blank. The same file format is
// used by every accent in `data/accents`, so adding an accent is adding a file.
import { tokenize, format } from './ipa.js';

const EMPTY = '∅';

// ## Parsing a pattern element
function parseElement(chunk) {
  if (chunk === EMPTY || chunk === '0') return { kind: 'empty' };
  if (chunk === '#') return { kind: 'boundary' };
  if (chunk === 'V' || chunk === 'C') return { kind: 'class', name: chunk };
  if (chunk.startsWith('{') && chunk.endsWith('}')) {
    const items = chunk.slice(1, -1).split(',').filter(Boolean);
    return { kind: 'set', items: items.map((s) => (s === 'V' || s === 'C' || s === '#' ? { kind: s === '#' ? 'boundary' : 'class', name: s } : { kind: 'sym', symbol: onlySymbol(s) })) };
  }
  const segs = tokenize(chunk);
  if (!segs.length || segs.some((s) => s.type === 'unknown' || s.type === 'break')) throw new Error(`"${chunk}" is not IPA`);
  return segs.length === 1 ? { kind: 'sym', symbol: segs[0].symbol, token: segs[0] } : { kind: 'seq', elements: segs.map((s) => ({ kind: 'sym', symbol: s.symbol, token: s })) };
}
function onlySymbol(s) {
  const segs = tokenize(s);
  if (segs.length !== 1 || segs[0].type === 'unknown' || segs[0].type === 'break') throw new Error(`"${s}" is not a single IPA symbol`);
  return segs[0].symbol;
}
// Flatten sequences (`aɪ`) into separate elements.
const flatten = (elements) => elements.flatMap((e) => (e.kind === 'seq' ? e.elements : [e]));

// ## Parsing a rule file
export function parseAccent(text) {
  const out = { name: '', about: '', rhythm: null, strip: [], rules: [], errors: [] };
  text.split(/\r?\n/).forEach((raw, n) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    try {
      if (line.startsWith('@')) {
        const [, key, rest] = line.match(/^@(\w+)\s*(.*)$/) || [];
        if (key === 'name') out.name = rest;
        else if (key === 'about') out.about = rest;
        else if (key === 'rhythm') { if (!['stress', 'syllable'].includes(rest)) throw new Error('@rhythm must be stress or syllable'); out.rhythm = rest; }
        else if (key === 'strip') out.strip.push(rest);
        else throw new Error(`unknown directive @${key}`);
        return;
      }
      const m = line.match(/^(.+?)\s*>\s*(.+?)(?:\s*\/\s*(.*))?$/);
      if (!m) throw new Error('expected  A > B  or  A > B / left _ right');
      const [, from, to, context] = m;
      let left = [], right = [];
      if (context !== undefined) {
        const parts = context.split('_');
        if (parts.length !== 2) throw new Error('a context needs exactly one _');
        left = flatten(parts[0].trim().split(/\s+/).filter(Boolean).map(parseElement));
        right = flatten(parts[1].trim().split(/\s+/).filter(Boolean).map(parseElement));
      }
      const fromEls = flatten(from.trim().split(/\s+/).map(parseElement));
      const toEls = flatten(to.trim().split(/\s+/).map(parseElement)).filter((e) => e.kind !== 'empty');
      if (toEls.some((e) => e.kind !== 'sym')) throw new Error('the replacement must be IPA symbols or ∅');
      const isInsert = fromEls.length === 1 && fromEls[0].kind === 'empty';
      if (!isInsert && fromEls.some((e) => e.kind === 'empty' || e.kind === 'boundary')) throw new Error('∅ and # cannot be inside the thing being replaced');
      out.rules.push({ from: isInsert ? [] : fromEls, to: toEls, left, right, text: line, line: n + 1 });
    } catch (error) {
      out.errors.push({ line: n + 1, text: line, message: error.message });
    }
  });
  return out;
}

// ## Matching
//
// A text is a list of items (segments and word breaks). An element matches one item, except `#`,
// which also matches the edge of the text, where there is no item at all.
function matches(el, item) {
  if (el.kind === 'boundary') return item === undefined || item.type === 'break';
  if (el.kind === 'set') return el.items.some((e) => matches(e, item));
  if (item === undefined || item.type === 'break') return false;
  if (el.kind === 'class') return el.name === 'V' ? item.type === 'vowel' : item.type === 'consonant';
  if (el.kind === 'sym') return item.symbol === el.symbol;
  return false;
}

// Does the left context match, ending just before `i`? Elements are matched right to left.
function leftOk(items, i, left) {
  let p = i - 1;
  for (let k = left.length - 1; k >= 0; k--, p--) {
    const el = left[k];
    if (!matches(el, items[p])) return false;
    // A boundary at the edge consumes nothing; further elements cannot match beyond it.
    if (el.kind === 'boundary' && p < 0) { return left.slice(0, k).length === 0; }
  }
  return true;
}
function rightOk(items, i, right) {
  let p = i;
  for (let k = 0; k < right.length; k++, p++) {
    if (!matches(right[k], items[p])) return false;
    if (right[k].kind === 'boundary' && p >= items.length) return k === right.length - 1;
  }
  return true;
}

// ## Making tokens
function makeToken(el, like) {
  const t = el.token ? { ...el.token } : tokenize(el.symbol)[0];
  return { ...t, stress: like ? like.stress : 0 };
}

// ## Applying one rule
//
// Scans the text once, left to right. Matches are found against the text as it was when the rule
// started, so a rule cannot feed itself (`t > tt` does not run away).
function applyRule(items, rule, rn, trace) {
  const out = [];
  const n = items.length;
  let i = 0;
  const note = (at, before, after) => trace.push({ rule: rn, text: rule.text, at, before: before.join(' '), after: after.join(' ') });
  if (rule.from.length === 0) {
    // Insertion: test every gap.
    for (let g = 0; g <= n; g++) {
      if (leftOk(items, g, rule.left) && rightOk(items, g, rule.right) && !(items[g] && items[g].type === 'break' && items[g - 1] && items[g - 1].type === 'break')) {
        const next = items[g];
        const made = rule.to.map((el) => makeToken(el, null));
        // Stress lives on the first segment of a syllable. A segment inserted before a stressed
        // one takes over its mark, so the stress does not end up inside a cluster.
        out.push(...made);
        note(g, ['∅'], made.map((t) => t.symbol));
        void next;
      }
      if (g < n) out.push(items[g]);
    }
    return out;
  }
  while (i < n) {
    const len = rule.from.length;
    let ok = i + len <= n;
    for (let k = 0; ok && k < len; k++) if (!matches(rule.from[k], items[i + k]) || items[i + k].type === 'break') ok = false;
    if (ok && leftOk(items, i, rule.left) && rightOk(items, i + len, rule.right)) {
      const removed = items.slice(i, i + len);
      const made = rule.to.map((el, k) => makeToken(el, k === 0 ? removed[0] : null));
      // Keep the modifiers the replaced segment had (length, aspiration, nasalisation) when the
      // replacement is a single, same-kind segment.
      if (made.length === 1 && removed.length === 1 && made[0].type === removed[0].type) {
        for (const key of ['long', 'half', 'aspirated', 'nasalized', 'tone']) if (made[0][key] === undefined || made[0][key] === false) made[0][key] = removed[0][key];
      }
      const stress = Math.max(...removed.map((t) => t.stress || 0));
      if (made.length === 0 && stress) {
        // A deleted segment takes its stress mark to the next segment.
        const j = items.findIndex((t, idx) => idx >= i + len && t.type !== 'break');
        if (j >= 0 && items[j].stress < stress) items = items.map((t, idx) => (idx === j ? { ...t, stress } : t));
      } else if (made.length) made[0].stress = Math.max(made[0].stress || 0, stress);
      note(i, removed.map((t) => t.symbol), made.map((t) => t.symbol));
      out.push(...made);
      i += len;
    } else {
      out.push(items[i]);
      i++;
    }
  }
  return out;
}

// ## Applying an accent
//
// Returns `{ ipa, tokens, trace }`. The `trace` lists every change: which rule, where, and what
// became what. It is what lets the demo show *why* the output differs.
export function applyAccent(input, accent) {
  const rules = Array.isArray(accent) ? accent : accent.rules;
  const strip = Array.isArray(accent) ? [] : accent.strip;
  let items = (typeof input === 'string' ? tokenize(input) : input).filter((t) => t.type !== 'unknown' && !(t.type === 'break' && t.kind === 'syllable'));
  const trace = [];
  rules.forEach((rule, rn) => { items = applyRule(items, rule, rn, trace); });
  if (strip.includes('length')) items = items.map((t) => (t.long ? { ...t, long: false } : t));
  return { ipa: format(items), tokens: items, trace };
}

// ## Loading in the browser
export async function loadAccent(id, fetchImpl = fetch) {
  const url = new URL(`../data/accents/${id}.rules`, import.meta.url);
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`could not load the ${id} accent (${response.status})`);
  const source = await response.text();
  return { ...parseAccent(source), source };
}

// The accents that ship with the repo. Each id is a file in `data/accents`.
export const ACCENTS = [
  { id: 'none', label: 'No accent (as written)' },
  { id: 'spanish', label: 'Spanish speaker of English' },
  { id: 'french', label: 'French speaker of English' },
  { id: 'german', label: 'German speaker of English' },
  { id: 'japanese', label: 'Japanese speaker of English' },
  { id: 'indian', label: 'Indian English' },
  { id: 'cockney', label: 'Cockney' },
  { id: 'rp', label: 'Southern British (non-rhotic)' },
  { id: 'american', label: 'American flapping' },
];
