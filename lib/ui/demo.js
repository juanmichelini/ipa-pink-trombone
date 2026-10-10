// # Helpers shared by the demo pages
//
// Small things every experiment needs, so each `main.js` can stay about its own idea.
import { createSynth } from '../audio.js';
import { normalizeScore, frameAt } from '../score.js';
import { renderScore, encodeWav } from '../render.js';
import { DEFAULT_TRACT_CM } from '../pinktrombone.js';

// ## Starting audio on a gesture
//
// Browsers refuse to start audio until the page has been touched. `lazySynth().get()` makes the
// synth the first time it is asked for (from inside an event handler) and returns the same one
// after that. `rebuild` throws it away, for when the tract length has to change.
export function lazySynth(options = {}) {
  let promise = null;
  return {
    get() {
      if (!promise) promise = createSynth(options).catch((error) => { promise = null; throw error; });
      return promise;
    },
    async rebuild(newOptions) {
      if (promise) { try { (await promise).close(); } catch { /* already gone */ } }
      promise = null;
      Object.assign(options, newOptions);
    },
  };
}

// ## Playing a score while drawing it
//
// Plays the score through the synth and calls `onFrame(frame, t)` on every animation frame with
// the frame the engine is at, so the tract picture moves with the sound. Resolves when the sound
// ends. Returns `{ done, cancel }`.
export function playAnimated(synth, score, onFrame) {
  const norm = normalizeScore(score);
  let raf = 0, cancelled = false;
  const started = performance.now();
  const tick = () => {
    if (cancelled) return;
    const t = (performance.now() - started) / 1000;
    onFrame(frameAt(norm, Math.min(t, norm.duration)), t);
    if (t < norm.duration + 0.1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  const done = synth.play(score).then(() => { cancelAnimationFrame(raf); });
  return { done, cancel() { cancelled = true; cancelAnimationFrame(raf); synth.stop(); } };
}

// ## Downloading what you hear
//
// Renders the score offline with the same engine and offers it as a WAV file.
export function downloadWav(score, filename = 'ipa-pink-trombone.wav', options = {}) {
  const samples = renderScore(score, { tractLength: DEFAULT_TRACT_CM, ...options });
  const blob = new Blob([encodeWav(samples, options.sampleRate || 44100)], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const log = (value, min, max) => min * Math.pow(max / min, value);
export const unlog = (hz, min, max) => Math.log(hz / min) / Math.log(max / min);
export const round = (x, digits = 0) => Number(x.toFixed(digits));
