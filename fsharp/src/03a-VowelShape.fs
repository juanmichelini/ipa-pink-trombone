// # From the vowel chart to a mouth
//
// Lesson 1 described a vowel by where the tongue is (height, backness, rounding) and what it
// *sounds* like (two formants). Lesson 2 wrote movement down as frames. This lesson joins them: a
// position on the chart becomes the numbers a frame needs, **tongue index, tongue diameter and lip
// opening**.
//
// Nothing here is a formula derived from anatomy. The numbers come from calibration: a script
// (`scripts/calibrate-vowels.mjs`) tries tongue positions in the engine and keeps, for each vowel,
// the one whose formants are closest to the reference. Those fifteen unrounded vowels are the
// **anchors**. Thirteen rounded vowels are calibrated differently: only how far the lips close,
// as a fraction of the jaw opening. Everything between the symbols is a smooth blend of the anchors.
//
// The tables below are copied from `lib/vowel-fit.js` (itself generated), so the F# and the
// JavaScript use the same calibration. A test compares them.
module IpaTrombone.VowelShape

open IpaTrombone.TongueSpace
open IpaTrombone.Score

// ## The shape
//
// Three numbers describe the mouth for a vowel. They are exactly the fields of a `Frame` that
// lesson 2's `carrierOf` sets, and nothing else about a frame (voicing, noise, the nose) belongs to
// the vowel.
type Shape =
    { TongueIndex: float
      TongueDiameter: float
      Lips: float }

// A shape as a `Change`, which is how a frame learns about it.
let apply (shape: Shape) : Change =
    fun frame ->
        { frame with
            TongueIndex = shape.TongueIndex
            TongueDiameter = shape.TongueDiameter
            Lips = shape.Lips }

// And back: the shape a frame is in.
let shapeOfFrame (frame: Frame) : Shape =
    { TongueIndex = frame.TongueIndex
      TongueDiameter = frame.TongueDiameter
      Lips = frame.Lips }

// ## The calibration
//
// An anchor is a point on the chart with some calibrated numbers attached. For the unrounded
// vowels the numbers are the tongue index and diameter; for the rounded ones, one number: the lip
// ratio.
type Anchor =
    { Symbol: string
      Backness: float
      Height: float
      Values: float list }

let private anchor symbol backness height values : Anchor =
    { Symbol = symbol
      Backness = backness
      Height = height
      Values = values }

let private fitAnchors : Anchor list =
    [
        anchor "i" 0.0 0.0 [27.5; 2.05]
        anchor "ɨ" 0.5 0.0 [24.0; 1.9]
        anchor "ɯ" 1.0 0.0 [22.0; 1.9]
        anchor "ɪ" 0.15 0.17 [26.0; 2.45]
        anchor "e" 0.0 0.33 [30.5; 2.75]
        anchor "ɘ" 0.5 0.33 [24.0; 2.3]
        anchor "ɤ" 1.0 0.33 [20.5; 2.15]
        anchor "ə" 0.5 0.5 [20.5; 2.2]
        anchor "ɛ" 0.0 0.67 [23.0; 3.0]
        anchor "ɜ" 0.5 0.67 [19.0; 2.2]
        anchor "ʌ" 1.0 0.67 [15.0; 2.05]
        anchor "æ" 0.0 0.83 [14.5; 3.25]
        anchor "ɐ" 0.5 0.83 [16.0; 2.4]
        anchor "a" 0.0 1.0 [14.0; 3.0]
        anchor "ɑ" 1.0 1.0 [10.0; 1.9]
    ]

let private fitRounding : Anchor list =
    [
        anchor "y" 0.0 0.0 [0.8]
        anchor "ʉ" 0.5 0.0 [0.66]
        anchor "u" 1.0 0.0 [0.34]
        anchor "ʏ" 0.15 0.17 [0.76]
        anchor "ʊ" 0.85 0.17 [0.68]
        anchor "ø" 0.0 0.33 [0.56]
        anchor "ɵ" 0.5 0.33 [0.68]
        anchor "o" 1.0 0.33 [0.34]
        anchor "œ" 0.0 0.67 [0.74]
        anchor "ɞ" 0.5 0.67 [0.78]
        anchor "ɔ" 1.0 0.67 [0.4]
        anchor "ɶ" 0.0 1.0 [0.78]
        anchor "ɒ" 1.0 1.0 [0.68]
    ]

// ## The jaw
//
// An open vowel needs an open mouth; the tongue alone cannot raise F1 high enough. The model
// widens the opening at the lips with height, the way a jaw drops: relaxed (1.5) up to close-mid,
// then opening toward 2.8 at the open end. Calibration was done with this function in place, so it
// is part of the model, not an afterthought.
let jawOpening (height: float) : float =
    1.5 + 1.3 * min 1.0 (max 0.0 ((height - 0.33) / 0.67))

// ## Between the symbols
//
// The chart is continuous: a mouse can be anywhere on it, not only on a symbol. Anywhere else the
// value is an **inverse-distance-weighted blend** of the anchors: nearby anchors count much more
// than far ones, and *at* an anchor the answer is exactly the calibrated value. `power` says how
// local the blend is: a weight is one over distance to that power.
let blendAnchors (power: float) (anchors: Anchor list) (backness: float) (height: float) : float list =
    let distance2 (a: Anchor) =
        (a.Backness - backness) * (a.Backness - backness) + (a.Height - height) * (a.Height - height)
    match anchors |> List.tryFind (fun a -> distance2 a < 1e-9) with
    | Some exact -> exact.Values
    | None ->
        let weight (a: Anchor) = 1.0 / ((distance2 a) ** (power / 2.0))
        let total = anchors |> List.sumBy weight
        let count = (List.head anchors).Values.Length
        [ for k in 0 .. count - 1 ->
            (anchors |> List.sumBy (fun a -> weight a * List.item k a.Values)) / total ]

// ## A position on the chart becomes a shape
//
// - `backness` and `height`: 0 to 1, as in lesson 1
// - `rounded`: 0 for spread lips up to 1 for fully rounded; in between is a half-rounded vowel
//
// The jaw opens with height. Rounding then closes the lips to a fraction of that opening, and the
// fraction comes from the calibrated rounded vowels nearest on the chart.
let vowelShape (backness: float) (height: float) (rounded: float) : Shape =
    let tongue = blendAnchors 3.0 fitAnchors backness height
    let ratio = List.head (blendAnchors 2.0 fitRounding backness height)
    { TongueIndex = List.item 0 tongue
      TongueDiameter = List.item 1 tongue
      Lips = jawOpening height * (1.0 - rounded + rounded * ratio) }

// The shape of a named vowel, rounding included. `ofIpa` is lesson 1's lookup.
let shapeOfSymbol (symbol: string) : Shape option =
    ofIpa symbol |> Option.map (fun t -> vowelShape t.Backness t.Height t.Rounding)

// ## A frame you can hear
//
// A shape plus a source: voicing on at a steady pitch, the nose closed, both constrictions open.
let vowelFrame (f0: float) (tenseness: float) (shape: Shape) : Frame =
    { defaultFrame with
        TongueIndex = shape.TongueIndex
        TongueDiameter = shape.TongueDiameter
        Lips = shape.Lips
        Velum = 0.01
        C0d = 3.0
        C1d = 3.0
        C0n = 0.0
        C1n = 0.0
        F0 = f0
        Tenseness = tenseness
        Intensity = 1.0
        Aspiration = 0.0 }
