// # Listening with numbers
//
// We cannot hear the tests, but we can measure what a tract shape does. If you strike a bell you
// learn its pitch from the ringing. Likewise, if we fire a single click into the glottis end of a
// tract and record what comes out of the lips, the spectrum of that ringing shows the tract's
// resonances, called **formants**. The first two (F1 and F2) are what mostly distinguish vowels:
//
// - F1 goes up as the mouth opens (high vowels low F1, low vowels high F1)
// - F2 goes up as the tongue moves forward (front vowels high F2, back vowels low F2)
//
// So "does the tract make /i/ when it should?" becomes "is F1 low and F2 high?".
import { Tract, DEFAULT_TRACT_CM } from './pinktrombone.js';

// ## A small FFT
//
// Radix-2, in place. Lengths must be powers of two.
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

// ## The impulse response of a shape
//
// Build a tract, give it the shape, and send one click in. The tract steps at twice the audio
// rate, so the returned series has sample rate `2 * sampleRate`. Noise and the glottal source are
// not involved, which makes this exactly repeatable.
export function impulseResponse(frame, { sampleRate = 44100, tractLength = DEFAULT_TRACT_CM, steps = 16384 } = {}) {
  const tract = new Tract(sampleRate, tractLength);
  tract.setShape(frame);
  tract.settle();
  const out = new Float64Array(steps);
  for (let i = 0; i < steps; i++) {
    tract.step(i === 0 ? 1 : 0, 0, 1);
    out[i] = tract.lipOutput + tract.noseOutput;
  }
  return { samples: out, rate: 2 * sampleRate };
}

// ## The spectrum
//
// Hann-windowed magnitude, in a form that is easy to plot or search. Bin `k` is at
// `k * rate / length` Hz.
export function spectrum({ samples, rate }) {
  const n = samples.length;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = samples[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  fft(re, im);
  const mag = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
  return { mag, binHz: rate / n };
}

// ## Finding formants
//
// Resonances are local maxima of the spectrum. We smooth lightly, pick maxima between 150 Hz and
// `maxHz`, discard weak ones and merge any two closer than `minSeparation`. The result is sorted by
// frequency: `result[0]` is F1, `result[1]` is F2 and so on.
//
// "Weak" has to be generous. A tall tongue makes F1 enormous and the formants above it can sit 35 dB
// lower while still being perfectly audible, so the floor is -60 dB. To avoid mistaking ripples
// for resonances, a peak must also stand a little above the valleys around it.
export function formants(frame, { count = 4, maxHz = 5000, minHz = 150, minSeparation = 90, ...opts } = {}) {
  const { mag, binHz } = spectrum(impulseResponse(frame, opts));
  const sm = new Float64Array(mag.length);
  for (let k = 2; k < mag.length - 2; k++) sm[k] = (mag[k - 2] + 2 * mag[k - 1] + 3 * mag[k] + 2 * mag[k + 1] + mag[k + 2]) / 9;
  const lo = Math.ceil(minHz / binHz), hi = Math.min(mag.length - 3, Math.floor(maxHz / binHz));
  const reach = Math.max(2, Math.round(40 / binHz));
  const prominenceReach = Math.round(250 / binHz);
  let top = 0;
  for (let k = lo; k <= hi; k++) top = Math.max(top, sm[k]);
  const peaks = [];
  for (let k = lo; k <= hi; k++) {
    let isMax = sm[k] > 0.001 * top;
    for (let d = 1; d <= reach && isMax; d++) if (sm[k - d] > sm[k] || sm[k + d] >= sm[k]) isMax = false;
    if (isMax) {
      let valley = sm[k];
      for (let d = 1; d <= prominenceReach && k - d >= lo; d++) valley = Math.min(valley, sm[k - d]);
      let valleyRight = sm[k];
      for (let d = 1; d <= prominenceReach && k + d <= hi; d++) valleyRight = Math.min(valleyRight, sm[k + d]);
      if (sm[k] < 1.2 * Math.max(valley, valleyRight)) isMax = false;
    }
    if (isMax) {
      // Parabolic interpolation for sub-bin accuracy.
      const a = sm[k - 1], b = sm[k], c = sm[k + 1];
      const shift = 0.5 * (a - c) / (a - 2 * b + c || 1);
      peaks.push({ hz: (k + shift) * binHz, mag: b });
    }
  }
  const merged = [];
  for (const p of peaks) {
    const prev = merged[merged.length - 1];
    if (prev && p.hz - prev.hz < minSeparation) {
      if (p.mag > prev.mag) merged[merged.length - 1] = p;
    } else merged.push(p);
  }
  return merged.slice(0, count).map((p) => p.hz);
}

// ## Spectral energy in a band
//
// Used to tell hiss (energy up high) from voicing (energy low), and a nasal from an oral sound.
export function bandEnergy(samples, sampleRate, fromHz, toHz) {
  let n = 1;
  while (n < Math.min(samples.length, 32768)) n <<= 1;
  const re = new Float64Array(n), im = new Float64Array(n);
  const start = Math.max(0, Math.floor((samples.length - n) / 2));
  for (let i = 0; i < n && start + i < samples.length; i++) re[i] = samples[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  fft(re, im);
  const binHz = sampleRate / n;
  let total = 0, band = 0;
  for (let k = 1; k < n / 2; k++) {
    const e = re[k] * re[k] + im[k] * im[k];
    total += e;
    const hz = k * binHz;
    if (hz >= fromHz && hz < toHz) band += e;
  }
  return total > 0 ? band / total : 0;
}
