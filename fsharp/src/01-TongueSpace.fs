// # Lesson 1: the tongue space (in F#)
//
// This is the same idea as Demo 1, rebuilt as a small **pure F# core**. Pure means: no state, no
// randomness, no clock, no I/O. Every function below gives the same answer for the same input, so
// each one can be read, tested and reasoned about on its own. The browser runs the same code,
// compiled to JavaScript by [Fable](https://fable.io); see `fsharp/README.md`.
//
// The lesson is one picture, drawn with types:
//
// - a **Tongue** is where the tongue (and lips) are
// - **Formants** are what that shape does to the air: the two resonances, F1 and F2, that mostly
//   decide which vowel you hear
// - `toSound : Tongue -> Formants` goes from mouth to sound
// - `fromSound : Formants -> Tongue` goes back
// - `render : Formants -> float -> float -> float -> float[]` makes samples you can play
//
// The two directions are not equally easy. Going back is the interesting part, and the end of this
// file measures exactly how interesting.
module IpaTrombone.TongueSpace

open System

// ## The tongue space
//
// Three numbers, each from 0 to 1, are enough to place a vowel. They are the axes of the IPA vowel
// chart, and they are the same `b`, `h` and `rounded` as in `lib/vowels.js`:
//
// - **Height**: 0 is *close* (a tall tongue, as in `i` and `u`), 1 is *open* (a low tongue, `a`)
// - **Backness**: 0 is *front* (`i`), 1 is *back* (`u`)
// - **Rounding**: 0 is spread lips, 1 is fully rounded lips
//
// A record is a good fit: it has exactly these three fields and nothing else, and the compiler
// refuses to build one with a field missing.
type Tongue =
    { Height: float
      Backness: float
      Rounding: float }

// What a mouth shape does to the air, in Hz. F1 rises as the mouth opens and F2 rises as the tongue
// moves forward, so these two numbers are enough to tell most vowels apart.
type Formants = { F1: float; F2: float }

// A named vowel from the IPA chart: its symbol, where the tongue is, and the formants a typical
// adult male speaker produces. `Approx` is true when the formants are a textbook estimate rather
// than a published measurement.
type Vowel =
    { Symbol: string
      Name: string
      Tongue: Tongue
      Sound: Formants
      Approx: bool }

// ## The inventory
//
// Twenty-eight vowels, copied from `lib/vowels.js` so the two stay in step. Each row is the symbol,
// its name, backness, height, rounding (0 or 1), then F1 and F2 in Hz.
let private vowel symbol name backness height rounding f1 f2 approx : Vowel =
    { Symbol = symbol
      Name = name
      Tongue = { Height = height; Backness = backness; Rounding = rounding }
      Sound = { F1 = f1; F2 = f2 }
      Approx = approx }

let vowels : Vowel list =
    [
        vowel "i" "close front unrounded" 0.0 0.0 0.0 240.0 2400.0 false
        vowel "y" "close front rounded" 0.0 0.0 1.0 235.0 2100.0 false
        vowel "ɨ" "close central unrounded" 0.5 0.0 0.0 240.0 1700.0 true
        vowel "ʉ" "close central rounded" 0.5 0.0 1.0 250.0 1250.0 true
        vowel "ɯ" "close back unrounded" 1.0 0.0 0.0 300.0 1390.0 false
        vowel "u" "close back rounded" 1.0 0.0 1.0 250.0 595.0 false
        vowel "ɪ" "near-close near-front unrounded" 0.15 0.17 0.0 390.0 1990.0 true
        vowel "ʏ" "near-close near-front rounded" 0.15 0.17 1.0 440.0 1700.0 true
        vowel "ʊ" "near-close near-back rounded" 0.85 0.17 1.0 440.0 1020.0 true
        vowel "e" "close-mid front unrounded" 0.0 0.33 0.0 390.0 2300.0 false
        vowel "ø" "close-mid front rounded" 0.0 0.33 1.0 370.0 1900.0 false
        vowel "ɘ" "close-mid central unrounded" 0.5 0.33 0.0 400.0 1700.0 true
        vowel "ɵ" "close-mid central rounded" 0.5 0.33 1.0 380.0 1350.0 true
        vowel "ɤ" "close-mid back unrounded" 1.0 0.33 0.0 460.0 1310.0 false
        vowel "o" "close-mid back rounded" 1.0 0.33 1.0 360.0 640.0 false
        vowel "ə" "mid central" 0.5 0.5 0.0 500.0 1500.0 true
        vowel "ɛ" "open-mid front unrounded" 0.0 0.67 0.0 610.0 1900.0 false
        vowel "œ" "open-mid front rounded" 0.0 0.67 1.0 585.0 1710.0 false
        vowel "ɜ" "open-mid central unrounded" 0.5 0.67 0.0 560.0 1500.0 true
        vowel "ɞ" "open-mid central rounded" 0.5 0.67 1.0 540.0 1300.0 true
        vowel "ʌ" "open-mid back unrounded" 1.0 0.67 0.0 600.0 1170.0 false
        vowel "ɔ" "open-mid back rounded" 1.0 0.67 1.0 500.0 700.0 false
        vowel "æ" "near-open front unrounded" 0.0 0.83 0.0 820.0 1700.0 true
        vowel "ɐ" "near-open central" 0.5 0.83 0.0 750.0 1400.0 true
        vowel "a" "open front unrounded" 0.0 1.0 0.0 850.0 1610.0 false
        vowel "ɶ" "open front rounded" 0.0 1.0 1.0 820.0 1530.0 false
        vowel "ɑ" "open back unrounded" 1.0 1.0 0.0 750.0 940.0 false
        vowel "ɒ" "open back rounded" 1.0 1.0 1.0 700.0 760.0 false
    ]

