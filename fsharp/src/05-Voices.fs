// # Voices
//
// The same IPA can be said by a bass, a child or a soprano. Three physical things change between
// them, and all three are already inputs to the engine:
//
// 1. **Tract length.** A longer tube resonates lower, so every formant moves down together. This
//    is why a child saying the same vowel as a man sounds different even at the same pitch. The
//    engine takes the length in centimetres.
// 2. **Pitch.** How fast the vocal folds vibrate: about 100 Hz for an adult man, 200 Hz for a
//    woman, 300 Hz or more for a child.
// 3. **Source quality.** How tightly the folds close (`Tenseness`), how steadily they vibrate
//    (`Jitter`, `VibratoDepth`), and how much breath leaks through.
//
// A **voice** is a named choice of those numbers. Nothing in a voice knows about language or IPA.
// It is a layer you can put on top of anything that makes a score, and in this file it is a
// record and two small functions.
module IpaTrombone.Voices

open IpaTrombone.TongueSpace
open IpaTrombone.Score
open IpaTrombone.Planner

// The tract length the engine is built for, glottis to lips, in centimetres.
let defaultTractCm : float = 17.1

// ## What a voice is
type Voice =
    { Id: string
      Label: string
      TractCm: float
      F0: float
      Tenseness: float
      VibratoDepth: float
      VibratoRate: float
      Jitter: float
      Range: float // how much the pitch moves around F0
      Declination: float
      Whisper: bool }

// A voice with the usual values for the numbers a preset does not bother to say.
let private voice id label tractCm f0 tenseness vibratoDepth jitter range : Voice =
    { Id = id
      Label = label
      TractCm = tractCm
      F0 = f0
      Tenseness = tenseness
      VibratoDepth = vibratoDepth
      VibratoRate = 5.5
      Jitter = jitter
      Range = range
      Declination = 0.08
      Whisper = false }

// ## The presets
//
// Tract lengths are textbook values for the vocal tract from glottis to lips. `F0` is a typical
// speaking pitch; `Range` says how much a speaker moves around it.
let voices : Voice list =
    [
        voice "bass" "Bass" 19.0 85.0 0.7 0.006 0.01 0.8
        voice "man" "Man" 17.5 115.0 0.6 0.0 0.008 1.0
        voice "tenor" "Tenor" 16.5 175.0 0.75 0.02 0.004 1.2
        voice "woman" "Woman" 14.8 205.0 0.55 0.0 0.008 1.1
        { (voice "soprano" "Soprano" 14.2 440.0 0.8 0.03 0.002 1.3) with VibratoRate = 5.8 }
        voice "child" "Child (6 y)" 11.5 285.0 0.55 0.0 0.012 1.6
        voice "toddler" "Toddler" 9.5 380.0 0.5 0.0 0.016 1.8
        { (voice "elder" "Elder" 16.5 125.0 0.35 0.012 0.03 0.7) with VibratoRate = 4.5 }
        { (voice "whisper" "Whisper" 16.0 130.0 0.3 0.0 0.0 0.0) with Whisper = true }
        { (voice "robot" "Robot" 17.0 110.0 0.9 0.0 0.0 0.0) with Declination = 0.0 }
        voice "giant" "Giant" 26.0 60.0 0.6 0.004 0.02 0.6
    ]

let voiceById (id: string) : Voice option =
    voices |> List.tryFind (fun v -> v.Id = id)

// ## Whispering
//
// Whispered speech has no vibrating folds at all, only breath through the tract. Turn the voicing
// into breath: wherever the voice would be, aspiration noise takes its place. Breath is much
// quieter than voice for the same effort, so it is turned up to three times the nominal maximum
// (the engine allows up to 4 for exactly this).
let whisperScore (score: Score) : Score =
    { score with
        Keyframes =
            score.Keyframes
            |> List.map (fun k ->
                { k with
                    Frame =
                        { k.Frame with
                            Aspiration = min 4.0 (k.Frame.Aspiration + 3.0 * k.Frame.Intensity)
                            Intensity = 0.0 } }) }

// ## Speaking with a voice
//
// Returns what the planner returns, plus `TractCm`, which must be given to whatever plays or
// renders the score: the shape of the tract is in the score, but its length is a property of the
// speaker. To change one number of a preset, change the record: `{ voice with F0 = 180.0 }`.
type Speech =
    { Plan: Plan
      TractCm: float
      Voice: Voice }

let speak (voice: Voice) (ipa: string) : Speech =
    let options =
        { defaultPlanOptions with
            F0 = voice.F0
            Tenseness = voice.Tenseness
            VibratoDepth = voice.VibratoDepth
            VibratoRate = voice.VibratoRate
            Jitter = voice.Jitter
            Range = voice.Range
            Declination = voice.Declination }
    let planned = plan options ipa
    let score = if voice.Whisper then whisperScore planned.Score else planned.Score
    { Plan = { planned with Score = score }
      TractCm = voice.TractCm
      Voice = voice }

// ## How much the formants move
//
// Relative to the reference adult tract, as a ratio. A 14.2 cm tract is about 1.2 times as
// high-pitched in every resonance as the 17.1 cm reference.
let formantScale (tractCm: float) : float = defaultTractCm / tractCm

// And in lesson 1's terms: the formants a vowel would have in a tract of this length. The
// vowel table is for the reference tract, so a child's `a` is the table's `a` with both formants
// raised by the ratio.
let inTract (tractCm: float) (formants: Formants) : Formants =
    let k = formantScale tractCm
    { F1 = formants.F1 * k; F2 = formants.F2 * k }
