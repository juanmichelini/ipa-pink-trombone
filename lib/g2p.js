// # Spelling to sound, by rules
//
// A dictionary only knows the words someone wrote down. Some writing systems are regular enough
// that rules can guess the rest, and **Spanish** and **Indonesian** are two of them. This file holds
// those rules. English, French and Portuguese spelling is too irregular for a short rule set to be
// honest, so those languages rely on their dictionaries alone, and the demo says so when a word is
// missing.
//
// Both converters work the same way, in three steps:
//
// 1. spell the word as a list of **units**, each a sound with a flag for vowel or consonant
// 2. cut the list into syllables, using the usual rule that a single consonant between vowels
//    starts the next syllable, and that two consonants split unless they form a cluster that can
//    start a word (`pr`, `bl`, ...)
// 3. put the stress mark before the stressed syllable

// ## Shared: syllables and stress
export function syllabify(units, clusters) {
  const syllables = [];
  let current = [];
  const isV = (u) => u.vowel;
  let i = 0;
  while (i < units.length) {
    // Take the onset consonants, then the vowels (nucleus), then decide where the coda ends.
    current.push(units[i]);
    if (isV(units[i])) {
      let j = i + 1;
      while (j < units.length && isV(units[j]) && units[j].joins) { current.push(units[j]); j++; }
      // Count the consonants up to the next vowel.
      let k = j;
      while (k < units.length && !isV(units[k])) k++;
      const between = units.slice(j, k);
      if (k === units.length) {
        current.push(...between);          // word-final consonants stay with this syllable
        syllables.push(current); current = []; i = k; break;
      }
      let keep = 0;
      if (between.length >= 2) {
        // Keep the last one or two consonants for the next syllable's onset if they form a cluster.
        const lastTwo = between.slice(-2).map((u) => u.sound).join('');
        keep = clusters.has(lastTwo) ? between.length - 2 : between.length - 1;
      }
      current.push(...between.slice(0, keep));
      syllables.push(current); current = [];
      i = j + keep;
    } else {
      i++;
    }
  }
  if (current.length) {
    if (syllables.length) syllables[syllables.length - 1].push(...current); else syllables.push(current);
  }
  return syllables;
}

// Writes syllables out as IPA, with the stress mark in front of syllable `stressed`, if there is
// more than one syllable. A one-syllable word carries no mark.
export function render(syllables, stressed) {
  return syllables.map((s, n) => (syllables.length > 1 && n === stressed ? 'ˈ' : '') + s.map((u) => u.sound).join('')).join('');
}

const unit = (sound, vowel = false, extra = {}) => ({ sound, vowel, ...extra });

// ## Spanish
//
// Latin American Spanish: `c` before `e`, `i` and `z` are `s` (seseo) and `ll` is `ʝ`. The stop
// consonants `b d g` turn into approximants `β ð ɣ` between vowels, because the tongue does not
// quite close. Stress is on the next-to-last syllable unless the word ends in a consonant other
// than `n` or `s`, or has an accent mark that says otherwise.
const ES_CLUSTERS = new Set(['pɾ', 'pl', 'bɾ', 'bl', 'tɾ', 'dɾ', 'kɾ', 'kl', 'ɡɾ', 'ɡl', 'fɾ', 'fl', 'βɾ', 'ðɾ', 'ɣɾ', 'ɣl', 'βl', 'kw', 'ɡw']);
const ES_ACCENTED = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u' };
const ES_VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

