// # From IPA to a score
//
// This is where vowels and consonants meet. The planner takes the segments from `ipa.js` and builds
// one score that moves through them, using the vowel shapes from Demo 1 and the consonant gestures
// from Demo 2.
//
// The hard part is that speech is not a row of separate sounds. The tongue does not return to
// neutral between segments; it is already travelling to the next vowel while the lips close for a
// `b`. This is **coarticulation**, and the planner handles it in one simple way:
//
// - a **vowel** is a target shape, reached by gliding from wherever the tract was
// - a **consonant** is built with the *previous* vowel as its carrier, and then the tongue is
//   steered so that it leaves the previous vowel as the consonant begins and arrives at the *next*
//   vowel as it ends. The consonant gesture itself (lips, tip, velum, noise) is untouched.
//
// So in `aba` the tongue stays near `a` through the whole `b`; in `ibu` it travels from `i` to `u`
// while the lips are closed. Nothing is stored per pair of sounds. It is one rule applied to every
// pair.
import { Timeline } from './score.js';
import { tokenize } from './ipa.js';
import { shapeOfSymbol } from './vowel-map.js';
import { vowelBySymbol } from './vowels.js';
import { consonantBySymbol, consonantGesture, NEUTRAL_SHAPE } from './consonants.js';

// ## Timing parameters
//
// Seconds at a medium speaking rate. Demos 6 and 7 replace these with something cleverer.
export const TIMING = {
  vowel: 0.14,
  longFactor: 1.8,
  halfFactor: 1.3,
  stressFactor: 1.2,
  consonantScale: 0.6,
  glide: 0.05,
  wordGap: 0.05,
  startSilence: 0.04,
  endFade: 0.05,
  nasalVelum: 0.3,
  toneFactor: 1.4,   // vowels carrying a tone are longer, so the contour has room
  toneStep: 0.12,    // octaves per tone level
};

const shapeKeys = (s) => ({ tongueIndex: s.tongueIndex, tongueDiameter: s.tongueDiameter, lips: s.lips });
const OPEN_MOUTH = { c0d: 3, c1d: 3, c0n: 0, c1n: 0, c0m: 0, c0mHz: 0, aspiration: 0 };

// The pitch bump for a stressed syllable: primary stress is a little higher than secondary.
const ACCENT = [1, 1.05, 1.1];

