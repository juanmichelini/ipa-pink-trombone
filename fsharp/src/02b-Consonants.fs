// # Lesson 2, part 2: consonants (in F#)
//
// A vowel is a *position*. A steady consonant is a position too: a constriction made somewhere in
// the mouth (its place), as narrow as it is (its degree), with or without the voice and the nose.
// Those are continuous: any place and any degree make a sound and a picture, and the IPA symbols are
// only named points in that space. What a position cannot hold is *time*: a stop is a closure and a
// burst, a tap a flick, a trill a flutter. Those are gestures, paths through the space. The IPA
// consonant chart is organised by exactly these ideas, and this lesson turns each into a type:
//
// - **Place** (the columns): where the tract is narrowed, lips at the front to the glottis at the back
// - **Manner** (the rows): how. A *plosive* closes completely and bursts open; a *fricative* leaves a
//   gap that hisses; a *nasal* closes the mouth but opens the nose; an *approximant* narrows without
//   hissing; a *trill* flutters; a *tap* is one very quick closure; a *lateral* lets air round the
//   sides of the tongue
// - **Voicing**: whether the vocal folds buzz
//
// Lesson 1 had `toSound` and `fromSound`. The consonant versions are:
//
// - `gesture : Consonant -> Gesture` makes the movement (a score from lesson 2 part 1)
// - `identify : Frame -> Consonant * float` looks at a held mouth shape and says which consonant it is
//   (or which of the consonants that share that exact shape: see `synonyms`)
//
// It is the same idea as `lib/consonants.js`, rewritten so that the compiler checks it. Add a place
// or a manner and every `match` that forgot it stops compiling.
module IpaTrombone.Consonants

open IpaTrombone.Score

// ## Place and manner
//
// Two *discriminated unions*: a value is exactly one of the listed cases, and nothing else. A
// misspelt place is not a bug waiting for a test, it is a compile error.
//
// Three places are not on the main chart but sounds need them: a sound made at two places at once
// (`w` is lips and back of the tongue) or between two (`ɕ`).
type Place =
    | Bilabial
    | Labiodental
    | Dental
    | Alveolar
    | Postalveolar
    | Retroflex
    | Palatal
    | Velar
    | Uvular
    | Pharyngeal
    | Glottal
    | AlveoloPalatal
    | LabialVelar
    | LabialPalatal

type Manner =
    | Plosive
    | Nasal
    | Trill
    | Tap
    | Fricative
    | LateralFricative
    | Approximant
    | LateralApproximant
    | Affricate

// A consonant: its IPA symbol, where, how, and whether the voice is on.
type Consonant =
    { Symbol: string
      Place: Place
      Manner: Manner
      Voiced: bool }

// ## The inventory
//
// The pulmonic consonants of the IPA chart (sounds made with air from the lungs), a handful of
// "other symbols" later lessons need (`w`, `ɥ`, `ʍ`, `ɕ`, `ʑ`) and the affricates, which are a stop
// released into a fricative at the same or a nearby place. Copied from `lib/consonants.js`, in the
// same order. A voiceless and a voiced symbol share a chart cell: `p b`, `t d`.
let private row symbol place manner voiced : Consonant =
    { Symbol = symbol
      Place = place
      Manner = manner
      Voiced = voiced }

let consonants : Consonant list =
    [
        row "p" Bilabial Plosive false
        row "b" Bilabial Plosive true
        row "t" Alveolar Plosive false
        row "d" Alveolar Plosive true
        row "ʈ" Retroflex Plosive false
        row "ɖ" Retroflex Plosive true
        row "c" Palatal Plosive false
        row "ɟ" Palatal Plosive true
        row "k" Velar Plosive false
        row "ɡ" Velar Plosive true
        row "q" Uvular Plosive false
        row "ɢ" Uvular Plosive true
        row "ʔ" Glottal Plosive false
        row "m" Bilabial Nasal true
        row "ɱ" Labiodental Nasal true
        row "n" Alveolar Nasal true
        row "ɳ" Retroflex Nasal true
        row "ɲ" Palatal Nasal true
        row "ŋ" Velar Nasal true
        row "ɴ" Uvular Nasal true
        row "ʙ" Bilabial Trill true
        row "r" Alveolar Trill true
        row "ʀ" Uvular Trill true
        row "ⱱ" Labiodental Tap true
        row "ɾ" Alveolar Tap true
        row "ɽ" Retroflex Tap true
        row "ɸ" Bilabial Fricative false
        row "β" Bilabial Fricative true
        row "f" Labiodental Fricative false
        row "v" Labiodental Fricative true
        row "θ" Dental Fricative false
        row "ð" Dental Fricative true
        row "s" Alveolar Fricative false
        row "z" Alveolar Fricative true
        row "ʃ" Postalveolar Fricative false
        row "ʒ" Postalveolar Fricative true
        row "ʂ" Retroflex Fricative false
        row "ʐ" Retroflex Fricative true
        row "ç" Palatal Fricative false
        row "ʝ" Palatal Fricative true
        row "x" Velar Fricative false
        row "ɣ" Velar Fricative true
        row "χ" Uvular Fricative false
        row "ʁ" Uvular Fricative true
        row "ħ" Pharyngeal Fricative false
        row "ʕ" Pharyngeal Fricative true
        row "h" Glottal Fricative false
        row "ɦ" Glottal Fricative true
        row "ɬ" Alveolar LateralFricative false
        row "ɮ" Alveolar LateralFricative true
        row "ʋ" Labiodental Approximant true
        row "ɹ" Alveolar Approximant true
        row "ɻ" Retroflex Approximant true
        row "j" Palatal Approximant true
        row "ɰ" Velar Approximant true
        row "l" Alveolar LateralApproximant true
        row "ɭ" Retroflex LateralApproximant true
        row "ʎ" Palatal LateralApproximant true
        row "ʟ" Velar LateralApproximant true
        row "w" LabialVelar Approximant true
        row "ɥ" LabialPalatal Approximant true
        row "ʍ" LabialVelar Fricative false
        row "ɕ" AlveoloPalatal Fricative false
        row "ʑ" AlveoloPalatal Fricative true
        row "t͡s" Alveolar Affricate false
        row "d͡z" Alveolar Affricate true
        row "t͡ʃ" Postalveolar Affricate false
        row "d͡ʒ" Postalveolar Affricate true
        row "p͡f" Labiodental Affricate false
        row "b͡v" Labiodental Affricate true
        row "ʈ͡ʂ" Retroflex Affricate false
        row "ɖ͡ʐ" Retroflex Affricate true
        row "t͡ɕ" AlveoloPalatal Affricate false
        row "d͡ʑ" AlveoloPalatal Affricate true
    ]

