// # Consonants against real recordings
//
// Holds each consonant of `lib/consonants.js` up to a recording of a human saying it between two
// "a" vowels (the Wikipedia IPA chart with audio; `node scripts/fetch-reference.mjs` downloads them
// into the git-ignored `ref/`). For every consonant it prints one row of numbers, reference first and
// ours second, and with `--png` it saves the two spectrograms side by side to `out/compare/`.
//
// Usage: `node scripts/compare-consonants.mjs [--png] [--debug] [symbol ...]`
//
// ## How a recording is read
//
// The recordings differ from speaker to speaker ("sa asa", "aba aba", ...), so nothing here assumes a
// layout. A **vowel run** is a stretch of frames that look like the recording's own "a" (see
// `frames` below). Each gap between two vowel runs is one *consonant instance*; so is a hissing stretch next to
// a vowel at the edge of the file ("sa"). Pauses between repetitions are longer than any consonant
// and are skipped. The instances of one recording are averaged. Our own render goes through exactly
// the same procedure, so the two are measured the same way.
//
// ## What is measured, per instance
//
// - `dur`: milliseconds from the end of one vowel to the start of the next
// - `lvl`: the consonant's level (median over its frames) in dB re the neighbouring vowels
// - `voice`, `hiss`: power below 500 Hz (median) and above 2 kHz (90th percentile), in dB re the vowels;
//   `voice - hiss` says whether the sound is a buzz under a hiss or the other way round
// - `cent`, `peak`: centroid and peak frequency (Hz) of the hiss, from the frames where the noise
//   above 2 kHz is within 12 dB of its loudest, so a stop's burst is judged by the burst and not by the
//   silence around it
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONSONANTS, consonantBySymbol, consonantGesture } from '../lib/consonants.js';
import { shapeOfSymbol } from '../lib/vowel-map.js';
import { renderScore } from '../lib/render.js';
import { readWav, stft, db, band, encodePng, ramp } from './dsp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const wanted = args.filter((a) => !a.startsWith('--'));
const OUT = join(ROOT, 'out', 'compare');

const FRAME = 220, SIZE = 1024;                  // 5 ms hop, 23 ms window at 44.1 kHz
const VOWEL_BAND = [500, 1500], VOICE_BAND = [0, 500], HISS_FROM = 2000;
const MAX_SILENCE = 0.15;                        // s: a silence this long inside a gap makes it a pause
const MAX_GAP = 0.4;                             // s: longer gaps between vowels are pauses, not consonants

// ## Finding the consonant instances
//
// A frame is described by its level in fourteen coarse bands up to 11 kHz. The "a" of the recording
// is the average of its loudest vowel-like frames (voiced, with more energy at 500 to 1500 Hz than
// above 2 kHz). A frame is *vowel* if its band shape is within a few dB of that average and it is not
// much quieter. Judging by shape and not by the level in one band is what makes it work for hisses
// (loud, but the wrong shape) and for approximants (quiet change, but a different shape).
const EDGES = [0, 250, 500, 750, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000, 6500, 8000, 11000];

function frames(samples, rate) {
  const S = stft(samples, rate, SIZE, Math.round((FRAME * rate) / 44100));
  const nyq = rate / 2;
  const f = S.power.map((p, i) => ({
    t: S.time[i], p,
    tot: db(band(p, S.binHz, 0, nyq)), vow: db(band(p, S.binHz, ...VOWEL_BAND)), high: db(band(p, S.binHz, HISS_FROM, nyq)),
    bands: EDGES.slice(1).map((hi, k) => db(band(p, S.binHz, EDGES[k], hi))),
  }));
  const like = f.filter((x) => x.vow - x.high >= 6);
  const pool = like.length >= 5 ? like : [...f].sort((x, y) => y.tot - x.tot).slice(0, Math.max(5, f.length >> 3));
  const top = Math.max(...pool.map((x) => x.tot));
  const loud = pool.filter((x) => x.tot >= top - 8);
  const proto = EDGES.slice(1).map((_, k) => loud.reduce((s, x) => s + x.bands[k], 0) / loud.length);
  const floor = Math.max(...proto) - 55, pm = proto.reduce((s, v) => s + Math.max(v, floor), 0) / proto.length;
  for (const x of f) {
    const m = x.bands.reduce((s, v) => s + Math.max(v, floor), 0) / proto.length;
    x.dist = Math.sqrt(x.bands.reduce((s, v, k) => s + (Math.max(v, floor) - m - (Math.max(proto[k], floor) - pm)) ** 2, 0) / proto.length);
  }
  return { S, f, hop: S.hop / rate, top };
}

