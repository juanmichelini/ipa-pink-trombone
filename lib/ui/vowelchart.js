// # The vowel chart as an instrument
//
// An SVG IPA vowel trapezoid you can drag across. Press anywhere: the pointer's position is turned
// into `(b, h)`, backness and height, and handed to a callback. Press close to a symbol and it
// snaps to that exact vowel, rounding included.
//
// As in the printed chart, a rounded vowel sits to the right of its unrounded partner at the same
// point. The dot is the tongue position, the symbol beside it shows the lips.
import { VOWELS, chartPosition, fromChart } from '../vowels.js';

// The chart's drawing area, in SVG units (the viewBox is 400 by 290).
export const CHART = { x0: 52, y0: 26, w: 296, h: 220, viewWidth: 400, viewHeight: 290 };

export function toPixels(x, y) {
  return { px: CHART.x0 + x * CHART.w, py: CHART.y0 + y * CHART.h };
}

export function fromPixels(px, py) {
  return { x: (px - CHART.x0) / CHART.w, y: (py - CHART.y0) / CHART.h };
}

// Where a vowel's symbol is drawn: beside its dot, to the left if unrounded and to the right if
// rounded, as on the printed chart.
export function symbolPlacement(vowel) {
  const { x, y } = chartPosition(vowel.b, vowel.h);
  const { px, py } = toPixels(x, y);
  return { px, py, textX: px + (vowel.rounded ? 11 : -11), anchor: vowel.rounded ? 'start' : 'end' };
}

// ## Hit testing
//
// The vowel whose symbol is nearest to a pointer position (in SVG units), if it is within
// `reach` units.
export function nearestVowel(px, py, reach = 15) {
  let best = null, bestD = reach;
  for (const v of VOWELS) {
    const p = symbolPlacement(v);
    const d = Math.min(Math.hypot(p.textX - px, p.py - py), Math.hypot(p.px - px, p.py - py));
    if (d < bestD) { best = v; bestD = d; }
  }
  return best;
}

// What a pointer at `(px, py)` means: a vowel (snapped), or a free `(b, h)` position.
export function interpret(px, py) {
  const snapped = nearestVowel(px, py);
  if (snapped) return { b: snapped.b, h: snapped.h, symbol: snapped.symbol, rounded: snapped.rounded ? 1 : 0, snapped: true };
  const { x, y } = fromPixels(px, py);
  const { b, h } = fromChart(x, y);
  return { b, h, symbol: null, rounded: null, snapped: false };
}

// ## The element
//
// `createVowelChart(container, handlers)` builds the SVG. Handlers:
//
// - `onPress(position)` and `onMove(position)` while the pointer is down
// - `onRelease()` when it lifts
//
// It returns `setCursor(b, h)` to place the cursor from the outside (for example while a score plays)
// and `svg`.
export function createVowelChart(container, { onPress = () => {}, onMove = () => {}, onRelease = () => {} } = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (name, attrs = {}, text) => {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const svg = el('svg', { viewBox: `0 0 ${CHART.viewWidth} ${CHART.viewHeight}`, class: 'vowel-chart', role: 'img', 'aria-label': 'IPA vowel chart: drag to move the tongue' });

  const corner = (x, y) => toPixels(x, y);
  const A = corner(0, 0), B = corner(1, 0), C = corner(1, 1), D = corner(0.5, 1);
  svg.append(el('polygon', { points: `${A.px},${A.py} ${B.px},${B.py} ${C.px},${C.py} ${D.px},${D.py}`, class: 'chart-outline' }));
  for (const h of [1 / 3, 2 / 3]) {
    const l = chartPosition(0, h), r = chartPosition(1, h);
    const p = toPixels(l.x, l.y), q = toPixels(r.x, r.y);
    svg.append(el('line', { x1: p.px, y1: p.py, x2: q.px, y2: q.py, class: 'chart-grid' }));
  }
  const top = toPixels(0.5, 0), bottom = toPixels(0.75, 1);
  svg.append(el('line', { x1: top.px, y1: top.py, x2: bottom.px, y2: bottom.py, class: 'chart-grid' }));
  const caption = (x, y, text, anchor = 'middle') => svg.append(el('text', { x, y, 'text-anchor': anchor, class: 'chart-caption' }, text));
  caption(A.px, A.py - 8, 'front', 'start');
  caption(B.px, B.py - 8, 'back', 'end');
  caption(CHART.x0 - 10, A.py + 4, 'close', 'end');
  caption(CHART.x0 - 10, C.py + 4, 'open', 'end');

  const labels = new Map();
  for (const v of VOWELS) {
    const p = symbolPlacement(v);
    svg.append(el('circle', { cx: p.px, cy: p.py, r: 2.5, class: 'chart-dot' }));
    const label = el('text', { x: p.textX, y: p.py + 6, 'text-anchor': p.anchor, class: 'chart-symbol' }, v.symbol);
    const title = el('title', {}, v.name);
    label.append(title);
    svg.append(label);
    labels.set(v.symbol, label);
  }
  const cursor = el('circle', { cx: -20, cy: -20, r: 9, class: 'chart-cursor' });
  svg.append(cursor);
  container.append(svg);

  const toSvg = (event) => {
    const rect = svg.getBoundingClientRect();
    return {
      px: ((event.clientX - rect.left) / rect.width) * CHART.viewWidth,
      py: ((event.clientY - rect.top) / rect.height) * CHART.viewHeight,
    };
  };
  let down = false;
  svg.addEventListener('pointerdown', (event) => {
    down = true;
    svg.setPointerCapture(event.pointerId);
    const { px, py } = toSvg(event);
    onPress(interpret(px, py));
    event.preventDefault();
  });
  svg.addEventListener('pointermove', (event) => {
    if (!down) return;
    const { px, py } = toSvg(event);
    onMove(interpret(px, py));
  });
  const up = () => { if (down) { down = false; onRelease(); } };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);

  return {
    svg,
    setCursor(b, h) {
      const { x, y } = chartPosition(b, h);
      const { px, py } = toPixels(x, y);
      cursor.setAttribute('cx', px); cursor.setAttribute('cy', py);
    },
    highlight(symbol) {
      for (const [s, label] of labels) label.classList.toggle('active', s === symbol);
    },
  };
}
