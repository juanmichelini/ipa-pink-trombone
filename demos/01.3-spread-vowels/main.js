// # Lesson 1.3: Spread vowels
//
// A step on the way to Demo 1. The whole instrument is `lib/ui/vowel-lesson.js`; this page only says what is
// left free: the tongue in both directions, height included, with the lips held spread.
import { startVowelLesson } from '../../lib/ui/vowel-lesson.js';

startVowelLesson({
  visible: (v) => !v.rounded,
  lockHeight: null,
  lockRounded: 0,
});
