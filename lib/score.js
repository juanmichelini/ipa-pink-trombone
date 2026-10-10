// # Scores and frames
//
// Speech is movement. Everything above the engine (the IPA planner, the voices, the tempo and
// the accents) ends up producing one thing: a **score**. A score is a list of keyframes, each a
// moment in time and a description of the whole instrument at that moment. The engine plays the
// score by interpolating between keyframes.
//
// A **frame** is a flat object of numbers:
//
// - tongue: `tongueIndex` (12 back to 29 front), `tongueDiameter` (2.05 tall tongue to 3.5 low)
// - `lips`: lip opening diameter (1.5 relaxed, about 0.6 rounded)
// - `velum`: nasal opening (0.01 closed, 0.4 open)
// - two constrictions, `c0` and `c1`, each with `i` (index), `d` (diameter, 3 or more means
//   inactive) and `n` (how much hiss it makes, 0 to 1)
// - `noiseHz`: the centre of the hiss, higher for an `s` than for an `h`
// - source: `f0` (pitch in Hz), `tenseness` (0 breathy to 1 pressed), `intensity` (voicing loudness
//   0 to 1), `aspiration` (extra breath noise 0 to 1)
// - `c0m` and `c0mHz`: make the first constriction flutter by that depth (in diameter units) at that
//   rate. This is how a trill works: the tongue tip or uvula taps a closure over and over
// - optionally `vibratoDepth`, `vibratoRate`, `jitter`
//
// Flat numbers make interpolation trivial: every key is blended linearly.
export const DEFAULT_FRAME = Object.freeze({
  tongueIndex: 20, tongueDiameter: 2.8, lips: 1.5, velum: 0.01,
  c0i: 30, c0d: 3, c0n: 0, c0m: 0, c0mHz: 0, c1i: 30, c1d: 3, c1n: 0, noiseHz: 1000,
  f0: 140, tenseness: 0.6, intensity: 0, aspiration: 0,
  vibratoDepth: 0, vibratoRate: 5.5, jitter: 0,
});

// A full frame from a partial one.
export function frame(overrides = {}, base = DEFAULT_FRAME) {
  return { ...base, ...overrides };
}

// ## Normalising a score
//
// Authors write keyframes as *changes*: `{ t: 0.2, intensity: 1 }` means "from here on, voicing is
// on". Normalising carries every unmentioned field forward, producing complete frames sorted by
// time, so the player never has to think about missing keys.
export function normalizeScore(score) {
  const keys = [...score.keyframes].sort((a, b) => a.t - b.t);
  const out = [];
  let current = { ...DEFAULT_FRAME };
  for (const k of keys) {
    current = { ...current, ...k };
    out.push({ ...current });
  }
  return { keyframes: out, duration: score.duration ?? (out.length ? out[out.length - 1].t : 0) };
}

// ## Evaluating a score at a time
//
// Find the two keyframes around `t` and blend. Before the first and after the last, hold. Two
// keyframes at nearly the same time make a near-instant change, which is how a stop consonant
// snaps shut.
export function frameAt(normalized, t) {
  const ks = normalized.keyframes;
  if (ks.length === 0) return { ...DEFAULT_FRAME };
  if (t <= ks[0].t) return ks[0];
  const last = ks[ks.length - 1];
  if (t >= last.t) return last;
  let lo = 0, hi = ks.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ks[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = ks[lo], b = ks[hi];
  const u = (t - a.t) / Math.max(1e-9, b.t - a.t);
  const out = {};
  for (const key of Object.keys(a)) out[key] = key === 't' ? t : a[key] + (b[key] - a[key]) * u;
  return out;
}

export function scoreDuration(normalized) {
  return normalized.duration;
}

// ## Writing scores by hand: the timeline
//
// Describing a gesture as raw keyframes is tedious, because every keyframe must repeat every field.
// A `Timeline` remembers the current frame. `at(t, changes)` says "by time `t`, these things are
// different", and the timeline emits a full keyframe. Fields that are not mentioned keep their
// value, so they hold steady through that interval; fields that are mentioned glide from where
// they were. Reading a gesture then reads like a description of it:
//
//     tl.at(0.10, {});                    // hold the vowel until 0.1 s
//     tl.at(0.15, { c0d: 0 });            // over 50 ms, close the lips
//     tl.at(0.22, {});                    // hold the closure
//     tl.at(0.23, { c0d: 3, c0n: 1 });    // release in 10 ms
export class Timeline {
  constructor(start = {}) {
    this.current = { ...DEFAULT_FRAME, ...start };
    this.keyframes = [{ t: 0, ...this.current }];
  }

  at(t, changes = {}) {
    const last = this.keyframes[this.keyframes.length - 1].t;
    this.current = { ...this.current, ...changes };
    this.keyframes.push({ ...this.current, t: Math.max(t, last) });
    return this;
  }

  // Everything in one object, ready for the renderer.
  get score() {
    return { keyframes: this.keyframes, duration: this.keyframes[this.keyframes.length - 1].t };
  }
}

// ## Joining scores
//
// Plays scores one after another with a gap between them. Each score keeps its own timing; only
// its start is shifted. Used for "play the whole row".
export function concatScores(scores, gap = 0.15) {
  const keyframes = [];
  let offset = 0;
  for (const score of scores) {
    for (const k of score.keyframes) keyframes.push({ ...k, t: k.t + offset });
    offset += score.duration + gap;
  }
  return { keyframes, duration: Math.max(0, offset - gap) };
}
