// # Demo 5: Voices
//
// Every earlier demo spoke with one imaginary person. Here the speaker is a parameter. The page is
// the controls for `lib/voices.js`:
//
// - a button per preset, which sets the four numbers below
// - four sliders that bend the preset: tract length, pitch, tenseness and vibrato
// - "every voice" says the same text with each preset in turn, which is the clearest way to hear
//   what changes and what does not
//
// One detail matters: the tract *length* belongs to the speaker, not to the score. The page tells
// the synth the length before each utterance, and the picture draws a tract of that length.
import { VOICES, voiceById, speak, formantScale } from '../../lib/voices.js';
import { DEFAULT_FRAME } from '../../lib/score.js';
import { markAt } from '../../lib/planner.js';
import { shapeOf } from '../../lib/tractshape.js';
import { drawTract } from '../../lib/ui/tractview.js';
import { lazySynth, playAnimated, downloadWav, log, unlog, round } from '../../lib/ui/demo.js';
import { t, tp } from '../../lib/i18n.js';

const $ = (id) => document.getElementById(id);
const synthHolder = lazySynth();
let synth = null;
let playing = null;
let current = null;
const PITCH = [50, 600];

// The voice being edited: a preset plus any slider changes.
let voice = { ...voiceById('man') };

// ## Controls follow the voice
function showControls() {
  $('tract-cm').value = voice.tractCm;
  $('pitch').value = unlog(voice.f0, ...PITCH);
  $('tenseness').value = voice.tenseness;
  $('vibrato').value = voice.vibratoDepth;
  $('tractOut').textContent = t('voices.tract', { cm: voice.tractCm.toFixed(1), scale: formantScale(voice.tractCm).toFixed(2) });
  $('pitchOut').textContent = `${Math.round(voice.f0)} Hz`;
  $('tensenessOut').textContent = t(voice.tenseness < 0.35 ? 'voice.breathy' : voice.tenseness > 0.8 ? 'voice.pressed' : 'voice.modal');
  $('vibratoOut').textContent = voice.vibratoDepth < 0.003 ? t('voice.none') : `${(voice.vibratoDepth * 100).toFixed(1)}%`;
  for (const b of $('voices').children) b.classList.toggle('active', b.dataset.id === voice.id);
  drawTract($('tract'), shapeOf(DEFAULT_FRAME, { tractLength: voice.tractCm }));
}

for (const v of VOICES) {
  const b = document.createElement('button');
  b.textContent = t(`voice.label.${v.id}`);
  b.dataset.id = v.id;
  b.style.fontSize = '1rem';
  b.addEventListener('click', () => { voice = { ...v }; showControls(); say(); });
  $('voices').append(b);
}
const slider = (id, apply) => $(id).addEventListener('input', (e) => { apply(Number(e.target.value)); showControls(); });
slider('tract-cm', (x) => { voice.tractCm = x; });
slider('pitch', (x) => { voice.f0 = log(x, ...PITCH); });
slider('tenseness', (x) => { voice.tenseness = x; });
slider('vibrato', (x) => { voice.vibratoDepth = x; });

// ## Saying it
//
// The synth rebuilds its tract when the length changes, which silences it for a moment, so the
// length is set before playing and never during.
async function sayWith(v, text = $('ipa').value) {
  const utterance = speak(text, v);
  current = utterance;
  try { synth = await synthHolder.get(); } catch (error) { $('status').textContent = t('common.audioError', { message: error.message }); return; }
  synth.setTractLength(utterance.tractLength);
  playing = playAnimated(synth, utterance.score, (frame, time) => {
    drawTract($('tract'), shapeOf(frame, { tractLength: utterance.tractLength }));
    const m = markAt(utterance.marks, time);
    $('readout').textContent = t('voices.readout', { label: v.id ? t(`voice.label.${v.id}`) : t('voices.custom'), cm: utterance.tractLength.toFixed(1), hz: Math.round(v.f0), mark: m ? ` · [${m.symbol}]` : '' });
  });
  await playing.done;
}
async function say() {
  if (playing) playing.cancel();
  await sayWith(voice);
}
async function sayEveryVoice() {
  if (playing) playing.cancel();
  const token = (sayEveryVoice.token = (sayEveryVoice.token || 0) + 1);
  for (const v of VOICES) {
    if (sayEveryVoice.token !== token) return;
    $('status').textContent = t(`voice.label.${v.id}`);
    await sayWith(v);
    await new Promise((r) => setTimeout(r, 250));
  }
  $('status').textContent = '';
}

$('say').addEventListener('click', say);
$('all').addEventListener('click', sayEveryVoice);
$('stop').addEventListener('click', () => { sayEveryVoice.token = (sayEveryVoice.token || 0) + 1; if (playing) playing.cancel(); if (synth) synth.stop(); $('status').textContent = ''; });
$('download').addEventListener('click', () => {
  const u = current || speak($('ipa').value, voice);
  downloadWav(u.score, `voice-${voice.id || 'custom'}.wav`, { tractLength: u.tractLength });
});
$('readout').style.whiteSpace = 'pre-line';
showControls();
