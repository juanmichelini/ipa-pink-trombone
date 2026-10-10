// # The vocal tract engine
//
// This is the heart of the repo: a small physical model of a human voice. It is **inspired by
// [Pink Trombone](https://dood.al/pinktrombone/)** by Neil Thapen, which showed how little it
// takes to make a convincing voice if you model the throat as a tube whose width you can change.
// The code here is an independent implementation of the same family of ideas, written for this
// project. Where we borrow a convention (the 44-section tract, the index units) it is so that
// "where does the tongue go?" has the same answer here as it does there.
//
// The model has two halves.
//
// 1. A **glottis**: the source. It makes a buzzing waveform at a chosen pitch, with a chosen
//    amount of breathiness.
// 2. A **tract**: the filter. A tube from the glottis to the lips, with a side branch for the nose.
//    Sound bounces back and forth inside it, and the tube's shape decides which frequencies ring.
//
// Everything else in the project is about deciding *what shape the tube should have, and when*.

// ## Units and a note on length
//
// A tube of length `L` cm that is sampled with `n` sections has a section length `L / n`. In a
// waveguide, a wave crosses one section per simulation step, so the step rate is
// `c / (L / n)`, where `c` is the speed of sound. The tract is stepped twice per audio sample (this
// gives a better-behaved model than once), so for a given sample rate the section count is fixed by
// the length. At 44.1 kHz, 17.1 cm gives exactly 44 sections.
//
// Shapes are written in **index units**: positions 0 to 44 from glottis to lips, whatever the real
// number of sections is. A tongue at index 25 is under the hard palate for a tall adult and for a
// small child. That is what lets a voice change its tract length without anyone rewriting vowels.
export const SPEED_OF_SOUND = 34300; // cm/s
export const INDEX_UNITS = 44;
export const DEFAULT_TRACT_CM = 17.1;

export function tractSections(sampleRate, lengthCm) {
  return Math.max(16, Math.round((lengthCm * 2 * sampleRate) / SPEED_OF_SOUND));
}

// ## Landmarks along the tract, in index units
//
// - the **blade** of the tongue starts at 10, the **tip** zone at 32
// - the **lips** start at 39
// - the **nasal branch** leaves the main tube at 17 and is 28 units long
export const LANDMARKS = { bladeStart: 10, tipStart: 32, lipStart: 39, noseStart: 17, noseLength: 28 };

