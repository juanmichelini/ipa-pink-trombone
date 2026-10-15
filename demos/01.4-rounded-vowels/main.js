// # Lesson 1.4: Rounded vowels
//
// A step on the way to Demo 1. The whole instrument is `lib/ui/vowel-lesson.js`; this page only says what is
// left free: the tongue in both directions, height included, with the lips held rounded.
import { startVowelLesson } from '../../lib/ui/vowel-lesson.js';

startVowelLesson({
  visible: (v) => v.rounded,
  lockHeight: null,
  lockRounded: 1,
});
