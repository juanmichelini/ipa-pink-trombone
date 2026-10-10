import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { demos } from '../lib/demos.js';

test('demos are numbered 1..N with unique slugs', () => {
  assert.deepEqual(demos.map((d) => d.n), demos.map((_, i) => i + 1));
  assert.equal(new Set(demos.map((d) => d.slug)).size, demos.length);
});

test('every live demo has a page on disk', async () => {
  for (const d of demos.filter((x) => x.status === 'live')) {
    await access(new URL(`../demos/${d.slug}/index.html`, import.meta.url));
  }
});