// ## Randomness
//
// Noise (breath, frying-pan hiss) needs random numbers. A seeded generator means the same score
// renders to the same samples, which is what makes the tests and downloaded recordings
// reproducible.
export function makeRng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// ## A band-pass filter for noise
//
// White noise is too harsh. Breath noise and fricative hiss are both band-limited, so a standard
// biquad band-pass shapes them. The centre frequency can move (an `s` is higher than an `sh`).
class Bandpass {
  constructor(sampleRate, freq, q) {
    this.fs = sampleRate; this.q = q;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.setFreq(freq);
  }
  setFreq(freq) {
    if (freq === this.freq) return;
    this.freq = freq;
    const w0 = (2 * Math.PI * Math.min(freq, this.fs * 0.45)) / this.fs;
    const alpha = Math.sin(w0) / (2 * this.q);
    const a0 = 1 + alpha;
    this.b0 = alpha / a0; this.b2 = -alpha / a0;
    this.a1 = (-2 * Math.cos(w0)) / a0; this.a2 = (1 - alpha) / a0;
  }
  process(x) {
    const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

// ## The glottis
//
// The source is the **Liljencrants-Fant (LF) model** of the glottal flow derivative, controlled by
// a single "tenseness" knob. In one pitch period (time scaled to 0 to 1):
//
// - during the *open phase* the derivative is `E0 e^(αt) sin(ωt)`: it swings up, then dives sharply
//   negative as the folds snap shut at time `Te`
// - during the *return phase* it relaxes back to zero as `-(e^(-ε(t-Te)) - shift) / Δ`
//
// The timing parameters (`Tp`, `Te`, `Ta`) come from Fant's regressions on a single parameter `Rd`.
// Low tenseness gives a large `Rd`: a soft, breathy voice. High tenseness gives a pressed, buzzy one.
export class Glottis {
  constructor(sampleRate, rng) {
    this.fs = sampleRate;
    this.rng = rng;
    this.f0 = 140;
    this.tenseness = 0.6;
    this.intensity = 0;
    this.aspiration = 0;
    this.vibratoDepth = 0;
    this.vibratoRate = 5.5;
    this.jitter = 0;
    this.phase = 0;
    this.vibPhase = 0;
    this.freq = this.f0;
    this.setupWaveform();
  }

  // The unknown in the LF model is the growth rate `α` of the open phase. It is chosen so the flow
  // returns to zero over a period, that is the open and return areas cancel. We find it by
  // bisection. The closed form is used as a fallback if the bracket fails.
  setupWaveform() {
    const Rd = clamp(3 * (1 - this.tenseness), 0.5, 2.7);
    const Ra = -0.01 + 0.048 * Rd;
    const Rk = 0.224 + 0.118 * Rd;
    const Rg = ((Rk / 4) * (0.5 + 1.2 * Rk)) / (0.11 * Rd - Ra * (0.5 + 1.2 * Rk));
    const Ta = Ra;
    const Tp = 1 / (2 * Rg);
    const Te = Tp + Tp * Rk;
    const epsilon = 1 / Ta;
    const shift = Math.exp(-epsilon * (1 - Te));
    const Delta = 1 - shift;
    const returnArea = ((1 / epsilon) * (shift - 1) + (1 - Te) * shift) / Delta;
    const omega = Math.PI / Tp;
    const s = Math.sin(omega * Te);
    const openArea = (a) => -((a * s - omega * Math.cos(omega * Te)) + omega * Math.exp(-a * Te)) / ((a * a + omega * omega) * s);
    const net = (a) => openArea(a) + returnArea;
    let lo = 0, hi = 40;
    let alpha;
    if (net(lo) * net(hi) < 0) {
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (net(mid) * net(lo) > 0) lo = mid; else hi = mid;
      }
      alpha = (lo + hi) / 2;
    } else {
      const upper = (Te - Tp) / 2 - returnArea;
      alpha = Math.log(-(Math.PI * s * upper) / (Tp * 2)) / (Tp / 2 - Te);
    }
    this.lf = { Te, alpha, omega, epsilon, shift, Delta, E0: -1 / (s * Math.exp(alpha * Te)) };
    this.loudness = Math.pow(clamp(this.tenseness, 0.02, 1), 0.25);
  }

  // The waveform at normalised time `t` (0 to 1) within a period.
  waveform(t) {
    const { Te, alpha, omega, epsilon, shift, Delta, E0 } = this.lf;
    const out = t > Te ? (-Math.exp(-epsilon * (t - Te)) + shift) / Delta : E0 * Math.exp(alpha * t) * Math.sin(omega * t);
    return out;
  }

  // Noise that rides with the voice. Turbulence in the throat is strongest while the folds are
  // open, so breath and fricative noise are modulated by the glottal cycle. When the voice is off,
  // noise is steady.
  noiseModulator() {
    const voiced = 0.1 + 0.2 * Math.max(0, Math.sin(2 * Math.PI * this.phase));
    const v = this.tenseness * this.intensity;
    return v * voiced + (1 - v) * 0.3;
  }

  // One sample of source. `noise` is band-limited breath noise from the caller.
  step(noise) {
    this.vibPhase += (2 * Math.PI * this.vibratoRate) / this.fs;
    if (this.vibPhase > 2 * Math.PI) this.vibPhase -= 2 * Math.PI;
    const wobble = this.vibratoDepth * Math.sin(this.vibPhase) + this.jitter * (this.rng() - 0.5);
    this.freq = Math.max(20, this.f0 * (1 + wobble));
    this.phase += this.freq / this.fs;
    if (this.phase >= 1) {
      this.phase -= 1;
      this.setupWaveform();
    }
    const voiced = this.waveform(this.phase) * this.intensity * this.loudness;
    const breath = (this.aspiration + this.intensity * (1 - Math.sqrt(clamp(this.tenseness, 0, 1)))) * this.noiseModulator();
    return voiced + breath * noise * 0.2;
  }
}

// ## The tract
//
// A chain of `n` tube sections. Each section has a cross-section area `A` (the square of its
// diameter). Where the area changes, part of a travelling wave reflects. The reflection
// coefficient between sections `i-1` and `i` is `(A[i-1] - A[i]) / (A[i-1] + A[i])`. That one
// formula is the entire acoustics. Two arrays carry the waves: `R` moving toward the lips and
// `L` moving back toward the glottis.
//
// Complications: the glottis end reflects 75% of what reaches it, the lip end reflects negatively
// (an open end), walls lose a little energy every step, and one junction (the velum) splits into
// three: onward, nose, and back.
const GLOTTAL_REFLECTION = 0.75;
const LIP_REFLECTION = -0.85;
const WALL_LOSS = 0.999;

export class Tract {
  constructor(sampleRate, lengthCm = DEFAULT_TRACT_CM) {
    this.fs = sampleRate;
    this.lengthCm = lengthCm;
    const n = (this.n = tractSections(sampleRate, lengthCm));
    const scale = n / INDEX_UNITS;
    this.scale = scale;
    this.noseLength = Math.max(8, Math.round(LANDMARKS.noseLength * scale));
    this.noseStart = n - this.noseLength + 1;

    const f = () => new Float64Array(n);
    this.R = f(); this.L = f();
    this.reflection = f(); this.newReflection = f();
    this.junctionR = f(); this.junctionL = new Float64Array(n + 1);
    this.diameter = f(); this.A = f();
    this.rest = f();

    const m = this.noseLength;
    this.noseR = new Float64Array(m); this.noseL = new Float64Array(m);
    this.noseJunctionR = new Float64Array(m); this.noseJunctionL = new Float64Array(m + 1);
    this.noseDiameter = new Float64Array(m); this.noseA = new Float64Array(m);
    this.noseReflection = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      let d = 2 * (i / m);
      d = d < 1 ? 0.4 + 1.6 * d : 0.5 + 1.5 * (2 - d);
      this.noseDiameter[i] = Math.min(d, 1.9);
      this.noseA[i] = this.noseDiameter[i] ** 2;
    }
    this.velum = 0.01;
    this.noseDiameter[0] = this.velum;
    this.noseA[0] = this.velum ** 2;
    for (let i = 1; i < m; i++) this.noseReflection[i] = (this.noseA[i - 1] - this.noseA[i]) / (this.noseA[i - 1] + this.noseA[i]);

