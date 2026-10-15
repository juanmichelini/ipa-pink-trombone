// # The place axis
//
// The consonant table has one column for each place the IPA names, but the tract has no columns: a
// narrowing can be made anywhere between the lips and the throat. The axis is the table's columns
// straightened into one line, **lips at the left, throat at the right** (as in the table), with the
// symbols of a lesson marked where they are made. Press anywhere on it and slide: the narrowing glides
// along the tract, and you hear every place between two named ones.
//
// Like the vowel chart it knows nothing about audio. It reports `{ index, symbol }` (where the pointer
// is, and the symbol it is on, if it is close to one) and the demo decides what to do with that.
import { PLACES, OTHER_PLACES } from '../consonants.js';
import { tp } from '../i18n.js';

// The drawing area, in SVG units, and the range of places it covers, from the lips to the throat.
export const AXIS = { x0: 28, x1: 330, y: 96, viewWidth: 400, viewHeight: 190, lips: 43.5, throat: 13.5 };

export const indexToX = (index) => AXIS.x0 + ((AXIS.lips - index) / (AXIS.lips - AXIS.throat)) * (AXIS.x1 - AXIS.x0);
export const xToIndex = (x) => {
  const f = Math.min(1, Math.max(0, (x - AXIS.x0) / (AXIS.x1 - AXIS.x0)));
  return AXIS.lips - f * (AXIS.lips - AXIS.throat);
};

// The place index of a named place, and the named places that have one (the glottis has none).
export const placeIndexOf = (id) => [...PLACES, ...OTHER_PLACES].find((p) => p.id === id)?.index ?? null;
export const namedPlaces = () => PLACES.filter((p) => p.index !== null);

// Symbols at nearly the same place would be drawn on top of each other, so they are stacked: each is
// moved up a row if the one before it is closer than `gap` SVG units.
export function stack(items, gap = 24) {
  const rows = [];
  return [...items].sort((a, b) => b.index - a.index).map((item) => {
    const x = indexToX(item.index);
    let row = 0;
    while (rows[row] !== undefined && Math.abs(x - rows[row]) < gap) row++;
    rows[row] = x;
    return { ...item, x, row };
  });
}

// Which of the named places get a name under the line. Every place has a tick, but the names of places a
// few units apart would be written over each other, so a name is left out if the one before it (counting
// from the lips) is closer than `gap` index units. Only the places the lesson's symbols are made at count.
export function labelled(ids, gap = 3.4) {
  const shown = [];
  for (const p of namedPlaces().filter((q) => ids.includes(q.id))) {
    if (!shown.length || shown[shown.length - 1].index - p.index >= gap) shown.push(p);
  }
  return shown;
}

// The symbol of `items` nearest to a pointer at `x`, if it is within `reach` units.
export function nearestSymbol(items, x, reach = 11) {
  let best = null, bestD = reach;
  for (const item of items) {
    const d = Math.abs(indexToX(item.index) - x);
    if (d < bestD) { best = item; bestD = d; }
  }
  return best;
}

// ## The element
//
// `createPlaceAxis(container, { symbols, places, onPress, onMove, onRelease })`, where `symbols` is a list of
// `{ symbol, index }` and `places` the ids of the places to name under the line. It returns `setCursor(index)` and `highlight(symbol)`.
export function createPlaceAxis(container, { symbols, places = namedPlaces().map((p) => p.id), onPress = () => {}, onMove = () => {}, onRelease = () => {} }) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (name, attrs = {}, text) => {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const svg = el('svg', { viewBox: `0 0 ${AXIS.viewWidth} ${AXIS.viewHeight}`, class: 'place-axis', role: 'img', 'aria-label': 'Places of articulation, from the lips to the throat: press and slide' });

  svg.append(el('line', { x1: AXIS.x0, y1: AXIS.y, x2: AXIS.x1, y2: AXIS.y, class: 'axis-line' }));
  // The named places: a tick and a name slanted below it.
  for (const p of namedPlaces()) {
    svg.append(el('line', { x1: indexToX(p.index), y1: AXIS.y - 4, x2: indexToX(p.index), y2: AXIS.y + 5, class: 'axis-tick' }));
  }
  for (const p of labelled(places)) {
    const x = indexToX(p.index);
    svg.append(el('text', { x, y: AXIS.y + 17, transform: `rotate(40 ${x} ${AXIS.y + 17})`, class: 'chart-caption' }, tp(p.id)));
  }
  const labels = new Map();
  for (const item of stack(symbols)) {
    const y = AXIS.y - 14 - item.row * 26;
    svg.append(el('circle', { cx: item.x, cy: AXIS.y, r: 2.5, class: 'chart-dot' }));
    const label = el('text', { x: item.x, y, 'text-anchor': 'middle', class: 'chart-symbol' }, item.symbol);
    svg.append(label);
    labels.set(item.symbol, label);
  }
  const cursor = el('circle', { cx: -20, cy: AXIS.y, r: 9, class: 'chart-cursor' });
  svg.append(cursor);
  container.append(svg);

  const toX = (event) => {
    const rect = svg.getBoundingClientRect();
    return ((event.clientX - rect.left) / rect.width) * AXIS.viewWidth;
  };
  const interpret = (event) => {
    const x = toX(event);
    const near = nearestSymbol(symbols, x);
    return near ? { index: near.index, symbol: near.symbol } : { index: xToIndex(x), symbol: null };
  };
  let down = false;
  svg.addEventListener('pointerdown', (event) => { down = true; svg.setPointerCapture(event.pointerId); onPress(interpret(event)); event.preventDefault(); });
  svg.addEventListener('pointermove', (event) => { if (down) onMove(interpret(event)); });
  const up = () => { if (down) { down = false; onRelease(); } };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);

  return {
    svg,
    setCursor(index) { cursor.setAttribute('cx', indexToX(index)); },
    highlight(symbol) { for (const [s, label] of labels) label.classList.toggle('active', s === symbol); },
  };
}
