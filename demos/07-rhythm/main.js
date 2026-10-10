// # Demo 7: Rhythm
//
// The input is IPA with stress marks. The page chooses a clock for it (`lib/rhythm.js`) and then
// shows the syllables as boxes whose widths are their real durations, so the difference between
// the two rhythms is something to look at as well as hear.
//
// Three modes:
//
// - **stress-timed**: stressed syllables are beats, unstressed ones squeeze between them and
//   reduce toward `ə`
// - **syllable-timed**: every syllable gets the same time
// - **no rhythm model**: the planner's own timing from Demo 3, for comparison
//
// "Same beats, more syllables" is the classic demonstration: `cats chase mice`, then the same
// three beats with extra syllables between them. In stress-timed mode the long sentence takes only
// a little longer. Switch to syllable-timed and it takes much longer.
import { plan, markAt } from '../../lib/planner.js';
import { rhythmPlan, nPVI, syllableDurations, describe } from '../../lib/rhythm.js';
import { DEFAULT_FRAME } from '../../lib/score.js';
import { shapeOf } from '../../lib/tractshape.js';
import { drawTract } from '../../lib/ui/tractview.js';
import { lazySynth, playAnimated, downloadWav } from '../../lib/ui/demo.js';

const $ = (id) => document.getElementById(id);
const synthHolder = lazySynth();
let synth = null;
let playing = null;
let current = null;

const EXAMPLES = [
  ['The cats are chasing the mice', 'ðə ˈkæts ɑː ˈtʃeɪsɪŋ ðə ˈmaɪs'],
  ['Cats chase mice', 'ˈkæts ˈtʃeɪs ˈmaɪs'],
  ['Spanish: el gato come pescado', 'el ˈɡato ˈkome pesˈkado'],
  ['French: je suis dans la maison', 'ʒə sɥi dɑ̃ la mɛˈzɔ̃'],
  ['English: a beautiful afternoon', 'ə ˈbjuːtɪfəl ˌɑːftəˈnuːn'],
  ['Italian-ish: la bella vita', 'la ˈbɛlla ˈvita'],
];
const BEATS_SHORT = 'ˈkæts ˈtʃeɪs ˈmaɪs';
const BEATS_LONG = 'ˈkæts ɑː ˈtʃeɪsɪŋ ðə ˈmaɪs';

// ## Building the utterance
//
// `rhythmPlan` returns durations for each vowel (and squeezes for consonants); the planner takes
// them as `overrides`. With no rhythm model there are no overrides, so the planner times it.
function build(ipa = $('ipa').value, mode = selectedMode()) {
  const r = mode === 'none' ? { syllables: rhythmPlan(ipa, 'syllable').syllables, overrides: {} } : rhythmPlan(ipa, mode);
  const p = plan(ipa, { overrides: r.overrides });
  return { ...p, syllables: r.syllables, ipa };
}
const selectedMode = () => document.querySelector('input[name=mode]:checked').value;

// ## Showing syllables
//
// One box per syllable, as wide as it lasts, with the IPA of the syllable written in it.
function showLanes(u) {
  const lanes = $('lanes');
  lanes.replaceChildren();
  const ds = syllableDurations(u.syllables, u.marks);
  const labels = describe(u.ipa).split(/[ .]/);
  u.syllables.forEach((s, n) => {
    const el = document.createElement('div');
    el.style.flex = `${ds[n]} 0 0`;
    el.style.background = s.stressed ? 'var(--accent-strong)' : 'var(--line)';
    el.style.color = s.stressed ? '#fff' : 'inherit';
    el.style.borderRight = '1px solid var(--bg, #fff)';
    el.style.font = '15px var(--ipa)';
    el.style.display = 'grid';
    el.style.placeItems = 'center';
    el.style.overflow = 'hidden';
    el.textContent = labels[n] || '';
    el.title = `${Math.round(ds[n] * 1000)} ms`;
    lanes.append(el);
  });
  const pvi = nPVI(ds);
  $('stats').textContent = `${u.syllables.length} syllables in ${u.duration.toFixed(2)} s · unevenness (nPVI) ${pvi.toFixed(0)}` +
    ` (about 20 reads as syllable-timed, 55 or more as stress-timed)`;
}

// ## Playing
async function play(u, label = '') {
  try { synth = await synthHolder.get(); } catch (error) { $('status').textContent = `Audio could not start: ${error.message}`; return; }
  showLanes(u);
  playing = playAnimated(synth, u.score, (frame, t) => {
    drawTract($('tract'), shapeOf(frame));
    const m = markAt(u.marks, t);
    $('readout').textContent = `${label}${m ? `[${m.symbol}]` : ''}`;
  });
  await playing.done;
}
async function say() {
  if (playing) playing.cancel();
  current = build();
  await play(current);
}

// ## The comparison
//
// Short and long sentence with the same three stressed words, in both rhythms. The status line
// reports how long each one took, which is the whole point: compare the ratios.
async function compare() {
  if (playing) playing.cancel();
  const token = (compare.token = (compare.token || 0) + 1);
  const lines = [];
  for (const mode of ['stress', 'syllable']) {
    for (const ipa of [BEATS_SHORT, BEATS_LONG]) {
      if (compare.token !== token) return;
      const u = build(ipa, mode);
      $('status').textContent = `${mode}-timed · ${ipa} · ${u.duration.toFixed(2)} s`;
      lines.push(`${mode}: ${u.duration.toFixed(2)} s`);
      await play(u, `${mode} · `);
      await new Promise((r) => setTimeout(r, 350));
    }
  }
  $('status').textContent = lines.join('   ');
}

// ## Wiring
for (const [label, ipa] of EXAMPLES) {
  const o = document.createElement('option');
  o.textContent = label;
  o.value = ipa;
  $('example').append(o);
}
function refresh() { current = build(); showLanes(current); }
$('example').addEventListener('change', (e) => { $('ipa').value = e.target.value; refresh(); });
$('ipa').addEventListener('input', refresh);
for (const r of document.querySelectorAll('input[name=mode]')) r.addEventListener('change', refresh);
$('say').addEventListener('click', say);
$('compare').addEventListener('click', compare);
$('stop').addEventListener('click', () => { compare.token = (compare.token || 0) + 1; if (playing) playing.cancel(); if (synth) synth.stop(); });
$('download').addEventListener('click', () => downloadWav((current || build()).score, `rhythm-${selectedMode()}.wav`));
$('readout').style.whiteSpace = 'pre-line';
$('ipa').value = EXAMPLES[0][1];
drawTract($('tract'), shapeOf(DEFAULT_FRAME));
refresh();
