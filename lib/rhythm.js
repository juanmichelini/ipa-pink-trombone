// # Rhythm: stress-timed and syllable-timed speech
//
// Languages differ in how they keep time. In a **syllable-timed** language (Spanish, French,
// Mandarin and many others) syllables come at a roughly even pace, whatever they contain. In a
// **stress-timed** language (English, Russian, Arabic) it is the *stressed* syllables that come at
// a roughly even pace, and the unstressed syllables between them are squeezed or stretched to fit.
// Say "Cats CHASE mice" and "Cats are CHASing the MICE": the second sentence has more syllables but
// takes about as long as the first, because the extra syllables are crammed between the beats.
//
// Real speech is only a tendency in this direction, never perfectly even, and linguists argue
// about how well the categories hold. This file models the tendency, not the debate: it lets you
// *choose* a rhythm and hear what it does.
//
// ## How it works
//
// 1. cut the IPA into **syllables** (`syllabify`)
// 2. decide how long each syllable should be, according to the rhythm
// 3. give the planner a *duration for each vowel*, so that vowel plus surrounding consonants add up
//    to the syllable; unstressed vowels that get very short are also **reduced** toward `ə`
//
// The planner does the rest, so this file never touches a keyframe.
import { tokenize } from './ipa.js';
import { plan } from './planner.js';

const STOPS = new Set(['p', 'b', 't', 'd', 'k', 'ɡ', 'c', 'ɟ', 'q']);
const FRICATIVES = new Set(['f', 'v', 'θ', 'ʃ', 'ɸ', 'β', 'x', 'ɣ', 'h']);
const LIQUIDS = new Set(['l', 'ɹ', 'r', 'ɾ', 'ɻ', 'w', 'j']);
const NO_ONSET = new Set(['ŋ']);

// The segments the planner works on, in order. Indexes into this list are how the rhythm talks to
// the planner, so both must filter the tokens in the same way.
export function segmentsOf(input) {
  const tokens = typeof input === 'string' ? tokenize(input) : input;
  return tokens.filter((t) => t.type !== 'unknown');
}

// ## Syllables
//
// A group of consonants between two vowels has to be shared out. The usual rule is that as many
// consonants as can *start a word* go to the second syllable (the "maximal onset"): `a-stra`, not
// `as-tra`. So the test is whether the last few consonants form something a word can begin with.
function canStart(cs) {
  const s = cs.map((c) => c.symbol);
  if (s.length === 1) return !NO_ONSET.has(s[0]);
  if (s.length === 2) {
    const [a, b] = s;
    if (a === 's') return STOPS.has(b) && !'bdɡ'.includes(b) || 'mnlwfv'.includes(b);
    if ((STOPS.has(a) || FRICATIVES.has(a)) && LIQUIDS.has(b)) return !(a === 't' && b === 'l') && !(a === 'd' && b === 'l');
    return false;
  }
  if (s.length === 3) return s[0] === 's' && 'ptk'.includes(s[1]) && LIQUIDS.has(s[2]);
  return false;
}

// Two vowels in a row make one nucleus (a diphthong) if the second is a high or central glide-like
// vowel and the first is not itself high: `aɪ`, `oʊ`, `eɪ`. Otherwise they are separate syllables.
const GLIDE_LIKE = new Set(['ɪ', 'ʊ', 'i', 'u', 'ə', 'ɐ', 'y']);
const HIGH = new Set(['i', 'u', 'ɪ', 'ʊ', 'y', 'ɨ', 'ʉ', 'ɯ']);
function sameNucleus(a, b) {
  return GLIDE_LIKE.has(b.symbol) && !HIGH.has(a.symbol) && !a.long && !b.stress;
}