let bySymbol (symbol: string) : Consonant option =
    consonants |> List.tryFind (fun c -> c.Symbol = symbol)

// ## Place becomes a position
//
// The engine measures the tract in index units: 0 at the glottis, 44 at the lips, one unit about
// 0.39 cm. An articulator some distance from the lips has the index `44 - distance / 0.39`. The
// distances are textbook figures for an adult: the alveolar ridge is about 2 cm behind the lips (just
// behind the upper teeth), the palate 5.5, the soft palate 7.5, the uvula 9.5, the throat wall 12.
// From index 41 on, the articulator that closes is the lower lip; before that it is the tongue (the
// engine, lesson 9, keeps the two apart).
//
// The glottis is not *in* the mouth, so it has no index. `None` says so, and the compiler makes
// every caller deal with it.
let placeIndex (place: Place) : float option =
    match place with
    | Bilabial -> Some 43.5
    | Labiodental -> Some 42.0
    | Dental -> Some 40.0
    | Alveolar -> Some 39.0
    | Postalveolar -> Some 36.5
    | Retroflex -> Some 34.5
    | Palatal -> Some 29.5
    | Velar -> Some 24.5
    | Uvular -> Some 19.5
    | Pharyngeal -> Some 13.5
    | Glottal -> None
    | AlveoloPalatal -> Some 30.5
    | LabialVelar -> Some 43.5
    | LabialPalatal -> Some 43.5

// ## How each sound is made
//
// Most of what separates consonants of the same manner is a handful of numbers. A constriction is
// a position, a gap and an amount of hiss; a spec is up to two constrictions and the centre
// frequency of the hiss.
type private Constriction = { Index: float; Diameter: float; Noise: float }

type private Spec =
    { C0: Constriction option
      C1: Constriction option
      Hz: float }

// ## The space a consonant lives in
//
// A steady consonant is a point in a small continuous space, and the IPA symbols are only named
// points in it, as the vowel symbols are named points on the vowel chart.
//
// - **place**: where along the tract it is made, any index from the throat (13) to the lips (43.5)
// - **degree**: how narrow it is, any gap from 0 (shut) through about 0.4 (a hiss) and 0.5 to 1
//   (a narrowing that only colours a vowel) up to 3 (open: no consonant at all)
// - **nasal**: how open the nose is
// - **voicing**: how much the voice is on
//
// Place and degree are the two dials; they are the `C0i` and `C0d` of a frame. What they do *not* get
// is a hiss setting of their own. How loud the hiss is and where its pitch sits fall out of the
// place, because they are properties of the tube in front of the gap:
//
// - the **pitch** follows the cavity between the gap and the lips. The shorter that cavity, the higher
//   it resonates: `s` (just behind the teeth) is high, `ʃ` lower, `x` and the throat sounds low. A gap
//   at the lips has no cavity at all, so the hiss there is low and broad.
// - the **loudness** follows how well the place can make a jet of air hit something: the tongue tip
//   and blade behind the teeth do it best, the lips and the back of the mouth less so.
//
// Both are smooth curves of the place, so sliding the place slides the hiss with it.
let private curve (points: (float * float) list) (x: float) : float =
    let (x0, y0) = List.head points
    if x <= x0 then
        y0
    else
        match points |> List.pairwise |> List.tryFind (fun (_, (x1, _)) -> x <= x1) with
        | Some ((xa, ya), (xb, yb)) -> ya + ((yb - ya) * (x - xa)) / (xb - xa)
        | None -> snd (List.last points)

// Centre frequency of the hiss, in Hz, for a gap at `index`.
let hissPitch (index: float) : float =
    curve
        [ (13.5, 900.0); (19.5, 1200.0); (24.5, 1800.0); (29.5, 2200.0); (34.5, 1800.0); (36.5, 2700.0)
          (39.0, 7600.0); (40.0, 2800.0); (42.0, 3800.0); (43.5, 2000.0) ]
        index

