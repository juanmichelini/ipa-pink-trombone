// # Lesson 2, part 2: consonants (in F#)
//
// A vowel is a *position*. A consonant is a *gesture*: a constriction made somewhere in the mouth,
// in some manner, with or without the voice. The IPA consonant chart is organised by exactly those
// three ideas, and this lesson turns each into a type:
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
    | Postalveolar -> Some 35.0
    | Retroflex -> Some 33.5
    | Palatal -> Some 29.5
    | Velar -> Some 24.5
    | Uvular -> Some 19.5
    | Pharyngeal -> Some 13.5
    | Glottal -> None
    | AlveoloPalatal -> Some 32.0
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

// **Fricatives** (and the hiss of affricates). Per place: the gap (narrower than about 0.5 hisses,
// narrower than 0.3 is too tight), the centre of the hiss in Hz, how strongly it hisses, and
// sometimes a position that replaces the place's usual one. The sibilants (`s ʃ` and relatives) are
// loud and sit near the front, so the cavity in front of the gap is small and resonates high. That
// is why `s` is higher than `ʃ`: it is not a setting, it falls out of where the gap is.
//
// The glottis and the labial-palatal have no entry of their own; they borrow the alveolar one, as
// the JavaScript does. (The glottal fricatives `h ɦ` never use it: they are breath through the
// mouth, set up separately below.)
let private fricativeOf (place: Place) : float * float * float * float option =
    match place with
    | Bilabial -> (0.5, 1500.0, 0.6, None)
    | Labiodental -> (0.45, 3000.0, 0.6, None)
    | Dental -> (0.45, 3500.0, 0.6, None)
    | Alveolar -> (0.4, 6000.0, 1.0, Some 39.5)
    | Postalveolar -> (0.4, 3200.0, 1.0, Some 36.5)
    | Retroflex -> (0.4, 2800.0, 1.0, Some 34.5)
    | AlveoloPalatal -> (0.4, 4500.0, 1.0, Some 34.0)
    | Palatal -> (0.45, 3800.0, 0.85, None)
    | Velar -> (0.5, 1800.0, 0.8, None)
    | Uvular -> (0.5, 1200.0, 0.8, None)
    | Pharyngeal -> (0.5, 900.0, 0.8, None)
    | LabialVelar -> (0.5, 1500.0, 0.6, None)
    | Glottal
    | LabialPalatal -> (0.4, 6000.0, 1.0, Some 39.5)

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
// dominate the sound. Lateral fricatives hiss at that gap (a little wider, 0.42).
let private lateralGap = 0.32

// Where a burst or release hisses, by place: a closer place releases higher.
let private placeNoiseHz (place: Place) : float =
    match place with
    | Bilabial -> 1200.0
    | Labiodental -> 2500.0
    | Dental -> 3500.0
    | Alveolar -> 4500.0
    | Postalveolar -> 3000.0
    | Retroflex -> 2800.0
    | AlveoloPalatal -> 4000.0
    | Palatal -> 3000.0
    | Velar -> 2000.0
    | Uvular -> 1400.0
    | Pharyngeal -> 1000.0
    | Glottal -> 1000.0
    | LabialVelar
    | LabialPalatal -> 2000.0

// Place and manner become the numbers each family of gesture needs. Every manner is listed, so
// adding one to the type makes this function stop compiling until it is dealt with.
let private specOf (c: Consonant) : Spec =
    let position = placeIndex c.Place
    let resting = 30.0
    match c.Manner with
    | Fricative
    | Affricate ->
        let (gap, hz, noise, over) = fricativeOf c.Place
        let index = over |> Option.orElse position |> Option.defaultValue resting
        { C0 = Some { Index = index; Diameter = gap; Noise = noise }; C1 = None; Hz = hz }
    | LateralFricative ->
        { C0 = Some { Index = 38.5; Diameter = lateralGap + 0.1; Noise = 0.9 }; C1 = None; Hz = 3500.0 }
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
          Hz = placeNoiseHz c.Place }