    // Weights of the velum junction (left tube, right tube, nose), before and after the latest shape.
    this.weights = new Float64Array(3);
    this.newWeights = new Float64Array(3);

    this.constrictions = [];
    this.transients = [];
    this.lastObstruction = -1;
    this.lipOutput = 0;
    this.noseOutput = 0;
    this.setShape({});
    this.settle();
  }

  // ### Shapes
  //
  // A shape comes from a *frame* (see `score.js`):
  //
  // - `tongueIndex` and `tongueDiameter`: a raised-cosine hump of the tongue. The index says where
  //   along the tract the hump peaks (12 pharynx, up to 29 near the hard palate); the diameter
  //   sets how high it rises: small is a tall tongue and a narrow gap.
  // - `lips`: the diameter of the lip opening. 1.5 is relaxed, small is rounded.
  // - `velum`: how open the nose is, 0.01 closed and about 0.4 open.
  // - up to two **constrictions**, each with an index, a diameter and how much hiss it makes.
  //
  // The hump below is the tongue shape used by Pink Trombone: `1.5 - (g + 1.5 - d') cos(t)` with
  // `d' = 2 + (d - 2) / 1.5` and `g = 1.7`, tapered at the ends so it joins the rest of the tract.
  setShape(frame) {
    const { n, scale } = this;
    const tongueIndex = frame.tongueIndex ?? 20;
    const tongueDiameter = frame.tongueDiameter ?? 2.8;
    const lips = frame.lips ?? 1.5;
    const fixed = 2 + (tongueDiameter - 2) / 1.5;
    const target = this.rest;
    for (let i = 0; i < n; i++) {
      const u = i / scale;
      let d = u < 7 - 0.5 ? 0.6 : u < 12 ? 1.1 : 1.5;
      if (u >= LANDMARKS.bladeStart && u < LANDMARKS.lipStart) {
        const t = (1.1 * Math.PI * (tongueIndex - u)) / (LANDMARKS.tipStart - LANDMARKS.bladeStart);
        let curve = (1.5 - fixed + 1.7) * Math.cos(t);
        if (u < LANDMARKS.bladeStart + 1 || u >= LANDMARKS.lipStart - 1) curve *= 0.8;
        else if (u < LANDMARKS.bladeStart + 2 || u >= LANDMARKS.lipStart - 2) curve *= 0.94;
        d = 1.5 - curve;
      } else if (u >= LANDMARKS.lipStart) {
        d = lips;
      }
      target[i] = Math.max(0, d);
    }
    // Constrictions pinch the tube with a soft skirt (wide at the back, narrow at the tip).
    this.constrictions.length = 0;
    for (const [k, slot] of [['c0', 0], ['c1', 1]]) {
      const index = frame[`${k}i`];
      const diameter = frame[`${k}d`];
      if (index === undefined || diameter === undefined || diameter >= 3) continue;
      const noise = frame[`${k}n`] ?? 0;
      this.constrictions[slot] = { index, diameter, noise, position: index * scale };
      const width = index < 25 ? 10 : index >= LANDMARKS.tipStart ? 5 : 10 - (5 * (index - 25)) / (LANDMARKS.tipStart - 25);
      for (let i = 0; i < n; i++) {
        const u = i / scale;
        const rel = Math.abs(u - index) - 0.5;
        const shrink = rel <= 0 ? 0 : rel > width ? 1 : 0.5 * (1 - Math.cos((Math.PI * rel) / width));
        if (shrink < 1 && diameter < target[i]) target[i] = diameter + (target[i] - diameter) * shrink;
      }
    }
    this.constrictions = this.constrictions.filter(Boolean);
    this.velum = clamp(frame.velum ?? 0.01, 0.01, 0.6);
    this.noseDiameter[0] = this.velum;
    this.noseA[0] = this.velum ** 2;
    for (let i = 1; i < this.noseLength; i++) this.noseReflection[i] = (this.noseA[i - 1] - this.noseA[i]) / (this.noseA[i - 1] + this.noseA[i]);
    this.updateReflections();
  }