// How strongly a gap at `index` hisses. The sibilants (the tongue tip and blade just behind the teeth,
// from the postalveolar region to the alveolar ridge) are the loud ones. Everywhere else the jet has
// nothing good to hit and the hiss is 10 to 25 dB quieter (measured against recordings, see
// `scripts/compare-consonants.mjs`): the lips and the throat least, the teeth in between. The
// labiodental gap is wide open at the lips, so the hiss that gets out needs more push.
let hissLevel (index: float) : float =
    curve
        [ (13.5, 0.22); (19.5, 0.2); (24.5, 0.15); (29.5, 0.48); (33.0, 4.0); (37.0, 4.0); (39.0, 1.7)
          (40.0, 0.5); (42.0, 5.4); (43.5, 1.4) ]
        index

// The degrees that the symbols use, as named points on the degree dial.
let degreeFricative = 0.42
let degreeLateral = 0.32

// A consonant of a place and a degree, as the constriction the engine takes. This is the whole of the
// mapping from the space to a frame: nothing here depends on which symbol it is.
/// Voicing is one dial for every consonant. What it can reach depends on the gap, never on the symbol:
/// a gap narrow enough to hiss shares the airstream with the voice, so the voice sits well under the
/// hiss, like the quiet murmur under a real `z`; a gap that is closed or only just open (a nasal, a
/// glide, a lateral) lets the voice out about 15 dB quieter than a vowel does; a gap of 1.5 or more
/// is a vowel and the voice is full. `voiceGain hiss gap` is the most voice a consonant with that
/// much hiss and that gap can have.
let voiceGain (hiss: float) (gap: float) : float =
    if hiss > 0.0 then 0.12 else curve [ (0.9, 0.15); (1.5, 1.0) ] gap

let private constriction (index: float) (gap: float) : Constriction =
    { Index = index; Diameter = gap; Noise = (if gap < 0.6 then hissLevel index else 0.0) }

// **Approximants.** A narrowing too wide to hiss, which changes the vowel-like resonances. `j` is a
// palatal narrowing, `w` rounds the lips and raises the back of the tongue, `ɹ` (the English r)
// has two narrowings, one near the front and one in the throat. A narrowing is at a named place or
// at a raw position.
type private Where =
    | AtPlace of Place
    | AtIndex of float

let private approximants : Map<string, (Where * float) * (Where * float) option> =
    Map.ofList
        [ ("ʋ", ((AtPlace Labiodental, 0.6), None))
          ("ɹ", ((AtIndex 33.0, 0.75), Some(AtIndex 14.5, 1.0)))
          ("ɻ", ((AtPlace Retroflex, 0.75), Some(AtIndex 14.5, 1.0)))
          ("j", ((AtPlace Palatal, 0.55), None))
          ("ɰ", ((AtPlace Velar, 0.85), None))
          ("w", ((AtPlace LabialVelar, 0.5), Some(AtIndex 24.5, 0.9)))
          ("ɥ", ((AtPlace LabialPalatal, 0.5), Some(AtIndex 29.5, 0.7))) ]

// **Laterals.** A tube has no sides, so the midline is narrowed instead, to 0.32: tight enough to
// dominate the sound. Lateral fricatives hiss at the fricative degree (0.42), a unit further back than `s`.
let private lateralGap = degreeLateral

// A lateral fricative lets the air out round the sides of the tongue, not over a jet, so it hisses
// far less than a sibilant: about 12 dB in the recordings.
let private lateralHiss = 0.25

// Place and manner become the numbers each family of gesture needs. Every manner is listed, so
// adding one to the type makes this function stop compiling until it is dealt with.
let private specOf (c: Consonant) : Spec =
    let position = placeIndex c.Place
    let resting = 30.0
    match c.Manner with
    | Fricative
    | Affricate ->
        // The glottis has no place in the mouth; its fricatives are breath, set up separately.
        (match position with
         | None -> { C0 = None; C1 = None; Hz = 1000.0 }
         | Some index -> { C0 = Some (constriction index degreeFricative); C1 = None; Hz = hissPitch index })
    | LateralFricative ->
        // A tube has no sides, so the air is made to escape "round the side" by putting the gap a little
        // behind where the tongue tip is: that is the whole of the model's `ɬ`.
        let index = Option.defaultValue resting position - 1.0
        let k = constriction index degreeFricative
        { C0 = Some { k with Noise = k.Noise * lateralHiss }; C1 = None; Hz = hissPitch index }
    | LateralApproximant ->
        { C0 = Some { Index = Option.defaultValue resting position; Diameter = lateralGap; Noise = 0.0 }
          C1 = None
          Hz = 1000.0 }
    | Approximant ->
        let resolve ((where, gap): Where * float) : Constriction =
            let index =
                match where with
                | AtPlace p -> placeIndex p |> Option.defaultValue resting
                | AtIndex i -> i
            { Index = index; Diameter = gap; Noise = 0.0 }
        match Map.tryFind c.Symbol approximants with
        | Some (first, second) -> { C0 = Some (resolve first); C1 = Option.map resolve second; Hz = 1000.0 }
        | None -> { C0 = None; C1 = None; Hz = 1000.0 }
    | Trill
    | Tap
    | Nasal
    | Plosive ->
        { C0 = position |> Option.map (fun i -> { Index = i; Diameter = 0.0; Noise = 0.0 })
          C1 = None
          Hz = (match position with Some i -> hissPitch i | None -> 1000.0) }

