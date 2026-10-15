// # Lesson 2.9: Affricates
//
// A step on the way to Demo 2. The whole instrument is `lib/ui/consonant-lesson.js`; this page only says which
// slice of the table to take, and the place is left free along the line.
import { slice, startConsonantLesson } from '../../lib/ui/consonant-lesson.js';

startConsonantLesson({
  carrier: 'a',
  variants: [slice('affricate', false), slice('affricate', true)],
});
