import test from 'node:test';
import assert from 'node:assert/strict';
import { CONSONANTS, MANNERS, consonantAt, consonantGesture } from '../lib/consonants.js';
import { renderScore, rms } from '../lib/render.js';
import { shapeOfSymbol } from '../lib/vowel-map.js';
import { VOWELS } from '../lib/vowels.js';
import { indexToX, xToIndex, stack, nearestSymbol, labelled, namedPlaces, AXIS } from '../lib/ui/placeaxis.js';
import { slice } from '../lib/ui/consonant-lesson.js';
import { placeIndexOf } from '../lib/ui/placeaxis.js';
import { consonantBySymbol } from '../lib/consonants.js';
import { interpret, toPixels } from '../lib/ui/vowelchart.js';
import { chartPosition } from '../lib/vowels.js';

// ## The place axis

test('the axis runs from the lips on the left to the throat on the right, and back again', () => {
  assert.ok(indexToX(AXIS.lips) < indexToX(AXIS.throat));
  assert.equal(Math.round(indexToX(AXIS.lips)), AXIS.x0);
  for (const index of [13.5, 20, 29.5, 39, 43.5]) assert.ok(Math.abs(xToIndex(indexToX(index)) - index) < 1e-9);
  assert.equal(xToIndex(-50), AXIS.lips, 'left of the line is the lips');
  assert.equal(xToIndex(999), AXIS.throat, 'right of the line is the throat');
});

test('symbols made at nearly the same place are stacked, not written over each other', () => {
  const rows = stack([{ symbol: 'ɸ', index: 43.5 }, { symbol: 'ʍ', index: 43.5 }, { symbol: 's', index: 39 }, { symbol: 'x', index: 24.5 }]);
  assert.equal(rows.find((r) => r.symbol === 'ɸ').row, 0);
  assert.equal(rows.find((r) => r.symbol === 'ʍ').row, 1);
  assert.equal(rows.find((r) => r.symbol === 'x').row, 0);
});

test('the symbol under the pointer is the nearest one, if it is near', () => {
  const items = [{ symbol: 's', index: 39 }, { symbol: 'ʃ', index: 36.5 }];
  assert.equal(nearestSymbol(items, indexToX(39) + 3).symbol, 's');
  assert.equal(nearestSymbol(items, indexToX(30)), null);
});

test('place names under the line are thinned so that none overlaps the next', () => {
  const all = namedPlaces().map((p) => p.id);
  const shown = labelled(all);
  assert.ok(shown.length >= 5 && shown.length < all.length);
  for (let i = 1; i < shown.length; i++) assert.ok(shown[i - 1].index - shown[i].index >= 3.4);
  assert.deepEqual(labelled(['velar']).map((p) => p.id), ['velar']);
  assert.deepEqual(labelled(['nowhere']), []);
});

// ## A consonant at any place

test('a consonant of every manner, at any place along the tract, makes finite, bounded, audible sound', () => {
  const carrier = shapeOfSymbol('a');
  for (const manner of [...MANNERS, 'affricate']) {
    for (const voiced of [false, true]) {
      for (const index of [13.5, 17, 24.5, 31.2, 36.5, 39, 41, 43.5]) {
        const g = consonantGesture(consonantAt(manner, voiced, index), { carrier });
        const x = renderScore(g.score);
        const what = `${voiced ? 'voiced' : 'voiceless'} ${manner} at ${index}`;
        assert.ok(x.every(Number.isFinite), `${what} is finite`);
        assert.ok(x.every((s) => Math.abs(s) <= 1.0001), `${what} does not clip`);
        assert.ok(rms(x) > 0.005, `${what} is audible`);
      }
    }
  }
});

test('a consonant slid to a named place is the named consonant', () => {
  // The held shape of a fricative at the alveolar ridge is the one of `s`.
  const named = consonantGesture(CONSONANTS.find((c) => c.symbol === 's'), {}).steady;
  const slid = consonantGesture(consonantAt('fricative', false, 39), {}).steady;
  for (const key of Object.keys(named)) assert.ok(Math.abs(named[key] - slid[key]) < 1e-9, key);
});

// ## The slices of the table

test('a slice is every consonant of a manner and a voicing, with the glottal ones as buttons only', () => {
  const s = slice('fricative', false);
  assert.ok(s.symbols.includes('s') && s.symbols.includes('ʃ') && s.symbols.includes('ɸ'));
  assert.ok(!s.symbols.includes('z'), 'no voiced fricative in a voiceless slice');
  assert.deepEqual(s.extras, ['h']);
  assert.deepEqual(slice('plosive', false).extras, ['ʔ']);
  assert.deepEqual(slice('nasal', true).extras, []);
  for (const [manner, voiced] of [['trill', true], ['tap', true], ['affricate', false], ['affricate', true], ['lateral approximant', true], ['lateral fricative', false]]) {
    assert.ok(slice(manner, voiced).symbols.length >= 1, `${manner}`);
  }
});

test('the buttons under the line are in the order of the line, from the lips to the throat', () => {
  for (const [manner, voiced] of [['fricative', false], ['fricative', true], ['plosive', false], ['plosive', true], ['nasal', true], ['approximant', true], ['affricate', false], ['affricate', true], ['trill', true], ['tap', true]]) {
    const places = slice(manner, voiced).symbols.map((symbol) => placeIndexOf(consonantBySymbol(symbol).place));
    assert.deepEqual(places, [...places].sort((a, b) => b - a), `${voiced ? 'voiced' : 'voiceless'} ${manner}`);
  }
});

// ## The vowel chart with things held still

const at = (b, h) => { const { x, y } = chartPosition(b, h); const { px, py } = toPixels(x, y); return [px, py]; };

test('with the height locked, only front to back is free, and the lips are as locked', () => {
  const close = VOWELS.filter((v) => v.h === 0 && !v.rounded);
  const options = { list: close, lockHeight: 0, lockRounded: 0 };
  // Pointer far below the row: the height does not follow it.
  const [px] = at(0.5, 0);
  const free = interpret(px, 200, options);
  assert.equal(free.h, 0);
  assert.equal(free.rounded, 0);
  // Moving right moves the tongue back.
  const left = interpret(at(0.1, 0)[0], 26, { ...options, list: [] }).b, right = interpret(at(0.9, 0)[0], 26, { ...options, list: [] }).b;
  assert.ok(left < 0.2 && right > 0.8);
  // Near a vowel of the lesson it snaps to it.
  assert.equal(interpret(...at(0, 0), options).symbol, 'i');
});

test('the lips are held rounded or spread whatever the pointer is on', () => {
  const spread = VOWELS.filter((v) => !v.rounded);
  assert.equal(interpret(...at(1, 1), { list: spread, lockRounded: 0 }).rounded, 0);
  assert.equal(interpret(...at(0.5, 0.5), { list: VOWELS.filter((v) => v.rounded), lockRounded: 1 }).rounded, 1);
  // Without a lock, an unsnapped position leaves the rounding to the caller, as before.
  assert.equal(interpret(40, 200).rounded, null);
});

test('only the vowels of the lesson can be snapped to', () => {
  const rounded = VOWELS.filter((v) => v.rounded);
  const near = interpret(...at(0, 0), { list: rounded, lockRounded: 1 });
  assert.notEqual(near.symbol, 'i', 'i is not a rounded vowel');
});
