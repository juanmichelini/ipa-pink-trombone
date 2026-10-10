// # Calibrating the vowel map
//
// Run with `node scripts/calibrate-vowels.mjs` (add `--write` to regenerate `lib/vowel-fit.js`).
//
// The engine takes a tongue position (an index along the tract and a diameter) and a lip opening.
// The IPA chart gives a position and a rounding. This script finds the mapping between them by
// *measuring*, never by guessing: for each vowel it tries tongue positions, measures the formants
// the tract makes with `analysis.js`, and keeps the position whose F1 and F2 are closest (in
// ratio) to the vowel's reference formants.
//
// 1. **Anchors.** For every unrounded vowel, search the tongue grid with the jaw opening fixed by
//    its height (`jawOpening`). The winners are the anchors.
// 2. **Rounding.** A rounded vowel shares the tongue of its unrounded partner, so its tongue is
//    the blend of the anchors at its chart position, and only the lips are searched. Rounding is
//    expressed as a *ratio of the jaw opening*, because the same amount of lip narrowing means
//    different things for a closed and an open mouth. The ratios become a second set of anchors.
// 3. **Report.** Print how close every vowel in the inventory ends up, and write the fit.
import { writeFile } from 'node:fs/promises';
import { formants } from '../lib/analysis.js';
import { VOWELS, jawOpening, blendAnchors } from '../lib/vowels.js';

const measure = (frame) => formants(frame, { steps: 8192, count: 3 });
const cost = (F, v) => (F.length < 2 ? Infinity : Math.abs(Math.log(F[0] / v.f1)) + Math.abs(Math.log(F[1] / v.f2)));

// ## Step 1: anchors
//
// The search range is wider than Pink Trombone's mouse control (tongue index 12 to 29, diameter 2.05
// to 3.5). That range is an interface choice, not a limit of the model, and a few vowels (the
// close central and back unrounded ones, and open back `ɑ`) need a tongue that goes further back or
// a tighter constriction than the mouse allows.
const INDEX_RANGE = [8, 31];
const DIAMETER_RANGE = [1.9, 3.5];
const anchors = [];
for (const v of VOWELS.filter((x) => !x.rounded)) {
  const lips = jawOpening(v.h);
  let best = { cost: Infinity };
  for (let idx = INDEX_RANGE[0]; idx <= INDEX_RANGE[1] + 0.001; idx += 0.5) {
    for (let diam = DIAMETER_RANGE[0]; diam <= DIAMETER_RANGE[1] + 0.0001; diam += 0.05) {
      const F = measure({ tongueIndex: idx, tongueDiameter: diam, lips });
      const c = cost(F, v);
      if (c < best.cost) best = { cost: c, idx, diam, F };
    }
  }
  anchors.push({ symbol: v.symbol, b: v.b, h: v.h, tongueIndex: +best.idx.toFixed(2), tongueDiameter: +best.diam.toFixed(2) });
}

// ## Step 2: rounding
const rounding = [];
for (const v of VOWELS.filter((x) => x.rounded)) {
  const tongue = blendAnchors(anchors, v.b, v.h, ['tongueIndex', 'tongueDiameter']);
  const jaw = jawOpening(v.h);
  let best = { cost: Infinity };
  for (let ratio = 0.12; ratio <= 1.0001; ratio += 0.02) {
    const F = measure({ ...tongue, lips: jaw * ratio });
    const c = cost(F, v);
    if (c < best.cost) best = { cost: c, ratio };
  }
  rounding.push({ symbol: v.symbol, b: v.b, h: v.h, ratio: +best.ratio.toFixed(2), cost: best.cost });
}

// ## Step 3: report
console.log('anchors (unrounded):');
for (const x of anchors) console.log(' ', x.symbol, `b=${x.b} h=${x.h}`, `index ${x.tongueIndex}`, `diameter ${x.tongueDiameter}`);
console.log('rounding: best lips per vowel');
for (const r of rounding) console.log(' ', r.symbol, `b=${r.b} h=${r.h}`, `ratio ${r.ratio}`, `cost ${r.cost.toFixed(3)}`);

const fit = { anchors, rounding: rounding.map(({ symbol, b, h, ratio }) => ({ symbol, b, h, ratio })) };
if (process.argv.includes('--write')) {
  const text = `// # Vowel calibration (generated)
//
// Do not edit by hand. Produced by \`scripts/calibrate-vowels.mjs\`, which measures the engine's
// formants and picks the tongue position closest to each vowel's reference formants. Re-run the
// script after changing the engine's tract model and commit the result.
//
// - \`anchors\`: the calibrated tongue (index, diameter) at each unrounded vowel's chart position
// - \`rounding\`: for each rounded vowel, how far the lips close, as a fraction of the jaw opening
export const FIT = ${JSON.stringify(fit, null, 2)};
`;
  await writeFile(new URL('../lib/vowel-fit.js', import.meta.url), text);
  console.log('wrote lib/vowel-fit.js');
}
