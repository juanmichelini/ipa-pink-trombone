// # The experiments
//
// One list, read by the landing page, the lesson navigation and by tests. Adding an experiment means adding a row here,
// a folder under `demos/`, and an issue. `status` is `planned` until the demo is merged, then
// `live`; the landing page only links live demos.
export const demos = [
  { n: '1.1', parent: 1, slug: '01.1-front-to-back', title: 'Front to back', status: 'live',
    blurb: 'The tongue held high with the lips spread: slide it from front to back (i ɨ ɯ).' },
  { n: '1.2', parent: 1, slug: '01.2-rounded-front-to-back', title: 'Rounded lips', status: 'live',
    blurb: 'The same height with the lips rounded (y ʉ u): only the lips change.' },
  { n: '1.3', parent: 1, slug: '01.3-spread-vowels', title: 'Spread vowels', status: 'live',
    blurb: 'Every vowel with spread lips: move the tongue forward and back, up and down.' },
  { n: '1.4', parent: 1, slug: '01.4-rounded-vowels', title: 'Rounded vowels', status: 'live',
    blurb: 'Every vowel with rounded lips: move the tongue forward and back, up and down.' },
  { n: 1, slug: '01-vowels', title: 'Vowels', issue: 3, status: 'live',
    blurb: 'An IPA vowel chart drives the tongue and lips of the tract.' },
  { n: '2.1', parent: 2, slug: '02.1-voiceless-fricatives', title: 'Voiceless fricatives', status: 'live',
    blurb: 'A hiss with the voice off. Slide the narrowing from the lips to the throat.' },
  { n: '2.2', parent: 2, slug: '02.2-voiced-fricatives', title: 'Voiced fricatives', status: 'live',
    blurb: 'The same hiss with the voice on.' },
  { n: '2.3', parent: 2, slug: '02.3-voiceless-stops', title: 'Voiceless stops', status: 'live',
    blurb: 'A closure and a burst, voice off. Choose where it is made.' },
  { n: '2.4', parent: 2, slug: '02.4-voiced-stops', title: 'Voiced stops', status: 'live',
    blurb: 'The same closure and burst with the voice on.' },
  { n: '2.5', parent: 2, slug: '02.5-nasals', title: 'Nasals', status: 'live',
    blurb: 'The mouth closed at any place, the air going out through the nose.' },
  { n: '2.6', parent: 2, slug: '02.6-approximants', title: 'Approximants', status: 'live',
    blurb: 'A narrowing too wide to hiss: it only colours the voice.' },
  { n: '2.7', parent: 2, slug: '02.7-laterals', title: 'Laterals', status: 'live',
    blurb: 'The air goes round the sides of the tongue.' },
  { n: '2.8', parent: 2, slug: '02.8-trills-and-taps', title: 'Trills and taps', status: 'live',
    blurb: 'A flutter, or a single flick, of the lips or the tongue.' },
  { n: '2.9', parent: 2, slug: '02.9-affricates', title: 'Affricates', status: 'live',
    blurb: 'A stop released into a fricative.' },
  { n: 2, slug: '02-consonants', title: 'Consonants', issue: 4, status: 'live',
    blurb: 'The IPA pulmonic table drives constrictions, velum and noise.' },
  { n: 3, slug: '03-together', title: 'Together', issue: 5, status: 'live',
    blurb: 'Type IPA strings. Vowels and consonants, with coarticulation.' },
  { n: 4, slug: '04-languages', title: 'Languages', issue: 6, status: 'live',
    blurb: 'A word to IPA dictionary for the ten most spoken languages.' },
  { n: 5, slug: '05-voices', title: 'Voices', issue: 7, status: 'live',
    blurb: 'Male, female, kid, soprano, bass: same IPA, different speaker.' },
  { n: 6, slug: '06-tempo', title: 'Tempo', issue: 8, status: 'live',
    blurb: 'Faster and slower speech that does not turn to mush.' },
  { n: 7, slug: '07-rhythm', title: 'Rhythm', issue: 9, status: 'live',
    blurb: 'Stress-timed versus syllable-timed speech.' },
  { n: 8, slug: '08-accents', title: 'Accents', issue: 10, status: 'live',
    blurb: 'Rewrite rules applied to the IPA before it is sounded.' },
];

// The lessons that have a card of their own on the landing page, and the steps that lead up to one.
//
// A lesson with a `parent` is a *step*: Demo 1 and Demo 2 are taken one dimension at a time first, as
// 1.1 to 1.4 and 2.1 to 2.9, and then all at once. The ladder (the order of `demos`, which the lesson
// navigation walks) goes through the steps before the lesson they lead to.
export const lessons = demos.filter((d) => d.parent === undefined);
export const stepsOf = (n) => demos.filter((d) => d.parent === n);