  // ### Reflections
  //
  // Recompute the reflection coefficients for the new shape. The old ones are kept so each
  // sample of the next block can interpolate (see `lambda` in `step`), which avoids zipper noise.
  updateReflections() {
    const { n } = this;
    let newLast = -1;
    for (let i = 0; i < n; i++) {
      this.diameter[i] = this.rest[i];
      this.A[i] = this.diameter[i] ** 2;
      if (this.diameter[i] <= 0.001) newLast = i;
    }
    for (let i = 1; i < n; i++) {
      this.reflection[i] = this.newReflection[i];
      this.newReflection[i] = this.A[i] === 0 ? 0.999 : (this.A[i - 1] - this.A[i]) / (this.A[i - 1] + this.A[i]);
    }
    this.weights.set(this.newWeights);
    const a = this.noseStart;
    const sum = Math.max(1e-9, this.A[a - 1] + this.A[a] + this.noseA[0]);
    this.newWeights[0] = (2 * this.A[a - 1]) / sum;
    this.newWeights[1] = (2 * this.A[a]) / sum;
    this.newWeights[2] = (2 * this.noseA[0]) / sum;
    // When a full closure opens (and the nose is shut) the pressure behind it escapes as a pop.
    if (this.lastObstruction > -1 && newLast === -1 && this.noseA[0] < 0.05) this.transients.push({ position: this.lastObstruction, age: 0 });
    this.lastObstruction = newLast;
  }