// ## Moving into and out of a constriction
//
// A tube's formants only move once its gap is small, so a gap that shrinks in equal steps of width does
// nearly all of its acoustic moving in the last few milliseconds: the sound drops out in a click. The
// recordings glide for 50 ms or more on either side of a consonant. So `glide` takes the gap
// *geometrically* (the same ratio every step), and everything else in a straight line, which spreads the
// movement over the whole transition. It adds a few keyframes between the last one and `t`.
let private glideSteps = 4
let private gapFloor = 0.02

let private glide (t: float) (change: Change) (timeline: Timeline) : Timeline =
    let from = timeline.Current
    let target = change from
    let last = (List.head timeline.Keys).T
    let gap (a: float) (b: float) (u: float) : float =
        if a = b then a else (max a gapFloor) * ((max b gapFloor / max a gapFloor) ** u)
    let stepped =
        [ 1 .. glideSteps - 1 ]
        |> List.fold
            (fun (tl: Timeline) i ->
                let u = float i / float glideSteps
                tl
                |> Timeline.at (last + (t - last) * u) (fun _ ->
                    { blend u from target with
                        C0d = gap from.C0d target.C0d u
                        C1d = gap from.C1d target.C1d u }))
            timeline
    stepped |> Timeline.at t (fun _ -> target)

// ## Timings
//
// In seconds; about right for careful speech.
module private Timing =
    let leadCarrier = 0.1 // carrier vowel before the consonant
    let leadNone = 0.03
    let leadAlone = 0.04 // voice before a tap pressed on its own
    let afterAlone = 0.04
    let close = 0.05 // articulators moving into position
    let opening = 0.05 // and out again
    let stopHold = 0.12 // closure of a stop
    let fricativeHold = 0.24
    let nasalHold = 0.22
    let approximantHold = 0.16
    let trillHold = 0.3
    let tapClosure = 0.018
    let burst = 0.014
    let fricationStop = 0.04 // how long the gap of a voiceless stop stays narrow enough to hiss after the release
    let votPlain = 0.025 // voice onset time of a plain voiceless stop
    let votAspirated = 0.07
    let affricateFrication = 0.1
    let afterCarrier = 0.16
    let afterNone = 0.03 // after a stop with no carrier: nothing but the end of the release

// ## Carriers
//
// A consonant is heard next to a vowel, so a gesture can be made *around* one: the **carrier**. A
// carrier is a `Change`, a function that sets the tongue and lips of a frame, so it composes with
// anything else. `carrierOf` builds one from the three numbers lesson 1's vowels produce.
let carrierOf (tongueIndex: float) (tongueDiameter: float) (lips: float) : Change =
    fun frame ->
        { frame with
            TongueIndex = tongueIndex
            TongueDiameter = tongueDiameter
            Lips = lips }

// The tongue and lips at rest: what a consonant is made against when no vowel is given.
let neutral : Change = carrierOf 20.0 3.0 1.5

// ## What a gesture is
//
// - `Score`: the whole movement, from the carrier vowel (or silence) through the consonant and out
// - `Hold`: the time span with the consonant at its target, so a demo can hold it for as long as a
//   key is pressed; `None` for sounds that cannot be held (taps)
// - `Kind`: a coarse family, useful for deciding how to treat a press
// - `Core`: the span with the consonant in it, without the vowels around it. The planner (a later
//   lesson) uses it to splice a consonant between two vowels
// - `Steady`: the frame in the middle of the hold. This is the *shape of the mouth* for the
//   consonant, and it is what `identify` reads
[<RequireQualifiedAccess>]
type Kind =
    | Stop
    | Affricate
    | Tap
    | Trill
    | Continuant

type Span = { Start: float; End: float }

type Gesture =
    { Score: Score
      Hold: Span option
      Kind: Kind
      Core: Span
      Steady: Frame option }

// The knobs: `Pitch` in Hz; `Carrier` (a vowel to make the consonant against, or none);
// `Aspirated` (a puff of breath after a stop); `HoldFor` (seconds, to lengthen the hold);
// `TransitionScale` (1 for careful speech, below 1 to shorten the time the articulators take to
// close and open, as in running speech).
type Options =
    { Pitch: float
      Carrier: Change option
      Aspirated: bool
      HoldFor: float option
      TransitionScale: float }

let defaultOptions : Options =
    { Pitch = 130.0
      Carrier = None
      Aspirated = false
      HoldFor = None
      TransitionScale = 1.0 }

// What family of gesture a consonant belongs to.
let kindOf (c: Consonant) : Kind =
    match c.Manner with
    | Plosive -> Kind.Stop
    | Affricate -> Kind.Affricate
    | Tap -> Kind.Tap
    | Trill -> Kind.Trill
    | Nasal
    | Fricative
    | LateralFricative
    | Approximant
    | LateralApproximant -> Kind.Continuant

// ## Building a gesture
//
// Each family has its own function. They all take the timeline so far and return the timeline with
// the gesture added (and where the hold is), which is the pure version of the JavaScript's
// "mutate the timeline in place".
type private Ctx =
    { Opts: Options
      WithVowel: bool
      /// A tap pressed on its own: it gets a breath of voice either side, not a whole vowel.
      Alone: bool
      Lead: float
      Base: Frame }

let private c0Of (spec: Spec) : Constriction =
    match spec.C0 with
    | Some k -> k
    | None -> { Index = 30.0; Diameter = 3.0; Noise = 0.0 }