function runs(f, test) {
  const out = [];
  for (let i = 0; i < f.length; i++) {
    if (!test(f[i])) continue;
    let j = i; while (j + 1 < f.length && test(f[j + 1])) j++;
    out.push([i, j]); i = j;
  }
  return out;
}

// Mean power in dB of some frames, for a chosen band.
const meanDb = (fs, pick) => db(fs.reduce((s, x) => s + pick(x), 0) / Math.max(1, fs.length));

export function instances(samples, rate) {
  const { S, f, hop, top } = frames(samples, rate);
  const hmax = Math.max(...f.map((x) => x.high));
  const minRun = Math.round(0.05 / hop), minGap = Math.round(0.015 / hop);
  // Vowel runs; if no gap between vowels turns up (a very vowel-like approximant), be stricter.
  let vr = [];
  for (const maxDist of [9, 7, 5.5, 4]) {
    const raw = runs(f, (x) => x.dist <= maxDist && x.tot >= top - 25);
    vr = [];
    for (const r of raw) {
      if (vr.length && r[0] - vr[vr.length - 1][1] <= 3) vr[vr.length - 1][1] = r[1]; else vr.push([...r]);
    }
    vr = vr.filter(([a, b]) => b - a + 1 >= minRun);
    if (vr.slice(1).some((r, i) => r[0] - vr[i][1] - 1 >= minGap && (r[0] - vr[i][1]) * hop <= MAX_GAP)) break;
  }
  // A vowel's own level: its plateau, the frames within 3 dB of its loudest.
  const vowelDb = ([a, b]) => {
    const t = Math.max(...f.slice(a, b + 1).map((x) => x.tot));
    return meanDb(f.slice(a, b + 1).filter((x) => x.tot >= t - 3), (x) => Math.pow(10, x.tot / 10));
  };
  const spans = [];
  for (let i = 1; i < vr.length; i++) {
    const a = vr[i - 1][1] + 1, b = vr[i][0] - 1;
    // A gap holding a stretch of real silence is the pause between two repetitions, not a consonant.
    const silent = f.slice(a, b + 1).filter((x) => x.tot < top - 50).length * hop;
    if (b - a + 1 >= minGap && (b - a + 1) * hop <= MAX_GAP && silent < MAX_SILENCE) spans.push({ a, b, ref: [vr[i - 1], vr[i]], edge: false });
  }
  // A hissing consonant against the edge of the recording ("sa"): loud noise right next to a vowel.
  const hissy = (x) => x.high >= hmax - 20 && x.vow - x.high < 6;
  if (vr.length) {
    const [first, last] = [vr[0], vr[vr.length - 1]];
    let a = first[0]; while (a > 0 && hissy(f[a - 1])) a--;
    if (first[0] - a >= Math.round(0.04 / hop)) spans.push({ a, b: first[0] - 1, ref: [first], edge: true });
    let b = last[1]; while (b < f.length - 1 && hissy(f[b + 1])) b++;
    if (b - last[1] >= Math.round(0.04 / hop)) spans.push({ a: last[1] + 1, b, ref: [last], edge: true });
  }
  return {
    S, f, hop, rate, vowels: vr.map(([a, b]) => `${f[a].t.toFixed(2)}–${f[b].t.toFixed(2)}`),
    list: spans.map(({ a, b, ref, edge }) => ({ a, b, edge, t0: f[a].t - hop / 2, t1: f[b].t + hop / 2, vowel: ref.reduce((s, r) => s + vowelDb(r), 0) / ref.length })),
  };
}

