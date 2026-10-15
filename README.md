# 🗣️ Speaking Head

**A talking head you can type to.** Type or click IPA symbols, or a word in one of ten languages, and watch a
simulated vocal tract (tongue, jaw, lips, soft palate) make the sound, in a chosen voice, tempo and accent.

The question it asks is *where should you move the mouth for a given IPA symbol, in a given language, voice, tempo
and accent?* Vowels are points on the vowel chart, consonants are points in a place-and-degree space, an IPA planner
joins them, a dictionary turns words of ten languages into IPA, and voices, rhythm and accents shape the result. The
sound is checked against real recordings (see below), and a pure F# core mirrors the JavaScript.

## The experiments

The repo is a ladder of small, dynamic experiments. Every demo lives in the repo at the same time and they all
share one library in [`lib/`](lib/).

| # | Experiment | Idea |
|---|------------|------|
| 1 | Vowels | An IPA vowel chart drives the tongue and lips |
| 2 | Consonants | The IPA pulmonic table drives constrictions, velum and noise |
| 3 | Together | IPA strings of vowels and consonants |
| 4 | Languages | A word to IPA dictionary for ten of the most spoken languages (English, Spanish, Mandarin, Hindi, Arabic, French, Bengali, Portuguese, Russian, Indonesian) |
| 5 | Voices | Male, female, kid, soprano, bass... |
| 6 | Tempo | Faster and slower speech without turning to mush |
| 7 | Rhythm | Stress-timed vs syllable-timed |
| 8 | Accents | Rewrite rules applied to the IPA before it is sounded |

Lessons 1 and 2 are the two with the most to take in, so each is first taken **one dimension at a time**, in steps
that lead up to it:

- **1.1 to 1.4, vowels:** first the tongue sliding front to back at one height with the lips spread (`i ɨ ɯ`), then the
  same with the lips rounded (`y ʉ u`), then all the spread vowels with the height free as well, then all the rounded
  ones; then lesson 1 is the full chart.
- **2.1 to 2.9, consonants:** one manner and one voicing at a time (voiceless fricatives, voiced fricatives,
  voiceless stops, voiced stops, nasals, approximants, laterals, trills and taps, affricates), with only the **place**
  free: a line from the lips to the throat that you press and slide along, hearing every place between the named ones;
  then lesson 2 is the full table.

**All eight experiments are live.** They have been checked numerically and by smoke tests, but a human ear and a
real-browser pass are still the best next contribution; see "Status" in the plan.

## Checked against real speech

The consonants are calibrated against the [Wikipedia IPA chart with audio](https://en.wikipedia.org/wiki/IPA_consonant_chart_with_audio),
one Wikimedia Commons recording per sound. They are downloaded for local analysis only (never committed, licences
recorded), and each consonant is rendered as the same "a C a C a" and compared with its recording: duration, level
against the vowel, voice and hiss, spectral centroid, and spectrograms side by side.

```sh
node scripts/fetch-reference.mjs            # downloads the recordings into ref/ (needs ffmpeg)
node scripts/compare-consonants.mjs --png   # table, plus spectrograms and contact sheets in out/compare/
```

In the consonants demo, choosing a vowel in "between vowels" plays exactly that "a C a C a", so what you hear can be
held up against the wiki clip. Details are in [`CONTRIBUTING.md`](CONTRIBUTING.md).

Status and design notes live in [`docs/PLAN.md`](docs/PLAN.md). Progress lives in
[issues](../../issues) and [pull requests](../../pulls).

## Languages

The interface is translated into the ten languages of Demo 4 (English, Spanish, Mandarin, Hindi, Arabic, French, Bengali, Portuguese, Russian, Indonesian). The language is detected from the browser, can be forced with `?lang=es`, and can be changed from the menu at the bottom of every page (the choice is remembered). Arabic is laid out right to left.

The translations were written by Claude and have not been reviewed by native speakers: corrections are very welcome as pull requests. The source code, the rule files of Demo 8 and the accent names in the code stay in English.

## Running it

There is no build step and there are no dependencies.

```sh
npm test            # node --test, plain Node 20+
python3 -m http.server 8000   # then open http://localhost:8000
```

Deploying: import the repo in [Vercel](https://vercel.com/new), framework preset **Other**, no build command, output
directory `.` (already set in [`vercel.json`](vercel.json)).

## Literate programming

The source is written to be read. Top-level `//` comment lines are prose (lightweight Markdown), and the code follows
them. A tiny in-browser viewer weaves any source file into a document, so each demo page links to its own source,
for example `/literate/?src=lib/literate.js`. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## The F# core

The ideas are also being rebuilt as a small **pure F# core**, one lesson at a time: lesson 1 is a `Tongue`
type, a function from a tongue to its sound and one back again; lesson 2 adds consonants, lesson 3 the planner that joins them, lesson 4 languages, lesson 5 voices, lesson 6 tempo, lesson 7 rhythm, lesson 8 accents, and lesson 9 the engine that turns a score into sound. The
lessons are in [`fsharp/`](fsharp/) and read like the JavaScript source, for example
`/literate/?src=fsharp/src/01-TongueSpace.fs`. [Fable](https://fable.io) compiles them to JavaScript when the site is deployed (nothing to build to just read
them or to run the JavaScript demos). See [`fsharp/README.md`](fsharp/README.md).

## See also

- [**Pink Trombone**](https://dood.al/pinktrombone/) by Neil Thapen, the browser vocal-tract synthesizer this project
  started from (it was called `ipa-pink-trombone`). It shows that a one-dimensional waveguide model of the throat is
  enough for convincing vowels. The engine here is an independent implementation of the same family of techniques
  (a Kelly-Lochbaum waveguide tract plus an LF-style glottal source), not a copy of its code, and has since gone its
  own way: a voice rolled off like a real one, damped tract walls, a fricative filter, all tuned against recordings.

## How work happens

Everything goes through issues and pull requests. No direct commits to `main`. See [`CONTRIBUTING.md`](CONTRIBUTING.md).
