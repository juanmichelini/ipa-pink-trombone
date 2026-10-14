// # IPA consonants
//
// A consonant is a *gesture*: a constriction made somewhere in the mouth, in some manner, with or
// without voicing. The IPA consonant chart is organised by exactly those three ideas.
//
// - **Place** (columns): where the tract is narrowed, from the lips at the front to the glottis at
//   the back.
// - **Manner** (rows): how it is narrowed. A *stop* closes completely and then releases with a
//   burst. A *fricative* leaves a narrow gap that hisses. A *nasal* closes the mouth but opens the
//   nose. An *approximant* narrows without hissing. A *trill* flutters, a *tap* is one very quick
//   closure, a *lateral* lets air round the sides of the tongue.
// - **Voicing** (left or right in a cell): whether the vocal folds buzz.
//
// This file turns a chart cell into a score for the engine. The IPA symbols themselves are in the
// `CONSONANTS` table, and `consonantGesture` builds the movement.
import { Timeline } from './score.js';

// ## Place: where along the tract
//
// The engine's index units run 0 at the glottis to 44 at the lips, and one unit is about 0.39 cm.
// So an articulator that sits some distance from the lips has the index `44 - distance / 0.39`.
// The distances below are textbook figures for an adult, rounded: the alveolar ridge is about
// 2 cm behind the lips (just behind the upper teeth), the palate about 5.5 cm, the soft palate
// about 7.5 cm, the uvula about 9.5 cm, the throat wall about 12 cm. From index 41 on, the closing
// articulator is the lower lip; before that it is the tongue (see `LANDMARKS` in the engine).
export const PLACES = [
  { id: 'bilabial', index: 43.5 },
  { id: 'labiodental', index: 42 },
  { id: 'dental', index: 40 },
  { id: 'alveolar', index: 39 },
  { id: 'postalveolar', index: 36.5 },
  { id: 'retroflex', index: 34.5 },
  { id: 'palatal', index: 29.5 },
  { id: 'velar', index: 24.5 },
  { id: 'uvular', index: 19.5 },
  { id: 'pharyngeal', index: 13.5 },
  { id: 'glottal', index: null },
];

// A few sounds sit between two places or use two at once; the IPA chart lists them separately.
export const OTHER_PLACES = [
  { id: 'alveolo-palatal', index: 35.5 },
  { id: 'labial-velar', index: 43.5 },
  { id: 'labial-palatal', index: 43.5 },
];

const PLACE_INDEX = Object.fromEntries([...PLACES, ...OTHER_PLACES].map((p) => [p.id, p.index]));

export const MANNERS = ['plosive', 'nasal', 'trill', 'tap', 'fricative', 'lateral fricative', 'approximant', 'lateral approximant'];

