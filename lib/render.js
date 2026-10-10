// # Rendering a score to samples
//
// The same renderer serves the tests, the calibration scripts and the "download WAV" buttons.
// (In the browser, playback uses the same pieces inside an AudioWorklet; see `audio.js`.)
//
// It walks through time one block at a time. For each block it asks the score for the frame at that
// moment, hands it to the voice, and lets the voice produce the samples.
import { Voice } from './pinktrombone.js';
import { normalizeScore, frameAt } from './score.js';

export const BLOCK = 32;

// `tail` adds a little silence after the last keyframe so releases and ringing are not cut off.
export function renderScore(score, { sampleRate = 44100, tractLength, seed = 1, tail = 0.15, gain = 2, voice: extra = {} } = {}) {
  const norm = normalizeScore(score);
  const total = Math.ceil((norm.duration + tail) * sampleRate / BLOCK) * BLOCK;
  const out = new Float32Array(total);
  const voice = new Voice({ sampleRate, tractLength, seed, gain });
  for (let pos = 0; pos < total; pos += BLOCK) {
    const f = frameAt(norm, pos / sampleRate);
    voice.setFrame({ ...extra, ...f });
    voice.run(out, pos, BLOCK);
  }
  return out;
}

// ## WAV
//
// A 16-bit mono PCM WAV file, no dependencies: a 44-byte header and the samples.
export function encodeWav(samples, sampleRate = 44100) {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset, s) => { for (let i = 0; i < s.length; i++) bytes[offset + i] = s.charCodeAt(i); };
  text(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

// Simple level measures, used by tests and for choosing a master gain.
export function peak(samples) {
  let p = 0;
  for (const s of samples) p = Math.max(p, Math.abs(s));
  return p;
}

export function rms(samples, from = 0, to = samples.length) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, to - from));
}
