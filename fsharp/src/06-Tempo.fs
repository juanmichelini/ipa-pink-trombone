// # Tempo
//
// How do you make speech faster? There are two answers, and Demo 6 plays them side by side.
//
// - **The naive way:** make the speech at its normal speed, then divide every time in the score by
//   the speed. It is what playing a recording faster does. Everything gets shorter by the same
//   factor: vowels, consonants, the closure of a `p`, the burst after it.
// - **The speech-like way:** ask the planner for a faster utterance (`Rate` in lesson 3). Vowels
//   shrink with `1 / rate`, consonant holds with `1 / sqrt rate`, the movements that belong to the
//   anatomy (closing, releasing, the burst) do not shrink at all, and a very short vowel does not
//   have time to reach its target and falls short of it (undershoot).
//
// The speech-like rules are already in the planner, so this lesson adds no new rule. What it adds
// is the **comparison**: both ways as functions with the same signature, and the measurements that
// show what is different. A claim like "real speakers shorten vowels more than consonants" is easy
// to say and easy to doubt. Here it is a number you can compute and a test that fails if it stops
// being true.
module IpaTrombone.Tempo

open IpaTrombone.Score
open IpaTrombone.Ipa
open IpaTrombone.Planner

// ## Two ways to go fast
type Way =
    | Naive
    | SpeechLike

// Plan at the normal speed, then squeeze all of time. The marks (which segment sounds when) are
// squeezed with it, so highlighting still lines up.
let naive (rate: float) (text: string) : Plan =
    let normal = plan defaultPlanOptions text
    let score = scaleTime (1.0 / rate) normal.Score
    { Score = score
      Marks = normal.Marks |> List.map (fun m -> { m with Start = m.Start / rate; End = m.End / rate })
      Duration = score.Duration }

// Let the planner do it.
let speechLike (rate: float) (text: string) : Plan =
    plan { defaultPlanOptions with Rate = rate } text

let say (way: Way) (rate: float) (text: string) : Plan =
    match way with
    | Naive -> naive rate text
    | SpeechLike -> speechLike rate text

// ## Measuring
//
// Time spent in vowels, or in consonants: the sum of the lengths of that kind of segment.
let timeIn (kind: Kind) (p: Plan) : float =
    p.Marks |> List.filter (fun m -> m.Kind = kind) |> List.sumBy (fun m -> m.End - m.Start)

// What a rate did, as ratios against the same text at normal speed: 1 means unchanged, 0.5 means
// half as long. If vowels and consonants had the same ratio, nothing about the speech would have
// changed but its speed.
type Squeeze =
    { Whole: float
      Vowels: float
      Consonants: float }

let squeeze (way: Way) (rate: float) (text: string) : Squeeze =
    let normal = say way 1.0 text
    let fast = say way rate text
    { Whole = fast.Duration / normal.Duration
      Vowels = timeIn Kind.Vowel fast / timeIn Kind.Vowel normal
      Consonants = timeIn Kind.Consonant fast / timeIn Kind.Consonant normal }

// The time a segment spends with its mouth shut and no voice: the silence of a stop's closure.
// Sampled every 2 ms through the segment. A listener needs about 30 ms of it to hear a `p` at all.
let silentClosure (symbol: string) (p: Plan) : float =
    match p.Marks |> List.tryFind (fun m -> m.Symbol = symbol) with
    | None -> 0.0
    | Some mark ->
        let samples = int (ceil ((mark.End - mark.Start) / 0.002))
        [ 0 .. samples - 1 ]
        |> List.map (fun k -> frameAt p.Score.Keyframes (mark.Start + float k * 0.002))
        |> List.filter (fun f -> f.Intensity < 0.05 && f.C0d < 0.02)
        |> List.length
        |> fun count -> float count * 0.002
