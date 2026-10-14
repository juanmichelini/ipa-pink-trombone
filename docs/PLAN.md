# Plan

Goal: a speaking head. A series of incremental, dynamic experiments that map IPA to a simulated vocal tract (its engine
began as a Pink-Trombone-style waveguide), growing from a single vowel chart to accents, and checked against real
recordings. All experiments coexist in one repo and share one library.

## Principles

- **Issues and PRs only.** Each experiment is an issue; each issue is one PR.
- **Static output.** Plain ES modules served as-is. Vercel serves the repo root. The only build step compiles the F# core (see below).
- **Literate, pure script.** Source is prose first (see `CONTRIBUTING.md`). No framework, no bundler, no dependencies.
- **One library.** `lib/` holds everything reusable. Demos are thin.
- **Testable.** Phonetic claims are checked numerically from the tract's impulse response.

## Architecture

```
IPA text ──► tokenizer ──► segments ──► planner ──► score ──► renderer ──► audio
 (lib/ipa)                 (lib/consonants,        (lib/score)   (lib/pinktrombone)
                            lib/vowels)             keyframes     in browser: AudioWorklet
                                                                  in Node: offline → WAV
```

- A **score** is a list of keyframes: a time plus articulation (tongue index, tongue diameter, lips, velum, an optional
  constriction) plus source (f0, tenseness, intensity, aspiration). The engine interpolates between them.
- The **engine** is a Kelly-Lochbaum waveguide with a nasal branch and an LF-style glottis. Shape is expressed in
  *Pink Trombone index units* (0 to 44, glottis to lips) and resampled to however many tract sections a voice uses.
- The **same renderer** runs in the browser, in tests, and in the calibration scripts.
- Later stages are transformations on the data before it reaches the next stage:
  accents rewrite IPA, languages supply dictionaries and rhythm class, voices set source and tract length, tempo and
  rhythm decide durations.

## Repo layout

```
index.html            landing page, lists the experiments
demos/NN-name/        one folder per experiment: index.html + main.js
lib/                  shared library (engine, IPA data, planner, ...)
literate/             in-browser viewer that weaves source files
data/                 dictionaries and other plain-text data
scripts/              calibration and tooling (Node, no deps)
test/                 node:test suites
docs/                 this plan
```

## The ladder

| Issue | Demo | Adds |
|------:|------|------|
| #1 | Foundations | repo, viewer, Vercel, CI |
| #2 | Engine | glottis, tract, score, renderer, audio |
| #3 | Demo 1 | IPA vowel chart → tongue/lips |
| #4 | Demo 2 | IPA consonant table → constrictions |
| #5 | Demo 3 | IPA strings, planner, coarticulation |
| #6 | Demo 4 | ten languages, word → IPA dictionary |
| #7 | Demo 5 | voices |
| #8 | Demo 6 | tempo |
| #9 | Demo 7 | stress-timed vs syllable-timed rhythm |
| #10 | Demo 8 | accent rewrite rules |

## Decisions and assumptions

- **"English, Spanish, and top 10 languages"** is read as the ten most spoken languages by total speakers, which already
  contain both English and Spanish: English, Mandarin, Hindi, Spanish, Standard Arabic, French, Bengali, Portuguese,
  Russian, and a tenth place that is Urdu or Indonesian depending on the count. Urdu and Hindi are one spoken language
  in two scripts and Hindi is already present, so Indonesian took the tenth place. The registry is data-driven, so adding
  Urdu, German, Japanese, etc. is a small PR.
- **Dictionaries are seeds**, not full lexicons: a few dozen common words per language, curated by hand, with rule-based
  grapheme-to-phoneme where the orthography is regular. Quality is an ongoing contribution, tracked in issues.
- **Pulmonic consonants only** at first. Clicks, ejectives and implosives are listed as not modelled.
- **We cannot listen in CI.** Calibration targets published formant values and tests check relationships, but a human
  ear should review each demo. PRs say whether that happened.

## Status

All eight experiments are merged and live (issues #3 to #10). What is verified, and what is not:

- **Verified by tests (`npm test`)**: engine stability, formant positions against published vowel values, consonant
  acoustics (closure silence, fricative high-frequency energy, nasal radiation, trill modulation), tokenizer and planner
  behaviour, every dictionary and accent file parses and sounds, rhythm and tempo relationships, and wiring (every demo
  import and element id resolves).
- **Smoke-tested under a fake DOM**: each demo page loads, builds its controls and sends a sane score to the worklet.
- **Not verified**: how any of it *sounds* to a human, and behaviour in a real browser and on Vercel. Those need an ear and
  a deployment, and are the first thing to do next.

Known approximations: lateral consonants are midline-narrowed (a tube has no sides); clicks, ejectives and implosives are
not modelled; palatalisation, emphatics, dental consonants and breathy voice are approximated by the nearest sound;
rhythm classes are a simplification; accents are sketches of tendencies.

## The F# core (in progress)

A pure F# version of the data-to-data layer, taught as lessons: `Tongue` and `Formants` with `toSound` and
`fromSound` (lesson 1), then consonants, scores, the planner, languages, voices, tempo, rhythm, accents (lessons 2 to 8) and the engine (lesson 9). It is compiled to JavaScript by Fable
on every Vercel deploy into an uncommitted `core/`, so the site is still served as static files but the deploy now has a build step (it installs .NET). Purity is a property of each function's interface: the
waveguide engine (lesson 9) keeps local mutable loops inside a pure signature, because a fully immutable per-sample
step was measured at roughly 11 times slower than a mutable one and cannot run in real time. The JavaScript
library stays the source the demos use until a lesson replaces a piece of it.

## Out of scope for now

- Real-time microphone analysis, speech recognition, learning mappings from audio.
- A full-coverage pronunciation lexicon.
