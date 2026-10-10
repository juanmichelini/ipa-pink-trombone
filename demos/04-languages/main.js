// # Demo 4: Languages
//
// The new idea here is not acoustic, it is **lookup**: turn the words a person types into IPA,
// and let Demo 3's planner do the rest. The page has four jobs:
//
// - load the dictionary of the chosen language (a text file, fetched once and remembered)
// - convert the text with `textToIpa`, and show each word beside its IPA and where it came from
// - say the result, with the tract following
// - list the dictionary, so there is always something to click on
//
// Every language goes through the same engine. A French word and a Russian word differ only in
// the IPA that the dictionary gives.
import { LANGUAGES, languageByCode, loadDictionary, textToIpa } from '../../lib/languages.js';
import { plan, markAt } from '../../lib/planner.js';
import { DEFAULT_FRAME } from '../../lib/score.js';
import { shapeOf } from '../../lib/tractshape.js';
import { drawTract } from '../../lib/ui/tractview.js';
import { lazySynth, playAnimated, downloadWav, log, unlog, round } from '../../lib/ui/demo.js';

const $ = (id) => document.getElementById(id);
const synthHolder = lazySynth();
const dictionaries = new Map();
let synth = null;
let playing = null;
let current = null;
const state = { code: 'en', f0: 130 };
const PITCH = [70, 400];

// ## Dictionaries
async function dictionary(code) {
  if (!dictionaries.has(code)) dictionaries.set(code, await loadDictionary(code));
  return dictionaries.get(code);
}

// ## Converting what was typed
//
// Done on every change, and cheap. Each row shows the word, its IPA, and `dictionary`, `rules` or
// `unknown`, so it is clear which words are looked up and which are guessed.
async function convert() {
  const language = languageByCode(state.code);
  let entries;
  try { entries = await dictionary(state.code); } catch (error) { $('status').textContent = error.message; return; }
  const result = textToIpa($('text').value, entries, language);
  const body = $('words').tBodies[0];
  body.replaceChildren();
  for (const w of result.words) {
    const row = body.insertRow();
    row.insertCell().textContent = w.word;
    const ipa = row.insertCell();
    ipa.textContent = w.ipa ? `/${w.ipa}/` : '—';
    ipa.style.fontFamily = 'var(--ipa)';
    row.insertCell().textContent = w.source;
  }
  const missing = result.words.filter((w) => !w.ipa).map((w) => w.word);
  $('missing').textContent = missing.length ? `Not in the ${language.name} dictionary, skipped: ${missing.join(', ')}` : '';
  current = plan(result.ipa, { f0: state.f0 });
  current.text = result.ipa;
}

// ## Choosing a language
async function useLanguage(code) {
  state.code = code;
  const language = languageByCode(code);
  $('text').value = language.sample;
  $('text').lang = code;
  const entries = await dictionary(code).catch(() => new Map());
  const list = $('dictionary');
  list.replaceChildren();
  for (const [word] of entries) {
    const b = document.createElement('button');
    b.textContent = word;
    b.style.fontSize = '.95rem';
    b.addEventListener('click', () => { $('text').value = word; convert().then(say); });
    list.append(b);
  }
  await convert();
}

// ## Saying it
async function say() {
  if (!current || !current.text) return;
  if (playing) playing.cancel();
  const p = current;
  try { synth = await synthHolder.get(); } catch (error) { $('status').textContent = `Audio could not start: ${error.message}`; return; }
  playing = playAnimated(synth, p.score, (frame, time) => {
    drawTract($('tract'), shapeOf(frame));
    const m = markAt(p.marks, time);
    if (m) $('readout').textContent = `/${p.text}/\nnow: [${m.symbol}]`;
  });
  await playing.done;
}
$('readout').style.whiteSpace = 'pre-line';

// ## Controls
for (const l of LANGUAGES) {
  const o = document.createElement('option');
  o.value = l.code;
  o.textContent = `${l.name} · ${l.native}`;
  $('language').append(o);
}
$('language').addEventListener('change', (e) => useLanguage(e.target.value));
$('text').addEventListener('input', convert);
$('say').addEventListener('click', say);
$('stop').addEventListener('click', () => { if (playing) playing.cancel(); if (synth) synth.stop(); });
$('download').addEventListener('click', () => current && downloadWav(current.score, `${state.code}-${round(state.f0)}hz.wav`));
$('pitch').addEventListener('input', (e) => { state.f0 = log(Number(e.target.value), ...PITCH); $('pitchOut').textContent = `${Math.round(state.f0)} Hz`; convert(); });
$('pitch').value = unlog(state.f0, ...PITCH);
$('pitchOut').textContent = `${Math.round(state.f0)} Hz`;
drawTract($('tract'), shapeOf(DEFAULT_FRAME));
useLanguage('en');