// ## The inventory
//
// The pulmonic consonants of the IPA chart (sounds made with air from the lungs), plus the
// affricates and a handful of "other symbols" that languages in the next demos need. Each row is
// `[symbol, place, manner, voiced]`. Plosives, nasals and so on in one cell appear as a voiceless
// and a voiced symbol, as in the chart.
const rows = [
  ['p', 'bilabial', 'plosive', false], ['b', 'bilabial', 'plosive', true],
  ['t', 'alveolar', 'plosive', false], ['d', 'alveolar', 'plosive', true],
  ['ʈ', 'retroflex', 'plosive', false], ['ɖ', 'retroflex', 'plosive', true],
  ['c', 'palatal', 'plosive', false], ['ɟ', 'palatal', 'plosive', true],
  ['k', 'velar', 'plosive', false], ['ɡ', 'velar', 'plosive', true],
  ['q', 'uvular', 'plosive', false], ['ɢ', 'uvular', 'plosive', true],
  ['ʔ', 'glottal', 'plosive', false],
  ['m', 'bilabial', 'nasal', true], ['ɱ', 'labiodental', 'nasal', true], ['n', 'alveolar', 'nasal', true],
  ['ɳ', 'retroflex', 'nasal', true], ['ɲ', 'palatal', 'nasal', true], ['ŋ', 'velar', 'nasal', true], ['ɴ', 'uvular', 'nasal', true],
  ['ʙ', 'bilabial', 'trill', true], ['r', 'alveolar', 'trill', true], ['ʀ', 'uvular', 'trill', true],
  ['ⱱ', 'labiodental', 'tap', true], ['ɾ', 'alveolar', 'tap', true], ['ɽ', 'retroflex', 'tap', true],
  ['ɸ', 'bilabial', 'fricative', false], ['β', 'bilabial', 'fricative', true],
  ['f', 'labiodental', 'fricative', false], ['v', 'labiodental', 'fricative', true],
  ['θ', 'dental', 'fricative', false], ['ð', 'dental', 'fricative', true],
  ['s', 'alveolar', 'fricative', false], ['z', 'alveolar', 'fricative', true],
  ['ʃ', 'postalveolar', 'fricative', false], ['ʒ', 'postalveolar', 'fricative', true],
  ['ʂ', 'retroflex', 'fricative', false], ['ʐ', 'retroflex', 'fricative', true],
  ['ç', 'palatal', 'fricative', false], ['ʝ', 'palatal', 'fricative', true],
  ['x', 'velar', 'fricative', false], ['ɣ', 'velar', 'fricative', true],
  ['χ', 'uvular', 'fricative', false], ['ʁ', 'uvular', 'fricative', true],
  ['ħ', 'pharyngeal', 'fricative', false], ['ʕ', 'pharyngeal', 'fricative', true],
  ['h', 'glottal', 'fricative', false], ['ɦ', 'glottal', 'fricative', true],
  ['ɬ', 'alveolar', 'lateral fricative', false], ['ɮ', 'alveolar', 'lateral fricative', true],
  ['ʋ', 'labiodental', 'approximant', true], ['ɹ', 'alveolar', 'approximant', true],
  ['ɻ', 'retroflex', 'approximant', true], ['j', 'palatal', 'approximant', true], ['ɰ', 'velar', 'approximant', true],
  ['l', 'alveolar', 'lateral approximant', true], ['ɭ', 'retroflex', 'lateral approximant', true],
  ['ʎ', 'palatal', 'lateral approximant', true], ['ʟ', 'velar', 'lateral approximant', true],
  // other symbols
  ['w', 'labial-velar', 'approximant', true], ['ɥ', 'labial-palatal', 'approximant', true],
  ['ʍ', 'labial-velar', 'fricative', false],
  ['ɕ', 'alveolo-palatal', 'fricative', false], ['ʑ', 'alveolo-palatal', 'fricative', true],
  // affricates: a stop released into a fricative at the same (or a nearby) place
  ['t͡s', 'alveolar', 'affricate', false], ['d͡z', 'alveolar', 'affricate', true],
  ['t͡ʃ', 'postalveolar', 'affricate', false], ['d͡ʒ', 'postalveolar', 'affricate', true],
  ['p͡f', 'labiodental', 'affricate', false], ['b͡v', 'labiodental', 'affricate', true],
  ['ʈ͡ʂ', 'retroflex', 'affricate', false], ['ɖ͡ʐ', 'retroflex', 'affricate', true],
  ['t͡ɕ', 'alveolo-palatal', 'affricate', false], ['d͡ʑ', 'alveolo-palatal', 'affricate', true],
];

export const CONSONANTS = rows.map(([symbol, place, manner, voiced]) => ({ symbol, place, manner, voiced }));
export const CONSONANT_SYMBOLS = CONSONANTS.map((c) => c.symbol);

export function consonantBySymbol(symbol) {
  return CONSONANTS.find((c) => c.symbol === symbol) || null;
}

// ## What the chart does not cover
//
// Said plainly so nobody is surprised: this model is a one-dimensional tube, and some sounds need
// more than that.
export const NOT_MODELLED = [
  'clicks, implosives and ejectives (non-pulmonic): they need air from somewhere other than the lungs',
  'laterals are approximated: a real lateral lets air round the sides of the tongue, and a tube has no sides, so the midline is narrowed instead',
  'voiceless nasals, voiceless approximants and other voiceless versions of voiced symbols: apply voicing off in Demo 3 with the diacritic',
];

