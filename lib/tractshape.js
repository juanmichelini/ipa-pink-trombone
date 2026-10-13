// # The shape of a frame
//
// The engine only needs a frame to make sound, but a picture of the tract needs actual widths.
// `shapeOf` asks a throwaway `Tract` what diameters a frame produces. It touches no audio, so
// the UI can call it as often as it likes while a finger moves.
import { Tract, DEFAULT_TRACT_CM } from './pinktrombone.js';

const cache = new Map();

export function shapeOf(frame, { sampleRate = 44100, tractLength = DEFAULT_TRACT_CM } = {}) {
  const key = `${sampleRate}:${tractLength}`;
  let tract = cache.get(key);
  if (!tract) { tract = new Tract(sampleRate, tractLength); cache.set(key, tract); }
  tract.setShape(frame);
  return {
    n: tract.n,
    scale: tract.scale,
    diameter: Float64Array.from(tract.diameter),
    // The two lower surfaces behind that diameter (the tube is as wide as the smaller of the two).
    tongue: Float64Array.from(tract.tongue),
    floor: Float64Array.from(tract.floor),
    noseLength: tract.noseLength,
    noseStart: tract.noseStart,
    noseDiameter: Float64Array.from(tract.noseDiameter),
    velum: tract.velum,
    constrictions: tract.constrictions.map((c) => ({ ...c })),
    // The sound source, for the picture of the vocal cords: how loud the voice is, how much breath
    // there is, and how tightly the cords are pressed.
    source: {
      intensity: frame.intensity ?? 0, aspiration: frame.aspiration ?? 0,
      tenseness: frame.tenseness ?? 0.6, f0: frame.f0 ?? 130,
    },
  };
}
