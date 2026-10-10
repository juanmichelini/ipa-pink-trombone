// # Voices
//
// The same IPA can be said by a bass, a child or a soprano. Three physical things change between
// them, and all three are already inputs to the engine:
//
// 1. **Tract length.** A longer tube resonates lower, so every formant moves down together. This
//    is why a child saying the same vowel as a man sounds different even at the same pitch. The
//    engine takes the length in centimetres.
// 2. **Pitch.** How fast the vocal folds vibrate: about 100 Hz for an adult man, 200 Hz for a
//    woman, 300 Hz or more for a child.
// 3. **Source quality.** How tightly the folds close (`tenseness`), how steadily they vibrate
//    (`jitter`, `vibrato`), and how much breath leaks through.
//
// A **voice** is a named choice of those numbers. Nothing in a voice knows about language or IPA.
// It is a layer you can put on top of anything that makes a score.
import { plan } from './planner.js';
import { DEFAULT_TRACT_CM } from './pinktrombone.js';

// ## The presets
//
// Tract lengths are textbook values for the vocal tract from glottis to lips. `f0` is a typical
// speaking pitch; `range` says how much a speaker moves around it.
export const VOICES = [
  { id: 'bass', label: 'Bass', tractCm: 19.0, f0: 85, tenseness: 0.7, vibratoDepth: 0.006, jitter: 0.01, range: 0.8 },
  { id: 'man', label: 'Man', tractCm: 17.5, f0: 115, tenseness: 0.6, vibratoDepth: 0, jitter: 0.008, range: 1 },
  { id: 'tenor', label: 'Tenor', tractCm: 16.5, f0: 175, tenseness: 0.75, vibratoDepth: 0.02, jitter: 0.004, range: 1.2 },
  { id: 'woman', label: 'Woman', tractCm: 14.8, f0: 205, tenseness: 0.55, vibratoDepth: 0, jitter: 0.008, range: 1.1 },
  { id: 'soprano', label: 'Soprano', tractCm: 14.2, f0: 440, tenseness: 0.8, vibratoDepth: 0.03, vibratoRate: 5.8, jitter: 0.002, range: 1.3 },
  { id: 'child', label: 'Child (6 y)', tractCm: 11.5, f0: 285, tenseness: 0.55, vibratoDepth: 0, jitter: 0.012, range: 1.6 },
  { id: 'toddler', label: 'Toddler', tractCm: 9.5, f0: 380, tenseness: 0.5, vibratoDepth: 0, jitter: 0.016, range: 1.8 },
  { id: 'elder', label: 'Elder', tractCm: 16.5, f0: 125, tenseness: 0.35, vibratoDepth: 0.012, vibratoRate: 4.5, jitter: 0.03, range: 0.7 },
  { id: 'whisper', label: 'Whisper', tractCm: 16.0, f0: 130, tenseness: 0.3, vibratoDepth: 0, jitter: 0, range: 0, whisper: true },
  { id: 'robot', label: 'Robot', tractCm: 17.0, f0: 110, tenseness: 0.9, vibratoDepth: 0, jitter: 0, range: 0, declination: 0 },
  { id: 'giant', label: 'Giant', tractCm: 26.0, f0: 60, tenseness: 0.6, vibratoDepth: 0.004, jitter: 0.02, range: 0.6 },
];

export function voiceById(id) {
  return VOICES.find((v) => v.id === id) || null;
}

// ## Whispering
//
// Whispered speech has no vibrating folds at all, only breath through the tract. Turn the voicing
// into breath: wherever the voice would be, aspiration noise takes its place. Breath is much quieter than voice for the same effort, so it is
// turned up to three times the nominal maximum (the engine allows up to 4 for exactly this).
export function whisperScore(score) {
  const keyframes = score.keyframes.map((k) => ({
    ...k,
    aspiration: Math.min(4, k.aspiration + 3 * k.intensity),
    intensity: 0,
  }));
  return { keyframes, duration: score.duration };
}

// ## Speaking with a voice
//
// Returns what the planner returns, plus `tractLength`, which must be given to whatever plays or
// renders the score (the shape of the tract is in the score, but its length is a property of the
// speaker). `overrides` replaces individual numbers of the preset, which is how the demo's
// sliders work.
export function speak(ipa, voice, overrides = {}) {
  const v = { ...voice, ...overrides };
  const result = plan(ipa, {
    f0: v.f0, tenseness: v.tenseness, vibratoDepth: v.vibratoDepth, vibratoRate: v.vibratoRate ?? 5.5,
    jitter: v.jitter, range: v.range ?? 1, declination: v.declination ?? 0.08,
  });
  const score = v.whisper ? whisperScore(result.score) : result.score;
  return { ...result, score, tractLength: v.tractCm ?? DEFAULT_TRACT_CM, voice: v };
}

// How much the formants move relative to the reference adult tract, as a ratio. A 14.2 cm tract
// is about 1.2 times as high-pitched in every resonance as the 17.1 cm reference.
export function formantScale(tractCm) {
  return DEFAULT_TRACT_CM / tractCm;
}
