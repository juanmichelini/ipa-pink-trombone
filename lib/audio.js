// # Browser audio
//
// This module connects the engine to your speakers. It builds an `AudioWorkletNode` whose
// processor (see `worklet.js`) contains the engine, and wraps it in a small object with the verbs
// the demos need:
//
// - `live(frame)` and `release()`: hold a sound while something is pressed
// - `play(score)`: play a whole score and wait for it to end
// - `stop()`, `setTractLength(cm)`, `setVolume(0..1)`
//
// ## Bundling without a bundler
//
// The worklet needs the engine, the score helpers and its own processor class in one scope. We
// fetch the three source files, remove their `export` keywords and `import` lines, and join them
// into one script that is handed to the browser as a Blob URL. `bundleWorklet` is a pure function
// so the tests can check it, and run the result, without a browser.
import { DEFAULT_TRACT_CM } from './pinktrombone.js';

export const WORKLET_FILES = ['./pinktrombone.js', './score.js', './worklet.js'];

export function bundleWorklet(sources) {
  return sources
    .map((text) => text.replace(/^import[^;]*;[ \t]*$/gm, '').replace(/^export\s+/gm, ''))
    .join('\n');
}

// ## Creating a synth
//
// Browsers only start audio after a user gesture. Call `createSynth` from a click handler (or
// call `resume()` from one). We ask for a 44.1 kHz context because that is the rate the tract is
// tuned for. Where the browser will not allow it, the engine adapts its section count instead
// (`tractSections` in the engine takes the rate into account).
export async function createSynth({ sampleRate = 44100, tractLength = DEFAULT_TRACT_CM, seed = 1 } = {}) {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  let ctx;
  try { ctx = new AudioContextClass({ sampleRate, latencyHint: 'interactive' }); } catch { ctx = new AudioContextClass(); }
  const sources = await Promise.all(
    WORKLET_FILES.map((file) => fetch(new URL(file, import.meta.url)).then((r) => {
      if (!r.ok) throw new Error(`could not load ${file}: ${r.status}`);
      return r.text();
    })),
  );
  const url = URL.createObjectURL(new Blob([bundleWorklet(sources)], { type: 'text/javascript' }));
  try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }

  const node = new AudioWorkletNode(ctx, 'trombone', {
    numberOfInputs: 0,
    outputChannelCount: [1],
    processorOptions: { tractLength, seed },
  });
  const volume = ctx.createGain();
  volume.gain.value = 0.8;
  node.connect(volume).connect(ctx.destination);

  let pending = null;
  node.port.onmessage = ({ data }) => {
    if (data.type === 'ended' && pending) { const done = pending; pending = null; done(); }
  };

  return {
    ctx,
    node,
    resume: () => ctx.resume(),
    live(frame) { ctx.resume(); node.port.postMessage({ type: 'live', frame }); },
    release() { node.port.postMessage({ type: 'release' }); },
    play(score) {
      ctx.resume();
      if (pending) pending();
      return new Promise((resolve) => {
        pending = resolve;
        node.port.postMessage({ type: 'play', score });
      });
    },
    stop() {
      node.port.postMessage({ type: 'stop' });
      if (pending) { const done = pending; pending = null; done(); }
    },
    setTractLength(length) { node.port.postMessage({ type: 'tract', length }); },
    setVolume(v) { volume.gain.value = Math.max(0, Math.min(1, v)); },
    close() { return ctx.close(); },
  };
}