// The least hiss, as a curve of the place, that makes a consonant heard on its own about as loud as an
// `s`: how much noise it takes to get the same sound out. Far less at the tongue tip than at the lips,
// where most of it never leaves the mouth (measured by rendering each place at a known amount).
let private aloneHiss (index: float) : float =
    curve
        [ (13.5, 3.2); (19.5, 2.8); (24.5, 1.7); (29.5, 1.8); (33.0, 1.0); (39.0, 1.0); (40.0, 3.2); (42.0, 19.0)
          (43.5, 12.6) ]
        index

// ### Continuants: fricatives, nasals, approximants, laterals
//
// Move to the target, hold, move back. Voiceless sounds switch the voice off while the constriction
// hisses; voiced sounds keep it on. `h` and `ɦ` are pure breath through whatever shape the mouth
// is already in.
let private continuant (c: Consonant) (spec: Spec) (x: Ctx) (tl: Timeline) : Timeline * Span =
    let tr = x.Opts.TransitionScale
    let closeAt = x.Lead + (Timing.close * tr)
    let natural =
        match c.Manner with
        | Nasal -> Timing.nasalHold
        | Fricative
        | LateralFricative -> Timing.fricativeHold
        | _ -> Timing.approximantHold
    let holdEnd = closeAt + (Option.defaultValue natural x.Opts.HoldFor)
    let hiss = match spec.C0 with Some k -> k.Noise | None -> 0.0
    let gap = match spec.C0 with Some k -> k.Diameter | None -> 3.0
    let voicing = if c.Voiced then voiceGain hiss gap else 0.0
    let target : Change =
        if c.Symbol = "h" || c.Symbol = "ɦ" then
            if c.Voiced then
                (fun f -> { f with Aspiration = 0.55; Intensity = 0.55; Tenseness = 0.25 })
            else
                (fun f -> { f with Aspiration = (if x.WithVowel then 1.0 else 4.0); Intensity = 0.0 })
        else
            all
                [ (fun f ->
                    match spec.C0 with
                    | Some k ->
                        // Alone, there is no vowel to be quiet against: a hiss comes up to the level of an `s`.
                        let n = if not x.WithVowel && k.Noise > 0.0 then max k.Noise (aloneHiss k.Index) else k.Noise
                        { f with C0i = k.Index; C0d = k.Diameter; C0n = n }
                    | None -> f)
                  (fun f ->
                      match spec.C1 with
                      | Some k -> { f with C1i = k.Index; C1d = k.Diameter; C1n = k.Noise }
                      | None -> f)
                  (fun f -> if c.Manner = Nasal then { f with Velum = 0.42 } else f)
                  (fun f ->
                      // ... and a nasal or glide gets the full voice, so every sound held alone is about as loud.
                      let alone = if not x.WithVowel && hiss = 0.0 && c.Voiced then 1.0 else voicing
                      { f with Intensity = alone })
                  (fun f -> if hiss > 0.0 && c.Voiced then { f with Tenseness = 0.45 } else f)
                  (fun f -> if c.Symbol = "ʍ" then { f with Lips = 0.6 } else f)
                  (fun f -> if c.Symbol = "w" || c.Symbol = "ɥ" then { f with Lips = 0.55 } else f) ]
    let back : Change =
        fun f ->
            { f with
                C0d = 3.0
                C1d = 3.0
                C0n = 0.0
                C1n = 0.0
                Velum = 0.01
                Aspiration = 0.0
                Tenseness = 0.6
                Lips = x.Base.Lips
                Intensity = (if x.WithVowel then 1.0 else 0.0) }
    let tail = if x.WithVowel then Timing.afterCarrier else 0.03
    let built =
        tl
        |> glide closeAt target
        |> Timeline.at holdEnd id
        |> glide (holdEnd + (Timing.opening * tr)) back
        |> Timeline.at (holdEnd + (Timing.opening * tr) + tail) id
    (built, { Start = closeAt; End = holdEnd })

// ### Trills
//
// A trill is a closure made and broken many times a second by the air itself. The engine has a
// flutter control (`C0m`, `C0mHz`) for the first constriction: a gap that opens and closes at
// about 25 Hz (30 for the uvula, which is lighter), with the voice on.
let private trill (c: Consonant) (spec: Spec) (x: Ctx) (tl: Timeline) : Timeline * Span =
    let tr = x.Opts.TransitionScale
    let closeAt = x.Lead + (Timing.close * tr)
    let holdEnd = closeAt + (Option.defaultValue Timing.trillHold x.Opts.HoldFor)
    let flutter : Change =
        fun f ->
            { f with
                C0i = (c0Of spec).Index
                C0d = 0.35
                C0m = 0.3
                C0mHz = (if c.Place = Uvular then 30.0 else 25.0)
                C0n = 0.15
                Intensity = 1.0 }
    let still : Change =
        fun f ->
            { f with
                C0d = 3.0
                C0m = 0.0
                C0mHz = 0.0
                C0n = 0.0
                Intensity = (if x.WithVowel then 1.0 else 0.0) }
    let tail = if x.WithVowel then Timing.afterCarrier else 0.03
    let built =
        tl
        |> glide closeAt flutter
        |> Timeline.at holdEnd id
        |> Timeline.at (holdEnd + (Timing.opening * tr)) still
        |> Timeline.at (holdEnd + (Timing.opening * tr) + tail) id
    (built, { Start = closeAt; End = holdEnd })

