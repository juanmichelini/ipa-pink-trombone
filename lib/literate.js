// # The literate viewer
//
// Every source file in this repo is meant to be read as a document. This module is the tool that
// makes that true in the browser: it fetches a source file, splits it into **prose** and **code**,
// and lays them out as an essay with code in it. There is no build step. The same file also runs
// under Node, which is how the tests exercise it.
//
// ## The convention
//
// - A line that starts with `//` in **column 0** is prose.
// - Everything else is code, including indented `//` comments.
// - Blank lines belong to whatever chunk came before them, and are trimmed at the chunk edges.
//
// The prose is written in a small Markdown subset: `#` to `####` headings, paragraphs, `- ` lists,
// `1. ` lists, `` `code` ``, `**bold**`, `*emphasis*` and `[links](https://example.com)`.

// ## Weaving
//
// `weave` is a pure function from source text to a list of chunks. Each chunk is
// `{ kind: 'prose' | 'code', text }`. Prose has its `// ` prefix removed.
export function weave(source) {
  const chunks = [];
  let current = null;
  for (const line of source.replace(/\r\n/g, '\n').split('\n')) {
    const prose = /^\/\/ ?(.*)$/.exec(line);
    const blank = line.trim() === '';
    let kind;
    if (prose) kind = 'prose';
    else if (blank) kind = current ? current.kind : 'code';
    else kind = 'code';
    if (!current || current.kind !== kind) {
      current = { kind, lines: [] };
      chunks.push(current);
    }
    current.lines.push(prose ? prose[1] : line);
  }
  return chunks
    .map((c) => ({ kind: c.kind, text: c.lines.join('\n').replace(/^\n+|\s+$/g, '') }))
    .filter((c) => c.text !== '');
}

// ## Escaping
//
// Source text and prose are untrusted as far as HTML is concerned, so everything is escaped before
// it is put into a string of markup.
export function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ## Inline Markdown
//
// Order matters. Code spans are lifted out first so nothing inside them is interpreted, then bold,
// emphasis and links are applied to the remaining text. Links are limited to `http(s)` and relative
// URLs so a prose comment cannot smuggle in a `javascript:` link.
function inline(text) {
  const spans = [];
  let out = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
    spans.push(`<code>${code}</code>`);
    return `\u0000${spans.length - 1}\u0000`;
  });
  out = out
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
      const safe = /^(https?:\/\/|\/|\.\/|\.\.\/|#|[\w-]+\/)/.test(url) && !/^javascript:/i.test(url);
      return safe ? `<a href="${url}">${label}</a>` : label;
    });
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => spans[Number(i)]);
}

// ## Block Markdown
//
// Blocks are separated by blank lines. A block is a heading, a list, or a paragraph.
export function renderMarkdown(text) {
  const html = [];
  for (const block of text.split(/\n\s*\n/)) {
    let lines = block.split('\n');
    const heading = /^(#{1,4}) +(.*)$/.exec(lines[0]);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      lines = lines.slice(1);
      if (lines.length === 0) continue;
    }
    if (/^\s*- /.test(lines[0]) && lines.every((l) => /^\s*- /.test(l) || /^\s{2,}\S/.test(l))) {
      html.push('<ul>' + joinItems(lines, /^\s*- +/).map((i) => `<li>${inline(i)}</li>`).join('') + '</ul>');
    } else if (/^\s*\d+\. /.test(lines[0]) && lines.every((l) => /^\s*\d+\. /.test(l) || /^\s{2,}\S/.test(l))) {
      html.push('<ol>' + joinItems(lines, /^\s*\d+\. +/).map((i) => `<li>${inline(i)}</li>`).join('') + '</ol>');
    } else {
      html.push(`<p>${inline(lines.join(' '))}</p>`);
    }
  }
  return html.join('\n');
}

// Continuation lines (indented) are folded into the item above them.
function joinItems(lines, marker) {
  const items = [];
  for (const line of lines) {
    if (marker.test(line)) items.push(line.replace(marker, ''));
    else items[items.length - 1] += ' ' + line.trim();
  }
  return items;
}

// ## Highlighting
//
// A deliberately small tokenizer: comments, strings, numbers and keywords. It is not a parser, it
// only has to make code pleasant to scan.
const TOKEN =
  /(\/\/.*$)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\b(\d[\d_]*\.?\d*(?:e[+-]?\d+)?)\b|\b(const|let|var|function|return|if|else|for|while|of|in|new|class|extends|export|import|from|default|null|undefined|true|false|this|throw|break|continue|switch|case|typeof|async|await|static)\b/gm;

// F# needs its own rules. A single quote is not a string there (`'a` is a type variable), and the
// keywords differ.
const FSHARP_TOKEN =
  /(\/\/.*$)|("(?:\\.|[^"\\\n])*")|\b(\d[\d_]*\.?\d*(?:e[+-]?\d+)?)\b|\b(let|rec|in|module|namespace|open|type|of|match|with|fun|function|if|then|elif|else|for|to|do|while|mutable|private|inline|true|false|not|and|or|when|yield|new|member|begin|end|try|finally|exception|use|null)\b/gm;

export function highlight(code, lang = 'js') {
  const token = lang === 'fsharp' ? FSHARP_TOKEN : TOKEN;
  let out = '';
  let last = 0;
  for (const m of code.matchAll(token)) {
    out += escapeHtml(code.slice(last, m.index));
    const cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'n' : 'k';
    out += `<span class="${cls}">${escapeHtml(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + escapeHtml(code.slice(last));
}

// ## Rendering a whole document
//
// Prose becomes Markdown, code becomes a highlighted `<pre>`. The first heading is used as the
// page title. `lang` picks the highlighter: `'js'` (the default) or `'fsharp'`.
export function renderDocument(source, lang = 'js') {
  const chunks = weave(source);
  const body = chunks
    .map((c) =>
      c.kind === 'prose'
        ? `<section class="prose">${renderMarkdown(c.text)}</section>`
        : `<pre class="code"><code>${highlight(c.text, lang)}</code></pre>`,
    )
    .join('\n');
  const title = (chunks.find((c) => c.kind === 'prose')?.text.match(/^#\s+(.*)$/m) || [])[1] || 'Source';
  return { title, html: body };
}

// ## Paths we are willing to fetch
//
// The viewer is given a path in the query string. Only plain relative paths to script (JavaScript
// and F#), data and markup files inside this repo are allowed.
export function isSafeSource(path) {
  return /^[\w\-./]+\.(m?js|fs|html|tsv|md|json)$/.test(path) && !path.includes('..') && !path.startsWith('/');
}

// ## Mounting
//
// In the browser, fetch the file named by `?src=` and put the woven document into `root`.
export async function mount(root, src) {
  if (!isSafeSource(src)) {
    root.innerHTML = '<p class="prose">That path is not something the viewer will open.</p>';
    return;
  }
  const response = await fetch(new URL(`../${src}`, import.meta.url));
  if (!response.ok) {
    root.innerHTML = `<p class="prose">Could not load <code>${escapeHtml(src)}</code> (${response.status}).</p>`;
    return;
  }
  const { title, html } = renderDocument(await response.text(), src.endsWith('.fs') ? 'fsharp' : 'js');
  document.title = `${title} · 🗣️ Speaking Head`;
  root.innerHTML = `<p class="src-path">${escapeHtml(src)}</p>${html}`;
}
