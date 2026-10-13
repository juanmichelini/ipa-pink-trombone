// # Small DSP helpers for the calibration scripts
//
// Just enough signal processing to compare two recordings: read a WAV, take a short-time spectrum,
// and write a PNG, with no dependencies (the repo has none). Used by `compare-consonants.mjs`.
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// A 16-bit PCM WAV (any chunk order, mono or the first channel) as floats in -1..1.
export function readWav(path) {
  const b = readFileSync(path);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let pos = 12, rate = 44100, channels = 1;
  while (pos + 8 <= b.length) {
    const id = b.toString('latin1', pos, pos + 4), size = v.getUint32(pos + 4, true);
    if (id === 'fmt ') { channels = v.getUint16(pos + 10, true); rate = v.getUint32(pos + 12, true); }
    if (id === 'data') {
      const n = Math.floor(Math.min(size, b.length - pos - 8) / 2 / channels);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = v.getInt16(pos + 8 + i * 2 * channels, true) / 32768;
      return { samples: out, rate };
    }
    pos += 8 + size + (size & 1);
  }
  throw new Error(`no data chunk in ${path}`);
}

// In-place radix-2 FFT of `re`/`im` (length a power of two).
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

// Short-time power spectra. Frame k covers samples [k*hop, k*hop+size) and is centred at `time[k]`
// seconds; `power[k][bin]` is |X|^2 of the Hann-windowed frame, divided by size^2 so a full-scale
// sine reads about 0.25.
export function stft(x, rate, size = 1024, hop = 220) {
  const win = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
  const power = [], time = [];
  const re = new Float64Array(size), im = new Float64Array(size);
  for (let s = 0; s + size <= x.length; s += hop) {
    for (let i = 0; i < size; i++) { re[i] = x[s + i] * win[i]; im[i] = 0; }
    fft(re, im);
    const p = new Float64Array(size / 2 + 1);
    for (let k = 0; k <= size / 2; k++) p[k] = (re[k] * re[k] + im[k] * im[k]) / (size * size);
    power.push(p);
    time.push((s + size / 2) / rate);
  }
  return { power, time, size, hop, rate, binHz: rate / size };
}

export const db = (p) => 10 * Math.log10(p + 1e-12);

// Sum of a power spectrum between two frequencies.
export function band(p, binHz, lo, hi) {
  let s = 0;
  for (let k = Math.max(0, Math.ceil(lo / binHz)); k < p.length && k * binHz < hi; k++) s += p[k];
  return s;
}

// ## PNG
//
// An 8-bit RGB image, written by hand: the signature, an IHDR, one zlib-compressed IDAT, an IEND.
const CRC = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const byte of buf) c = CRC[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'latin1'); data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
export function encodePng(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0); head.writeUInt32BE(height, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// A dark-to-bright colour ramp for a value 0..1 (black, purple, orange, pale yellow).
export function ramp(t) {
  const stops = [[0, 0, 4], [60, 15, 110], [180, 55, 120], [250, 140, 50], [252, 253, 191]];
  const x = Math.min(0.999, Math.max(0, t)) * (stops.length - 1), i = Math.floor(x), f = x - i;
  return stops[i].map((c, k) => Math.round(c + (stops[i + 1][k] - c) * f));
}
