import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { neighbours, slugFromPath, lessonNavHtml } from '../lib/ui/lessonnav.js';
import { demos } from '../lib/demos.js';
import { setCatalogues } from '../lib/i18n.js';

const english = JSON.parse(readFileSync('data/i18n/en.json', 'utf8'));
setCatalogues(english);

test('neighbours walk the ladder in order and stop at the ends', () => {
  // The ladder goes through the steps first: 1.1, 1.2, 1.3, 1.4, 1, 2.1, ..., 2.9, 2, 3, ...
  assert.equal(neighbours('01.1-front-to-back').previous, null);
  assert.equal(neighbours('01.1-front-to-back').next.slug, '01.2-rounded-front-to-back');
  assert.equal(neighbours('01-vowels').previous.slug, '01.4-rounded-vowels');
  assert.equal(neighbours('01-vowels').next.slug, '02.1-voiceless-fricatives');
  assert.equal(neighbours('02-consonants').previous.slug, '02.9-affricates');
  assert.equal(neighbours('02-consonants').next.slug, '03-together');
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
  assert.match(html, new RegExp(`${demos.findIndex((d) => d.slug === '03-together') + 1} of ${demos.length}`));
});

test('a step links to its neighbours with its number', () => {
  const html = lessonNavHtml('02.3-voiceless-stops');
  assert.match(html, /href="\/demos\/02\.2-voiced-fricatives\/"/);
  assert.match(html, /href="\/demos\/02\.4-voiced-stops\/"/);
  assert.match(html, /2\.4\. Voiced stops/);
});

test('every live demo page loads the lesson navigation', () => {
  for (const d of demos.filter((x) => x.status === 'live')) {
    assert.match(readFileSync(`demos/${d.slug}/index.html`, 'utf8'), /lib\/ui\/lessonnav\.js/, d.slug);
  }
});

test('with no catalogue at all, the buttons still show the registry titles and English labels', () => {
  setCatalogues({}, {});
  const html = lessonNavHtml('03-together');
  assert.match(html, /2\. Consonants/);
  assert.match(html, /4\. Languages/);
  assert.match(html, new RegExp(`All lessons · ${demos.findIndex((d) => d.slug === '03-together') + 1} of ${demos.length}`));
  assert.doesNotMatch(html, /demo\.\d|lesson\./);
  setCatalogues(english);
});
