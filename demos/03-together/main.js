// # Demo 3: Together
//
// Everything so far in one box. A text field takes IPA; the planner (`lib/planner.js`) turns it
// into a single score; the engine says it; the tract picture follows. All the new work is in the
// shared library, so this page is wiring again:
//
// - read the text and show which characters were not understood
// - plan, then play with `playAnimated`, highlighting the segment that is sounding
// - a palette of symbols to add to the text, so IPA can be typed without a special keyboard
import { tokenize, unknownCharacters } from '../../lib/ipa.js';
import { plan, markAt } from '../../lib/planner.js';
import { VOWEL_SYMBOLS } from '../../lib/vowels.js';
import { CONSONANT_SYMBOLS } from '../../lib/consonants.js';
import { DEFAULT_FRAME } from '../../lib/score.js';
import { shapeOf } from '../../lib/tractshape.js';
import { drawTract } from '../../lib/ui/tractview.js';
import { lazySynth, playAnimated, downloadWav, log, unlog, round } from '../../lib/ui/demo.js';

const $ = (id) => document.getElementById(id);
const synthHolder = lazySynth();
let synth = null;
let playing = null;
const state = { f0: 130 };
const PITCH = [70, 400];

const EXAMPLES = [
  ['hello world', 'ˈhɛloʊ wɜːld'],
  ['mama', 'ˈmama'],
  ['sheep / ship', 'ʃiːp ʃɪp'],
  ['pat / bat', 'pʰat bat'],
  ['yo-yo', 'ˈjoʊjoʊ'],
  ['trill', 'ˈtɾa ˈra'],
  ['sixth', 'sɪksθ'],
  ['French nasals', 'bɔ̃ ʒuʁ'],
];

// ## Planning on demand
//
// Planning is fast enough to do on every keystroke, which lets the segment strip show how the text
// was understood before anything is played.
let current = null;
function replan() {
  const text = $('ipa').value;
  const unknown = unknownCharacters(text);
  $('unknown').textContent = unknown.length ? `Not understood, and skipped: ${[...new Set(unknown)].join(' ')}` : '';
  current = plan(text, { f0: state.f0 });
  const strip = $('segments');
  strip.replaceChildren();
  for (const m of current.marks) {
    const b = document.createElement('button');
    b.textContent = m.symbol;
    b.dataset.index = m.index;
    b.className = m.type;
    b.addEventListener('click', () => sayText(m.symbol));
    strip.append(b);
  }
}

// ## Saying it
async function sayText(text = $('ipa').value) {
  if (playing) playing.cancel();
  const p = text === $('ipa').value ? current : plan(text, { f0: state.f0 });
  try { synth = await synthHolder.get(); } catch (error) { $('status').textContent = `Audio could not start: ${error.message}`; return; }
  playing = playAnimated(synth, p.score, (frame, time) => {
    drawTract($('tract'), shapeOf(frame));
    const m = markAt(p.marks, time);
    for (const b of $('segments').children) b.classList.toggle('playing', Boolean(m) && text === $('ipa').value && Number(b.dataset.index) === m.index);
    if (m) $('readout').textContent = `[${m.symbol}] ${m.type}`;
  });
  await playing.done;
  for (const b of $('segments').children) b.classList.remove('playing');
}

// ## Controls and palette
$('say').addEventListener('click', () => sayText());
$('stop').addEventListener('click', () => { if (playing) playing.cancel(); if (synth) synth.stop(); });
$('download').addEventListener('click', () => downloadWav(current.score, `say-${round(state.f0)}hz.wav`));
$('ipa').addEventListener('input', replan);
$('ipa').addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') sayText(); });
$('pitch').addEventListener('input', (e) => { state.f0 = log(Number(e.target.value), ...PITCH); $('pitchOut').textContent = `${Math.round(state.f0)} Hz`; replan(); });
$('pitch').value = unlog(state.f0, ...PITCH);
$('pitchOut').textContent = `${Math.round(state.f0)} Hz`;

for (const [label, ipa] of EXAMPLES) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', () => { $('ipa').value = ipa; replan(); sayText(); });
  $('examples').append(b);
}
for (const [title, symbols] of [['Vowels', VOWEL_SYMBOLS], ['Consonants', CONSONANT_SYMBOLS], ['Marks', ['ˈ', 'ˌ', 'ː', 'ʰ', '̃', ' ']]]) {
  const h = document.createElement('p');
  h.className = 'note';
  h.textContent = title;
  const row = document.createElement('div');
  row.className = 'vowel-buttons';
  for (const s of symbols) {
    const b = document.createElement('button');
    b.textContent = s === '̃' ? '◌̃' : s === ' ' ? 'space' : s;
    b.addEventListener('click', () => { $('ipa').value += s; replan(); });
    row.append(b);
  }
  $('palette').append(h, row);
}
replan();
drawTract($('tract'), shapeOf(DEFAULT_FRAME));
