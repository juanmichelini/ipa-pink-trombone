import test from 'node:test';
import assert from 'node:assert/strict';
import { weave, renderMarkdown, highlight, renderDocument, isSafeSource, escapeHtml } from '../lib/literate.js';

test('weave splits column-0 // lines (prose) from code', () => {
  const src = ['// # Title', '//', '// Some prose.', 'const a = 1;', '  // indented comment stays code', 'const b = 2;'].join('\n');
  const chunks = weave(src);
  assert.deepEqual(chunks.map((c) => c.kind), ['prose', 'code']);
  assert.equal(chunks[0].text, '# Title\n\nSome prose.');
  assert.match(chunks[1].text, /indented comment stays code/);
});

test('weave keeps a blank line between two prose lines inside one chunk', () => {
  const chunks = weave('// one\n\n// two\ncode();');
  assert.equal(chunks[0].kind, 'prose');
  assert.equal(chunks[0].text, 'one\n\ntwo');
});

test('weave drops empty chunks and handles CRLF', () => {
  const chunks = weave('\r\n// hi\r\n\r\nx();\r\n');
  assert.deepEqual(chunks.map((c) => c.kind), ['prose', 'code']);
});

test('markdown: headings, paragraphs, lists, inline', () => {
  const html = renderMarkdown('## Head\nright after\n\nA `code` and **bold** and *em* and [x](https://e.com).\n\n- one\n- two\n  more\n\n1. a\n2. b');
  assert.match(html, /<h2>Head<\/h2>/);
  assert.match(html, /<p>right after<\/p>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>em<\/em>/);
  assert.match(html, /<a href="https:\/\/e.com">x<\/a>/);
  assert.match(html, /<li>two more<\/li>/);
  assert.match(html, /<ol><li>a<\/li><li>b<\/li><\/ol>/);
});

test('markdown escapes HTML and refuses javascript: links', () => {
  const html = renderMarkdown('<img src=x onerror=alert(1)> [bad](javascript:alert(1))');
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('href="javascript'));
});

test('code spans are not interpreted as markdown', () => {
  assert.match(renderMarkdown('`**not bold**`'), /<code>\*\*not bold\*\*<\/code>/);
});

test('highlight wraps tokens and escapes everything', () => {
  const html = highlight('const x = "<a>"; // c');
  assert.match(html, /<span class="k">const<\/span>/);
  assert.match(html, /<span class="s">&quot;&lt;a&gt;&quot;<\/span>/);
  assert.match(html, /<span class="c">\/\/ c<\/span>/);
});

test('renderDocument uses the first heading as the title', () => {
  assert.equal(renderDocument('// # My file\ncode();').title, 'My file');
});

test('isSafeSource only allows plain repo-relative paths', () => {
  assert.ok(isSafeSource('lib/literate.js'));
  assert.ok(isSafeSource('data/dictionaries/es.tsv'));
  assert.ok(!isSafeSource('../secret.js'));
  assert.ok(!isSafeSource('/etc/passwd.js'));
  assert.ok(!isSafeSource('https://evil.example/x.js'));
  assert.ok(!isSafeSource('lib/x.exe'));
});

test('escapeHtml', () => {
  assert.equal(escapeHtml('<&">'), '&lt;&amp;&quot;&gt;');
});

test('the viewer can weave its own source', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../lib/literate.js', import.meta.url), 'utf8');
  const { title, html } = renderDocument(src);
  assert.equal(title, 'The literate viewer');
  assert.ok(html.includes('<pre class="code">'));
});

test('F# files are allowed and highlighted as F#', () => {
  assert.ok(isSafeSource('fsharp/src/01-TongueSpace.fs'));
  assert.ok(!isSafeSource('fsharp/src/../../x.fs'));
  // In F# a single quote starts a type variable, not a string.
  const html = highlight("let f (x: 'a) (y: 'b) = x", 'fsharp');
  assert.ok(html.includes('<span class="k">let</span>'));
  assert.ok(!html.includes('<span class="s">'));
});
