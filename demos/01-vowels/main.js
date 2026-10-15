// # Demo 1: Vowels
//
// The first experiment, and the simplest claim: **the IPA vowel chart is a map of where the tongue
// goes**, so dragging across it should move a vocal tract the way a real tongue moves. This is the
// whole chart, with everything free. The steps before it (1.1 to 1.4) take one dimension at a time.
// The instrument itself is in `lib/ui/vowel-lesson.js`.
import { startVowelLesson } from '../../lib/ui/vowel-lesson.js';

startVowelLesson();