// ## Measuring one instance
export function measure(an, inst) {
  const { f, S, rate } = an;
  const fs = f.slice(inst.a, inst.b + 1);
  const nyq = rate / 2;
  // Levels are taken per frame and summarised by a percentile, not a mean of power: a mean is carried
  // by whichever frames are loudest (the release of a stop), a percentile says what the sound is like
  // for most of its length. `voice` and `lvl` use the median; `hiss` the 90th percentile, so that a
  // burst or a fricative's plateau counts, and not the silence around it.
  const pct = (xs, q) => { const v = [...xs].sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.floor(q * v.length))]; };
  // Nothing is measured below -40 dB re the vowel: that is the room noise of a recording, or digital silence.
  const floor = (x) => Math.max(-40, x);
  const out = {
    dur: (inst.b - inst.a + 1) * an.hop * 1000,
    lvl: floor(pct(fs.map((x) => x.tot), 0.5) - inst.vowel),
    voice: floor(pct(fs.map((x) => db(band(x.p, S.binHz, ...VOICE_BAND))), 0.5) - inst.vowel),
    hiss: floor(pct(fs.map((x) => x.high), 0.9) - inst.vowel),
    cent: NaN, peak: NaN,
  };
  // The hiss spectrum: average of the frames where the noise is within 12 dB of its loudest.
  const hmax = Math.max(...fs.map((x) => x.high));
  if (hmax - inst.vowel > -50) {
    const loud = fs.filter((x) => x.high >= hmax - 12);
    const kLo = Math.ceil(1500 / S.binHz), kHi = Math.min(S.size / 2, Math.floor(16000 / S.binHz));
    const avg = new Float64Array(S.size / 2 + 1);
    for (const x of loud) for (let k = 0; k < avg.length; k++) avg[k] += x.p[k] / loud.length;
    let num = 0, den = 0, best = -1, bestV = 0;
    for (let k = kLo; k <= kHi; k++) {
      num += k * S.binHz * avg[k]; den += avg[k];
      // Peak of the spectrum smoothed over 9 bins (about 380 Hz), so one noisy bin is not the peak.
      let s = 0; for (let j = -4; j <= 4; j++) s += avg[Math.min(avg.length - 1, Math.max(0, k + j))];
      if (s > bestV) { bestV = s; best = k; }
    }
    out.cent = num / den; out.peak = best * S.binHz;
  }
  return out;
}

const finite = (xs) => xs.filter(Number.isFinite);
const mean = (xs) => { const v = finite(xs); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN; };

// `known` is a time range `{ start, end }` to use if no consonant is found by listening (our own
// render knows where its consonant is; a sound that never leaves the "a" shape is reported with `*`).
export function summarise(samples, rate, known = null) {
  const an = instances(samples, rate);
  let guessed = false;
  // Only the instances that lie on the known consonant count; a sound too like the vowel to be told
  // from it by ear (or by band shape) falls back to the known range.
  if (known) {
    an.list = an.list.filter((i) => Math.min(i.t1, known.end) - Math.max(i.t0, known.start) > 0.5 * (i.t1 - i.t0));
    const found = an.list.reduce((sum, i) => sum + (i.t1 - i.t0), 0);
    if (found < 0.5 * (known.end - known.start)) an.list = [];
  }
  if (!an.list.length && known) {
    const a = Math.round(known.start / an.hop), b = Math.min(an.f.length - 1, Math.round(known.end / an.hop));
    const t = Math.max(...an.f.map((x) => x.tot));
    an.list.push({ a, b, t0: known.start, t1: known.end, vowel: t });
    guessed = true;
  }
  const ms = an.list.map((i) => measure(an, i));
  const keys = ['dur', 'lvl', 'voice', 'hiss', 'cent', 'peak'];
  // The pause between two repetitions can only make a gap longer, so the duration is the shortest gap
  // between two vowels (or, for a hiss that only has a vowel on one side, the shortest of those).
  const between = ms.filter((_, i) => !an.list[i].edge);
  const dur = Math.min(...(between.length ? between : ms).map((m) => m.dur));
  return { an, n: ms.length, guessed, ...Object.fromEntries(keys.map((k) => [k, mean(ms.map((m) => m[k]))])), dur: Number.isFinite(dur) ? dur : NaN };
}

