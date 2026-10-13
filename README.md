# ipa-pink-trombone

**IPA to mouth lessons.** Type or click IPA symbols and watch a simulated vocal tract make the sound.

This project is **inspired by [Pink Trombone](https://dood.al/pinktrombone/)** by Neil Thapen, the delightful
browser vocal-tract synthesizer. Pink Trombone shows that a one-dimensional waveguide model of the throat is enough to
make convincing vowels and consonants if you move the tongue, lips and velum well. Here we ask the next question:
*where should you move them for a given IPA symbol, in a given language, voice, tempo and accent?*

The synthesis engine in this repo is an independent implementation of the same family of techniques
(a Kelly-Lochbaum waveguide tract plus an LF-style glottal source). It is not a copy of Pink Trombone's code.

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

**All eight experiments are live.** They have been checked numerically and by smoke tests, but a human ear and a
real-browser pass are still the best next contribution; see "Status" in the plan.

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
type, a function from a tongue to its sound and one back again; lesson 2 adds consonants, lesson 3 the planner that joins them, lesson 4 languages, lesson 5 voices, lesson 6 tempo, and so on. The
lessons are in [`fsharp/`](fsharp/) and read like the JavaScript source, for example
`/literate/?src=fsharp/src/01-TongueSpace.fs`. [Fable](https://fable.io) compiles them to JavaScript when the site is deployed (nothing to build to just read
them or to run the JavaScript demos). See [`fsharp/README.md`](fsharp/README.md).

## How work happens

Everything goes through issues and pull requests. No direct commits to `main`. See [`CONTRIBUTING.md`](CONTRIBUTING.md).
