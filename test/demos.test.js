import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { demos, lessons, stepsOf } from '../lib/demos.js';

test('the lessons are numbered 1..N and every slug is unique', () => {
  assert.deepEqual(lessons.map((d) => d.n), lessons.map((_, i) => i + 1));
  assert.equal(new Set(demos.map((d) => d.slug)).size, demos.length);
  assert.equal(new Set(demos.map((d) => String(d.n))).size, demos.length);
});

test('a step is numbered under its lesson, and comes before it in the ladder', () => {
  for (const [i, d] of demos.entries()) {
    if (d.parent === undefined) continue;
    const parent = demos.findIndex((x) => x.n === d.parent);
    assert.ok(parent > i, `${d.n} comes before lesson ${d.parent}`);
    assert.match(String(d.n), new RegExp(`^${d.parent}\\.\\d+$`), `${d.n} is numbered under ${d.parent}`);
  }
  // Steps of one lesson are consecutive and in order: 1.1, 1.2, ...
  for (const lesson of lessons) {
    const steps = stepsOf(lesson.n);
    assert.deepEqual(steps.map((s) => s.n), steps.map((_, k) => `${lesson.n}.${k + 1}`));
  }
  assert.ok(stepsOf(1).length === 4 && stepsOf(2).length === 9);
});

test('every live demo has a page on disk', async () => {
  for (const d of demos.filter((x) => x.status === 'live')) {
    await access(new URL(`../demos/${d.slug}/index.html`, import.meta.url));
  }
});
