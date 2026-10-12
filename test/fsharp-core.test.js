import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { VOWELS } from '../lib/vowels.js';

// The F# core is compiled to `core/` by Fable (see `fsharp/README.md`). On a fresh checkout the
// folder may not exist yet, so these tests skip with a reason. The `fsharp` workflow sets
// `REQUIRE_CORE`, and then a missing build is a failure instead of a skip.
const file = new URL('../core/01-TongueSpace.fs.js', import.meta.url);
const built = existsSync(file);
if (!built && process.env.REQUIRE_CORE) throw new Error('core/01-TongueSpace.fs.js was not built');
const core = built ? await import(file.href) : null;
const skip = built ? false : 'core/ is not built: see fsharp/README.md';

test('the F# vowel table matches lib/vowels.js', { skip }, () => {
  const fs = Array.from(core.vowels);
  assert.equal(fs.length, VOWELS.length);
  for (const v of VOWELS) {
    const f = fs.find((x) => x.Symbol === v.symbol);
    assert.ok(f, `missing /${v.symbol}/`);
    assert.equal(f.Name, v.name);
    assert.equal(f.Tongue.Backness, v.b);
    assert.equal(f.Tongue.Height, v.h);
    assert.equal(f.Tongue.Rounding, v.rounded ? 1 : 0);
    assert.equal(f.Sound.F1, v.f1);
    assert.equal(f.Sound.F2, v.f2);
    assert.equal(f.Approx, v.approx);
  }
});

test('compiled toSound reproduces every reference formant', { skip }, () => {
  for (const v of Array.from(core.vowels)) {
    const s = core.toSound(v.Tongue);
    assert.ok(Math.abs(s.F1 - v.Sound.F1) < 1e-6 && Math.abs(s.F2 - v.Sound.F2) < 1e-6, v.Symbol);
  }
});

test('compiled fromSound sends every vowel back to its own symbol', { skip }, () => {
  for (const v of Array.from(core.vowels)) {
    assert.equal(core.nearest(core.fromSound(v.Sound)).Symbol, v.Symbol);
  }
});

test('compiled render is the right length and repeatable', { skip }, () => {
  const sound = core.toSound(Array.from(core.vowels)[0].Tongue);
  const a = core.render(sound, 120, 16000, 0.25);
  assert.equal(a.length, 4000);
  assert.deepEqual(Array.from(a), Array.from(core.render(sound, 120, 16000, 0.25)));
  assert.ok(Array.from(a).every((x) => Math.abs(x) <= 0.8 + 1e-12));
});