// ## Which recording is which consonant
//
// The chart writes an affricate `ts` or `t̠ʃ`; the repo writes `t͡s` and `t͡ʃ`.
const TIE = '͡', MINUS = '̠';
function referenceFile(sym) {
  const flat = sym.replace(TIE, '');
  const [first, ...rest] = [...flat];
  for (const name of [sym, flat, first + MINUS + rest.join('')]) {
    const p = join(ROOT, 'ref', `${name}.wav`);
    if (existsSync(p)) return p;
  }
  return null;
}

// ## Spectrograms side by side
const WINDOW = 0.9, PX_HOP = 110, PX_SIZE = 512, ROWS = 232;   // 0.9 s, 2.5 ms per column, 0 to 10 kHz
function panel(samples, rate, centre) {
  const S = stft(samples, rate, PX_SIZE, PX_HOP);
  const cols = Math.round((WINDOW * rate) / PX_HOP), first = Math.round(((centre - WINDOW / 2) * rate) / PX_HOP);
  const at = (c) => S.power[first + c];
  let top = -1e9;
  for (let c = 0; c < cols; c++) if (at(c)) for (let k = 0; k < ROWS; k++) top = Math.max(top, db(at(c)[k]));
  return { cols, at, top, S };
}

function writePng(file, ref, mine) {
  const GAP = 8, W = ref.cols * 2 + GAP, H = ROWS + 10;
  const img = Buffer.alloc(W * H * 3, 0);
  const put = (x, y, [r, g, b]) => { const o = (y * W + x) * 3; img[o] = r; img[o + 1] = g; img[o + 2] = b; };
  [[ref, 0], [mine, ref.cols + GAP]].forEach(([p, x0]) => {
    for (let c = 0; c < p.cols; c++) {
      const col = p.at(c);
      for (let y = 0; y < ROWS; y++) put(x0 + c, y, col ? ramp((db(col[ROWS - 1 - y]) - p.top + 70) / 70) : [0, 0, 0]);
    }
    for (let k = 1; k <= 9; k++) for (let x = 0; x < 5; x++) put(x0 + x, ROWS - Math.round((k * 1000) / (p.S.binHz)), [255, 255, 255]);   // every kHz
    for (let ms = 0; ms <= 900; ms += 100) for (let y = 0; y < 6; y++) put(x0 + Math.min(p.cols - 1, Math.round(ms / 2.5)), ROWS + 2 + y, [255, 255, 255]);   // every 100 ms
  });
  writeFileSync(file, encodePng(W, H, img));
}