  // Empty the tube of sound. Used as a safety net: if anything ever goes non-finite in a live audio
  // thread, silence and a restart beat a permanent screech or a dead tab.
  reset() {
    for (const a of [this.R, this.L, this.junctionR, this.junctionL, this.noseR, this.noseL, this.noseJunctionR, this.noseJunctionL]) a.fill(0);
    this.transients.length = 0;
    this.lipOutput = this.noseOutput = 0;
  }

  // After the first shape, make the old and new coefficients the same, so nothing is interpolated.
  settle() {
    this.reflection.set(this.newReflection);
    this.weights.set(this.newWeights);
    this.transients.length = 0;
  }

  // ### Turbulence
  //
  // Air squeezed through a narrow gap makes noise. A gap that is too wide makes none, and one that
  // is closed makes none either, so noise is strongest around 0.3 to 0.7 diameter. The noise is
  // split between the two neighbouring sections in proportion to where in between it sits.
  addTurbulence(noise, position, diameter) {
    const i = Math.floor(position);
    const delta = position - i;
    const thinness = clamp(8 * (0.7 - diameter), 0, 1);
    const openness = clamp(30 * (diameter - 0.3), 0, 1);
    const amount = noise * thinness * openness;
    const a = amount * (1 - delta), b = amount * delta;
    if (i + 2 >= this.n) return;
    this.R[i + 1] += a / 2; this.L[i + 1] += a / 2;
    this.R[i + 2] += b / 2; this.L[i + 2] += b / 2;
  }

  // ### One step
  //
  // `lambda` (0 to 1) says how far through the current block we are, to blend old and new
  // reflections. After this call `lipOutput` and `noseOutput` hold what escaped.
  step(glottal, turbulence, lambda) {
    const { n, R, L, junctionR, junctionL, noseStart } = this;
    for (let t = this.transients.length - 1; t >= 0; t--) {
      const tr = this.transients[t];
      const amp = 0.3 * Math.pow(2, -200 * tr.age);
      R[tr.position] += amp / 2; L[tr.position] += amp / 2;
      tr.age += 1 / (this.fs * 2);
      if (tr.age > 0.2) this.transients.splice(t, 1);
    }
    for (const c of this.constrictions) {
      if (c.noise > 0) this.addTurbulence(0.66 * turbulence * c.noise, c.position, c.diameter);
    }

    junctionR[0] = L[0] * GLOTTAL_REFLECTION + glottal;
    junctionL[n] = R[n - 1] * LIP_REFLECTION;
    for (let i = 1; i < n; i++) {
      const r = this.reflection[i] * (1 - lambda) + this.newReflection[i] * lambda;
      const w = r * (R[i - 1] + L[i]);
      junctionR[i] = R[i - 1] - w;
      junctionL[i] = L[i] + w;
    }

    // The velum junction: three tubes meet (the throat below, the mouth above, the nose).
    //
    // The waves `R` and `L` are volume-velocity waves (that is why the closed glottis end reflects
    // with a plus sign and the open lips with a minus). For such waves, flow continuity and a
    // common pressure at the junction give one formula for every port: what leaves port `k` is
    // `2 A_k / (A_1 + A_2 + A_3)` times the sum of everything arriving, minus what arrived on `k`.
    // With two ports it reduces to the ordinary junction used everywhere else in the tube, and
    // with the nose shut (a tiny area) it leaves the main tube unchanged. It cannot create energy.
    const i = noseStart;
    const wl = this.weights[0] * (1 - lambda) + this.newWeights[0] * lambda;
    const wr = this.weights[1] * (1 - lambda) + this.newWeights[1] * lambda;
    const wn = this.weights[2] * (1 - lambda) + this.newWeights[2] * lambda;
    const arriving = R[i - 1] + L[i] + this.noseL[0];
    junctionL[i] = wl * arriving - R[i - 1];
    junctionR[i] = wr * arriving - L[i];
    this.noseJunctionR[0] = wn * arriving - this.noseL[0];

    for (let k = 0; k < n; k++) {
      R[k] = junctionR[k] * WALL_LOSS;
      L[k] = junctionL[k + 1] * WALL_LOSS;
    }
    this.lipOutput = R[n - 1];

    const m = this.noseLength;
    this.noseJunctionL[m] = this.noseR[m - 1] * LIP_REFLECTION;
    for (let k = 1; k < m; k++) {
      const w = this.noseReflection[k] * (this.noseR[k - 1] + this.noseL[k]);
      this.noseJunctionR[k] = this.noseR[k - 1] - w;
      this.noseJunctionL[k] = this.noseL[k] + w;
    }
    for (let k = 0; k < m; k++) {
      this.noseR[k] = this.noseJunctionR[k] * WALL_LOSS;
      this.noseL[k] = this.noseJunctionL[k + 1] * WALL_LOSS;
    }
    this.noseOutput = this.noseR[m - 1];
  }
}