export function spanishToIpa(word) {
  const w = word.toLowerCase().normalize('NFC');
  const out = [];
  let stressMarked = null;
  for (let i = 0; i < w.length; i++) {
    const c = w[i], n = w[i + 1], p = out.length ? out[out.length - 1] : null;
    const next2 = w.slice(i, i + 2);
    const frontNext = n === 'e' || n === 'i' || n === 'é' || n === 'í';
    if (ES_ACCENTED[c]) { stressMarked = out.filter((u) => u.vowel && !u.glide).length; out.push(unit(ES_ACCENTED[c], true, { strong: ES_ACCENTED[c] !== 'i' && ES_ACCENTED[c] !== 'u' })); continue; }
    if (ES_VOWELS.has(c)) { out.push(unit(c, true, { strong: c === 'a' || c === 'e' || c === 'o' })); continue; }
    if (next2 === 'ch') { out.push(unit('t͡ʃ')); i++; continue; }
    if (next2 === 'll') { out.push(unit('ʝ')); i++; continue; }
    if (next2 === 'rr') { out.push(unit('r')); i++; continue; }
    if (c === 'q' && n === 'u') { out.push(unit('k')); i++; continue; }
    if (c === 'g' && n === 'u' && (w[i + 2] === 'e' || w[i + 2] === 'i' || w[i + 2] === 'é' || w[i + 2] === 'í')) { out.push(unit('ɡ')); i++; continue; }
    if (c === 'g' && n === 'ü') { out.push(unit('ɡ'), unit('w')); i++; continue; }
    if (c === 'c') { out.push(unit(frontNext ? 's' : 'k')); continue; }
    if (c === 'z' || c === 's') { out.push(unit('s')); continue; }
    if (c === 'g') { out.push(unit(frontNext ? 'x' : 'ɡ', false, { lenite: !frontNext })); continue; }
    if (c === 'j') { out.push(unit('x')); continue; }
    if (c === 'h') continue;
    if (c === 'ñ') { out.push(unit('ɲ')); continue; }
    if (c === 'v' || c === 'b') { out.push(unit('b', false, { lenite: true })); continue; }
    if (c === 'd') { out.push(unit('d', false, { lenite: true })); continue; }
    if (c === 'r') { const start = !p || ['n', 'l', 's'].includes(w[i - 1]); out.push(unit(start ? 'r' : 'ɾ')); continue; }
    if (c === 'y') { out.push(n === undefined || !ES_VOWELS.has(n) ? unit('i', true, { strong: false }) : unit('ʝ')); continue; }
    if (c === 'x') { out.push(unit('k'), unit('s')); continue; }
    if (c === 'k' || c === 'm' || c === 'n' || c === 'p' || c === 't' || c === 'l' || c === 'f' || c === 'w') { out.push(unit(c)); continue; }
    // anything else is passed through untouched so the caller can see it
    out.push(unit(c));
  }
  // Weak vowels next to another vowel are glides: `bwenos`, `djes`. Stressed weak vowels (í, ú)
  // are not, which is exactly what the accent mark is for.
  for (let i = 0; i < out.length; i++) {
    const u = out[i];
    if (!u.vowel || u.strong || u.accented) continue;
    const prev = out[i - 1], next = out[i + 1];
    const accentedHere = stressMarked !== null && i === indexOfNthVowel(out, stressMarked);
    if (accentedHere) continue;
    if ((prev && prev.vowel) || (next && next.vowel)) {
      u.sound = u.sound === 'i' ? 'j' : 'w';
      u.glide = true;
      u.vowel = false;
      // A glide is not a syllable nucleus, so the vowel it joins carries the syllable.
    }
  }
  // Lenition: stops become approximants after a vowel (or a glide) and before a vowel.
  for (let i = 1; i < out.length; i++) {
    const u = out[i];
    if (!u.lenite) continue;
    const before = out[i - 1];
    const intervocalic = before.vowel || before.glide;
    u.sound = intervocalic ? { b: 'β', d: 'ð', 'ɡ': 'ɣ' }[u.sound] : u.sound;
  }
  // `n` before a velar is itself velar: `cinco` is `siŋko`.
  for (let i = 0; i + 1 < out.length; i++) if (out[i].sound === 'n' && ['k', 'ɡ', 'x'].includes(out[i + 1].sound)) out[i].sound = 'ŋ';
  const syllables = syllabify(out, ES_CLUSTERS);
  // Penultimate stress, unless the word ends in a consonant other than n or s.
  const last = w[w.length - 1];
  const endsVowelNS = ES_VOWELS.has(last) || ES_ACCENTED[last] !== undefined || last === 'n' || last === 's';
  let stressed = syllables.length - (endsVowelNS ? 2 : 1);
  if (stressMarked !== null) {
    stressed = syllables.findIndex((s) => s.some((u) => u === out[indexOfNthVowel(out, stressMarked)]));
  }
  return render(syllables, Math.max(0, stressed));
}

