// # Demo 2: Consonants
//
// The claim of this experiment: **the IPA consonant table is a table of tract gestures**. Place is
// where the tract narrows, manner is how, and voicing is whether the voice is on. Press a symbol
// and the same engine that said the vowels makes the sound.
//
// Pressing means two things, depending on the sound:
//
// - **Sustainable** sounds (fricatives, nasals, approximants, laterals) are held: the tract moves
//   to the steady frame of the gesture and stays there until you let go.
// - **Transient** sounds (stops, affricates, taps, trills) cannot be held without changing what
//   they are, so the whole gesture plays once.
//
// With "between vowels" chosen, the gesture is wrapped in the same vowel on both sides, because
// most consonants are heard by what they do to the vowels next to them.
import { CONSONANTS, consonantBySymbol, consonantGesture, NOT_MODELLED } from '../../lib/consonants.js';
import { concatScores, scaleTime, DEFAULT_FRAME } from '../../lib/score.js';
import { shapeOfSymbol } from '../../lib/vowel-map.js';
import { shapeOf } from '../../lib/tractshape.js';
import { drawTract } from '../../lib/ui/tractview.js';
import { createConsonantTable } from '../../lib/ui/consonanttable.js';
import { lazySynth, playAnimated, downloadWav, log, unlog, round } from '../../lib/ui/demo.js';
import { t, tp } from '../../lib/i18n.js';

const $ = (id) => document.getElementById(id);
const synthHolder = lazySynth();
let synth = null;
let playing = null;
let lastScore = null;
const SINGLE_PRESS_STRETCH = 5;
const state = { f0: 130, carrier: 'none', aspirated: false };
const PITCH = [70, 400];

// ## Choosing the carrier
//
// A carrier vowel is a tract shape, taken from the vowel library built in Demo 1.
function carrierShape() {
  if (state.carrier === 'none') return null;
  const { tongueIndex, tongueDiameter, lips } = shapeOfSymbol(state.carrier);
  return { tongueIndex, tongueDiameter, lips };
}
const gestureOf = (symbol) =>
  consonantGesture(consonantBySymbol(symbol), { f0: state.f0, carrier: carrierShape(), aspirated: state.aspirated });

// ## Showing it
function show(frame, symbol) {
  drawTract($('tract'), shapeOf(frame));
  const c = consonantBySymbol(symbol);
  if (!c) return;
  $('readout').textContent = t('cons.readout', { symbol, voicing: tp(c.voiced ? 'voiced' : 'voiceless'), place: tp(c.place), manner: tp(c.manner) });
  table.highlight(symbol);
}
$('readout').style.whiteSpace = 'pre-line';

// ## Sound
//
// Audio can only start after a gesture, and starting takes a moment, so `held` tracks whether the
// press is still going when the synth is ready.
let held = null;
let heldLive = false;
async function press(symbol) {
  held = symbol;
  if (playing) playing.cancel();
  const g = gestureOf(symbol);
  // A single press lasts five times as long as the gesture's natural length, so each phase of it
  // (closure, burst, release, glide) can be heard on its own.
  const score = scaleTime(g.score, SINGLE_PRESS_STRETCH);
  lastScore = score;
  try { synth = await synthHolder.get(); } catch (error) { $('status').textContent = t('common.audioError', { message: error.message }); return; }
  if (held !== symbol && g.kind === 'continuant') return; // let go before audio was ready
  if (g.kind === 'continuant' && state.carrier === 'none') {
    // Held for as long as the pointer is down.
    show(g.steady, symbol);
    heldLive = true;
    synth.live({ ...g.steady, intensity: g.steady.intensity });
  } else {
    playing = playAnimated(synth, score, (frame) => show(frame, symbol));
  }
}
function release(symbol) {
  if (held === symbol) held = null;
  if (synth && heldLive) { heldLive = false; synth.release(); }
}
const table = createConsonantTable($('table'), { onPress: press, onRelease: release });

// ## Playing a family
//
// Several gestures joined into one score by `concatScores`, animated while it plays.
async function playFamily(filter, label) {
  if (playing) playing.cancel();
  const symbols = CONSONANTS.filter(filter).map((c) => c.symbol);
  const parts = symbols.map((s) => gestureOf(s).score);
  const score = concatScores(parts, 0.1);
  lastScore = score;
  try { synth = await synthHolder.get(); } catch (error) { $('status').textContent = t('common.audioError', { message: error.message }); return; }
  const starts = [];
  let t = 0;
  for (const p of parts) { starts.push(t); t += p.duration + 0.1; }
  playing = playAnimated(synth, score, (frame, time) => {
    let i = starts.findIndex((s, k) => time >= s && (k === starts.length - 1 || time < starts[k + 1]));
    show(frame, symbols[Math.max(0, i)]);
  });
  $('status').textContent = t('status.playingLabel', { label: tp(label), list: symbols.join(' ') });
  await playing.done;
  $('status').textContent = '';
}
$('playRow').addEventListener('click', () => playFamily((c) => c.manner === 'plosive', 'stops'));
$('playFric').addEventListener('click', () => playFamily((c) => c.manner === 'fricative', 'fricatives'));
$('stop').addEventListener('click', () => { if (playing) playing.cancel(); if (synth) synth.release(); $('status').textContent = ''; });
$('download').addEventListener('click', () => {
  downloadWav(lastScore || gestureOf('s').score, `consonant-${round(state.f0)}hz.wav`);
});

// ## Controls
$('carrier').addEventListener('change', (e) => { state.carrier = e.target.value; });
$('aspirated').addEventListener('change', (e) => { state.aspirated = e.target.checked; });
$('pitch').addEventListener('input', (e) => { state.f0 = log(Number(e.target.value), ...PITCH); $('pitchOut').textContent = `${Math.round(state.f0)} Hz`; });
$('pitch').value = unlog(state.f0, ...PITCH);
$('pitchOut').textContent = `${Math.round(state.f0)} Hz`;
NOT_MODELLED.forEach((note, i) => { const li = document.createElement('li'); li.textContent = t(`nm.${i + 1}`); $('notModelled').append(li); });
drawTract($('tract'), shapeOf(DEFAULT_FRAME));
