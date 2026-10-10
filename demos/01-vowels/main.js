// # Demo 1: Vowels
//
// The first experiment, and the simplest claim: **the IPA vowel chart is a map of where the
// tongue goes**, so dragging across it should move a vocal tract the way a real tongue moves.
//
// There is almost nothing in this file because the ideas live in the shared library:
//
// - `lib/vowels.js` knows the chart and the reference formants of each vowel
// - `lib/vowel-map.js` turns a chart position into a tongue, jaw and lips
// - `lib/pinktrombone.js` makes the sound; `lib/ui/*` draws it
//
// What is left here is wiring: pointer in, sound and picture out.
import { VOWELS, VOWEL_SYMBOLS, vowelBySymbol } from '../../lib/vowels.js';
import { vowelShape, vowelFrame, vowelSequence, cursorAt } from '../../lib/vowel-map.js';
import { shapeOf } from '../../lib/tractshape.js';
import { formants } from '../../lib/analysis.js';
import { drawTract } from '../../lib/ui/tractview.js';
import { createVowelChart } from '../../lib/ui/vowelchart.js';
import { lazySynth, playAnimated, downloadWav, log, unlog, round } from '../../lib/ui/demo.js';
import { t, tp } from '../../lib/i18n.js';

const $ = (id) => document.getElementById(id);
const synthHolder = lazySynth();
let synth = null;
let playing = null;

// ## State
//
// Four numbers describe everything the chart can say: backness `b`, height `h`, rounding (0 spread
// to 1 fully rounded) and pitch.
const state = { b: 0, h: 0, rounded: 0, f0: 130, tenseness: 0.6 };
const PITCH = [70, 400];

function frameNow() {
  return vowelFrame(vowelShape(state.b, state.h, state.rounded), { f0: state.f0, tenseness: state.tenseness });
}

// ## Showing it
//
// The nearest named vowel is the one a phonetician would call this position. Measuring the
// formants of the shape that is actually playing shows the link between articulation and
// acoustics: move up the chart and F1 falls, move left and F2 rises.
function nearestSymbol(b, h, rounded) {
  let best = null, bestD = Infinity;
  for (const v of VOWELS) {
    const d = (v.b - b) ** 2 + (v.h - h) ** 2 + 0.05 * Math.abs((v.rounded ? 1 : 0) - rounded);
    if (d < bestD) { best = v; bestD = d; }
  }
  return best;
}

const chart = createVowelChart($('chart'), {
  onPress: (pos) => { applyPosition(pos); startSound(); },
  onMove: (pos) => { applyPosition(pos); updateSound(); },
  onRelease: () => stopSound(),
});

function applyPosition(pos) {
  state.b = pos.b;
  state.h = pos.h;
  if (pos.rounded !== null) {
    state.rounded = pos.rounded;
    $('rounding').value = pos.rounded;
  }
  refresh();
}

let pending = false;
function refresh(frame = frameNow(), cursor = { b: state.b, h: state.h }, vowel = nearestSymbol(cursor.b, cursor.h, state.rounded)) {
  chart.setCursor(cursor.b, cursor.h);
  chart.highlight(vowel.symbol);
  drawTract($('tract'), shapeOf(frame));
  $('roundingOut').textContent = t(state.rounded < 0.15 ? 'rounding.spread' : state.rounded > 0.85 ? 'rounding.rounded' : 'rounding.half');
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    const [f1, f2] = formants(frame, { steps: 8192, count: 2 });
    $('readout').textContent =
      t('vowel.readout', {
        symbol: vowel.symbol, name: vowel.name.split(' ').map(tp).join(' '), f1: Math.round(f1), f2: Math.round(f2),
        rf1: vowel.f1, rf2: vowel.f2, approx: vowel.approx ? t('vowel.approx') : '',
      });
  });
}
$('readout').style.whiteSpace = 'pre-line';