// ## Main
const pad = (s, n) => String(s).padEnd(n), num = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '-');
const pair = (a, b, d = 0, w = 15) => pad(`${num(a, d)} → ${num(b, d)}`, w);
const carrier = shapeOfSymbol('a');
const symbols = wanted.length ? wanted : CONSONANTS.map((c) => c.symbol);
if (flags.has('--png')) mkdirSync(OUT, { recursive: true });
const rows = [], missing = [];
console.log(`${pad('sym', 6)}${pad('n', 5)}${pad('dur ms', 15)}${pad('lvl dB', 15)}${pad('voice dB', 15)}${pad('hiss dB', 15)}${pad('voice-hiss', 15)}${pad('centroid Hz', 15)}peak Hz      (reference → ours)`);
for (const sym of symbols) {
  const c = consonantBySymbol(sym);
  const file = c && referenceFile(sym);
  if (!file) { missing.push(sym); continue; }
  const r = readWav(file);
  const g = consonantGesture(c, { carrier });
  const mineSamples = renderScore(g.score);
  const a = summarise(r.samples, r.rate), b = summarise(mineSamples, 44100, g.hold ? { start: g.hold.start, end: g.hold.end } : g.core);
  const row = { sym, a, b };
  rows.push(row);
  console.log(`${pad(sym, 6)}${pad(`${a.n}/${b.n}${b.guessed ? '*' : ''}`, 5)}${pair(a.dur, b.dur)}${pair(a.lvl, b.lvl, 1)}${pair(a.voice, b.voice, 1)}${pair(a.hiss, b.hiss, 1)}${pair(a.voice - a.hiss, b.voice - b.hiss, 1)}${pair(a.cent, b.cent, 0, 15)}${num(a.peak)} → ${num(b.peak)}`);
  if (flags.has('--debug')) for (const [who, s] of [['ref', a], ['ours', b]]) console.log(`      ${who}: vowels ${s.an.vowels.join(' ')} | consonants ${s.an.list.map((i) => `${i.t0.toFixed(2)}–${i.t1.toFixed(2)}s`).join('  ')}`);
  if (flags.has('--png')) {
    // Show the last instance of the recording (an "aCa" with a vowel on each side) and ours.
    const ia = a.an.list.at(-1) || { t0: 0, t1: 0 }, ib = b.an.list.at(-1) || { t0: 0, t1: 0 };
    writePng(join(OUT, `${sym}.png`), panel(r.samples, r.rate, (ia.t0 + ia.t1) / 2), panel(mineSamples, 44100, (ib.t0 + ib.t1) / 2));
  }
}
if (missing.length) console.log(`\nno recording for: ${missing.join(' ')}`);

// Where we are furthest from the recordings, one line per measure.
const gaps = [['dur', 'ms'], ['lvl', 'dB'], ['voice', 'dB'], ['hiss', 'dB']];
console.log('\nlargest differences (ours minus reference):');
for (const [k, unit] of gaps) {
  const d = rows.map((r) => [r.sym, r.b[k] - r.a[k]]).filter(([, x]) => Number.isFinite(x)).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 6);
  console.log(`  ${pad(k, 6)}${d.map(([s, x]) => `${s} ${x > 0 ? '+' : ''}${x.toFixed(k === 'dur' ? 0 : 1)}${unit}`).join('   ')}`);
}
const mad = (k) => mean(rows.map((r) => Math.abs(r.b[k] - r.a[k])));
console.log(`\nmean |ours - reference| over ${rows.length} consonants: dur ${mad('dur').toFixed(0)} ms, lvl ${mad('lvl').toFixed(1)} dB, voice ${mad('voice').toFixed(1)} dB, hiss ${mad('hiss').toFixed(1)} dB, centroid x${Math.exp(mean(rows.map((r) => Math.abs(Math.log(r.b.cent / r.a.cent))))).toFixed(2)}`);
const ratio = rows.map((r) => [r.sym, r.b.cent / r.a.cent]).filter(([, x]) => Number.isFinite(x)).sort((x, y) => Math.abs(Math.log(y[1])) - Math.abs(Math.log(x[1]))).slice(0, 6);
console.log(`  ${pad('cent', 6)}${ratio.map(([s, x]) => `${s} ×${x.toFixed(2)}`).join('   ')}`);
if (rows.length) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'summary.tsv'), ['sym\tmeasure\treference\tours', ...rows.flatMap((r) => ['dur', 'lvl', 'voice', 'hiss', 'cent', 'peak'].map((k) => `${r.sym}\t${k}\t${r.a[k]}\t${r.b[k]}`))].join('\n') + '\n');
}
