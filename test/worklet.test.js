import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bundleWorklet, WORKLET_FILES } from '../lib/audio.js';
import { rms } from '../lib/render.js';

const read = (f) => readFile(new URL(`../lib/${f.replace('./', '')}`, import.meta.url), 'utf8');

// Load the real bundle the browser would load, against a stub of the AudioWorklet globals.
async function loadProcessor(sampleRate = 44100) {
  const code = bundleWorklet(await Promise.all(WORKLET_FILES.map(read)));
  let Registered;
  class AudioWorkletProcessor {
    constructor() { this.port = { posted: [], postMessage(m) { this.posted.push(m); } }; }
  }
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', code)(
    AudioWorkletProcessor, (name, cls) => { assert.equal(name, 'trombone'); Registered = cls; }, sampleRate,
  );
  return Registered;
}

const pull = (p, chunks) => {
  const all = new Float32Array(chunks * 128);
  for (let i = 0; i < chunks; i++) {
    const out = [new Float32Array(128)];
    p.process([], [out]);
    all.set(out[0], i * 128);
  }
  return all;
};

test('the bundle has no imports or exports left and registers the processor', async () => {
  const code = bundleWorklet(await Promise.all(WORKLET_FILES.map(read)));
  assert.ok(!/^\s*(import|export)\s/m.test(code));
  assert.ok(await loadProcessor());
});

test('live mode makes sound, release fades to silence', async () => {
  const P = await loadProcessor();
  const p = new P({ processorOptions: { seed: 1 } });
  p.onMessage({ type: 'live', frame: { intensity: 1, f0: 140 } });
  const held = pull(p, 60);
  assert.ok(rms(held, 128 * 30) > 0.01, 'audible while held');
  assert.ok(held.every(Number.isFinite));
  p.onMessage({ type: 'release' });
  const tail = pull(p, 20);          // the first 60 ms after release
  assert.ok(rms(tail) > 0.4 * rms(held, 128 * 30), 'the sound rings on after release instead of cutting off');
  const later = pull(p, 30);         // about 70 to 170 ms
  assert.ok(rms(later) < rms(tail), 'and it decays');
  pull(p, 400);
  const after = pull(p, 20);
  assert.ok(rms(after) < 1e-4, 'silent after release');
});

test('playing a score reports when it ends', async () => {
  const P = await loadProcessor();
  const p = new P({});
  p.onMessage({ type: 'play', score: { keyframes: [{ t: 0, intensity: 1 }, { t: 0.1 }], duration: 0.1 } });
  const out = pull(p, 100);
  assert.ok(rms(out, 0, 128 * 20) > 0.01);
  assert.ok(p.port.posted.some((m) => m.type === 'ended'));
});

test('changing the tract length rebuilds the voice', async () => {
  const P = await loadProcessor();
  const p = new P({});
  const before = p.voice.tract.n;
  p.onMessage({ type: 'tract', length: 11 });
  assert.ok(p.voice.tract.n < before);
});