// ## Sound
//
// Pressing starts a held sound; moving glides it; lifting releases. Audio can only start after a
// gesture, so the synth is created on the first press, and that takes a moment (the engine is
// fetched and compiled). If the finger is already up by then, the sound must not start at all, so
// `held` records whether the press is still going.
let held = false;
async function startSound() {
  held = true;
  try {
    synth = await synthHolder.get();
    if (held) synth.live(frameNow());
    $('status').textContent = '';
  } catch (error) {
    $('status').textContent = t('common.audioError', { message: error.message });
  }
}
function updateSound() { if (synth && held) synth.live(frameNow()); }
function stopSound() { held = false; if (synth) synth.release(); }

// ## Buttons for every vowel
//
// The same thing without a pointer on the chart: hold a button (or Space and Enter on it).
for (const symbol of VOWEL_SYMBOLS) {
  const v = vowelBySymbol(symbol);
  const button = document.createElement('button');
  button.textContent = symbol;
  button.title = v.name.split(' ').map(tp).join(' ');
  const down = () => { applyPosition({ b: v.b, h: v.h, rounded: v.rounded ? 1 : 0 }); startSound(); button.classList.add('active'); };
  const up = () => { stopSound(); button.classList.remove('active'); };
  button.addEventListener('pointerdown', down);
  button.addEventListener('pointerup', up);
  button.addEventListener('pointerleave', up);
  button.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); down(); } });
  button.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') up(); });
  $('buttons').append(button);
}

// ## Controls
const showPitch = () => { $('pitchOut').textContent = `${Math.round(state.f0)} Hz`; };
const showVoice = () => { $('tensenessOut').textContent = t(state.tenseness < 0.35 ? 'voice.breathy' : state.tenseness > 0.8 ? 'voice.pressed' : 'voice.modal'); };
$('rounding').addEventListener('input', (e) => { state.rounded = Number(e.target.value); refresh(); updateSound(); });
$('pitch').addEventListener('input', (e) => { state.f0 = log(Number(e.target.value), ...PITCH); showPitch(); updateSound(); });
$('tenseness').addEventListener('input', (e) => { state.tenseness = Number(e.target.value); showVoice(); updateSound(); });
$('pitch').value = unlog(state.f0, ...PITCH);
showPitch();
showVoice();

// ## Playing a sequence
//
// A score from `vowelSequence`, played through the same engine, with the chart cursor and the
// tract following along via `playAnimated`.
let lastSequence = null;
async function playSequence(symbols) {
  if (playing) playing.cancel();
  const sequence = vowelSequence(symbols, { f0: state.f0, tenseness: state.tenseness });
  lastSequence = sequence;
  try { synth = await synthHolder.get(); } catch (error) { $('status').textContent = t('common.audioError', { message: error.message }); return; }
  playing = playAnimated(synth, sequence, (frame, t) => {
    const c = cursorAt(sequence, t);
    refresh(frame, c, vowelBySymbol(c.symbol));
  });
  $('status').textContent = t('status.playing', { list: symbols.join(' ') });
  await playing.done;
  $('status').textContent = '';
}
const CARDINAL = ['i', 'e', 'ɛ', 'a', 'ɑ', 'ɔ', 'o', 'u'];
const EVERYTHING = ['i', 'y', 'ɪ', 'ʏ', 'e', 'ø', 'ɛ', 'œ', 'æ', 'a', 'ɶ', 'ɑ', 'ɒ', 'ʌ', 'ɔ', 'ɤ', 'o', 'ʊ', 'u', 'ɯ', 'ɨ', 'ʉ', 'ɘ', 'ɵ', 'ə', 'ɜ', 'ɞ', 'ɐ'];
$('playCardinal').addEventListener('click', () => playSequence(CARDINAL));
$('playAll').addEventListener('click', () => playSequence(EVERYTHING));
$('stop').addEventListener('click', () => { if (playing) playing.cancel(); stopSound(); $('status').textContent = ''; });
$('download').addEventListener('click', () => {
  const seq = lastSequence || vowelSequence(CARDINAL, { f0: state.f0, tenseness: state.tenseness });
  downloadWav(seq, `vowels-${round(state.f0)}hz.wav`);
});

refresh();
