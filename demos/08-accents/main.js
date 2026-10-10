// # Demo 8: Accents
//
// The pipeline of this whole repo, end to end:
//
//     English text → (dictionary, Demo 4) → IPA → (accent rules, this demo) → IPA
//                 → (rhythm, Demo 7) → (planner, Demo 3) → score → (engine) → sound
//
// This page only connects the stages. The new stage is the middle one, `lib/accents.js`, and the
// most important control on the page is the rules box: it is the accent, as plain text. Edit a
// rule and the result changes at once; break a rule and the page tells you which line.
import { ACCENTS, loadAccent, parseAccent, applyAccent } from '../../lib/accents.js';
import { loadDictionary, textToIpa, languageByCode } from '../../lib/languages.js';
import { plan, markAt } from '../../lib/planner.js';
import { rhythmPlan } from '../../lib/rhythm.js';
import { DEFAULT_FRAME } from '../../lib/score.js';
import { shapeOf } from '../../lib/tractshape.js';
import { drawTract } from '../../lib/ui/tractview.js';
import { lazySynth, playAnimated, downloadWav, log, unlog, round } from '../../lib/ui/demo.js';
import { t, tp } from '../../lib/i18n.js';

const $ = (id) => document.getElementById(id);
const synthHolder = lazySynth();
let synth = null;
let playing = null;
let dictionary = null;
let accent = null;
let result = null;
let last = null;
const state = { f0: 130 };
const PITCH = [70, 400];

// ## From text to IPA
//
// Text in slashes is IPA already. Anything else is looked up word by word in the English
// dictionary.
function toIpa(text) {
  const t = text.trim();
  if (t.startsWith('/') && t.endsWith('/') && t.length > 1) return { ipa: t.slice(1, -1), words: [] };
  return textToIpa(t, dictionary, languageByCode('en'));
}

// ## The pipeline, run on every change
//
// The accent is parsed from whatever is in the rules box, so editing it takes effect immediately.
function recompute() {
  accent = parseAccent($('rules').value);
  const { ipa, words } = toIpa($('text').value);
  result = { before: ipa, ...applyAccent(ipa, accent), words };
  $('before').textContent = `/${ipa}/`;
  $('after').textContent = `/${result.ipa}/`;
  $('errors').replaceChildren(...accent.errors.map((e) => Object.assign(document.createElement('li'), { textContent: t('acc.error', { line: e.line, message: e.message }) })));
  $('about').textContent = accent.about || '';
  const body = $('trace').tBodies[0];
  body.replaceChildren();
  for (const t of result.trace.slice(0, 60)) {
    const row = body.insertRow();
    row.insertCell().textContent = t.text;
    row.insertCell().textContent = `${t.before} → ${t.after}`;
  }
  const missing = (words || []).filter((w) => !w.ipa).map((w) => w.word);
  $('missing').textContent = missing.length ? t('acc.missing', { words: missing.join(', ') }) : '';
}

// ## Saying
//
// With "use the accent's rhythm" ticked and an accent that names one, the rhythm model of Demo 7
// times the speech; otherwise the planner's own timing is used.
function build(ipa, withRhythm) {
  const rhythm = withRhythm && $('useRhythm').checked && accent.rhythm ? rhythmPlan(ipa, accent.rhythm) : null;
  return plan(ipa, { f0: state.f0, overrides: rhythm ? rhythm.overrides : {} });
}
async function play(ipa, label, withRhythm) {
  const u = build(ipa, withRhythm);
  last = u;
  try { synth = await synthHolder.get(); } catch (error) { $('status').textContent = t('common.audioError', { message: error.message }); return; }
  playing = playAnimated(synth, u.score, (frame, t) => {
    drawTract($('tract'), shapeOf(frame));
    const m = markAt(u.marks, t);
    $('readout').textContent = `${label}${m ? ` · [${m.symbol}]` : ''}`;
  });
  await playing.done;
}
async function sayAccent() { if (playing) playing.cancel(); recompute(); await play(result.ipa, accent.name || t('acc.accent'), true); }
async function sayOriginal() { if (playing) playing.cancel(); recompute(); await play(result.before, t('acc.asWritten'), false); }
async function both() {
  if (playing) playing.cancel();
  const token = (both.token = (both.token || 0) + 1);
  recompute();
  for (const [ipa, label, rh] of [[result.before, t('acc.asWritten'), false], [result.ipa, accent.name || t('acc.accent'), true]]) {
    if (both.token !== token) return;
    $('status').textContent = label;
    await play(ipa, label, rh);
    await new Promise((r) => setTimeout(r, 400));
  }
  $('status').textContent = '';
}

// ## Choosing an accent
async function choose(id) {
  const parsed = await loadAccent(id).catch((error) => { $('status').textContent = error.message; return null; });
  if (!parsed) return;
  $('rules').value = parsed.source;
  recompute();
}

// ## Wiring
for (const a of ACCENTS) {
  const o = document.createElement('option');
  o.value = a.id;
  o.textContent = t(`acc.${a.id}`);
  $('accent').append(o);
}
$('accent').addEventListener('change', (e) => choose(e.target.value));
$('rules').addEventListener('input', recompute);
$('text').addEventListener('input', recompute);
$('sayAccent').addEventListener('click', sayAccent);
$('sayOriginal').addEventListener('click', sayOriginal);
$('both').addEventListener('click', both);
$('stop').addEventListener('click', () => { both.token = (both.token || 0) + 1; if (playing) playing.cancel(); if (synth) synth.stop(); $('status').textContent = ''; });
$('download').addEventListener('click', () => last && downloadWav(last.score, `accent-${round(state.f0)}hz.wav`));
$('pitch').addEventListener('input', (e) => { state.f0 = log(Number(e.target.value), ...PITCH); $('pitchOut').textContent = `${Math.round(state.f0)} Hz`; });
$('pitch').value = unlog(state.f0, ...PITCH);
$('pitchOut').textContent = `${Math.round(state.f0)} Hz`;
$('readout').style.whiteSpace = 'pre-line';
$('text').value = 'the weather is very good in the little city';
drawTract($('tract'), shapeOf(DEFAULT_FRAME));
loadDictionary('en').then((d) => { dictionary = d; $('accent').value = 'spanish'; return choose('spanish'); })
  .catch((error) => { $('status').textContent = error.message; });
