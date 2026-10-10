import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { demos } from '../lib/demos.js';

// Nothing here can open a browser, so this is the next best thing: every demo's imports must
// resolve to a real file that really exports the names asked for, and every element id the page
// script looks up must exist in its HTML.

const IMPORT = /import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g;

async function checkImports(file) {
  const source = readFileSync(file, 'utf8');
  for (const m of source.matchAll(IMPORT)) {
    const target = resolve(dirname(file), m[2]);
    assert.ok(existsSync(target), `${file}: ${m[2]} does not exist`);
    const mod = await import(pathToFileURL(target).href);
    for (const name of m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
      assert.ok(name in mod, `${file}: ${m[2]} has no export ${name}`);
    }
  }
}

test('every demo page script imports only things that exist', async () => {
  for (const d of demos.filter((x) => x.status === 'live')) await checkImports(`demos/${d.slug}/main.js`);
});

test('every library module imports only things that exist', async () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : []));
  for (const file of walk('lib')) if (!file.endsWith('worklet.js')) await checkImports(file);
});

test('every id a demo script looks up exists in its page', () => {
  for (const d of demos.filter((x) => x.status === 'live')) {
    const js = readFileSync(`demos/${d.slug}/main.js`, 'utf8');
    const html = readFileSync(`demos/${d.slug}/index.html`, 'utf8');
    const ids = new Set([...js.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]));
    for (const id of ids) assert.ok(html.includes(`id="${id}"`), `${d.slug}: no element #${id}`);
  }
});

test('live demos have a page linked from the landing registry and no planned demo has a folder', () => {
  for (const d of demos) {
    const has = existsSync(`demos/${d.slug}/index.html`);
    assert.equal(has, d.status === 'live', `${d.slug} status ${d.status}`);
  }
});