// Returns an array of `{ segments: [indexes], nucleus: [indexes], stressed, word }`.
export function syllabify(input) {
  const segs = segmentsOf(input);
  const syllables = [];
  let word = 0;
  let current = null;
  const open = () => { current = { segments: [], nucleus: [], stressed: false, secondary: false, word }; syllables.push(current); };
  const closeIf = () => { current = null; };

  // First find each word's nucleus groups, then deal with the consonants between them.
  let i = 0;
  let pendingConsonants = [];       // consonants since the last nucleus, in this word
  let lastSyllable = null;          // the syllable the pending consonants might become a coda of

  const flushWordEnd = () => {
    if (pendingConsonants.length && lastSyllable) lastSyllable.segments.push(...pendingConsonants.map((c) => c.index));
    pendingConsonants = [];
    lastSyllable = null;
  };

  for (; i < segs.length; i++) {
    const seg = segs[i];
    if (seg.type === 'break') {
      if (seg.kind === 'syllable') {
        // Explicit break: everything pending goes to the next syllable.
        if (lastSyllable) { lastSyllable.explicitEnd = true; }
        // The consonants before the dot belong to the previous syllable.
        if (pendingConsonants.length && lastSyllable) lastSyllable.segments.push(...pendingConsonants.map((c) => c.index));
        pendingConsonants = [];
        lastSyllable = lastSyllable && null;
        syllables.explicit = true;
        continue;
      }
      flushWordEnd();
      word++;
      continue;
    }
    seg.index = i;
    if (seg.type === 'consonant') { pendingConsonants.push({ ...seg, index: i }); continue; }
    // A vowel. Does it extend the current nucleus?
    const prev = segs[i - 1];
    if (lastSyllable && prev && prev.type === 'vowel' && pendingConsonants.length === 0 && sameNucleus(prev, seg)) {
      lastSyllable.segments.push(i); lastSyllable.nucleus.push(i);
      continue;
    }
    // A new syllable starts. Decide where the pending consonants split.
    let split = 0;                       // how many pending consonants stay with the previous syllable
    if (lastSyllable && pendingConsonants.length) {
      split = pendingConsonants.length;
      // Stress forces a boundary right before the stressed segment.
      const stressAt = pendingConsonants.findIndex((c) => segs[c.index].stress > 0);
      if (stressAt >= 0) split = stressAt;
      else {
        while (split > 0 && canStart(pendingConsonants.slice(split - 1)) && pendingConsonants.length - split + 1 <= 3) split--;
        // A lone consonant that cannot start a syllable (ŋ) stays behind; so does a leading one when
        // nothing else can be said.
      }
    } else {
      split = 0;
    }
    if (lastSyllable) lastSyllable.segments.push(...pendingConsonants.slice(0, split).map((c) => c.index));
    open();
    current.segments.push(...pendingConsonants.slice(split).map((c) => c.index), i);
    current.nucleus.push(i);
    pendingConsonants = [];
    lastSyllable = current;
  }
  flushWordEnd();
  closeIf();
  for (const s of syllables) {
    // The stress mark can sit on the onset or on the nucleus; either way it marks the syllable.
    s.stressed = s.segments.some((k) => segs[k].stress === 2);
    s.secondary = !s.stressed && s.segments.some((k) => segs[k].stress === 1);
    s.consonants = s.segments.filter((k) => !s.nucleus.includes(k)).length;
  }
  return syllables;
}

// A readable form: `ˈhɛ.loʊ ˈwɜːld`.
export function describe(input) {
  const segs = segmentsOf(input);
  const sylls = syllabify(input);
  const words = [];
  for (const s of sylls) {
    (words[s.word] = words[s.word] || []).push((s.stressed ? 'ˈ' : s.secondary ? 'ˌ' : '') + s.segments.map((k) => segs[k].symbol + (segs[k].long ? 'ː' : '')).join(''));
  }
  return words.filter(Boolean).map((w) => w.join('.')).join(' ');
}

// ## Durations
//
// Seconds at the default speed. A syllable is its consonants plus its vowel, so the vowel gets what
// is left of the syllable once the consonants have taken theirs. But consonants are not fixed
// either: in a syllable with a heavy cluster, speakers squeeze the consonants too. So for each
// syllable:
//
// 1. if the consonants would leave less than a minimum for the vowel, shrink their holds
//    (`scale`, never below half)
// 2. plan the text once to see how long the consonants really come out
// 3. give the vowel the rest of the syllable
const MIN_VOWEL = 0.045;

