// # From the IPA chart to a vocal tract
//
// This is Demo 1's central idea in one function: **a position on the IPA vowel chart becomes a
// tongue position, a jaw opening and a lip shape.**
//
// `vowel-fit.js` is the result of calibration (`scripts/calibrate-vowels.mjs`): the tongue index
// and diameter that reproduce each unrounded vowel's formants, and the lip rounding that
// reproduces each rounded vowel's. Everything between the symbols is a smooth blend of those.
import { FIT } from './vowel-fit.js';
import { VOWELS, vowelBySymbol, jawOpening, blendAnchors } from './vowels.js';
import { DEFAULT_FRAME } from './score.js';

// ## The shape
//
// - `b` and `h`: backness and height, 0 to 1 (see `vowels.js`)
// - `rounded`: 0 for spread lips up to 1 for fully rounded; in between is a half-rounded vowel
//
// The jaw opens with height. Rounding then closes the lips to a fraction of that opening, and the
// fraction comes from the calibrated rounded vowels nearest on the chart.
export function vowelShape(b, h, rounded = 0) {
  const tongue = blendAnchors(FIT.anchors, b, h, ['tongueIndex', 'tongueDiameter']);
  const { ratio } = blendAnchors(FIT.rounding, b, h, ['ratio'], 2);
  const lips = jawOpening(h) * (1 - rounded + rounded * ratio);
  return { tongueIndex: tongue.tongueIndex, tongueDiameter: tongue.tongueDiameter, lips };
}

// The shape of a named vowel, rounding included.
export function shapeOfSymbol(symbol) {
  const v = vowelBySymbol(symbol);
  if (!v) return null;
  return vowelShape(v.b, v.h, v.rounded ? 1 : 0);
}

// ## A frame you can hear
//
// A shape plus a source: voicing on, a steady pitch, the nose closed.
export function vowelFrame(shape, { f0 = 130, tenseness = 0.6, intensity = 1 } = {}) {
  return { ...DEFAULT_FRAME, ...shape, velum: 0.01, c0d: 3, c1d: 3, c0n: 0, c1n: 0, f0, tenseness, intensity, aspiration: 0 };
}

// ## A run of vowels
//
// A score that moves from vowel to vowel: glide to each one, hold it, glide on. Used by the demo's
// "play them all" button and by tests.
export function vowelSequence(symbols, { f0 = 130, hold = 0.45, glide = 0.18, tenseness = 0.6 } = {}) {
  const keyframes = [];
  const marks = [];
  let t = 0;
  for (const symbol of symbols) {
    const shape = shapeOfSymbol(symbol);
    if (!shape) throw new Error(`unknown vowel ${symbol}`);
    const v = vowelBySymbol(symbol);
    const frame = vowelFrame(shape, { f0, tenseness });
    keyframes.push({ t, ...frame });
    keyframes.push({ t: t + hold, ...frame });
    marks.push({ symbol, b: v.b, h: v.h, start: t, end: t + hold });
    t += hold + glide;
  }
  const duration = Math.max(0, t - glide);
  // `marks` tells a picture where the chart cursor is at any moment: on a vowel during its hold,
  // sliding to the next during the glide.
  return { keyframes, duration, symbols, marks };
}

// Where the cursor is at time `t` of a sequence, as `{ b, h, symbol }`.
export function cursorAt(sequence, t) {
  const { marks } = sequence;
  if (!marks.length) return null;
  let i = 0;
  while (i + 1 < marks.length && t >= marks[i + 1].start) i++;
  const m = marks[i], next = marks[i + 1];
  if (!next || t <= m.end) return { b: m.b, h: m.h, symbol: m.symbol };
  const u = Math.min(1, (t - m.end) / (next.start - m.end));
  return { b: m.b + (next.b - m.b) * u, h: m.h + (next.h - m.h) * u, symbol: u > 0.5 ? next.symbol : m.symbol };
}

export { VOWELS };
