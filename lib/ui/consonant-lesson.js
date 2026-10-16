// # A consonant lesson
//
// The claim of Demo 2: **the IPA consonant table is a table of tract gestures**. Lesson 2 shows the whole
// table at once. The steps before it (2.1 to 2.9) take it a slice at a time: one manner, and one voicing
// (so, for example, only the voiceless fricatives), with the one thing left free being **where** the
// tract is narrowed. Instead of a column per place there is a line from the lips to the throat
// (`lib/ui/placeaxis.js`). Press it and slide, and the sound glides through every place between the
// named ones; the tract on the right narrows where you point.
//
// A lesson is `startConsonantLesson({ variants, carrier })`. A *variant* is a manner and a voicing, with:
//
// - `symbols`: the IPA symbols of that slice, marked on the line where they are made
// - `extras`: symbols that have a sound but no place on the line (`h`, `ʔ`), as plain buttons
//
// A lesson with more than one variant (the laterals, the trills and taps, the affricates) has buttons to
// choose between them. `carrier` is the vowel to play it between (`'none'` plays it alone). A sound that
// can be held (a fricative, a nasal, a glide) is held for as long as you press; the others (stops, taps,
// trills, affricates) are gestures that play through, so they play when you let go.
import { CONSONANTS, consonantBySymbol, consonantGesture, consonantAt, kindOf } from '../consonants.js';
import { betweenVowels } from '../between.js';
import { scaleTime, frameAt, normalizeScore } from '../score.js';
import { shapeOfSymbol } from '../vowel-map.js';
import { shapeOf } from '../tractshape.js';
import { drawTract } from './tractview.js';
import { createPlaceAxis, placeIndexOf, indexToX, nearestSymbol } from './placeaxis.js';
import { makeButton } from './consonanttable.js';
import { lazySynth, playAnimated, downloadWav, log, unlog, round } from './demo.js';
import { t, tp } from '../i18n.js';

// A slice of the inventory: every consonant of a manner and a voicing. Those with a place in the mouth go on the
// line, and are listed in the order of the line, from the lips to the throat, so that the buttons under the
// line read the same way as the symbols on it (the inventory has some sounds, such as `ʍ` and `ɕ`, at the end).
// The glottal ones (`h`, `ʔ`) have no place along the line, so they are plain buttons, after the others.
export function slice(manner, voiced) {
  const these = CONSONANTS.filter((c) => c.manner === manner && c.voiced === voiced);
  const index = (c) => placeIndexOf(c.place);
  return {
    manner,
    voiced,
    symbols: these.filter((c) => index(c) !== null).sort((a, b) => index(b) - index(a)).map((c) => c.symbol),
    extras: these.filter((c) => index(c) === null).map((c) => c.symbol),
  };
}

const SINGLE_PRESS_STRETCH = 5;
const PITCH = [70, 400];