// ## The space a consonant lives in
//
// A steady consonant is a point in a small continuous space, and the IPA symbols are only named
// points in it, as the vowel symbols are named points on the vowel chart.
//
// - **place**: where along the tract it is made, any index from the throat (13) to the lips (43.5)
// - **degree**: how narrow it is, any gap from 0 (shut) through about 0.4 (a hiss) and 0.5 to 1
//   (a narrowing that only colours a vowel) up to 3 (open: no consonant at all)
// - **nasal**: how open the nose is
// - **voicing**: how much the voice is on
//
// Place and degree are the two dials; they are the `c0i` and `c0d` of a frame. What they do *not*
// get is a hiss setting of their own. How loud the hiss is and where its pitch sits fall out of
// the place, because they are properties of the tube in front of the gap:
//
// - the **pitch** follows the cavity between the gap and the lips. The shorter that cavity, the
//   higher it resonates: `s` (just behind the teeth) is high, `ʃ` lower, `x` and the throat sounds
//   low. A gap at the lips has no cavity at all, so the hiss there is low and broad.
// - the **loudness** follows how well the place can make a jet of air hit something: the tongue
//   tip and blade behind the teeth do it best, the lips and the back of the mouth less so.
//
// Both are smooth curves of the place, so sliding the place slides the hiss with it.
function curve(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1], [x1, y1] = points[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}

// Centre frequency of the hiss, in Hz, for a gap at `index`.
export function hissPitch(index) {
  return curve([[13.5, 900], [19.5, 1200], [24.5, 1800], [29.5, 2200], [34.5, 1800], [36.5, 2700], [39, 7600], [40, 2800], [42, 3800], [43.5, 2000]], index);
}

// How strongly a gap at `index` hisses. The sibilants (the tongue tip and blade just behind the
// teeth, from the postalveolar region to the alveolar ridge) are the loud ones, 1. Everywhere else the
// jet has nothing good to hit and the hiss is 10 to 25 dB quieter (measured against recordings, see
// `scripts/compare-consonants.mjs`): the lips and the throat least, the teeth in between. The
// labiodental gap is wide open at the lips, so the hiss that gets out needs more push.
export function hissLevel(index) {
  return curve([[13.5, 0.22], [19.5, 0.2], [24.5, 0.15], [29.5, 0.48], [33, 4], [37, 4], [39, 1.7], [40, 0.5], [42, 5.4], [43.5, 1.4]], index);
}

// The degrees that the symbols use, as named points on the degree dial.
export const DEGREE = { closed: 0, fricative: 0.42, lateral: 0.32 };

// **Voicing** is how much the voice is on. It is the one dial for every consonant. What it can
// reach depends on the gap, never on the symbol:
//
// - a gap narrow enough to hiss shares the airstream with the voice, so the voice sits well under
//   the hiss, as the quiet murmur under a real `z` does
// - a gap that is closed or only just open (a nasal, a glide, a lateral) lets the voice out much
//   more quietly than a vowel does: about 15 dB down in the recordings
// - a gap of 1.5 or more is a vowel, and the voice is full
//
// `voiceGain(hiss, gap)` is the most voice a consonant with that much hiss and that gap can have.
export function voiceGain(hiss, gap = 3) {
  if (hiss > 0) return 0.12;
  return curve([[0.9, 0.15], [1.5, 1]], gap);
}

// A consonant of a place and a degree, as the constriction the engine takes. This is the whole of
// the mapping from the space to a frame: nothing here depends on which symbol it is.
export function constriction(index, d) {
  return { index, d, n: d < 0.6 ? hissLevel(index) : 0 };
}

// **Approximants.** A narrowing too wide to hiss, which changes the vowel-like resonances. `j` is a
// palatal narrowing, `w` rounds the lips and raises the back of the tongue, `ɹ` (the English r) has
// two narrowings, one near the front and one in the throat.
const APPROXIMANTS = {
  ʋ: { c0: ['labiodental', 0.6] },
  ɹ: { c0: [33, 0.75], c1: [14.5, 1.0] },
  ɻ: { c0: ['retroflex', 0.75], c1: [14.5, 1.0] },
  j: { c0: ['palatal', 0.55] },
  ɰ: { c0: ['velar', 0.85] },
  w: { c0: ['labial-velar', 0.5], c1: [24.5, 0.9] },
  ɥ: { c0: ['labial-palatal', 0.5], c1: [29.5, 0.7] },
};

