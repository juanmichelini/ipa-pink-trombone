// # Demo 6: Tempo
//
// Two ways to make speech faster, side by side:
//
// - **speech-like**: the planner's `rate` option, which shortens vowels by `1 / rate`, consonant
//   holds by `1 / √rate`, and lets short vowels undershoot (`lib/planner.js`)
// - **naive**: plan at normal speed and scale every time in the score by the same factor
//
// The bar under the controls shows each segment's duration, so the first approach's effect is
// visible as well as audible: vowels shrink, consonants hold their width.
import { plan, markAt, syllableRate } from '../../lib/planner.js';
import { scaleTime, DEFAULT_FRAME } from '../../lib/score.js';
import { shapeOf } from '../../lib/tractshape.js';
import { drawTract } from '../../lib/ui/tractview.js';
import { lazySynth, playAnimated, downloadWav, log, unlog } from '../../lib/ui/demo.js';

const $ = (id) => document.getElementById(id);
const synthHolder = lazySynth();
let synth = null;
let playing = null;
let current = null;
const RATE = [0.4, 3.5];

const rate = () => log(Number($('rate').value), ...RATE);
const mode = () => document.querySelector('input[name=mode]:checked').value;

// ## Building an utterance for the current settings
function utterance(r = rate(), m = mode()) {
  const text = $('ipa').value;
  if (m === 'speech') return plan(text, { rate: r });
  const base = plan(text);
  const score = scaleTime(base.score, 1 / r);
  return { ...base, score, duration: score.duration, marks: base.marks.map((x) => ({ ...x, start: x.start / r, end: x.end / r })) };
}

// ## Showing durations
//
// Each segment becomes one box whose width is proportional to its duration. Pink boxes are vowels
// and grey boxes are consonants. Hovering a box gives its length in milliseconds. This is the
// most direct way to see what "speeding up" did to each kind of sound, because the sound itself
// goes by too fast to hear which part changed.
function showBars(u) {
  const bars = $('bars');
  bars.replaceChildren();
  for (const m of u.marks) {
    const el = document.createElement('div');
    el.style.flex = `${m.end - m.start} 0 0`;
    el.style.background = m.type === 'vowel' ? 'var(--accent-strong)' : 'var(--muted)';
    el.style.borderRight = '1px solid var(--bg, #fff)';
    el.style.color = '#fff';
    el.style.font = '14px var(--ipa)';
    el.style.textAlign = 'center';
    el.style.overflow = 'hidden';
    el.textContent = m.symbol;
    el.title = `${m.symbol}: ${Math.round((m.end - m.start) * 1000)} ms`;
    bars.append(el);
  }
}
// The readout beside the slider turns the abstract multiplier into something with units: syllables
// per second (conversational English is around four to six) and total length.
function refresh() {
  current = utterance();
  showBars(current);
  $('rateOut').textContent = `×${rate().toFixed(2)} · ${syllableRate(current.marks, current.duration).toFixed(1)} syllables/s · ${current.duration.toFixed(2)} s`;
}

// ## Playing
//
// `playAnimated` sends the score to the synth and calls back on every animation frame with the
// frame being sounded, so the tract picture moves in time with what you hear. `markAt` turns the
// time into the segment that is sounding, for the readout.
async function play(u, label = '') {
  try { synth = await synthHolder.get(); } catch (error) { $('status').textContent = `Audio could not start: ${error.message}`; return; }
  showBars(u);
  playing = playAnimated(synth, u.score, (frame, t) => {
    drawTract($('tract'), shapeOf(frame));
    const m = markAt(u.marks, t);
    $('readout').textContent = `${label}${m ? `[${m.symbol}]` : ''}`;
  });
  await playing.done;
}
async function say() { if (playing) playing.cancel(); refresh(); await play(current); }
//
// The ladder says the same text four times, getting faster. The token lets the Stop button cancel
// it between steps: each step checks that it is still the latest ladder before starting.
async function ladder() {
  if (playing) playing.cancel();
  const token = (ladder.token = (ladder.token || 0) + 1);
  for (const [name, r] of [['slow', 0.6], ['medium', 1], ['fast', 1.8], ['very fast', 3]]) {
    if (ladder.token !== token) return;
    $('status').textContent = `${name} (×${r})`;
    await play(utterance(r), `${name} · `);
    await new Promise((res) => setTimeout(res, 300));
  }
  $('status').textContent = '';
  refresh();
}

// ## Wiring
//
// The slider is logarithmic, because doubling the speed should feel like the same step whether you
// start slow or fast. Every control just refreshes the plan; nothing plays until Say is pressed.
$('rate').value = unlog(1, ...RATE);
$('rate').addEventListener('input', refresh);
$('ipa').addEventListener('input', refresh);
for (const r of document.querySelectorAll('input[name=mode]')) r.addEventListener('change', refresh);
$('say').addEventListener('click', say);
$('ladder').addEventListener('click', ladder);
$('stop').addEventListener('click', () => { ladder.token = (ladder.token || 0) + 1; if (playing) playing.cancel(); if (synth) synth.stop(); $('status').textContent = ''; });
$('download').addEventListener('click', () => downloadWav((current || utterance()).score, `tempo-${rate().toFixed(1)}x.wav`));
$('readout').style.whiteSpace = 'pre-line';
drawTract($('tract'), shapeOf(DEFAULT_FRAME));
refresh();
