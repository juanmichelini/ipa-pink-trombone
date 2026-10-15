// # Lesson 1.1: Front to back
//
// A step on the way to Demo 1. The whole instrument is `lib/ui/vowel-lesson.js`; this page only says what is
// left free: the tongue front to back, at one height, with the lips held spread.
import { startVowelLesson } from '../../lib/ui/vowel-lesson.js';

startVowelLesson({
  visible: (v) => v.h === 0 && !v.rounded,
  lockHeight: 0,
  lockRounded: 0,
});