// **Laterals.** The midline is narrowed to 0.3, tight enough to dominate the sound. Lateral
// fricatives hiss at that gap.
const LATERAL_GAP = DEGREE.lateral;

// A lateral fricative lets the air out round the sides of the tongue, not over a jet, so it hisses
// far less than a sibilant: about 12 dB in the recordings.
const LATERAL_HISS = 0.25;

// ## Timings
//
// In seconds. These are about right for careful speech.
const T = {
  leadCarrier: 0.1,   // carrier vowel before the consonant
  leadNone: 0.03,
  leadAlone: 0.04,    // voice before a tap pressed on its own
  afterAlone: 0.04,
  close: 0.05,        // articulators moving into position
  open: 0.05,         // and out again
  stopHold: 0.12,    // closure of a stop
  fricativeHold: 0.24,
  nasalHold: 0.22,
  approximantHold: 0.16,
  trillHold: 0.3,
  tapClosure: 0.018,
  burst: 0.014,
  votPlain: 0.04,    // voice onset time of a plain voiceless stop
  votAspirated: 0.07,
  affricateFrication: 0.1,
  afterCarrier: 0.16,
  afterNone: 0.14,    // a short neutral vowel after a stop, so the release has something to release into
};

// How far a closure is open: the "not quite sealed" tube that lets a faint voice bar out of a voiced
// stop. The recordings put the voice bar about 28 dB under the vowel at every place, but the same
// leak is much quieter at the lips (nothing in front of it to resonate) than at the tongue, so the
// leak is a curve of the place, widest at the lips. A voiceless closure has no voice to leak, so it
// only needs `SEAL`: shut, but not so shut that the engine's loud release pop fires.
const SEAL = 0.015;
function leak(index) {
  return curve([[13.5, 0.005], [24.5, 0.007], [39, 0.012], [43.5, 0.07]], index);
}

// The burst at a release. The recordings put its pitch near 2.5 kHz at every place (it is a wide gap
// opening, not a groove, so the sibilant pitch of `s` does not apply), and its level near -30 dB under
// the vowel, but the same noise is much quieter out of the lips than out of the tongue tip, so the
// amount of noise needed is a curve of the place.
const BURST_HZ = 2500;
function burstLevel(index) {
  return curve([[13.5, 0.5], [24.5, 0.625], [29.5, 0.75], [33, 0.325], [39, 0.325], [40, 0.5], [42, 1.0], [43.5, 1.5]], index);
}

export const NEUTRAL_SHAPE = Object.freeze({ tongueIndex: 20, tongueDiameter: 3.0, lips: 1.5 });

