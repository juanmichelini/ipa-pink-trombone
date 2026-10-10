import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { neighbours, slugFromPath, lessonNavHtml } from '../lib/ui/lessonnav.js';
import { demos } from '../lib/demos.js';
import { setCatalogues } from '../lib/i18n.js';

const english = JSON.parse(readFileSync('data/i18n/en.json', 'utf8'));
setCatalogues(english);

test('neighbours walk the ladder in order and stop at the ends', () => {
  assert.equal(neighbours('01-vowels').previous, null);
  assert.equal(neighbours('01-vowels').next.slug, '02-consonants');
  assert.equal(neighbours('04-languages').previous.slug, '03-together');
  assert.equal(neighbours('08-accents').next, null);
  assert.deepEqual(neighbours('nope').position, 0);
});

test('planned demos are skipped', () => {
  const list = [{ slug: 'a', n: 1, title: 'A', status: 'live' }, { slug: 'b', n: 2, title: 'B', status: 'planned' }, { slug: 'c', n: 3, title: 'C', status: 'live' }];
  assert.equal(neighbours('a', list).next.slug, 'c');
});

test('paths map to slugs, and the html links the right pages', () => {
  assert.equal(slugFromPath('/demos/03-together/'), '03-together');
  assert.equal(slugFromPath('/demos/03-together/index.html'), '03-together');
  assert.equal(slugFromPath('/'), null);
  const html = lessonNavHtml('03-together');
  assert.match(html, /href="\/demos\/02-consonants\/"/);
  assert.match(html, /href="\/demos\/04-languages\/"/);
  assert.match(html, /3 of 8/);
});

test('every live demo page loads the lesson navigation', () => {
  for (const d of demos.filter((x) => x.status === 'live')) {
    assert.match(readFileSync(`demos/${d.slug}/index.html`, 'utf8'), /lib\/ui\/lessonnav\.js/, d.slug);
  }
});