// ## Timings
//
// In seconds; about right for careful speech.
module private Timing =
    let leadCarrier = 0.1 // carrier vowel before the consonant
    let leadNone = 0.03
    let close = 0.05 // articulators moving into position
    let opening = 0.05 // and out again
    let stopHold = 0.075 // closure of a stop
    let fricativeHold = 0.24
    let nasalHold = 0.22
    let approximantHold = 0.16
    let trillHold = 0.3
    let tapClosure = 0.018
    let burst = 0.014
    let votPlain = 0.016 // voice onset time of a plain voiceless stop
    let votAspirated = 0.07
    let affricateFrication = 0.1
    let afterCarrier = 0.16
    let afterNone = 0.14 // a short neutral vowel after a stop, so the release has something to release into

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
      Lead: float
      Base: Frame }

let private c0Of (spec: Spec) : Constriction =
    match spec.C0 with
    | Some k -> k
    | None -> { Index = 30.0; Diameter = 3.0; Noise = 0.0 }

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
    let isFricative = (c.Manner = Fricative || c.Manner = LateralFricative)
    let voicing =
        if isFricative then (if c.Voiced then 0.7 else 0.0)
        elif c.Voiced then 1.0
        else 0.0
    let target : Change =
        if c.Symbol = "h" || c.Symbol = "ɦ" then
            if c.Voiced then
                (fun f -> { f with Aspiration = 0.55; Intensity = 0.55; Tenseness = 0.25 })
            else
                (fun f -> { f with Aspiration = 1.0; Intensity = 0.0 })
        else
            all
                [ (fun f ->
                    match spec.C0 with
                    | Some k -> { f with C0i = k.Index; C0d = k.Diameter; C0n = k.Noise }
                    | None -> f)
                  (fun f ->
                      match spec.C1 with
                      | Some k -> { f with C1i = k.Index; C1d = k.Diameter; C1n = k.Noise }
                      | None -> f)
                  (fun f -> if c.Manner = Nasal then { f with Velum = 0.42 } else f)
                  (fun f -> { f with Intensity = voicing })
                  (fun f -> if isFricative && c.Voiced then { f with Tenseness = 0.45 } else f)
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
        |> Timeline.at closeAt target
        |> Timeline.at holdEnd id
        |> Timeline.at (holdEnd + (Timing.opening * tr)) back
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
                C0d = 0.2
                C0m = 0.35
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
        |> Timeline.at closeAt flutter
        |> Timeline.at holdEnd id
        |> Timeline.at (holdEnd + (Timing.opening * tr)) still
        |> Timeline.at (holdEnd + (Timing.opening * tr) + tail) id
    (built, { Start = closeAt; End = holdEnd })

// ### Stops
//
// Close, hold, release. What you hear is mostly in the transitions:
//
// - **During the closure** a voiceless stop is silent. A voiced stop keeps the voice on and, because
//   the tube is not quite sealed (a leak of 0.12), a faint low murmur gets out: the "voice bar"
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
                    C0d = (if voiced then 0.12 else 0.0)
                    C0n = 0.0
                    Intensity = (if voiced then 0.85 else 0.0)
                    Tenseness = (if voiced then 0.5 else f.Tenseness) }
        let vot =
            if voiced then 0.0
            elif o.Aspirated then Timing.votAspirated
            else Timing.votPlain
        let breath = if voiced then 0.0 elif o.Aspirated then 0.9 else 0.5
        let after = if x.WithVowel then Timing.afterCarrier else Timing.afterNone
        let built =
            tl
            |> Timeline.at closeAt closure
            |> Timeline.at releaseAt id
            |> Timeline.at (releaseAt + 0.004) (fun f -> { f with C0d = 0.38; C0n = 1.0; NoiseHz = spec.Hz })
            |> Timeline.at (releaseAt + Timing.burst) (fun f -> { f with C0d = 1.2; C0n = 0.5 })
            |> Timeline.at (releaseAt + Timing.burst + 0.012) (fun f -> { f with C0d = 3.0; C0n = 0.0 })
            |> Timeline.at (releaseAt + Timing.burst + 0.012) (fun f -> { f with Aspiration = breath; C0d = 3.0 })
            |> Timeline.at (releaseAt + Timing.burst + 0.012 + vot) (fun f -> { f with Aspiration = 0.0; Intensity = 1.0; Tenseness = 0.6 })
            |> Timeline.at (releaseAt + Timing.burst + 0.012 + vot + after) id
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
        |> Timeline.at closeAt (fun f ->
            { f with
                C0i = k.Index
                C0d = (if voiced then 0.12 else 0.0)
                C0n = 0.0
                Intensity = (if voiced then 0.85 else 0.0)
                Tenseness = (if voiced then 0.5 else 0.6) })
        |> Timeline.at releaseAt id
        |> Timeline.at (releaseAt + 0.006) (fun f ->
            { f with C0d = k.Diameter; C0n = k.Noise; NoiseHz = spec.Hz; Intensity = (if voiced then 0.7 else 0.0) })
        |> Timeline.at (releaseAt + 0.006 + Timing.affricateFrication) id
        |> Timeline.at released (fun f ->
            { f with C0d = 3.0; C0n = 0.0; Intensity = (if x.WithVowel || voiced then 1.0 else 0.0); Tenseness = 0.6 })
        |> Timeline.at (released + after) id
    // With no carrier vowel the voice must be on at the very end, so the last key is patched
    // (and only that key: the frame the timeline carries is not used afterwards).
    let finished =
        if x.WithVowel then
            built
        else
            match built.Keys with
            | last :: earlier -> { built with Keys = { last with Frame = { last.Frame with Intensity = 1.0 } } :: earlier }
            | [] -> built
    (finished, { Start = closeAt; End = releaseAt })

