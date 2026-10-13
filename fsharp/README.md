# The F# core

A pure F# version of the library's ideas, taught one lesson at a time. Each file in `src/` is a lesson,
written like the JavaScript source: prose in `//` comments in column 0, code after it. Compile order
(see `IpaTrombone.fsproj`) is lesson order, and a lesson may only use the ones above it.

| Lesson | File | Adds |
|-------:|------|------|
| 1 | `src/01-TongueSpace.fs` | `Tongue`, `Formants`, `toSound`, `fromSound`, `render` |
| 2 | `src/02a-Score.fs` | `Frame`, `Timeline`, `Score`: movement written down as pure values |
| 2 | `src/02b-Consonants.fs` | `Place`, `Manner`, `Consonant`, `gesture`, and `identify` (mouth shape back to consonant) |
| 3 | `src/03a-VowelShape.fs` | the calibrated vowel chart becomes a `Shape`: tongue, jaw and lips |
| 3 | `src/03b-Ipa.fs` | `tokenize` and `format`: IPA text to segments and back |
| 3 | `src/03c-Planner.fs` | `plan`: coarticulation, durations, stress, tones, undershoot and declination, as a fold |
| 4 | `src/04a-G2p.fs` | Spanish and Indonesian spelling to IPA: phones, syllables and stress as a pipeline of passes |
| 4 | `src/04b-Languages.fs` | the ten languages, dictionary parsing, lookup and text to IPA |
| 5 | `src/05-Voices.fs` | `Voice` presets, `speak`, `whisperScore`, and formants scaled by tract length |
| 6 | `src/06-Tempo.fs` | two ways to go fast (`naive`, `speechLike`) and the measurements that tell them apart |

Read a lesson in the browser at `/literate/?src=fsharp/src/01-TongueSpace.fs` (and likewise for the others).

The demos still run on the JavaScript library. A test per lesson compares the compiled F# with the JavaScript, number for number (`test/fsharp-*.test.js`), so the two cannot drift apart unnoticed.

## Why pure, and what that means here

Every function is deterministic: no state, randomness or I/O. `render` uses local `mutable` loop
variables for speed, but nothing mutable escapes, so from outside it is a pure function. (A fully
immutable per-sample waveguide was measured at about 11 times slower than a mutable one and cannot
keep up with real time, so the future engine lesson keeps the same pure signature with a mutable
inside.)

## How it gets to the browser

[Fable](https://fable.io) compiles the F# to JavaScript in `core/`. That folder is **not committed**
(it is in `.gitignore`): Vercel builds it on every deploy.

- `vercel.json` runs `scripts/vercel-install.sh` (installs the .NET SDK with `dnf` on Vercel's Amazon
  Linux 2023 build image and restores Fable, whose version is pinned in `.config/dotnet-tools.json`)
  and then `scripts/vercel-build.sh` (runs Fable).
- CI (`.github/workflows/fsharp.yml`) runs the F# tests, and also runs those same two scripts inside an
  `amazonlinux:2023` container before testing the JavaScript they produce. A green CI means the
  deploy's build step has been rehearsed.

You do not need .NET to work on the JavaScript side: `npm test` skips the compiled-core tests when
`core/` is missing.

## Building locally

Needs the .NET 8 SDK.

```sh
dotnet run --project fsharp/tests                 # F# tests (Expecto + FsCheck)
dotnet tool restore                               # installs the pinned Fable
dotnet fable fsharp/IpaTrombone.fsproj --outDir core
npm test                                          # now also tests the compiled core
```

`core/` is ignored by git, so there is nothing to commit afterwards. To see a page that uses it, serve the
folder as usual (`python3 -m http.server 8000`) after building.
