// # Reference recordings
//
// Downloads the pulmonic consonant recordings of the Wikipedia IPA chart with audio
// (https://en.wikipedia.org/wiki/IPA_consonant_chart_with_audio) into `ref/`, one 44.1 kHz mono WAV per
// symbol, so `scripts/compare-consonants.mjs` can hold the synthesis against real speech.
//
// The recordings live on Wikimedia Commons under free licences (mostly CC BY-SA or public domain) that
// require attribution. They are for local analysis only: `ref/` is git-ignored, nothing is committed or
// redistributed, and `ref/index.tsv` records each file's licence, author and source page.
//
// Needs Node 20+ and `ffmpeg` on the PATH. Usage: `node scripts/fetch-reference.mjs`
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = join(ROOT, 'ref');
const UA = 'ipa-pink-trombone-reference/1.0 (https://github.com/juanmichelini/ipa-pink-trombone; local analysis only)';
const PAGE = 'IPA_consonant_chart_with_audio';

async function getJson(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Commons answers 429 when asked too fast; wait as long as it says (or back off) and try again.
async function download(url) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers: { 'user-agent': UA } });
    if (r.status !== 429 || attempt >= 6) {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    }
    await sleep(Math.max(Number(r.headers.get('retry-after')) || 0, 5 * 2 ** attempt) * 1000);
  }
}

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const strip = (s) => decode(s.replace(/<[^>]+>/g, '')).trim();

// Every cell of the chart is `symbol, file`. The pulmonic consonants and the "other symbols" come
// first; the implosives, ejectives and clicks (not pulmonic) start at the first implosive.
const page = await getJson(`https://en.wikipedia.org/w/api.php?action=parse&page=${PAGE}&prop=text&format=json&formatversion=2`);
const cells = [...page.parse.text.matchAll(/<div class="IPA-audiocell-symbol">(.*?)<\/div><div class="IPA-audiocell-audio">(.*?)<\/div><\/div>/gs)]
  .map(([, sym, aud]) => {
    const f = aud.match(/\/wiki\/File:([^"]+)"/);
    return { symbol: strip(sym), file: f ? decodeURIComponent(decode(f[1])).replace(/_/g, ' ') : null };
  });
const stop = cells.findIndex((c) => c.file && /implosive/i.test(c.file));
const wanted = cells.slice(0, stop);

mkdirSync(REF, { recursive: true });
const missing = [];
const index = [['symbol', 'file', 'licence', 'author', 'source']];
const have = wanted.filter((c) => c.file || (missing.push([c.symbol, 'no recording on the chart']), false));

// Licence and download URL for each file, from the Commons API, 40 titles at a time.
const info = new Map();
for (let i = 0; i < have.length; i += 40) {
  const titles = have.slice(i, i + 40).map((c) => 'File:' + c.file).join('|');
  const q = await getJson(`https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|extmetadata&format=json&formatversion=2&titles=${encodeURIComponent(titles)}`);
  for (const p of q.query.pages) {
    const ii = p.imageinfo?.[0];
    if (ii) info.set(p.title.replace(/^File:/, '').replace(/_/g, ' '), ii);
  }
}

const tmp = join(REF, '.download');
mkdirSync(tmp, { recursive: true });
for (const c of have) {
  const ii = info.get(c.file) || [...info.entries()].find(([k]) => k.normalize('NFC') === c.file.normalize('NFC'))?.[1];
  if (!ii) { missing.push([c.symbol, `${c.file}: not found on Commons`]); continue; }
  const out = join(REF, `${c.symbol}.wav`);
  try {
    if (!existsSync(out)) {
      const r = await download(ii.url);
      const src = join(tmp, c.file.replace(/[^\w.-]/g, '_'));
      writeFileSync(src, Buffer.from(await r.arrayBuffer()));
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', out]);
      await sleep(1500);   // be polite to the servers
    }
    const m = ii.extmetadata || {};
    index.push([c.symbol, c.file, strip(m.LicenseShortName?.value || '?'), strip(m.Artist?.value || '?'), ii.descriptionurl]);
    console.log('ok     ', c.symbol, c.file);
  } catch (e) {
    missing.push([c.symbol, `${c.file}: ${e.message}`]);
    console.log('MISSING', c.symbol, e.message);
  }
}
writeFileSync(join(REF, 'index.tsv'), index.map((r) => r.join('\t')).join('\n') + '\n');
writeFileSync(join(REF, 'missing.txt'), missing.map((r) => r.join('\t')).join('\n') + '\n');
console.log(`\n${index.length - 1} downloaded, ${missing.length} missing (see ref/missing.txt)`);