// ## The gesture
//
// `consonantGesture(c, options)` returns:
//
// - `score`: the whole movement, from the carrier vowel (or silence) through the consonant and out
// - `hold`: the time range `{ start, end }` where the consonant is at its target, so a demo can
//   hold it for as long as a key is pressed; `null` for sounds that cannot be held (taps)
// - `kind`: a coarse family, useful for deciding how to treat a press
// - `core`: the time range with the consonant in it, without the vowels around it
//
// Options: `transitionScale` (1 for careful speech; below 1 shortens the time the articulators take
// to close and open, as in running speech), `f0` pitch, `carrier` (a vowel shape such as `{ tongueIndex, tongueDiameter, lips }`, or
// `null` for the consonant on its own), `aspirated`, `holdFor` (seconds, to lengthen the hold).
export function consonantGesture(c, { f0 = 130, carrier = null, aspirated = false, holdFor = null, transitionScale = 1 } = {}) {
  const kind = kindOf(c);
  // Taps and the glottal stop are only audible between sounds, so give them a neutral vowel.
  const needsContext = kind === 'tap' || c.symbol === 'ʔ';
  const shape = carrier || (needsContext ? NEUTRAL_SHAPE : NEUTRAL_SHAPE);
  const withVowel = Boolean(carrier) || needsContext;
  const base = {
    ...shape, velum: 0.01, c0d: 3, c1d: 3, c0n: 0, c1n: 0, c0m: 0, c0mHz: 0,
    f0, tenseness: 0.6, intensity: withVowel ? 1 : 0, aspiration: 0, noiseHz: 1000,
  };
  const tl = new Timeline(base);
  // A tap pressed on its own has no vowel to sit in, so it gets only a breath of voice either side
  // (not a whole vowel): you hear the flick, not "ɐɽɐ".
  const alone = kind === 'tap' && !carrier;
  const lead = alone ? T.leadAlone : withVowel ? T.leadCarrier : T.leadNone;
  const spec = specOf(c);
  const out = { f0, withVowel, aspirated, holdFor, lead, alone, tr: transitionScale };
  tl.at(lead, { c0i: spec.c0?.index ?? 30, c1i: spec.c1?.index ?? 30, noiseHz: spec.hz ?? 1000 });

  let hold = null;
  if (kind === 'continuant') hold = continuant(tl, c, spec, base, out);
  else if (kind === 'trill') hold = trill(tl, c, spec, base, out);
  else if (kind === 'stop') hold = stop(tl, c, spec, base, out);
  else if (kind === 'affricate') hold = affricate(tl, c, spec, base, out);
  else if (kind === 'tap') tap(tl, c, spec, base, out);
  // `core` is the stretch with the consonant itself in it: everything between the lead-in and the
  // vowel tail. The planner (Demo 3) uses it to splice a consonant between two vowels.
  const ks = tl.keyframes;
  const core = { start: lead, end: ks[ks.length - 2].t };
  return { score: tl.score, hold, kind, core, steady: hold ? steadyFrame(tl.score, hold) : null };
}

// What family of gesture a consonant belongs to.
export function kindOf(c) {
  if (c.manner === 'plosive') return 'stop';
  if (c.manner === 'affricate') return 'affricate';
  if (c.manner === 'tap') return 'tap';
  if (c.manner === 'trill') return 'trill';
  return 'continuant';
}

// The frame at the middle of the hold: what to hold while a key is down.
function steadyFrame(score, hold) {
  const mid = (hold.start + hold.end) / 2;
  const ks = score.keyframes;
  let best = ks[0];
  for (const k of ks) if (k.t <= mid) best = k;
  return { ...best };
}

// Place and manner become the numbers each family of gesture needs.
function specOf(c) {
  const pi = PLACE_INDEX[c.place];
  if (c.manner === 'fricative' || c.manner === 'affricate') {
    // The glottis has no place in the mouth; its fricatives are breath, set up separately.
    if (pi === null) return { c0: null, hz: 1000 };
    return { c0: constriction(pi, DEGREE.fricative), hz: hissPitch(pi) };
  }
  if (c.manner === 'lateral fricative') {
    const k = constriction(pi - 1, DEGREE.fricative);
    return { c0: { ...k, n: k.n * LATERAL_HISS }, hz: hissPitch(pi - 1) };
  }
  if (c.manner === 'lateral approximant') return { c0: { index: pi, d: LATERAL_GAP, n: 0 }, hz: 1000 };
  if (c.manner === 'approximant') {
    const a = APPROXIMANTS[c.symbol];
    const resolve = ([where, d]) => ({ index: typeof where === 'number' ? where : PLACE_INDEX[where], d, n: 0 });
    return { c0: resolve(a.c0), c1: a.c1 ? resolve(a.c1) : null, hz: 1000 };
  }
  if (c.manner === 'trill' || c.manner === 'tap' || c.manner === 'nasal' || c.manner === 'plosive') {
    return { c0: pi === null ? null : { index: pi, d: 0, n: 0 }, hz: pi === null ? 1000 : hissPitch(pi) };
  }
  return { c0: null, hz: 1000 };
}

