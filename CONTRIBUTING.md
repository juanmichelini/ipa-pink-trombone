# Contributing

## Everything is an issue and a PR

1. Open or pick an issue. Use the *Experiment / task* template. State acceptance criteria as checkboxes.
2. Branch from `main`: `demo/01-vowels`, `lib/engine`, `fix/…`, `docs/…`.
3. Open a PR that says `Closes #N`. Fill in the template, including how you verified it.
4. Merge when `npm test` is green. Squash merge, so `main` reads as one commit per issue.

No direct pushes to `main`.

## Literate source

Each source file is a document first.

- A line that starts with `//` **in column 0** is prose. It is rendered as Markdown-lite: `#`/`##` headings,
  paragraphs, `- ` lists, `` `code` ``, `**bold**`, `*em*`, `[links](https://example.com)`.
- Everything else is code. Indented `//` comments stay ordinary code comments.
- Write the *why* in the prose, in the order a reader needs it, then the code. Think "essay with code in it".
- Pure scripts: plain ES modules, no framework, no bundler, no dependencies.

Preview any file at `/literate/?src=path/to/file.js` while the static server runs.

## The F# core

Lessons live in `fsharp/src/` and follow the same literate convention (`//` prose in column 0). The
compiled JavaScript in `core/` is not committed: Vercel builds it from the F# on every deploy, and CI
rehearses that build. Details are in `fsharp/README.md`.

## Shared library first

If two demos need it, it goes in `lib/`. A demo folder should contain only the page, its `main.js` and whatever is
unique to that experiment.

## Tests without ears

We cannot hear CI. So the synthesis is tested numerically: render offline, estimate formants from the tract's impulse
response, and assert on relationships (`/i/` has a higher F2 than `/u/`) rather than on exact numbers. If you add a
phonetic claim, add a test for it. `npm test` needs no install.

## Data

Language data lives in `data/` as plain text (TSV). A dictionary change is a PR like any other; a test checks that
every IPA symbol in it can actually be sounded.

## Translations

Every sentence on a page lives in `data/i18n/<code>.json`; `en.json` is the source. To change a sentence, edit its id in `en.json` and in every other catalogue. To add a string, put `data-i18n="some.id"` on the element (or `data-i18n-html` for markup, `data-i18n-attr="title:some.id"` for attributes), or call `t('some.id', { name })` in a script, and add the id to `en.json`. To add a language, copy `en.json`, translate it, and add it to `LOCALES` in `lib/i18n.js`. The tests check that every catalogue has every id, with the same `{placeholders}` and tags, and that every id used in a page or script exists.

Scripts that show text the page cannot do without (the lesson buttons, the landing cards) pass the English text as the third argument of `t`, as in `t('demo.3.title', {}, d.title)`, so a visitor never sees a raw id even if a catalogue fails to load.