let private spreadVowels = vowels |> List.filter (fun v -> v.Tongue.Rounding < 0.5)
let private roundedVowels = vowels |> List.filter (fun v -> v.Tongue.Rounding >= 0.5)

// ## Small helpers
//
// `clamp01` keeps a number inside the chart. `sq` is a square. `soundDistance` says how far apart
// two sounds are: the distance between their formants measured in *ratios*, not Hz, because the ear
// hears 100 Hz as a big step at 300 Hz and a tiny one at 3000 Hz.
let private clamp01 (x: float) = max 0.0 (min 1.0 x)
let private sq (x: float) = x * x

let soundDistance (a: Formants) (b: Formants) : float =
    sqrt (sq (log (a.F1 / b.F1)) + sq (log (a.F2 / b.F2)))

// ## From mouth to sound
//
// We know the formants at 28 points on the chart. Anywhere else the answer is a blend of the
// nearby points: closer anchors count much more than far ones (inverse distance to the power 3),
// and exactly *at* an anchor the answer is that anchor's measurement. Blending happens on the
// logarithm of the frequency, which is the same "ratios, not Hz" idea as above.
//
// Rounding is the third axis, so the chart is blended twice, once among the spread vowels and once
// among the rounded ones, and rounding slides between the two results.
let private blend (anchors: Vowel list) (backness: float) (height: float) : float * float =
    let distance2 (a: Vowel) = sq (a.Tongue.Backness - backness) + sq (a.Tongue.Height - height)
    match anchors |> List.tryFind (fun a -> distance2 a < 1e-9) with
    | Some a -> log a.Sound.F1, log a.Sound.F2
    | None ->
        let weights = anchors |> List.map (fun a -> 1.0 / Math.Pow(distance2 a, 1.5))
        let total = List.sum weights
        let mean (pick: Vowel -> float) =
            let weighted = List.zip weights anchors |> List.sumBy (fun (w, a) -> w * log (pick a))
            weighted / total
        mean (fun a -> a.Sound.F1), mean (fun a -> a.Sound.F2)

let toSound (tongue: Tongue) : Formants =
    let b = clamp01 tongue.Backness
    let h = clamp01 tongue.Height
    let r = clamp01 tongue.Rounding
    let (s1, s2) = blend spreadVowels b h
    let (r1, r2) = blend roundedVowels b h
    { F1 = exp (s1 + (r1 - s1) * r)
      F2 = exp (s2 + (r2 - s2) * r) }

// ## From sound back to mouth
//
// There is no formula for the inverse, so we search: try a coarse grid of mouths (21 heights,
// 21 backnesses, three roundings), keep the one whose sound is closest to the target, then
// polish it by taking ever smaller steps in whichever direction helps. The search has no random
// numbers, so the same sound always gives the same mouth.
//
// A tiny penalty on rounding breaks ties in favour of spread lips: when two mouths sound the same,
// we report the plainer one.
let private cost (target: Formants) (tongue: Tongue) : float =
    sq (soundDistance (toSound tongue) target) + 1e-9 * tongue.Rounding

let private moves : (float * float * float) list =
    [ (1.0, 0.0, 0.0)
      (-1.0, 0.0, 0.0)
      (0.0, 1.0, 0.0)
      (0.0, -1.0, 0.0)
      (0.0, 0.0, 1.0)
      (0.0, 0.0, -1.0) ]

