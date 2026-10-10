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
| 4 | Languages | A word to IPA dictionary for the ten most spoken languages |
| 5 | Voices | Male, female, kid, soprano, bass... |
| 6 | Tempo | Faster and slower speech without turning to mush |
| 7 | Rhythm | Stress-timed vs syllable-timed |
| 8 | Accents | Rewrite rules applied to the IPA before it is sounded |

Status and design notes live in [`docs/PLAN.md`](docs/PLAN.md). Progress lives in
[issues](../../issues) and [pull requests](../../pulls).

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

## How work happens

Everything goes through issues and pull requests. No direct commits to `main`. See [`CONTRIBUTING.md`](CONTRIBUTING.md).