// How far a closure is open: the "not quite sealed" tube that lets a faint voice bar out of a voiced
// stop. The recordings put the voice bar about 28 dB under the vowel at every place, but the same leak is
// much quieter at the lips (nothing in front of it to resonate) than at the tongue, so the leak is a
// curve of the place, widest at the lips. A voiceless closure has no voice to leak, so it only needs
// `seal`: shut, but not so shut that the engine's loud release pop fires.
let private seal = 0.015

let private leak (index: float) : float =
    curve [ (13.5, 0.005); (24.5, 0.007); (39.0, 0.012); (43.5, 0.07) ] index

// The burst at a release. The recordings put its pitch near 2.5 kHz at every place (it is a wide gap
// opening, not a groove, so the sibilant pitch of `s` does not apply), and its level near -30 dB under the
// vowel, but the same noise is much quieter out of the lips than out of the tongue tip, so the amount of
// noise needed is a curve of the place.
let private burstHz = 2500.0

let private burstLevel (index: float) : float =
    curve
        [ (13.5, 0.5); (24.5, 0.625); (29.5, 0.75); (33.0, 0.325); (39.0, 0.325); (40.0, 0.5); (42.0, 1.0)
          (43.5, 1.5) ]
        index

// With the voice on, the same burst is lost under the harmonics, so a voiced release needs several times
// the noise (most at the tongue tip, least at the back) to be heard at about the recordings' level.
let private voicedBurstLevel (index: float) : float =
    curve
        [ (13.5, 1.5); (24.5, 2.0); (29.5, 3.0); (33.0, 4.9); (39.0, 4.9); (40.0, 6.0); (42.0, 8.0); (43.5, 10.0) ]
        index

// ### Stops
//
// Close, hold, release. What you hear is mostly in the transitions:
//
// - **During the closure** a voiceless stop is silent. A voiced stop keeps the voice on and, because
//   the tube is not quite sealed (a tiny leak, `leak`), a faint low murmur gets out: the "voice bar"
// - **At the release** the pent-up air makes a short burst of noise, whose colour comes from the place
// - **After the release** the voice starts after a delay, the *voice onset time*. Plain voiceless
//   stops have a short one; aspirated ones (`pʰ`) a long one, filled with breath
//
// The glottal stop is different: it is the voice itself being cut off, with nothing in the mouth.
let private stop (c: Consonant) (spec: Spec) (x: Ctx) (tl: Timeline) : Timeline * Span =
    let o = x.Opts
    let tr = o.TransitionScale
    let closeAt = x.Lead + (Timing.close * tr)
    let releaseAt = closeAt + (Option.defaultValue Timing.stopHold o.HoldFor)
    if c.Symbol = "ʔ" then
        let built =
            tl
            |> Timeline.at (x.Lead + 0.015) (fun f -> { f with Intensity = 0.0; Tenseness = 0.9 })
            |> Timeline.at releaseAt id
            |> Timeline.at (releaseAt + 0.012) (fun f -> { f with Intensity = 1.0; Tenseness = 0.9 })
            |> Timeline.at (releaseAt + 0.06) (fun f -> { f with Tenseness = 0.6 })
            |> Timeline.at (releaseAt + 0.06 + Timing.afterCarrier) id
        (built, { Start = x.Lead + 0.03; End = releaseAt })
    else
        let voiced = c.Voiced
        let closure : Change =
            fun f ->
                { f with
                    C0i = (c0Of spec).Index
                    C0d = (if voiced then leak (c0Of spec).Index else seal)
                    C0n = 0.0
                    Intensity = (if voiced then 0.85 else 0.0)
                    Tenseness = (if voiced then 0.5 else f.Tenseness) }
        let vot =
            if voiced then 0.0
            elif o.Aspirated then Timing.votAspirated
            else Timing.votPlain
        let breath = if voiced then 0.0 elif o.Aspirated then 0.9 else 2.0
        let after = if x.WithVowel then Timing.afterCarrier else Timing.afterNone
        let burst = (if voiced then voicedBurstLevel else burstLevel) (c0Of spec).Index
        // A voiced release is quick (the voice carries on through it). A voiceless one lets the gap widen
        // slowly: for about 35 ms it stays narrow enough to hiss, then it is the breath of the aspiration.
        let frication = if voiced then Timing.burst else Timing.fricationStop
        let built =
            tl
            |> glide closeAt closure
            |> Timeline.at releaseAt id
            |> Timeline.at (releaseAt + 0.004) (fun f -> { f with C0d = 0.38; C0n = burst; NoiseHz = burstHz })
            |> (fun tl2 ->
                if voiced then tl2
                else tl2 |> Timeline.at (releaseAt + frication * 0.5) (fun f -> { f with C0d = 0.55; C0n = burst * 0.5 }))
            |> Timeline.at (releaseAt + frication) (fun f -> { f with C0d = 1.2; C0n = (if voiced then burst / 2.0 else burst * 0.2) })
            |> Timeline.at (releaseAt + frication + 0.012) (fun f -> { f with C0d = 3.0; C0n = 0.0 })
            |> Timeline.at (releaseAt + frication + 0.012) (fun f -> { f with Aspiration = breath; C0d = 3.0 })
            |> Timeline.at (releaseAt + frication + 0.012 + vot) (fun f -> { f with Aspiration = 0.0; Intensity = (if x.WithVowel then 1.0 else 0.0); Tenseness = 0.6 })
            |> Timeline.at (releaseAt + frication + 0.012 + vot + after) id
        (built, { Start = closeAt; End = releaseAt })