// ## Continuants: fricatives, nasals, approximants, laterals
//
// Move to the target, hold, move back. Voicing is handled by what the consonant is: voiceless
// sounds switch the voice off while the constriction hisses (or while nothing is voiced at all
// when there is no carrier vowel), and voiced sounds keep it on.
function continuant(tl, c, spec, base, o) {
  const closeAt = o.lead + (T.close * o.tr);
  const hold = o.holdFor ?? (c.manner === 'nasal' ? T.nasalHold : c.manner.includes('fricative') ? T.fricativeHold : T.approximantHold);
  const holdEnd = closeAt + hold;
  const target = {};
  if (c.symbol === 'h' || c.symbol === 'ɦ') {
    // The glottal fricatives are pure breath through whatever shape the mouth is in.
    Object.assign(target, c.voiced
      ? { aspiration: 0.55, intensity: 0.55, tenseness: 0.25 }
      : { aspiration: 1, intensity: 0 });
  } else {
    if (spec.c0) Object.assign(target, { c0i: spec.c0.index, c0d: spec.c0.d, c0n: spec.c0.n });
    if (spec.c1) Object.assign(target, { c1i: spec.c1.index, c1d: spec.c1.d, c1n: spec.c1.n });
    if (c.manner === 'nasal') target.velum = 0.42;
    const hisses = Boolean(spec.c0 && spec.c0.n > 0);
    target.intensity = c.voiced ? voiceGain(spec.c0 ? spec.c0.n : 0, spec.c0 ? spec.c0.d : 3) : 0;
    if (hisses && c.voiced) target.tenseness = 0.45;
    if (c.symbol === 'ʍ') target.lips = 0.6;
    if (c.symbol === 'w' || c.symbol === 'ɥ') target.lips = 0.55;
  }
  const restoreVoice = o.withVowel ? { intensity: 1 } : { intensity: 0 };
  tl.at(closeAt, target);
  tl.at(holdEnd, {});
  const back = {
    c0d: 3, c1d: 3, c0n: 0, c1n: 0, velum: 0.01, aspiration: 0, tenseness: 0.6, lips: base.lips, ...restoreVoice,
  };
  tl.at(holdEnd + (T.open * o.tr), back);
  tl.at(holdEnd + (T.open * o.tr) + (o.withVowel ? T.afterCarrier : 0.03), {});
  return { start: closeAt, end: holdEnd };
}

// ## Trills
//
// A trill is a closure that is made and broken many times a second by the air itself. The engine
// has a flutter control (`c0m`, `c0mHz`) for the first constriction: a gap that opens and closes
// at about 25 Hz, with the voice on.
function trill(tl, c, spec, base, o) {
  const closeAt = o.lead + (T.close * o.tr);
  const holdEnd = closeAt + (o.holdFor ?? T.trillHold);
  tl.at(closeAt, { c0i: spec.c0.index, c0d: 0.2, c0m: 0.35, c0mHz: c.place === 'uvular' ? 30 : 25, c0n: 0.15, intensity: 1 });
  tl.at(holdEnd, {});
  tl.at(holdEnd + (T.open * o.tr), { c0d: 3, c0m: 0, c0mHz: 0, c0n: 0, intensity: o.withVowel ? 1 : 0 });
  tl.at(holdEnd + (T.open * o.tr) + (o.withVowel ? T.afterCarrier : 0.03), {});
  return { start: closeAt, end: holdEnd };
}