// ## The planner
//
// Options: `f0` (base pitch), `tenseness`, `declination` (fraction by which pitch falls over the
// utterance, as speakers naturally let it drift down), `timing` overrides, `vibratoDepth`,
// `vibratoRate` and `jitter` for the voice, and `range`, which scales every pitch movement (stress
// accents and tone contours) so a lively voice moves more than a flat one.
export function plan(input, { f0 = 130, tenseness = 0.6, declination = 0.08, timing = {}, vibratoDepth = 0, vibratoRate = 5.5, jitter = 0, range = 1 } = {}) {
  const T = { ...TIMING, ...timing };
  const tokens = typeof input === 'string' ? tokenize(input) : input;
  const segs = tokens.filter((t) => t.type !== 'unknown');
  const tl = new Timeline({ ...shapeKeys(NEUTRAL_SHAPE), f0, tenseness, intensity: 0, velum: 0.01, vibratoDepth, vibratoRate, jitter });
  const marks = [];
  let t = T.startSilence;
  tl.at(t, {});
  let previous = NEUTRAL_SHAPE;      // where the tongue is now
  let atStart = true;                // nothing has been voiced yet
  let pitch = f0;                    // the pitch the voice is at now, so consonants do not reset it

  const nextVowelShape = (from) => {
    for (let j = from + 1; j < segs.length; j++) {
      if (segs[j].type === 'vowel') return shapeKeys(shapeOfSymbol(segs[j].symbol));
      if (segs[j].type === 'break' && segs[j].kind === 'pause') break;
    }
    return null;
  };

  segs.forEach((seg, i) => {
    if (seg.type === 'break') {
      if (seg.kind === 'word') { t += T.wordGap; tl.at(t, {}); }
      else if (seg.kind === 'pause') {
        tl.at(t + 0.03, { intensity: 0, aspiration: 0 });
        t += seg.seconds; tl.at(t, {});
        atStart = true;
      }
      return;
    }
    if (seg.type === 'vowel') {
      const shape = shapeKeys(shapeOfSymbol(seg.symbol));
      let d = T.vowel * (seg.long ? T.longFactor : seg.half ? T.halfFactor : 1) * (seg.stress ? T.stressFactor : 1);
      const voiced = seg.voicing !== false;
      const accent = f0 * (1 + (ACCENT[seg.stress] - 1) * range);
      if (seg.tone) d *= T.toneFactor;
      const start = t;
      // A tone is a list of pitch levels (5 high, 1 low) spread evenly across the vowel.
      const levels = seg.tone || [3];
      const hz = (l) => (seg.tone ? accent * Math.pow(2, (l - 3) * T.toneStep * range) : accent);
      const glide = Math.min(T.glide, d * 0.4);
      tl.at(t + glide, {
        ...shape, ...OPEN_MOUTH, velum: seg.nasalized ? T.nasalVelum : 0.01,
        intensity: voiced ? 1 : 0, aspiration: voiced ? 0 : 0.8, f0: hz(levels[0]), tenseness,
      });
      for (let k = 1; k < levels.length; k++) tl.at(t + glide + ((d - glide) * k) / (levels.length - 1), { f0: hz(levels[k]) });
      t += d;
      if (levels.length === 1) tl.at(t, {});
      pitch = hz(levels[levels.length - 1]);
      previous = shape;
      atStart = false;
      marks.push({ index: i, symbol: seg.symbol, type: 'vowel', start, end: t });
      return;
    }
    // A consonant.
    const base = consonantBySymbol(seg.symbol);
    const c = seg.voicing === null ? base : { ...base, voiced: seg.voicing };
    const options = { f0, carrier: previous, aspirated: seg.aspirated };
    let g = consonantGesture(c, options);
    // Isolated, a consonant is held long enough to study. In running speech it is shorter.
    const natural = g.hold ? g.hold.end - g.hold.start : null;
    if (natural) {
      const factor = T.consonantScale * (seg.long ? T.longFactor : seg.half ? T.halfFactor : 1);
      g = consonantGesture(c, { ...options, holdFor: natural * factor });
    }
    const next = nextVowelShape(i) || previous;
    const from = shapeKeys(previous);
    const hold = g.hold || g.core;
    const start = t;
    const offset = t - g.core.start;
    for (const k of g.score.keyframes) {
      if (k.t < g.core.start - 1e-9 || k.t > g.core.end + 1e-9) continue;
      const { t: kt, ...frame } = k;
      // Steer the tongue: previous vowel until the gesture begins, next vowel once it ends.
      Object.assign(frame, kt <= hold.start + 1e-9 ? from : next);
      // The first sound of an utterance starts from silence, not from a vowel that was never said.
      if (atStart && kt <= hold.start + 1e-9) { frame.intensity = 0; frame.aspiration = 0; }
      frame.f0 = pitch;
      tl.at(kt + offset, frame);
    }
    t = g.core.end + offset;
    previous = next;
    atStart = false;
    marks.push({ index: i, symbol: seg.symbol, type: 'consonant', start, end: t });
  });

  tl.at(t + T.endFade, { intensity: 0, aspiration: 0, c0n: 0, c1n: 0 });
  const score = applyDeclination(tl.score, declination);
  return { score, marks, duration: score.duration };
}

// ## Declination
//
// Pitch in a statement drifts downward from start to end. Applying it after planning means no
// other part of the planner needs to know about it.
function applyDeclination(score, amount) {
  const total = score.duration || 1;
  const keyframes = score.keyframes.map((k) => ({ ...k, f0: k.f0 * (1 - amount * (k.t / total)) }));
  return { keyframes, duration: score.duration };
}

// Which segment is sounding at time `t`, for highlighting. Between two segments it is the earlier.
export function markAt(marks, t) {
  let found = null;
  for (const m of marks) if (m.start <= t) found = m; else break;
  return found;
}

export { vowelBySymbol };
