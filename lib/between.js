// # A consonant between vowels, the way the reference recordings have it
//
// The Wikipedia IPA chart with audio gives each consonant as a vowel, the consonant, the vowel again,
// and so on: "a C a C a". `betweenVowels` builds that from two of `consonantGesture`'s gestures, joined
// so the vowel in the middle is shared. The demo plays it, and `scripts/compare-consonants.mjs`
// renders it, so what you hear is what is measured against the recordings.
import { consonantGesture } from './consonants.js';

// `lead` is the vowel before the first consonant and `gap` the extra vowel between the two, both in
// seconds, on top of the vowel each gesture already has around its consonant. Returns:
//
// - `score`: the whole thing
// - `cores`: the time range of each consonant (`{ start, end }`), for measuring
// - `holds`: the closure or steady part of each, or `null` for sounds that cannot be held
export function betweenVowels(c, { lead = 0.15, gap = 0.1, ...options } = {}) {
  const first = consonantGesture(c, options);
  const second = consonantGesture(c, options);
  const startFirst = lead;
  // The second gesture's own first closing move happens at `core.start`; put that `gap` after the end
  // of the first one, so the two vowels (the tail of one, the lead of the other) run together.
  const startSecond = startFirst + first.score.duration + gap - second.core.start;
  const shift = (g, by) => g.score.keyframes.map((k) => ({ ...k, t: k.t + by }));
  const beginning = { ...first.score.keyframes[0], t: 0 };
  const keyframes = [beginning, ...shift(first, startFirst), ...shift(second, startSecond).filter((k) => k.t >= startSecond + second.core.start)];
  const range = (r, by) => (r ? { start: r.start + by, end: r.end + by } : null);
  return {
    score: { keyframes, duration: keyframes[keyframes.length - 1].t },
    cores: [range(first.core, startFirst), range(second.core, startSecond)],
    holds: [range(first.hold, startFirst), range(second.hold, startSecond)],
    kind: first.kind,
  };
}