// ### Affricates
//
// A stop whose release is slow enough to be a fricative: closure, then a gap that stays in the
// hissing range for about a tenth of a second.
let private affricate (c: Consonant) (spec: Spec) (x: Ctx) (tl: Timeline) : Timeline * Span =
    let o = x.Opts
    let tr = o.TransitionScale
    let voiced = c.Voiced
    let closeAt = x.Lead + (Timing.close * tr)
    let releaseAt = closeAt + (Option.defaultValue Timing.stopHold o.HoldFor)
    let k = c0Of spec
    let after = if x.WithVowel then Timing.afterCarrier else Timing.afterNone
    let released = releaseAt + 0.006 + Timing.affricateFrication + (Timing.opening * tr)
    let built =
        tl
        |> glide closeAt (fun f ->
            { f with
                C0i = k.Index
                C0d = (if voiced then leak k.Index else seal)
                C0n = 0.0
                Intensity = (if voiced then 0.85 else 0.0)
                Tenseness = (if voiced then 0.5 else 0.6) })
        |> Timeline.at releaseAt id
        |> Timeline.at (releaseAt + 0.006) (fun f ->
            { f with C0d = k.Diameter; C0n = k.Noise; NoiseHz = spec.Hz; Intensity = (if voiced then voiceGain k.Noise k.Diameter else 0.0) })
        |> Timeline.at (releaseAt + 0.006 + Timing.affricateFrication) id
        |> Timeline.at released (fun f ->
            { f with C0d = 3.0; C0n = 0.0; Intensity = (if x.WithVowel then 1.0 else 0.0); Tenseness = 0.6 })
        |> Timeline.at (released + after) id
    // With no carrier vowel the voice must be on at the very end, so the last key is patched
    // (and only that key: the frame the timeline carries is not used afterwards).
    (built, { Start = closeAt; End = releaseAt })

// ### Taps
//
// One closure so brief that the articulator barely touches: about 18 ms, inside a vowel. A tap
// cannot be held, so it has no hold span.
let private tap (spec: Spec) (x: Ctx) (tl: Timeline) : Timeline =
    let at = x.Lead
    let closed = at + 0.022
    tl
    |> Timeline.at (at + 0.012) (fun f -> { f with C0i = (c0Of spec).Index; C0d = 3.0 })
    |> Timeline.at closed (fun f -> { f with C0d = seal; Intensity = 0.8 })
    |> Timeline.at (closed + Timing.tapClosure) id
    |> Timeline.at (closed + Timing.tapClosure + 0.012) (fun f -> { f with C0d = 3.0; Intensity = 1.0 })
    |> Timeline.at (closed + Timing.tapClosure + 0.012 + (if x.Alone then Timing.afterAlone else Timing.afterCarrier)) id

// ## The frame to hold
//
// The frame in the middle of the hold: what to hold while a key is down.
let private steadyFrame (score: Score) (hold: Span) : Frame =
    let middle = (hold.Start + hold.End) / 2.0
    score.Keyframes
    |> List.filter (fun k -> k.T <= middle)
    |> List.tryLast
    |> Option.defaultValue (List.head score.Keyframes)
    |> fun k -> k.Frame

// ## From consonant to movement
//
// The base frame is a relaxed mouth with the nose shut, both constrictions open, the voice at the
// requested pitch and on only if there is a vowel to carry it. Then: a lead-in that moves the
// constrictions to the right place while still open, and the family's own gesture.
//
// Taps and the glottal stop are only audible between sounds, so they always get a vowel.
let gestureWith (options: Options) (c: Consonant) : Gesture =
    let kind = kindOf c
    let needsContext = (kind = Kind.Tap) || c.Symbol = "ʔ"
    let carrier = Option.defaultValue neutral options.Carrier
    let withVowel = Option.isSome options.Carrier || needsContext
    let baseFrame =
        { defaultFrame with
            Velum = 0.01
            C0d = 3.0
            C1d = 3.0
            C0n = 0.0
            C1n = 0.0
            C0m = 0.0
            C0mHz = 0.0
            F0 = options.Pitch
            Tenseness = 0.6
            Intensity = (if withVowel then 1.0 else 0.0)
            Aspiration = 0.0
            NoiseHz = 1000.0 }
        |> carrier
    let alone = (kind = Kind.Tap) && Option.isNone options.Carrier
    let lead = if alone then Timing.leadAlone elif withVowel then Timing.leadCarrier else Timing.leadNone
    let spec = specOf c
    let ctx = { Opts = options; WithVowel = withVowel; Alone = alone; Lead = lead; Base = baseFrame }
    let started =
        Timeline.start baseFrame
        |> Timeline.at lead (fun f ->
            { f with
                C0i = (match spec.C0 with Some k -> k.Index | None -> 30.0)
                C1i = (match spec.C1 with Some k -> k.Index | None -> 30.0)
                NoiseHz = spec.Hz })
    let (timeline, hold) =
        match kind with
        | Kind.Continuant ->
            let (t, h) = continuant c spec ctx started
            (t, Some h)
        | Kind.Trill ->
            let (t, h) = trill c spec ctx started
            (t, Some h)
        | Kind.Stop ->
            let (t, h) = stop c spec ctx started
            (t, Some h)
        | Kind.Affricate ->
            let (t, h) = affricate c spec ctx started
            (t, Some h)
        | Kind.Tap -> (tap spec ctx started, None)
    let score = Timeline.toScore timeline
    // The core is everything between the lead-in and the vowel tail: up to the second-to-last key.
    let core = { Start = lead; End = (List.item 1 timeline.Keys).T }
    { Score = score
      Hold = hold
      Kind = kind
      Core = core
      Steady = hold |> Option.map (steadyFrame score) }

