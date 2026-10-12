# The F# core

A pure F# version of the library's ideas, taught one lesson at a time. Each file in `src/` is a lesson,
written like the JavaScript source: prose in `//` comments in column 0, code after it. Compile order
(see `IpaTrombone.fsproj`) is lesson order, and a lesson may only use the ones above it.

| Lesson | File | Adds |
|-------:|------|------|
| 1 | `src/01-TongueSpace.fs` | `Tongue`, `Formants`, `toSound`, `fromSound`, `render` |

Read a lesson in the browser at `/literate/?src=fsharp/src/01-TongueSpace.fs`.

## Why pure, and what that means here

Every function is deterministic: no state, randomness or I/O. `render` uses local `mutable` loop
variables for speed, but nothing mutable escapes, so from outside it is a pure function. (A fully
immutable per-sample waveguide was measured at about 11 times slower than a mutable one and cannot
keep up with real time, so the future engine lesson keeps the same pure signature with a mutable
inside.)

## How it gets to the browser

[Fable](https://fable.io) compiles the F# to JavaScript in `core/`, and that output **is committed**, so
the site stays static with no build step on Vercel. You do not need .NET to run or deploy the site.

CI (`.github/workflows/fsharp.yml`) does the build:

- on a pull request from this repository it runs the F# tests, runs Fable, runs `npm test`, and **pushes
  the regenerated `core/` to the pull request branch** if it changed
- on `main` it fails if the committed `core/` does not match the F# source

Do not edit `core/` by hand.

## Building locally

Needs the .NET 8 SDK.

```sh
dotnet run --project fsharp/tests                 # F# tests (Expecto + FsCheck)
dotnet tool install --global fable --version "4.*"
fable fsharp/IpaTrombone.fsproj --outDir core     # regenerate core/
npm test
```

Fable writes `core/fable_modules/.gitignore`, which hides the library files it copies. They are needed
by the site, so add them with `git add -f core`.