export const RHYTHMS = {
  syllable: {
    label: 'Syllable-timed',
    // Every syllable is about the same length; stressed ones are a little longer.
    durations(sylls, { beat = 0.24 } = {}) {
      return sylls.map((s) => beat * (s.stressed ? 1.1 : 1));
    },
  },
  stress: {
    label: 'Stress-timed',
    // The stressed syllable starts a foot; the foot lasts about one beat; unstressed syllables
    // share what the stressed one does not use. Syllables before the first stress form a short
    // lead-in foot of their own.
    durations(sylls, { beat = 0.45 } = {}) {
      const out = new Array(sylls.length).fill(0);
      let i = 0;
      while (i < sylls.length) {
        let j = i + 1;
        // The foot ends before the next stressed syllable; a pause or word end does not end it.
        while (j < sylls.length && !sylls[j].stressed) j++;
        const lead = !sylls[i].stressed;           // a foot with no stressed head
        const k = j - i;
        if (lead) {
          for (let n = i; n < j; n++) out[n] = clamp((beat * 0.6) / k, 0.06, 0.17);
        } else {
          const rest = k - 1;
          const total = Math.max(beat, 0.16 + rest * 0.065);
          const u = rest ? clamp((total - 0.16) / rest, 0.065, 0.15) : 0;
          out[i] = total - rest * u;
          for (let n = i + 1; n < j; n++) out[n] = u;
        }
        i = j;
      }
      return out;
    },
  },
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// ## Putting it together
//
// Returns `{ syllables, durations, overrides }`. `overrides` maps a segment index to
// `{ seconds, symbol? }` for a vowel (how long it lasts, and the vowel it is reduced to when it is
// unstressed and shorter than `reduceBelow` seconds) or `{ scale }` for a consonant (how much its hold is
// squeezed).
export function rhythmPlan(input, mode = 'syllable', options = {}) {
  const segs = segmentsOf(input);
  const syllables = syllabify(input);
  const rhythm = RHYTHMS[mode] || RHYTHMS.syllable;
  const durations = rhythm.durations(syllables, options);
  const overrides = {};
  const reduceBelow = options.reduceBelow ?? (mode === 'stress' ? 0.07 : 0);
  const consonantsOf = (s) => s.segments.filter((k) => !s.nucleus.includes(k));

  // Pass 1: squeeze consonants in syllables that are too tight.
  const natural = plan(input).marks;
  const spent = (marks, s) => consonantsOf(s).reduce((a, k) => { const m = marks.find((x) => x.index === k); return a + (m ? m.end - m.start : 0); }, 0);
  syllables.forEach((s, n) => {
    const c = spent(natural, s);
    const room = durations[n] - (s.stressed ? 0.09 : 0.05);
    if (c > room && c > 0) {
      const scale = Math.max(0.5, room / c);
      for (const k of consonantsOf(s)) overrides[k] = { scale };
    }
  });
  // Pass 2: with the consonants as they will really be, give the vowels the rest.
  const squeezed = plan(input, { overrides }).marks;
  syllables.forEach((s, n) => {
    const vowelTime = Math.max(MIN_VOWEL, durations[n] - spent(squeezed, s));
    s.nucleus.forEach((k) => {
      const o = { seconds: vowelTime / s.nucleus.length };
      const seg = segs[k];
      if (!s.stressed && !s.secondary && vowelTime < reduceBelow && !seg.long && !seg.nasalized && !seg.tone && s.nucleus.length === 1) o.symbol = 'ə';
      overrides[k] = o;
    });
  });
  return { syllables, durations, overrides };
}

// ## Measuring rhythm
//
// The normalised Pairwise Variability Index (nPVI) of vowel durations is the standard number for
// "how uneven is this rhythm?". It is the average difference between neighbouring vowels, relative
// to their size, times 100. Stress-timed speech scores high (English is about 55-65) and
// syllable-timed speech low (Spanish and French about 30-45).
export function nPVI(durations) {
  if (durations.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < durations.length; i++) {
    const a = durations[i - 1], b = durations[i];
    sum += Math.abs(a - b) / ((a + b) / 2);
  }
  return (100 * sum) / (durations.length - 1);
}

// The vowel durations of a planned utterance, from its marks. Two vowels with nothing between them
// are one vocalic interval (a diphthong), which is how the index is defined.
export function vowelDurations(marks) {
  const out = [];
  let previousWasVowel = false;
  for (const m of marks) {
    if (m.type === 'vowel') {
      if (previousWasVowel) out[out.length - 1] += m.end - m.start; else out.push(m.end - m.start);
      previousWasVowel = true;
    } else previousWasVowel = false;
  }
  return out;
}

// The duration of each syllable in a planned utterance: from the start of its first segment to the
// end of its last. This is the quantity rhythm classes are really about, and the better thing to
// take the nPVI of when the syllables have different amounts of consonant in them.
export function syllableDurations(syllables, marks) {
  return syllables.map((s) => {
    const own = s.segments.map((k) => marks.find((m) => m.index === k)).filter(Boolean);
    return own.length ? own[own.length - 1].end - own[0].start : 0;
  });
}