// ## The voice
//
// A `Voice` wires a glottis, a tract and two noise filters together, and turns blocks of frames
// into samples. The block is the unit of control: shapes change once per block and are
// interpolated within it. Thirty-two samples at 44.1 kHz is under a millisecond, far finer than
// any articulator moves.
//
// The output goes through a soft limiter (`tanh`). Quiet sounds pass almost unchanged, and a
// burst or a loud vowel is rounded off instead of clipping.
export class Voice {
  constructor({ sampleRate = 44100, tractLength = DEFAULT_TRACT_CM, seed = 1, gain = 2 } = {}) {
    this.fs = sampleRate;
    this.rng = makeRng(seed);
    this.glottis = new Glottis(sampleRate, this.rng);
    this.tract = new Tract(sampleRate, tractLength);
    this.aspirateFilter = new Bandpass(sampleRate, 500, 0.5);
    this.fricativeFilter = new Bandpass(sampleRate, 1000, 0.5);
    this.gain = gain;
    this.resets = 0; // how many times the safety net had to fire; should stay 0
  }

  // Apply a frame: its shape to the tract and its source settings to the glottis.
  setFrame(frame) {
    const g = this.glottis;
    if (frame.f0 !== undefined) g.f0 = frame.f0;
    if (frame.tenseness !== undefined) g.tenseness = clamp(frame.tenseness, 0, 1);
    if (frame.intensity !== undefined) g.intensity = clamp(frame.intensity, 0, 1);
    if (frame.aspiration !== undefined) g.aspiration = clamp(frame.aspiration, 0, 1);
    if (frame.vibratoDepth !== undefined) g.vibratoDepth = frame.vibratoDepth;
    if (frame.vibratoRate !== undefined) g.vibratoRate = frame.vibratoRate;
    if (frame.jitter !== undefined) g.jitter = frame.jitter;
    if (frame.noiseHz !== undefined) this.fricativeFilter.setFreq(frame.noiseHz);
    this.tract.setShape(frame);
  }

  // Generate `count` samples into `out` starting at `offset`.
  run(out, offset, count) {
    const { glottis, tract } = this;
    for (let j = 0; j < count; j++) {
      const lambda1 = j / count;
      const lambda2 = (j + 0.5) / count;
      const aspirate = this.aspirateFilter.process(this.rng() * 2 - 1);
      const hiss = this.fricativeFilter.process(this.rng() * 2 - 1);
      const source = glottis.step(aspirate);
      const turbulence = hiss * glottis.noiseModulator();
      tract.step(source, turbulence, lambda1);
      let sum = tract.lipOutput + tract.noseOutput;
      tract.step(source, turbulence, lambda2);
      sum += tract.lipOutput + tract.noseOutput;
      out[offset + j] = Math.tanh(sum * 0.125 * this.gain);
    }
    // The block is over, so the shape it was heading toward is now the shape it is at. If `run` is
    // called again without a new frame, the tract simply holds still. (Without this the
    // coefficients would sweep from old to new again every block, a sawtooth modulation of the walls
    // that pumps energy into the tube.)
    tract.reflection.set(tract.newReflection);
    tract.weights.set(tract.newWeights);

    // Safety net (see `Tract.reset`).
    const last = out[offset + count - 1];
    if (!(last >= -1 && last <= 1)) {
      tract.reset();
      this.resets++;
      for (let j = 0; j < count; j++) out[offset + j] = 0;
    }
  }
}