// ## Stops
//
// Close, hold, release. What you hear is mostly in the transitions:
//
// - **During the closure** a voiceless stop is silent. A voiced stop keeps the voice on, and
//   because the tube is not quite sealed (a tiny leak, `leak`), a faint low murmur gets out: the
//   "voice bar".
// - **At the release** the pent-up air makes a short burst of noise, and the engine adds a pop when
//   a closure opens. The burst's colour comes from the place.
// - **After the release**, voicing starts after a delay called *voice onset time*. Plain voiceless
//   stops have a short delay; aspirated ones (`pʰ`) a long one, filled with breath.
function stop(tl, c, spec, base, o) {
  const closeAt = o.lead + (T.close * o.tr);
  const releaseAt = closeAt + (o.holdFor ?? T.stopHold);
  if (c.symbol === 'ʔ') {
    // The glottal stop is the voice itself being cut off: no constriction in the mouth.
    tl.at(o.lead + 0.015, { intensity: 0, tenseness: 0.9 });
    tl.at(releaseAt, {});
    tl.at(releaseAt + 0.012, { intensity: 1, tenseness: 0.9 });
    tl.at(releaseAt + 0.06, { tenseness: 0.6 });
    tl.at(releaseAt + 0.06 + T.afterCarrier, {});
    return { start: o.lead + 0.03, end: releaseAt };
  }
  const voiced = c.voiced;
  const closure = { c0i: spec.c0.index, c0d: voiced ? leak(spec.c0.index) : SEAL, c0n: 0 };
  if (!voiced) closure.intensity = 0;
  else closure.intensity = o.withVowel ? 0.85 : 0.85;
  if (voiced) closure.tenseness = 0.5;
  tl.at(closeAt, closure);
  tl.at(releaseAt, {});
  // The release: the gap opens through the hissing range in a few milliseconds.
  const vot = voiced ? 0 : o.aspirated ? T.votAspirated : T.votPlain;
  tl.at(releaseAt + 0.004, { c0d: 0.38, c0n: burstLevel(spec.c0.index), noiseHz: BURST_HZ });
  tl.at(releaseAt + T.burst, { c0d: 1.2, c0n: burstLevel(spec.c0.index) / 2 });
  tl.at(releaseAt + T.burst + 0.012, { c0d: 3, c0n: 0 });
  // After it: breath for the voice onset time, then the voice.
  const aspiration = voiced ? 0 : o.aspirated ? 0.9 : 2;
  tl.at(releaseAt + T.burst + 0.012, { aspiration, c0d: 3 });
  tl.at(releaseAt + T.burst + 0.012 + vot, { aspiration: 0, intensity: 1, tenseness: 0.6 });
  tl.at(releaseAt + T.burst + 0.012 + vot + (o.withVowel ? T.afterCarrier : T.afterNone), {});
  return { start: closeAt, end: releaseAt };
}

// ## Affricates
//
// A stop whose release is slow enough to be a fricative: closure, then a gap that stays in the
// hissing range for about a tenth of a second.
function affricate(tl, c, spec, base, o) {
  const closeAt = o.lead + (T.close * o.tr);
  const releaseAt = closeAt + (o.holdFor ?? T.stopHold);
  const voiced = c.voiced;
  tl.at(closeAt, { c0i: spec.c0.index, c0d: voiced ? leak(spec.c0.index) : SEAL, c0n: 0, intensity: voiced ? 0.85 : 0, tenseness: voiced ? 0.5 : 0.6 });
  tl.at(releaseAt, {});
  tl.at(releaseAt + 0.006, { c0d: spec.c0.d, c0n: spec.c0.n, noiseHz: spec.hz, intensity: voiced ? voiceGain(spec.c0.n, spec.c0.d) : 0 });
  tl.at(releaseAt + 0.006 + T.affricateFrication, {});
  tl.at(releaseAt + 0.006 + T.affricateFrication + (T.open * o.tr), { c0d: 3, c0n: 0, intensity: o.withVowel || voiced ? 1 : 0, tenseness: 0.6 });
  tl.at(releaseAt + 0.006 + T.affricateFrication + (T.open * o.tr) + (o.withVowel ? T.afterCarrier : T.afterNone), {});
  if (!o.withVowel) tl.keyframes[tl.keyframes.length - 1].intensity = 1;
  return { start: closeAt, end: releaseAt };
}

// ## Taps
//
// One closure so brief that the articulator barely touches: about 18 ms, inside a vowel.
function tap(tl, c, spec, base, o) {
  const at = o.lead;
  tl.at(at + 0.012, { c0i: spec.c0.index, c0d: 3 });
  tl.at(at + 0.022, { c0d: 0, intensity: 0.8 });
  tl.at(at + 0.022 + T.tapClosure, {});
  tl.at(at + 0.022 + T.tapClosure + 0.012, { c0d: 3, intensity: 1 });
  tl.at(at + 0.022 + T.tapClosure + 0.012 + (o.alone ? T.afterAlone : T.afterCarrier), {});
}
