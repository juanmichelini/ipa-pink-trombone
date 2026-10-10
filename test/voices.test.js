import test from 'node:test';
import assert from 'node:assert/strict';
import { VOICES, voiceById, speak, whisperScore, formantScale } from '../lib/voices.js';
import { formants } from '../lib/analysis.js';
import { shapeOfSymbol, vowelFrame } from '../lib/vowel-map.js';
import { renderScore, rms } from '../lib/render.js';
import { normalizeScore } from '../lib/score.js';

const RATE = 44100;
const render = (s) => { const o = renderScore(s.score, { sampleRate: RATE, tractLength: s.tractLength }); return o.samples || o; };
// Pitch from the first strong autocorrelation peak.
function pitchOf(x) {
  const seg = x.slice(Math.floor(RATE * 0.25), Math.floor(RATE * 0.45));
  let best = 0, bestLag = 0;
  const min = Math.floor(RATE / 700), max = Math.floor(RATE / 50);
  const r0 = seg.reduce((a, v) => a + v * v, 0);
  const rs = [];
  for (let lag = min; lag < max; lag++) { let s = 0; for (let i = 0; i + lag < seg.length; i++) s += seg[i] * seg[i + lag]; rs.push(s / r0); }
  const peak = Math.max(...rs);
  for (let i = 1; i < rs.length - 1; i++) if (rs[i] > 0.8 * peak && rs[i] >= rs[i - 1] && rs[i] >= rs[i + 1]) { bestLag = min + i; best = rs[i]; break; }
  return RATE / bestLag;
}

test('the presets have unique ids and plausible numbers', () => {
  assert.equal(new Set(VOICES.map((v) => v.id)).size, VOICES.length);
  for (const v of VOICES) {
    assert.ok(v.tractCm >= 8 && v.tractCm <= 28, v.id);
    assert.ok(v.f0 >= 50 && v.f0 <= 600, v.id);
  }
  assert.ok(voiceById('soprano') && voiceById('child') && voiceById('man') && voiceById('woman'));
});

test('every voice says a phrase with finite, audible, bounded sound', () => {
  for (const v of VOICES) {
    const x = render(speak('ˈhɛloʊ wɜːld', v));
    assert.ok(x.every(Number.isFinite), v.id);
    assert.ok(rms(x) > 0.01, `${v.id} silent`);
    assert.ok(x.every((s) => Math.abs(s) <= 1.0001), `${v.id} clips`);
  }
});

test('a shorter tract raises every formant by about the length ratio', () => {
  const frame = vowelFrame(shapeOfSymbol('a'));
  const man = formants(frame, { count: 3, tractLength: 17.5 });
  const child = formants(frame, { count: 3, tractLength: 11.5 });
  for (let i = 0; i < 3; i++) {
    const ratio = child[i] / man[i];
    assert.ok(Math.abs(ratio - 17.5 / 11.5) < 0.15, `F${i + 1} ratio ${ratio.toFixed(2)}`);
  }
  assert.ok(Math.abs(formantScale(8.55) - 2) < 0.01);
});

test('each voice is at about its own pitch', () => {
  for (const id of ['bass', 'man', 'woman', 'child', 'soprano']) {
    const v = voiceById(id);
    const x = render(speak('aːaː', { ...v, jitter: 0, vibratoDepth: 0 }));
    const f = pitchOf(x);
    assert.ok(f > v.f0 * 0.8 && f < v.f0 * 1.25, `${id}: wanted ~${v.f0}, measured ${Math.round(f)}`);
  }
});

test('a whisper has no voicing and still has sound', () => {
  const s = speak('ˈhɛloʊ', voiceById('whisper'));
  assert.ok(normalizeScore(s.score).keyframes.every((k) => k.intensity === 0));
  assert.ok(rms(render(s)) > 0.005);
  const w = whisperScore({ keyframes: [{ t: 0, intensity: 1, aspiration: 0 }], duration: 0 });
  assert.equal(w.keyframes[0].intensity, 0);
});

test('a soprano has vibrato and a robot does not', () => {
  const f0s = (v) => { const ks = speak('aːːː', v).score.keyframes; return ks[ks.length - 3].vibratoDepth; };
  assert.ok(f0s(voiceById('soprano')) > 0.02);
  assert.equal(f0s(voiceById('robot')), 0);
  const flat = speak('ˈaːˈa', voiceById('robot')).score.keyframes.filter((k) => k.intensity > 0.9).map((k) => k.f0);
  assert.ok(Math.max(...flat) / Math.min(...flat) < 1.01, 'robot is monotone');
});
