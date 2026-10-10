import test from 'node:test';
import assert from 'node:assert/strict';
import { Glottis, Tract, Voice, makeRng, tractSections } from '../lib/pinktrombone.js';
import { renderScore, encodeWav, peak, rms } from '../lib/render.js';
import { formants, bandEnergy } from '../lib/analysis.js';

const SR = 44100;

test('tract sections: 17.1 cm at 44.1 kHz is the classic 44', () => {
  assert.equal(tractSections(44100, 17.1), 44);
  assert.equal(tractSections(48000, 17.1), 48);
});

test('LF glottal waveform integrates to about zero over a period for any tenseness', () => {
  for (const tenseness of [0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
    const g = new Glottis(SR, makeRng(1));
    g.tenseness = tenseness;
    g.setupWaveform();
    const N = 20000;
    let sum = 0, min = 0, max = 0;
    for (let i = 0; i < N; i++) {
      const w = g.waveform(i / N);
      assert.ok(Number.isFinite(w));
      sum += w / N;
      min = Math.min(min, w); max = Math.max(max, w);
    }
    assert.ok(Math.abs(sum) < 0.01, `tenseness ${tenseness}: net ${sum}`);
    assert.ok(min <= -0.99 && min >= -1.2, `closing spike should be about -1, got ${min}`);
    assert.ok(max > 0, 'derivative is positive while the folds open');
  }
});

test('output is finite across the whole articulatory space, including closures', () => {
  const rng = makeRng(42);
  const r = (a, b) => a + (b - a) * rng();
  const voice = new Voice({ sampleRate: SR, seed: 3 });
  const buf = new Float32Array(32);
  for (let k = 0; k < 600; k++) {
    voice.setFrame({
      tongueIndex: r(12, 29), tongueDiameter: r(2.05, 3.5), lips: r(0, 1.8), velum: r(0.01, 0.5),
      c0i: r(2, 43), c0d: rng() < 0.3 ? 0 : r(0, 3.5), c0n: rng(),
      c1i: r(2, 43), c1d: rng() < 0.3 ? 0 : r(0, 3.5), c1n: rng(),
      noiseHz: r(300, 8000), f0: r(70, 900), tenseness: rng(), intensity: rng(), aspiration: rng(),
      vibratoDepth: rng() * 0.05, jitter: rng() * 0.02,
    });
    for (let rep = 0; rep < 8; rep++) {
      voice.run(buf, 0, 32);
      for (const x of buf) assert.ok(Number.isFinite(x) && Math.abs(x) <= 1, `bad sample ${x} at frame ${k}`);
    }
    // The waves inside the tube must stay bounded: the junctions may not create energy.
    let top = 0;
    for (const a of [voice.tract.R, voice.tract.L, voice.tract.noseR, voice.tract.noseL]) for (const x of a) top = Math.max(top, Math.abs(x));
    assert.ok(top < 50, `internal wave amplitude ${top} at frame ${k}`);
  }
  assert.equal(voice.resets, 0, 'the NaN safety net should never have been needed');
});

test('a neutral-ish tract rings near the textbook schwa formants', () => {
  const [f1, f2, f3] = formants({ tongueIndex: 20, tongueDiameter: 3.2 });
  assert.ok(f1 > 450 && f1 < 750, `F1 ${f1}`);
  assert.ok(f2 > 1300 && f2 < 1800, `F2 ${f2}`);
  assert.ok(f3 > 2400 && f3 < 3000, `F3 ${f3}`);
});

test('front-high and back-low shapes move F1 and F2 the right way', () => {
  const front = formants({ tongueIndex: 27, tongueDiameter: 2.05 }); // i-like
  const open = formants({ tongueIndex: 14, tongueDiameter: 2.6 }); // a-like
  assert.ok(front[0] < 350, `high tongue gives low F1, got ${front[0]}`);
  assert.ok(front[1] > 2000, `front tongue gives high F2, got ${front[1]}`);
  assert.ok(open[0] > 650, `open mouth gives high F1, got ${open[0]}`);
  assert.ok(open[1] < 1500, `back tongue gives low F2, got ${open[1]}`);
});

test('rounding the lips lowers the formants', () => {
  const spread = formants({ tongueIndex: 17, tongueDiameter: 2.3, lips: 1.5 });
  const rounded = formants({ tongueIndex: 17, tongueDiameter: 2.3, lips: 0.7 });
  assert.ok(rounded[0] < spread[0], `F1 ${rounded[0]} < ${spread[0]}`);
  assert.ok(rounded[1] < spread[1], `F2 ${rounded[1]} < ${spread[1]}`);
});

test('a shorter tract rings proportionally higher', () => {
  const adult = formants({ tongueIndex: 20, tongueDiameter: 3.2 }, { tractLength: 17.1 });
  const child = formants({ tongueIndex: 20, tongueDiameter: 3.2 }, { tractLength: 11 });
  const ratio = child[1] / adult[1];
  assert.ok(ratio > 1.4 && ratio < 1.7, `F2 ratio ${ratio} should be near 17.1/11 = 1.55`);
});

test('formants do not depend much on the sample rate', () => {
  const a = formants({ tongueIndex: 24, tongueDiameter: 2.6 }, { sampleRate: 44100 });
  const b = formants({ tongueIndex: 24, tongueDiameter: 2.6 }, { sampleRate: 48000 });
  assert.ok(Math.abs(a[0] - b[0]) / a[0] < 0.06, `F1 ${a[0]} vs ${b[0]}`);
  assert.ok(Math.abs(a[1] - b[1]) / a[1] < 0.06, `F2 ${a[1]} vs ${b[1]}`);
});

test('opening the velum sends energy out of the nose', () => {
  const energy = (velum) => {
    const t = new Tract(SR);
    t.setShape({ velum });
    t.settle();
    let e = 0;
    for (let i = 0; i < 4000; i++) {
      t.step(i === 0 ? 1 : 0, 0, 1);
      e += t.noseOutput * t.noseOutput;
    }
    return e;
  };
  assert.ok(energy(0.4) > 50 * energy(0.01), 'nasal output should dominate when the velum is open');
});

test('voicing is periodic at the requested pitch', () => {
  const f0 = 150;
  const out = renderScore({ keyframes: [{ t: 0, intensity: 1, f0, tongueIndex: 20, tongueDiameter: 2.8 }], duration: 0.4 });
  const seg = out.subarray(8000, 8000 + 4096);
  const lo = Math.floor(SR / 400), hi = Math.floor(SR / 70);
  const corr = [];
  for (let lag = lo; lag < hi; lag++) {
    let c = 0;
    for (let i = 0; i < 2048; i++) c += seg[i] * seg[i + lag];
    corr.push(c);
  }
  // The first strong peak, not the biggest: multiples of the period correlate almost as well.
  const top = Math.max(...corr);
  let bestLag = lo;
  for (let k = 1; k < corr.length - 1; k++) {
    if (corr[k] > 0.8 * top && corr[k] >= corr[k - 1] && corr[k] >= corr[k + 1]) { bestLag = lo + k; break; }
  }
  const measured = SR / bestLag;
  assert.ok(Math.abs(measured - f0) / f0 < 0.04, `measured ${measured} Hz`);
});

test('a vowel is a sensible loudness and silence stays silent', () => {
  const vowel = renderScore({ keyframes: [{ t: 0, intensity: 1 }], duration: 0.3 });
  assert.ok(peak(vowel) > 0.05 && peak(vowel) < 1, `peak ${peak(vowel)}`);
  const silence = renderScore({ keyframes: [{ t: 0, intensity: 0 }], duration: 0.3 });
  assert.ok(peak(silence) < 1e-6, 'no source, no sound');
});

test('constriction noise makes hiss only for a narrow-but-open gap', () => {
  const hiss = (d) => rms(renderScore({ keyframes: [{ t: 0, c0i: 36, c0d: d, c0n: 1, noiseHz: 4000 }], duration: 0.3 }), 4000);
  assert.ok(hiss(0.5) > 20 * hiss(2.5), 'fricative gap hisses, wide gap does not');
  assert.ok(hiss(0.5) > 20 * hiss(0), 'closed gap makes no hiss');
});

test('hiss with a higher centre frequency puts more energy up high', () => {
  const run = (hz) => renderScore({ keyframes: [{ t: 0, c0i: 36, c0d: 0.5, c0n: 1, noiseHz: hz }], duration: 0.4 });
  const low = bandEnergy(run(800), SR, 4000, 12000);
  const high = bandEnergy(run(5000), SR, 4000, 12000);
  assert.ok(high > low, `high-centre ${high} should exceed low-centre ${low}`);
});

test('rendering is deterministic for a seed and varies across seeds when noise is involved', () => {
  const score = { keyframes: [{ t: 0, intensity: 0.5, aspiration: 1, tenseness: 0.3 }], duration: 0.1 };
  const a = renderScore(score, { seed: 5 }), b = renderScore(score, { seed: 5 }), c = renderScore(score, { seed: 6 });
  assert.deepEqual(Array.from(a), Array.from(b));
  assert.notDeepEqual(Array.from(a), Array.from(c));
});

test('a closure that opens releases a burst', () => {
  const score = {
    keyframes: [
      { t: 0, c0i: 36, c0d: 0, c0n: 0, intensity: 0 },
      { t: 0.1, c0i: 36, c0d: 0, c0n: 0 },
      { t: 0.104, c0d: 3 },
    ],
    duration: 0.2,
  };
  const out = renderScore(score);
  const before = rms(out, 0, Math.floor(0.09 * SR));
  const after = peak(out.subarray(Math.floor(0.1 * SR), Math.floor(0.13 * SR)));
  assert.ok(before < 1e-6, 'closure is silent');
  assert.ok(after > 0.01, `burst peak ${after}`);
});

test('renderScore length and WAV encoding', () => {
  const out = renderScore({ keyframes: [{ t: 0 }], duration: 0.5 }, { tail: 0.1 });
  assert.ok(Math.abs(out.length / SR - 0.6) < 0.01);
  const wav = encodeWav(out, SR);
  const text = (o, n) => String.fromCharCode(...wav.subarray(o, o + n));
  assert.equal(text(0, 4), 'RIFF');
  assert.equal(text(8, 4), 'WAVE');
  const view = new DataView(wav.buffer);
  assert.equal(view.getUint32(24, true), SR);
  assert.equal(view.getUint32(40, true), out.length * 2);
  assert.equal(wav.length, 44 + out.length * 2);
});
