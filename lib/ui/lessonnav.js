// # Lesson navigation
//
// The experiments are a ladder, so every demo page ends with buttons to the previous and next rung.
// The list comes from `lib/demos.js`, the same registry the landing page reads, so a new demo gets
// its buttons by being added there.
//
// A demo page includes this file with one script tag and does nothing else. When loaded in a
// browser it works out which demo it is on from the address and adds the navigation to the page.
import { demos } from '../demos.js';

// The live demo before and after `slug`, in order. Planned demos have no page to go to, so they are
// skipped; either end of the ladder gives `null`.
export function neighbours(slug, list = demos) {
  const live = list.filter((d) => d.status === 'live');
  const i = live.findIndex((d) => d.slug === slug);
  if (i < 0) return { previous: null, next: null, position: 0, total: live.length };
  return { previous: live[i - 1] || null, next: live[i + 1] || null, position: i + 1, total: live.length };
}

// The demo slug in a path like `/demos/03-together/` or `/demos/03-together/index.html`.
export function slugFromPath(path) {
  const m = path.match(/\/demos\/([^/]+)\//);
  return m ? m[1] : null;
}

const link = (d, label, cls) => `<a class="lesson ${cls}" href="/demos/${d.slug}/" rel="${cls}">${label}<strong>${d.n}. ${d.title}</strong></a>`;

// The navigation as HTML: previous on the left, a link to all lessons in the middle, next on the
// right. An empty space holds the place of a missing end so the buttons do not jump around.
export function lessonNavHtml(slug, list = demos) {
  const { previous, next, position, total } = neighbours(slug, list);
  if (!position) return '';
  return `<nav class="lessons" aria-label="Lessons">
    ${previous ? link(previous, '← Previous ', 'prev') : '<span></span>'}
    <a class="lesson all" href="/">All lessons · ${position} of ${total}</a>
    ${next ? link(next, 'Next → ', 'next') : '<span></span>'}
  </nav>`;
}

if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  const slug = slugFromPath(location.pathname);
  if (slug) document.body.insertAdjacentHTML('beforeend', lessonNavHtml(slug));
}