let fromSound (target: Formants) : Tongue =
    let n = 20
    let seeds =
        [ for i in 0 .. n do
            for j in 0 .. n do
                for r in [ 0.0; 0.5; 1.0 ] ->
                    { Height = float i / float n
                      Backness = float j / float n
                      Rounding = r } ]
    let rec polish (t: Tongue) (step: float) : Tongue =
        if step < 1e-4 then
            t
        else
            let best =
                moves
                |> List.map (fun (dh, db, dr) ->
                    { Height = clamp01 (t.Height + dh * step)
                      Backness = clamp01 (t.Backness + db * step)
                      Rounding = clamp01 (t.Rounding + dr * step) })
                |> List.minBy (cost target)
            if cost target best < cost target t - 1e-15 then polish best step else polish t (step / 2.0)
    polish (seeds |> List.minBy (cost target)) 0.05

// ## Naming a mouth
//
// The nearest named vowel is what a phonetician would call this tongue position. Distance is measured
// on the chart, with rounding counting for a little so `i` and `y`, which share a spot, stay apart.
let nearest (tongue: Tongue) : Vowel =
    vowels
    |> List.minBy (fun v ->
        sq (v.Tongue.Backness - tongue.Backness)
        + sq (v.Tongue.Height - tongue.Height)
        + 0.05 * abs (v.Tongue.Rounding - tongue.Rounding))

// And the other way: the tongue for a symbol, if we know the symbol.
let ofIpa (symbol: string) : Tongue option =
    vowels |> List.tryFind (fun v -> v.Symbol = symbol) |> Option.map (fun v -> v.Tongue)

// ## Making samples
//
// Formants describe a sound; to hear it we need samples. The oldest trick works: a buzz with the
// pitch of a voice (a train of one-sample pulses, `f0` times a second) fed through two resonators,
// one at F1 and one at F2. Each resonator is a two-term feedback filter in the style of Klatt's
// formant synthesiser.
//
// `render` is pure from the outside: same inputs, same samples. The two helper loops below keep
// their running values in local `mutable` variables, which never escape the function. That is the
// usual deal in F#: purity is a property of the *interface*, and a loop is allowed to be a loop.
let private pulseTrain (f0: float) (sampleRate: float) (count: int) : float[] =
    let output = Array.zeroCreate<float> count
    let mutable phase = 0.0
    for i in 0 .. count - 1 do
        phase <- phase + f0 / sampleRate
        if phase >= 1.0 then
            phase <- phase - 1.0
            output.[i] <- 1.0
    output

let private resonate (frequency: float) (bandwidth: float) (sampleRate: float) (input: float[]) : float[] =
    let t = 1.0 / sampleRate
    let c = -(exp (-2.0 * Math.PI * bandwidth * t))
    let b = 2.0 * exp (-Math.PI * bandwidth * t) * cos (2.0 * Math.PI * frequency * t)
    let a = 1.0 - b - c
    let output = Array.zeroCreate<float> input.Length
    let mutable y1 = 0.0
    let mutable y2 = 0.0
    for i in 0 .. input.Length - 1 do
        let y = a * input.[i] + b * y1 + c * y2
        output.[i] <- y
        y2 <- y1
        y1 <- y
    output

// The result is scaled so its loudest sample is 0.8, which leaves room before clipping.
let render (sound: Formants) (f0: float) (sampleRate: float) (seconds: float) : float[] =
    let count = int (floor (sampleRate * seconds))
    let voiced =
        pulseTrain f0 sampleRate count
        |> resonate sound.F1 70.0 sampleRate
        |> resonate sound.F2 110.0 sampleRate
    let peak = voiced |> Array.fold (fun m v -> max m (abs v)) 0.0
    if peak = 0.0 then voiced else voiced |> Array.map (fun v -> 0.8 * v / peak)

// ## What to take away
//
// `toSound` and `render` are easy: mouth in, sound out. `fromSound` is the hard direction, and the
// tests in `fsharp/tests/Tests.fs` pin down what is and is not true of it:
//
// - **The sound survives the round trip.** `toSound (fromSound s)` is within a few percent of `s`.
//   Ask for a sound and you get a mouth that makes it.
// - **The mouth does not.** `fromSound (toSound t)` is often a *different* mouth. Two numbers (F1 and
//   F2) cannot say where three things (height, backness, rounding) are, so many mouths make nearly
//   the same sound. Rounding the lips and pulling the tongue back both lower F2, for instance.
//   Recovering articulation from sound alone is an *ill-posed* problem, and this is its smallest
//   example.
// - **Named vowels survive.** For all 28 symbols, `nearest (fromSound v.Sound)` is `v` itself,
//   because the chart's anchors are far enough apart to tell each other from.
//
// Lesson 2 adds consonants to this core: a place, a manner and voicing, and a gesture that moves
// through time instead of a point on a chart.
