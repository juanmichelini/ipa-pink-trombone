// # IPA vowels
//
// The IPA vowel chart is a map of where the tongue is. Three ideas are enough to read it:
//
// - **Height** (vertical axis): how close the tongue is to the roof of the mouth. *Close* vowels
//   like `i` and `u` have a tall tongue, *open* vowels like `a` have a low one (and a wide-open jaw).
// - **Backness** (horizontal axis): where along the mouth the tongue's high point is, from *front*
//   (`i`) to *back* (`u`).
// - **Rounding**: whether the lips are pushed into a circle. Where two vowels share a spot on the
//   chart the one on the right is rounded: `i` is spread and `y` is rounded, with the same tongue.
//
// This file holds the inventory and the geometry of the chart. Turning a position into a vocal
// tract shape is `vowel-map.js`.

// ## Coordinates
//
// Every vowel gets two numbers, both from 0 to 1:
//
// - `b`, backness: 0 front, 0.5 central, 1 back
// - `h`, height: 0 close, 0.17 near-close, 0.33 close-mid, 0.5 mid, 0.67 open-mid, 0.83 near-open, 1 open
//
// The printed chart is a trapezoid: the front edge slants because the tongue cannot be as far
// forward when the jaw is open. `chartPosition` converts `(b, h)` into drawing coordinates, also
// from 0 to 1, and `fromChart` goes the other way, so a mouse position becomes an articulation.
export function chartPosition(b, h) {
  const left = 0.5 * h;
  return { x: left + b * (1 - left), y: h };
}

export function fromChart(x, y) {
  const h = Math.min(1, Math.max(0, y));
  const left = 0.5 * h;
  return { b: Math.min(1, Math.max(0, (x - left) / (1 - left))), h };
}

// ## Reference formants
//
// A vowel's identity is mostly its first two resonances, **F1** (high for open vowels) and **F2**
// (high for front vowels). The values below are typical adult male figures in Hz. The eight primary
// and eight secondary cardinal vowels use the measurements published by Ladefoged; the rest are
// round-number estimates from the usual textbook ranges, and are marked `approx`. They are targets
// for calibrating the vocal tract, not a claim about any particular speaker.
//
// Fields: `symbol`, `name`, `b`, `h`, `rounded`, `f1`, `f2`, `approx`.
const v = (symbol, name, b, h, rounded, f1, f2, approx = false) => ({ symbol, name, b, h, rounded, f1, f2, approx });

export const VOWELS = [
  // close
  v('i', 'close front unrounded', 0, 0, false, 240, 2400),
  v('y', 'close front rounded', 0, 0, true, 235, 2100),
  v('ɨ', 'close central unrounded', 0.5, 0, false, 240, 1700, true),
  v('ʉ', 'close central rounded', 0.5, 0, true, 250, 1250, true),
  v('ɯ', 'close back unrounded', 1, 0, false, 300, 1390),
  v('u', 'close back rounded', 1, 0, true, 250, 595),
  // near-close
  v('ɪ', 'near-close near-front unrounded', 0.15, 0.17, false, 390, 1990, true),
  v('ʏ', 'near-close near-front rounded', 0.15, 0.17, true, 440, 1700, true),
  v('ʊ', 'near-close near-back rounded', 0.85, 0.17, true, 440, 1020, true),
  // close-mid
  v('e', 'close-mid front unrounded', 0, 0.33, false, 390, 2300),
  v('ø', 'close-mid front rounded', 0, 0.33, true, 370, 1900),
  v('ɘ', 'close-mid central unrounded', 0.5, 0.33, false, 400, 1700, true),
  v('ɵ', 'close-mid central rounded', 0.5, 0.33, true, 380, 1350, true),
  v('ɤ', 'close-mid back unrounded', 1, 0.33, false, 460, 1310),
  v('o', 'close-mid back rounded', 1, 0.33, true, 360, 640),
  // mid
  v('ə', 'mid central', 0.5, 0.5, false, 500, 1500, true),
  // open-mid
  v('ɛ', 'open-mid front unrounded', 0, 0.67, false, 610, 1900),
  v('œ', 'open-mid front rounded', 0, 0.67, true, 585, 1710),
  v('ɜ', 'open-mid central unrounded', 0.5, 0.67, false, 560, 1500, true),
  v('ɞ', 'open-mid central rounded', 0.5, 0.67, true, 540, 1300, true),
  v('ʌ', 'open-mid back unrounded', 1, 0.67, false, 600, 1170),
  v('ɔ', 'open-mid back rounded', 1, 0.67, true, 500, 700),
  // near-open
  v('æ', 'near-open front unrounded', 0, 0.83, false, 820, 1700, true),
  v('ɐ', 'near-open central', 0.5, 0.83, false, 750, 1400, true),
  // open
  v('a', 'open front unrounded', 0, 1, false, 850, 1610),
  v('ɶ', 'open front rounded', 0, 1, true, 820, 1530),
  v('ɑ', 'open back unrounded', 1, 1, false, 750, 940),
  v('ɒ', 'open back rounded', 1, 1, true, 700, 760),
];

export const VOWEL_SYMBOLS = VOWELS.map((x) => x.symbol);

export function vowelBySymbol(symbol) {
  return VOWELS.find((x) => x.symbol === symbol) || null;
}

// ## The jaw
//
// An open vowel needs an open mouth; the tongue alone cannot raise F1 high enough. The model
// widens the opening at the lips with height, the way a jaw drops. It is relaxed (1.5) up to
// close-mid and then opens toward 2.8 at the open end. Calibration (`scripts/calibrate-vowels.mjs`)
// was done with this function in place, so it is part of the model, not an afterthought.
export function jawOpening(h) {
  return 1.5 + 1.3 * Math.min(1, Math.max(0, (h - 0.33) / 0.67));
}

// ## Between the symbols
//
// The chart is continuous: a mouse can be anywhere on it, not only on a symbol. Calibration pins
// numbers at the vowels themselves (the **anchors**). Anywhere else, the value is an
// inverse-distance-weighted blend of the anchors: nearby anchors count much more than far ones, and
// at an anchor the answer is exactly the calibrated value. `power` controls how local the blend is.
// `keys` names the numeric fields to blend.
export function blendAnchors(anchors, b, h, keys, power = 3) {
  const out = Object.fromEntries(keys.map((k) => [k, 0]));
  let wSum = 0;
  for (const a of anchors) {
    const d2 = (a.b - b) ** 2 + (a.h - h) ** 2;
    if (d2 < 1e-9) return Object.fromEntries(keys.map((k) => [k, a[k]]));
    const w = 1 / Math.pow(d2, power / 2);
    wSum += w;
    for (const k of keys) out[k] += w * a[k];
  }
  for (const k of keys) out[k] /= wSum;
  return out;
}