export function startConsonantLesson({ variants, carrier = 'none' }) {
const $ = (id) => document.getElementById(id);
const synthHolder = lazySynth();
let synth = null;
let playing = null;
let lastScore = null;

// What is on the line for a variant: each symbol with the index of its place.
const itemsOf = (variant) => variant.symbols.map((symbol) => ({ symbol, index: placeIndexOf(consonantBySymbol(symbol).place) }));
const state = { variant: 0, index: itemsOf(variants[0])[0].index, carrier, f0: 130 };
const variant = () => variants[state.variant];

// The carrier vowel is a tract shape from the vowel library.
const carrierShape = () => {
  if (state.carrier === 'none') return null;
  const { tongueIndex, tongueDiameter, lips } = shapeOfSymbol(state.carrier);
  return { tongueIndex, tongueDiameter, lips };
};
const options = () => ({ f0: state.f0, carrier: carrierShape() });

// The consonant under the pointer: the named one if a symbol is pressed, otherwise the lesson's manner
// and voicing at the place pointed to.
const consonantNow = (symbol) => (symbol ? consonantBySymbol(symbol) : consonantAt(variant().manner, variant().voiced, state.index));
const holdable = (c) => consonantGesture(c, {}).kind === 'continuant' && state.carrier === 'none';
// The score to play for a consonant: between vowels, or alone and stretched so each phase is audible.
// A stop alone is the exception: there is nothing to hear while it is shut, so stretching it would only be a
// longer wait for the burst. It is already as quick as a real one (see `quick` in `consonants.js`).
const quickStop = (c) => kindOf(c) === 'stop' && c.symbol !== 'ʔ';
const scoreFor = (c) => (state.carrier === 'none'
  ? scaleTime(consonantGesture(c, options()).score, quickStop(c) ? 1 : SINGLE_PRESS_STRETCH)
  : betweenVowels(c, options()).score);
// The frame that shows the consonant at rest: the middle of its hold, or of the gesture if it has none.
const restFrame = (c) => {
  const g = consonantGesture(c, options());
  if (g.steady) return g.steady;
  return frameAt(normalizeScore(g.score), (g.core.start + g.core.end) / 2);
};

// ## Showing it
let axis = null;
const buildAxis = (v) => {
  $('axis').replaceChildren();
  axis = createPlaceAxis($('axis'), { symbols: itemsOf(v), places: v.symbols.map((x) => consonantBySymbol(x).place), onPress: (pos) => pressAt(pos), onMove: (pos) => moveTo(pos), onRelease: () => releaseAxis() });
};
function show(frame, index, symbol = null) {
  drawTract($('tract'), shapeOf(frame));
  axis.setCursor(index);
  const near = symbol ? { symbol } : nearestSymbol(itemsOf(variant()), indexToX(index), Infinity);
  if (!near) return;
  const c = consonantBySymbol(near.symbol);
  axis.highlight(near.symbol);
  $('readout').textContent = t('cons.readout', { symbol: near.symbol, voicing: tp(c.voiced ? 'voiced' : 'voiceless'), place: tp(c.place), manner: tp(c.manner) });
}
$('readout').style.whiteSpace = 'pre-line';

// ## Sound
//
// Audio can only start after a gesture, and starting takes a moment, so `held` records whether the
// press is still going when the synth is ready.
let held = false;
let heldLive = false;
const getSynth = async () => {
  try { synth = await synthHolder.get(); return synth; } catch (error) { $('status').textContent = t('common.audioError', { message: error.message }); return null; }
};
async function playScore(score, index, symbol) {
  if (playing) playing.cancel();
  lastScore = score;
  if (!(await getSynth())) return;
  playing = playAnimated(synth, score, (frame) => show(frame, index, symbol));
  await playing.done;
}
async function startHeld(c, symbol) {
  held = true;
  show(restFrame(c), state.index, symbol);
  if (!(await getSynth()) || !held) return;
  heldLive = true;
  synth.live(restFrame(c));
}
function stopHeld() { held = false; if (synth && heldLive) { heldLive = false; synth.release(); } }

// On the line: a held sound starts on press and glides as you slide; a gesture plays on release,
// where you let go.
let axisSymbol = null;
function pressAt(pos) {
  state.index = pos.index; axisSymbol = pos.symbol;
  const c = consonantNow(pos.symbol);
  if (holdable(c)) startHeld(c, pos.symbol); else show(restFrame(c), state.index, pos.symbol);
}
function moveTo(pos) {
  state.index = pos.index; axisSymbol = pos.symbol;
  const c = consonantNow(pos.symbol);
  show(restFrame(c), state.index, pos.symbol);
  if (heldLive && synth) synth.live(restFrame(c));
}
function releaseAxis() {
  if (held) { stopHeld(); return; }
  playScore(scoreFor(consonantNow(axisSymbol)), state.index, axisSymbol);
}

// ## Buttons for every symbol
//
// The same without the line: the named consonant, held or played as above, and the line follows.
const buttonFor = (symbol) => makeButton(symbol, {
  onPress: () => {
    const c = consonantBySymbol(symbol);
    const place = placeIndexOf(c.place);
    if (place !== null) state.index = place;
    if (holdable(c)) startHeld(c, symbol); else playScore(scoreFor(c), state.index, symbol);
  },
  onRelease: () => stopHeld(),
});
function buildButtons() {
  $('buttons').replaceChildren();
  for (const symbol of [...variant().symbols, ...(variant().extras || [])]) $('buttons').append(buttonFor(symbol));
}

// ## Variants
//
// A lesson with more than one slice (voiceless and voiced, trill and tap, ...) has a button for each,
// and the line is rebuilt for the one chosen.
const chooser = $('variants');
function choose(i) {
  state.variant = i;
  [...chooser.children].forEach((b, k) => b.classList.toggle('primary', k === i));
  buildAxis(variants[i]);
  state.index = itemsOf(variants[i])[0].index;
  buildButtons();
  show(restFrame(consonantNow(null)), state.index);
}
if (variants.length < 2) chooser.style.display = 'none';
else {
  variants.forEach((v, i) => {
    const b = document.createElement('button');
    b.textContent = `${tp(v.voiced ? 'voiced' : 'voiceless')} · ${tp(v.manner)}`;
    b.addEventListener('click', () => choose(i));
    chooser.append(b);
  });
}

// ## Controls
const showPitch = () => { $('pitchOut').textContent = `${Math.round(state.f0)} Hz`; };
$('carrier').value = state.carrier;
$('carrier').addEventListener('change', (e) => { state.carrier = e.target.value; });
$('pitch').addEventListener('input', (e) => { state.f0 = log(Number(e.target.value), ...PITCH); showPitch(); });
$('pitch').value = unlog(state.f0, ...PITCH);
showPitch();
$('stop').addEventListener('click', () => { if (playing) playing.cancel(); stopHeld(); $('status').textContent = ''; });
$('download').addEventListener('click', () => {
  downloadWav(lastScore || scoreFor(consonantNow(null)), `consonant-${round(state.f0)}hz.wav`);
});
choose(0);
}
