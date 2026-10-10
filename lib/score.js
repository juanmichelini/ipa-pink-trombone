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
// - optionally `vibratoDepth`, `vibratoRate`, `jitter`
//
// Flat numbers make interpolation trivial: every key is blended linearly.
export const DEFAULT_FRAME = Object.freeze({
  tongueIndex: 20, tongueDiameter: 2.8, lips: 1.5, velum: 0.01,
  c0i: 30, c0d: 3, c0n: 0, c1i: 30, c1d: 3, c1n: 0, noiseHz: 1000,
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
