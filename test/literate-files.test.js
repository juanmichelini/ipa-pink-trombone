import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { weave } from '../lib/literate.js';

// The repo promises literate source. This keeps the promise honest: every script under lib/,
// demos/ and scripts/, and every F# lesson under fsharp/src/, opens with a `// # Title` and carries a healthy share of prose.
async function sources(dir) {
  const out = [];
  for (const entry of await readdir(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...(await sources(`${dir}/${entry.name}`)));
    else if (/\.(m?js|fs)$/.test(entry.name)) out.push(`${dir}/${entry.name}`);
  }
  return out;
}

test('every script is a document: titled, with real prose', async () => {
  const files = [...(await sources('lib')), ...(await sources('demos')), ...(await sources('scripts')), ...(await sources('fsharp/src'))];
  assert.ok(files.length >= 10);
  const problems = [];
  for (const file of files) {
    const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    if (!/^\/\/ # .+/.test(text)) { problems.push(`${file}: must start with "// # Title"`); continue; }
    if (/\(generated\)/.test(text.split('\n')[0])) continue;
    const chunks = weave(text);
    const prose = chunks.filter((c) => c.kind === 'prose').reduce((n, c) => n + c.text.split('\n').filter(Boolean).length, 0);
    const code = chunks.filter((c) => c.kind === 'code').reduce((n, c) => n + c.text.split('\n').filter(Boolean).length, 0);
    if (prose < 0.12 * (prose + code)) problems.push(`${file}: only ${prose} prose lines against ${code} code lines`);
  }
  assert.deepEqual(problems, []);
});
