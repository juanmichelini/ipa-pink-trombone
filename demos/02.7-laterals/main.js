// # Lesson 2.7: Laterals
//
// A step on the way to Demo 2. The whole instrument is `lib/ui/consonant-lesson.js`; this page only says which
// slice of the table to take, and the place is left free along the line.
import { slice, startConsonantLesson } from '../../lib/ui/consonant-lesson.js';

startConsonantLesson({
  variants: [slice('lateral approximant', true), slice('lateral fricative', false), slice('lateral fricative', true)],
});
