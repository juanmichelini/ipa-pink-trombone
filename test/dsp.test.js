import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeWav } from '../lib/render.js';
import { readWav, stft, band, db, encodePng } from '../scripts/dsp.mjs';

// The calibration scripts measure recordings with these helpers, so check them on signals whose
// answer is known.
const RATE = 44100;
const sine = (hz, seconds = 0.5) => Float32Array.from({ length: Math.floor(RATE * seconds) }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / RATE));

test('a WAV written by the renderer reads back', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsp-'));
  const file = join(dir, 'a.wav');
  writeFileSync(file, encodeWav(sine(440)));
  const { samples, rate } = readWav(file);
  assert.equal(rate, RATE);
  assert.equal(samples.length, sine(440).length);
  assert.ok(Math.abs(samples[100] - sine(440)[100]) < 1e-3);
});

test('the spectrum of a 1 kHz sine peaks at 1 kHz and has nothing far from it', () => {
  const S = stft(sine(1000), RATE, 1024, 512);
  const p = S.power[3];
  const peak = p.indexOf(Math.max(...p));
  assert.ok(Math.abs(peak * S.binHz - 1000) < S.binHz, `peak at ${peak * S.binHz} Hz`);
  assert.ok(db(band(p, S.binHz, 4000, 20000)) < db(band(p, S.binHz, 800, 1200)) - 50);
});

test('a PNG has the signature, a header with the size, and an end chunk', () => {
  const png = encodePng(3, 2, Buffer.alloc(3 * 2 * 3, 128));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 3);
  assert.equal(png.readUInt32BE(20), 2);
  assert.equal(png.subarray(-8, -4).toString('latin1'), 'IEND');
});
