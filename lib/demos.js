// # The experiments
//
// One list, read by the landing page and by tests. Adding an experiment means adding a row here,
// a folder under `demos/`, and an issue. `status` is `planned` until the demo is merged, then
// `live`; the landing page only links live demos.
export const demos = [
  { n: 1, slug: '01-vowels', title: 'Vowels', issue: 3, status: 'live',
    blurb: 'An IPA vowel chart drives the tongue and lips of the tract.' },
  { n: 2, slug: '02-consonants', title: 'Consonants', issue: 4, status: 'live',
    blurb: 'The IPA pulmonic table drives constrictions, velum and noise.' },
  { n: 3, slug: '03-together', title: 'Together', issue: 5, status: 'planned',
    blurb: 'Type IPA strings. Vowels and consonants, with coarticulation.' },
  { n: 4, slug: '04-languages', title: 'Languages', issue: 6, status: 'planned',
    blurb: 'A word to IPA dictionary for the ten most spoken languages.' },
  { n: 5, slug: '05-voices', title: 'Voices', issue: 7, status: 'planned',
    blurb: 'Male, female, kid, soprano, bass: same IPA, different speaker.' },
  { n: 6, slug: '06-tempo', title: 'Tempo', issue: 8, status: 'planned',
    blurb: 'Faster and slower speech that does not turn to mush.' },
  { n: 7, slug: '07-rhythm', title: 'Rhythm', issue: 9, status: 'planned',
    blurb: 'Stress-timed versus syllable-timed speech.' },
  { n: 8, slug: '08-accents', title: 'Accents', issue: 10, status: 'planned',
    blurb: 'Rewrite rules applied to the IPA before it is sounded.' },
];
