// # The consonant table
//
// The IPA pulmonic chart as an HTML table: columns are places (lips at the left, throat at the
// right), rows are manners. A cell with two symbols holds the voiceless one first and the voiced one
// second, the same convention the printed chart uses. Cells with no sound are left blank.
//
// The table knows nothing about audio. It builds buttons and reports which symbol was pressed and
// released; the demo decides what to do with that.
import { CONSONANTS, PLACES, MANNERS } from '../consonants.js';

// The columns of the printed chart: some places are merged into one column of the picture because
// the chart does not distinguish them.
export function tableColumns() {
  return PLACES.map((p) => p.id);
}

// Which symbols live at (manner, place), voiceless first.
export function cellSymbols(manner, place) {
  return CONSONANTS
    .filter((c) => c.manner === manner && c.place === place)
    .sort((a, b) => Number(a.voiced) - Number(b.voiced))
    .map((c) => c.symbol);
}

// Everything in the inventory that is not in the main grid (the affricates and the
// double-articulated and alveolo-palatal sounds) goes in a short list under it.
export function extraSymbols() {
  const grid = new Set(PLACES.map((p) => p.id));
  return CONSONANTS.filter((c) => c.manner === 'affricate' || !grid.has(c.place)).map((c) => c.symbol);
}

function makeButton(symbol, { onPress, onRelease }) {
  const b = document.createElement('button');
  b.className = 'ipa-cell';
  b.textContent = symbol;
  b.dataset.symbol = symbol;
  let down = false;
  const press = () => { if (down) return; down = true; b.classList.add('active'); onPress(symbol); };
  const release = () => { if (!down) return; down = false; b.classList.remove('active'); onRelease(symbol); };
  b.addEventListener('pointerdown', press);
  b.addEventListener('pointerup', release);
  b.addEventListener('pointerleave', release);
  b.addEventListener('pointercancel', release);
  b.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(); } });
  b.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') release(); });
  return b;
}

export function createConsonantTable(container, handlers) {
  const table = document.createElement('table');
  table.className = 'ipa-table';
  const head = table.createTHead().insertRow();
  head.append(document.createElement('th'));
  for (const place of tableColumns()) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = place;
    head.append(th);
  }
  const body = table.createTBody();
  const rowManners = MANNERS.filter((m) => PLACES.some((p) => cellSymbols(m, p.id).length));
  for (const manner of rowManners) {
    const row = body.insertRow();
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = manner;
    row.append(th);
    for (const place of tableColumns()) {
      const cell = row.insertCell();
      for (const s of cellSymbols(manner, place)) cell.append(makeButton(s, handlers));
    }
  }
  container.append(table);
  const extras = document.createElement('div');
  extras.className = 'vowel-buttons';
  for (const s of extraSymbols()) extras.append(makeButton(s, handlers));
  container.append(extras);
  return {
    highlight(symbol) {
      for (const b of container.querySelectorAll('.ipa-cell')) b.classList.toggle('playing', b.dataset.symbol === symbol);
    },
  };
}
