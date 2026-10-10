// # Reading IPA
//
// Before anything can be sounded, a string like `ˈhɛloʊ wɜːld` has to be split into **segments**:
// a vowel or consonant plus whatever marks are attached to it. This file is that tokenizer, and it
// knows no acoustics. It only answers "what did the person write?".
//
// The marks it understands:
//
// - `ː` after a segment makes it long; `ˑ` half long
// - `ʰ` after a consonant makes it aspirated
// - `̃` (combining tilde) after a vowel makes it nasalised
// - `̥` (ring below) makes a segment voiceless, `̬` voiced
// - `ˈ` and `ˌ` before a syllable mark primary and secondary stress
// - `.` is a syllable break, a space is a word break, `|` and `‖` are short and long pauses
// - a tie bar `͡` joins two consonants into an affricate: `t͡ʃ`
//
// Anything else is returned as an `unknown` segment rather than dropped, so a UI can point at the
// character it did not understand. The tokenizer never throws.
import { VOWEL_SYMBOLS } from './vowels.js';
import { CONSONANT_SYMBOLS } from './consonants.js';

const TIE = '͡';
const NASAL = '̃';
const VOICELESS = '̥';
const VOICED = '̬';

// Some people write the tie bar, some do not (`tʃ`), and some use ligatures (`ʧ`). All of these
// become the same affricate.
const AFFRICATE_ALIASES = { 'ʦ': 't͡s', 'ʣ': 'd͡z', 'ʧ': 't͡ʃ', 'ʤ': 'd͡ʒ', 'ʨ': 't͡ɕ', 'ʥ': 'd͡ʑ' };

// Other common spellings of standard symbols: the ASCII `g` is the IPA `ɡ`, and `ɫ` is a dark `l`.
const ALIASES = { g: 'ɡ', 'ɫ': 'l', 'ɚ': 'ɜ', 'ɝ': 'ɜ' };

const VOWEL_SET = new Set(VOWEL_SYMBOLS);
// Longest first, so `t͡ʃ` wins over `t`.
const CONSONANTS_BY_LENGTH = [...CONSONANT_SYMBOLS].sort((a, b) => b.length - a.length);
const UNTIED = new Map(CONSONANT_SYMBOLS.filter((s) => s.includes(TIE)).map((s) => [s.replace(TIE, ''), s]));

// Normalising text to NFD would split `ç` into `c` and a cedilla, so only the precomposed nasal
// vowels are split, into the vowel and a combining tilde.
const PRECOMPOSED_NASALS = { 'ã': 'a', 'ẽ': 'e', 'ĩ': 'i', 'õ': 'o', 'ũ': 'u', 'ɛ̃': 'ɛ' };
function spreadNasals(text) {
  return text.replace(/[ãẽĩõũ]/g, (c) => PRECOMPOSED_NASALS[c] + NASAL);
}

export function tokenize(text) {
  const out = [];
  const chars = [...spreadNasals(text.normalize('NFC'))];
  let stress = 0;
  let i = 0;
  while (i < chars.length) {
    const rest = chars.slice(i).join('');
    const ch = chars[i];
    if (ch === ' ' || ch === '\n' || ch === '\t') { out.push({ type: 'break', kind: 'word' }); i++; continue; }
    if (ch === '.') { out.push({ type: 'break', kind: 'syllable' }); i++; continue; }
    if (ch === '|') { out.push({ type: 'break', kind: 'pause', seconds: 0.15 }); i++; continue; }
    if (ch === '‖') { out.push({ type: 'break', kind: 'pause', seconds: 0.35 }); i++; continue; }
    if (ch === 'ˈ') { stress = 2; i++; continue; }
    if (ch === 'ˌ') { stress = 1; i++; continue; }

    let symbol = null, length = 0, kind = null;
    const alias = AFFRICATE_ALIASES[ch];
    if (alias) { symbol = alias; length = 1; kind = 'consonant'; }
    if (!symbol) {
      for (const c of CONSONANTS_BY_LENGTH) {
        if (rest.startsWith(c)) { symbol = c; length = [...c].length; kind = 'consonant'; break; }
      }
      // Affricate without the tie bar: `tʃ` is two segments unless we say otherwise. Treat the
      // common pairs as one so `tʃ` and `t͡ʃ` sound the same. (`ts` is excluded: it is
      // a cluster in English `cats` and an affricate in German; write the tie to be sure.)
      if (symbol && !symbol.includes(TIE)) {
        const pair = ch + (chars[i + 1] || '');
        if (pair === 'tʃ' || pair === 'dʒ') { symbol = UNTIED.get(pair); length = 2; }
      }
    }
    if (!symbol && VOWEL_SET.has(ALIASES[ch] ?? ch)) { symbol = ALIASES[ch] ?? ch; length = 1; kind = 'vowel'; }
    if (!symbol && ALIASES[ch] && CONSONANT_SYMBOLS.includes(ALIASES[ch])) { symbol = ALIASES[ch]; length = 1; kind = 'consonant'; }
    if (!symbol) { out.push({ type: 'unknown', text: ch }); i++; continue; }
    if (kind === 'consonant' && ALIASES[symbol]) symbol = ALIASES[symbol];
    i += length;

    const seg = { type: kind, symbol, long: false, half: false, aspirated: false, nasalized: false, voicing: null, stress };
    stress = 0;
    for (;;) {
      const m = chars[i];
      if (m === 'ː') seg.long = true;
      else if (m === 'ˑ') seg.half = true;
      else if (m === 'ʰ') seg.aspirated = true;
      else if (m === NASAL) seg.nasalized = true;
      else if (m === VOICELESS) seg.voicing = false;
      else if (m === VOICED) seg.voicing = true;
      else if (m === TIE && kind === 'consonant') { /* a tie we did not need */ }
      else break;
      i++;
    }
    out.push(seg);
  }
  return out;
}

// Back to a string, for display and for tests: `tokenize` then `format` gives IPA that means the
// same thing.
export function format(tokens) {
  let s = '';
  for (const t of tokens) {
    if (t.type === 'break') s += t.kind === 'word' ? ' ' : t.kind === 'syllable' ? '.' : t.seconds > 0.2 ? '‖' : '|';
    else if (t.type === 'unknown') s += t.text;
    else {
      s += (t.stress === 2 ? 'ˈ' : t.stress === 1 ? 'ˌ' : '') + t.symbol;
      if (t.nasalized) s += NASAL;
      if (t.voicing === false) s += VOICELESS;
      if (t.voicing === true) s += VOICED;
      if (t.aspirated) s += 'ʰ';
      if (t.long) s += 'ː';
      if (t.half) s += 'ˑ';
    }
  }
  return s.normalize('NFC');
}

// Characters in `text` that were not understood, in order.
export function unknownCharacters(text) {
  return tokenize(text).filter((t) => t.type === 'unknown').map((t) => t.text);
}