// The index in `units` of the `n`th unit that was a vowel when spelled out. (Glides are renamed
// afterwards, so the original count is kept in the `glide` flag.)
function indexOfNthVowel(units, n) {
  let seen = -1;
  for (let i = 0; i < units.length; i++) {
    if (units[i].vowel || units[i].glide) {
      seen++;
      if (seen === n) return i;
    }
  }
  return -1;
}

// ## Indonesian
//
// Spelling is nearly phonemic. `c` is `t͡ʃ`, `j` is `d͡ʒ`, `y` is `j`, `ny` is `ɲ`, `ng` is `ŋ`,
// `sy` is `ʃ`, `kh` is `x`, and the plain `e` is the schwa `ə`. A final `k` is a glottal stop.
// Stress falls on the next-to-last syllable unless that syllable's vowel is a schwa.
const ID_CLUSTERS = new Set(['pr', 'pl', 'br', 'bl', 'tr', 'dr', 'kr', 'kl', 'ɡr', 'ɡl', 'fr', 'fl', 'st', 'sk', 'sp']);
const ID_VOWELS = new Set(['a', 'i', 'u', 'e', 'o', 'é']);

export function indonesianToIpa(word) {
  const w = word.toLowerCase().normalize('NFC');
  const out = [];
  for (let i = 0; i < w.length; i++) {
    const c = w[i], n = w[i + 1];
    const two = w.slice(i, i + 2);
    if (ID_VOWELS.has(c)) {
      const sound = c === 'e' ? 'ə' : c === 'é' ? 'e' : c;
      // `ai` and `au` are diphthongs: the second vowel joins the first syllable.
      out.push(unit(sound, true, { joins: false }));
      continue;
    }
    if (two === 'ny') { out.push(unit('ɲ')); i++; continue; }
    if (two === 'ng') { out.push(unit('ŋ')); i++; continue; }
    if (two === 'sy') { out.push(unit('ʃ')); i++; continue; }
    if (two === 'kh') { out.push(unit('x')); i++; continue; }
    if (c === 'c') { out.push(unit('t͡ʃ')); continue; }
    if (c === 'j') { out.push(unit('d͡ʒ')); continue; }
    if (c === 'y') { out.push(unit('j')); continue; }
    if (c === 'k' && i === w.length - 1) { out.push(unit('ʔ')); continue; }
    if (c === 'g') { out.push(unit('ɡ')); continue; }
    out.push(unit(c));
  }
  // Diphthongs ai / au (and oi): glue the second vowel to the first.
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1], b = out[i];
    if (a.vowel && b.vowel && ((a.sound === 'a' && (b.sound === 'i' || b.sound === 'u')) || (a.sound === 'o' && b.sound === 'i'))) b.joins = true;
  }
  // A "joins" vowel is the tail of a diphthong; mark the head so syllabify keeps them together.
  for (let i = 0; i + 1 < out.length; i++) if (out[i + 1].joins) out[i].joins = true;
  const fixed = out.map((u, i) => (u.vowel && i > 0 && out[i - 1].vowel && out[i - 1].joins && u.joins ? u : u));
  const syllables = syllabify(fixed, ID_CLUSTERS);
  let stressed = syllables.length - 2;
  if (stressed >= 0) {
    const vowel = syllables[stressed].find((u) => u.vowel);
    if (vowel && vowel.sound === 'ə' && syllables.length >= 2) stressed = syllables.length - 1;
  }
  return render(syllables, Math.max(0, stressed));
}