let gesture (c: Consonant) : Gesture = gestureWith defaultOptions c

// ## From the mouth back to the consonant
//
// Lesson 1's inverse was ill-posed: two formants cannot say where three things are. This one is
// not. Hold each consonant against the neutral carrier, take the frame in the middle of the hold, and
// you have 71 mouth shapes (the three taps cannot be held, so they have none). `identify` finds the
// nearest.
//
// **Nearest** needs a distance. Frame numbers are in different units (index units, gaps, Hz), so
// each is divided by its typical range first, which makes a change of "one typical step" in any
// field count the same. The tongue is left out, because identity is in the constrictions, the nose,
// the lips and the voice, not in which vowel the mouth happens to be wrapped around.
//
// **Some symbols are the same point.** Place and degree are all a held shape knows. So `t` and `t͡s`
// are one shape: they differ in how the closure is released, which is time. `identify` answers with the
// first of them in chart order, and `synonyms` lists the pairs.
let held : (Consonant * Frame) list =
    let options = { defaultOptions with Carrier = Some neutral }
    consonants
    |> List.choose (fun c -> (gestureWith options c).Steady |> Option.map (fun frame -> (c, frame)))

let distance (a: Frame) (b: Frame) : float =
    let part (scale: float) (x: float) (y: float) =
        let d = (x - y) / scale
        d * d
    sqrt (
        part 1.5 a.Lips b.Lips
        + part 0.4 a.Velum b.Velum
        + part 10.0 a.C0i b.C0i
        + part 1.0 a.C0d b.C0d
        + part 1.0 a.C0n b.C0n
        + part 0.35 a.C0m b.C0m
        + part 30.0 a.C0mHz b.C0mHz
        + part 10.0 a.C1i b.C1i
        + part 1.0 a.C1d b.C1d
        + part 1.0 a.C1n b.C1n
        + part 5000.0 a.NoiseHz b.NoiseHz
        + part 1.0 a.Intensity b.Intensity
        + part 1.0 a.Aspiration b.Aspiration
        + part 0.5 a.Tenseness b.Tenseness
    )

// The consonant whose held shape is nearest, and how far away it is. Zero means the mouth is
// exactly that consonant.
let identify (frame: Frame) : Consonant * float =
    held |> List.map (fun (c, f) -> (c, distance frame f)) |> List.minBy snd

// ## How far apart are the categories?
//
// A nearest-neighbour answer is only as trustworthy as the gaps between the things it chooses from.
// Leaving out the synonyms (which are the same point, so there is nothing to tell apart), if the two
// closest *different* shapes are `margin` apart, then any mouth within half a margin of a consonant
// is identified as it: the nearest one cannot be anywhere else. So the smallest gap is the number
// that says how much wobble `identify` tolerates.
let private pairs : (Consonant * Consonant * float) list =
    let shapes = List.toArray held
    [ for i in 0 .. shapes.Length - 1 do
        for j in i + 1 .. shapes.Length - 1 ->
            (fst shapes.[i], fst shapes.[j], distance (snd shapes.[i]) (snd shapes.[j])) ]

// Pairs of consonants whose held shapes are exactly the same.
let synonyms : (Consonant * Consonant) list =
    pairs |> List.filter (fun (_, _, d) -> d = 0.0) |> List.map (fun (a, b, _) -> (a, b))

let closestPair : Consonant * Consonant * float =
    pairs |> List.filter (fun (_, _, d) -> d > 0.0) |> List.minBy (fun (_, _, d) -> d)

let margin : float =
    let (_, _, d) = closestPair
    d

// ## What to take away
//
// - **A steady consonant is a point; a stop, tap or trill is a path.** Place and degree are continuous
//   dials, the hiss falls out of the place (`hissPitch`, `hissLevel`), and the symbols are named
//   points. What a point cannot say is time: `gesture` makes the score (closure, hold, release) and
//   `Hold`, `Core` and `Steady` say which part is the consonant itself.
// - **Types do the bookkeeping.** `Place` and `Manner` are closed sets. `specOf`, `placeIndex`,
//   `specOf` and `kindOf` list every case, so extending the chart cannot silently skip one.
// - **The inverse works here, up to synonyms.** The nearest named point is meaningful. The smallest
//   gap between two different shapes is `margin` (see the tests), about one index unit; and a stop and
//   its affricate (`synonyms`) are the same shape, because the difference between them is in time, and a
//   held shape has none.
// - **Not everything can be held.** A tap is over before it can be identified. `identify` reads
//   postures, and a tap is a movement.
//
// Lesson 3 puts vowels and consonants side by side: IPA strings, a planner, and the coarticulation
// that smooths one sound into the next.
