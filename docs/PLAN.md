# Plan

Goal: a series of incremental, dynamic experiments that map IPA to a Pink-Trombone-style vocal tract, growing from a
single vowel chart to accents. All experiments coexist in one repo and share one library.

## Principles

- **Issues and PRs only.** Each experiment is an issue; each issue is one PR.
- **Static, zero build.** Plain ES modules served as-is. Vercel serves the repo root.
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
  Russian, Urdu. The language registry is data-driven, so adding Indonesian, German, Japanese, etc. is a small PR.
- **Dictionaries are seeds**, not full lexicons: a few dozen common words per language, curated by hand, with rule-based
  grapheme-to-phoneme where the orthography is regular. Quality is an ongoing contribution, tracked in issues.
- **Pulmonic consonants only** at first. Clicks, ejectives and implosives are listed as not modelled.
- **We cannot listen in CI.** Calibration targets published formant values and tests check relationships, but a human
  ear should review each demo. PRs say whether that happened.

## Out of scope for now

- Real-time microphone analysis, speech recognition, learning mappings from audio.
- A full-coverage pronunciation lexicon.