// ### Taps
//
// One closure so brief that the articulator barely touches: about 18 ms, inside a vowel. A tap
// cannot be held, so it has no hold span.
let private tap (spec: Spec) (x: Ctx) (tl: Timeline) : Timeline =
    let at = x.Lead
    let closed = at + 0.022
    tl
    |> Timeline.at (at + 0.012) (fun f -> { f with C0i = (c0Of spec).Index; C0d = 3.0 })
    |> Timeline.at closed (fun f -> { f with C0d = 0.0; Intensity = 0.8 })
    |> Timeline.at (closed + Timing.tapClosure) id
    |> Timeline.at (closed + Timing.tapClosure + 0.012) (fun f -> { f with C0d = 3.0; Intensity = 1.0 })
    |> Timeline.at (closed + Timing.tapClosure + 0.012 + Timing.afterCarrier) id

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
    let lead = if withVowel then Timing.leadCarrier else Timing.leadNone
    let spec = specOf c
    let ctx = { Opts = options; WithVowel = withVowel; Lead = lead; Base = baseFrame }
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
// Lesson 1's inverse was ill-posed: two formants cannot say where three things are. This one is not.
// Hold each consonant against the neutral carrier, take the frame in the middle of the hold, and you
// have 71 mouth shapes (the three taps cannot be held, so they have none). `identify` finds the
// nearest.
//
// **Nearest** needs a distance. Frame numbers are in different units (index units, gaps, Hz), so
// each is divided by its typical range first, which makes a change of "one typical step" in any
// field count the same. The tongue is left out, because identity is in the constrictions, the nose,
// the lips and the voice, not in which vowel the mouth happens to be wrapped around.
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
// If the two closest consonants are `margin` apart, then any mouth within half a margin of a
// consonant is identified as it: the nearest one cannot be anywhere else. So the smallest gap is the
// number that says how much wobble `identify` tolerates.
let closestPair : Consonant * Consonant * float =
    let shapes = List.toArray held
    [ for i in 0 .. shapes.Length - 1 do
        for j in i + 1 .. shapes.Length - 1 ->
            (fst shapes.[i], fst shapes.[j], distance (snd shapes.[i]) (snd shapes.[j])) ]
    |> List.minBy (fun (_, _, d) -> d)

let margin : float =
    let (_, _, d) = closestPair
    d

// ## What to take away
//
// - **A consonant is a gesture, not a point.** Where a vowel was three numbers, a consonant is a
//   score: closure, hold, release, with timings. `gesture` makes it and `Hold`, `Core` and `Steady`
//   say which part is the consonant itself.
// - **Types do the bookkeeping.** `Place` and `Manner` are closed sets. `specOf`, `placeIndex`,
//   `placeNoiseHz` and `kindOf` list every case, so extending the chart cannot silently skip one.
// - **The inverse works here.** Consonants are categories, not a continuum, so the nearest category
//   is meaningful. The smallest gap is `margin` (see the tests): it is between `ɹ` and `ɻ`, which
//   the model separates by only half an index unit. That is a statement about the model, and about
//   how little English speakers hear the difference.
// - **Not everything can be held.** A tap is over before it can be identified. `identify` reads
//   postures, and a tap is a movement.
//
// Lesson 3 puts vowels and consonants side by side: IPA strings, a planner, and the coarticulation
// that smooths one sound into the next.
