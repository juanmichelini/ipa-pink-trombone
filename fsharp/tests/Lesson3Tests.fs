module Lesson3Tests

open System
open Expecto
open FsCheck
open IpaTrombone.TongueSpace
open IpaTrombone.Score
open IpaTrombone.VowelShape
open IpaTrombone.Ipa
open IpaTrombone.Planner

let private close (a: float) (b: float) = abs (a - b) < 1e-9

let private unit01 = Gen.choose (0, 1000) |> Gen.map (fun i -> float i / 1000.0)

let private chartPositions : Arbitrary<float * float> = Gen.zip unit01 unit01 |> Arb.fromGen

let private shapeOf (symbol: string) : Shape =
    match shapeOfSymbol symbol with
    | Some s -> s
    | None -> failwithf "no vowel /%s/" symbol

let private segmentsOf (text: string) : Segment list =
    tokenize text
    |> List.choose (fun t ->
        match t with
        | Sound s -> Some s
        | _ -> None)

let private breaksOf (text: string) : Break list =
    tokenize text
    |> List.choose (fun t ->
        match t with
        | Break b -> Some b
        | _ -> None)

let private symbolsOf (text: string) : string list = segmentsOf text |> List.map (fun s -> s.Symbol)

let private allSymbols : string list =
    (vowels |> List.map (fun v -> v.Symbol))
    @ (IpaTrombone.Consonants.consonants |> List.map (fun c -> c.Symbol))

[<Tests>]
let vowelShapeTests =
    testList "Lesson 3, part 1: from the chart to a mouth" [

        test "at a calibrated vowel the answer is the calibrated number" {
            let i = shapeOf "i"
            Expect.isTrue (close i.TongueIndex 27.5) "i tongue index"
            Expect.isTrue (close i.TongueDiameter 2.05) "i tongue diameter"
            Expect.isTrue (close i.Lips 1.5) "i lips are relaxed"
        }

        test "every vowel has a shape, and it is a real one" {
            for v in vowels do
                let s = shapeOf v.Symbol
                Expect.isTrue (not (Double.IsNaN s.TongueIndex) && s.TongueIndex > 8.0 && s.TongueIndex < 31.0) (sprintf "/%s/ tongue index" v.Symbol)
                Expect.isTrue (s.TongueDiameter > 1.0 && s.TongueDiameter < 4.0) (sprintf "/%s/ tongue diameter" v.Symbol)
                Expect.isTrue (s.Lips > 0.3 && s.Lips < 3.0) (sprintf "/%s/ lips" v.Symbol)
        }

        test "rounding closes the lips: u is tighter than ɯ, which has the same tongue" {
            let u = shapeOf "u"
            let m = shapeOf "ɯ"
            Expect.isTrue (close u.TongueIndex m.TongueIndex) "same tongue"
            Expect.isTrue (u.Lips < m.Lips * 0.6) "rounded lips are much smaller"
        }

        test "the jaw is relaxed up to close-mid and opens beyond" {
            Expect.isTrue (close (jawOpening 0.0) 1.5) "close"
            Expect.isTrue (close (jawOpening 0.33) 1.5) "close-mid"
            Expect.isTrue (close (jawOpening 1.0) 2.8) "open"
            Expect.isTrue (jawOpening 0.8 > jawOpening 0.6) "opens with height"
        }

        test "half rounded is halfway between spread and rounded lips" {
            let spread = vowelShape 1.0 0.0 0.0
            let rounded = vowelShape 1.0 0.0 1.0
            let half = vowelShape 1.0 0.0 0.5
            Expect.isTrue (close half.Lips ((spread.Lips + rounded.Lips) / 2.0)) "linear in rounding"
        }

        testProperty "anywhere on the chart the tongue stays within what was calibrated" (Prop.forAll chartPositions (fun (b, h) ->
            let s = vowelShape b h 0.0
            s.TongueIndex >= 9.99 && s.TongueIndex <= 30.51 && s.TongueDiameter >= 1.89 && s.TongueDiameter <= 3.51))

        test "a vowel frame is voiced, with the nose closed" {
            let f = vowelFrame 150.0 0.7 (shapeOf "a")
            Expect.equal f.Intensity 1.0 "voiced"
            Expect.equal f.Velum 0.01 "nose closed"
            Expect.equal f.F0 150.0 "pitch"
            Expect.equal f.Tenseness 0.7 "tenseness"
        }
    ]

[<Tests>]
let tokenizerTests =
    testList "Lesson 3, part 2: reading IPA" [

        test "marks, stress, ties and breaks" {
            let tokens = tokenize "ˈpʰiːt͡ʃ ã.ˌb"
            let segs = segmentsOf "ˈpʰiːt͡ʃ ã.ˌb"
            Expect.equal (segs |> List.map (fun s -> s.Symbol)) [ "p"; "i"; "t͡ʃ"; "a"; "b" ] "symbols"
            Expect.isTrue segs.[0].Aspirated "p is aspirated"
            Expect.equal segs.[0].Stress 2 "primary stress on p"
            Expect.isTrue segs.[1].Long "i is long"
            Expect.isTrue segs.[3].Nasalized "ã is nasalised"
            Expect.equal segs.[4].Stress 1 "secondary stress on b"
            Expect.equal (breaksOf "ˈpʰiːt͡ʃ ã.ˌb") [ Word; Syllable ] "a word break and a syllable break"
            Expect.equal tokens.Length 7 "five sounds and two breaks"
        }

        test "tʃ with or without the tie is one affricate; g is ɡ; ç is one symbol" {
            Expect.equal (symbolsOf "tʃ") [ "t͡ʃ" ] "no tie"
            Expect.equal (symbolsOf "t͡ʃ") [ "t͡ʃ" ] "tie"
            Expect.equal (symbolsOf "ʤ") [ "d͡ʒ" ] "ligature"
            Expect.equal (symbolsOf "g") [ "ɡ" ] "ASCII g"
            Expect.equal (symbolsOf "ç") [ "ç" ] "c with cedilla"
        }

        test "ts is a cluster unless it is tied" {
            Expect.equal (symbolsOf "ts") [ "t"; "s" ] "cluster"
            Expect.equal (symbolsOf "t͡s") [ "t͡s" ] "affricate"
        }

        test "every vowel and consonant symbol tokenizes to itself" {
            for s in allSymbols do
                Expect.equal (symbolsOf s) [ s ] (sprintf "/%s/" s)
        }

        test "unknown characters are reported, not dropped, and never throw" {
            Expect.equal (unknownCharacters "a?b!") [ "?"; "!" ] "reported in order"
            Expect.equal (format (tokenize "ˈhɛloʊ wɜːld")) "ˈhɛloʊ wɜːld" "known text survives"
        }

        test "a tone letter goes to the vowel of its syllable, even a few segments back" {
            match segmentsOf "maʊŋ˥˩" with
            | [ _; a; _; _ ] -> Expect.equal a.Tone None "not on the first vowel"
            | other -> failtestf "unexpected %A" other
            let segs = segmentsOf "ma˥˩"
            Expect.equal segs.[1].Tone (Some [ 5; 1 ]) "ma˥˩ falls"
            let ng = segmentsOf "ʊŋ˥"
            Expect.equal ng.[0].Tone (Some [ 5 ]) "the tone skips the ŋ and lands on the ʊ"
        }

        test "voicing marks and the two pauses" {
            let segs = segmentsOf "b̥ a̬"
            Expect.equal segs.[0].Voicing (Some false) "voiceless"
            Expect.equal segs.[1].Voicing (Some true) "voiced"
            Expect.equal (breaksOf "a|a‖a") [ Pause 0.15; Pause 0.35 ] "short and long pause"
        }

        test "format is the inverse of tokenize for text already in its own order" {
            for text in [ "ˈpʰiːt͡ʃ ã.ˌb"; "ma˥˩ ni˧"; "b̥ɑ̬ː|ɡu‖" ] do
                Expect.equal (format (tokenize text)) (text.Normalize()) text
        }
    ]

let private planOf (text: string) : Plan = plan defaultPlanOptions text

let private tongueAt (p: Plan) (t: float) : float = (frameAt p.Score.Keyframes t).TongueIndex

[<Tests>]
let plannerTests =
    testList "Lesson 3, part 3: the planner" [

        test "marks are in order and cover each segment" {
            let p = planOf "ˈhɛloʊ"
            Expect.equal (p.Marks |> List.map (fun m -> m.Symbol)) [ "h"; "ɛ"; "l"; "o"; "ʊ" ] "symbols"
            for (a, b) in List.pairwise p.Marks do
                Expect.isTrue (b.Start >= a.Start) "starts do not go backwards"
            let l = p.Marks.[2]
            Expect.equal (markAt p.Marks (l.Start + 0.001) |> Option.map (fun m -> m.Symbol)) (Some "l") "markAt finds l"
            Expect.equal (markAt p.Marks 0.0) None "nothing sounds before the first segment"
        }

        test "coarticulation: the tongue moves from one vowel to the next across a bilabial" {
            let p = planOf "ibu"
            let i, b, u = p.Marks.[0], p.Marks.[1], p.Marks.[2]
            let before = tongueAt p (i.End - 0.01)
            let after = tongueAt p (u.Start + 0.12)
            let during = tongueAt p ((b.Start + b.End) / 2.0)
            Expect.isTrue (abs (before - (shapeOf "i").TongueIndex) < 0.5) "ends at i"
            Expect.isTrue (abs (after - (shapeOf "u").TongueIndex) < 1.0) "arrives at u"
            Expect.isTrue (during < before && during > after) "mid-consonant the tongue is between the two vowels"
        }

        test "a consonant between two of the same vowel leaves the tongue where it was" {
            let p = planOf "aba"
            let b = p.Marks.[1]
            Expect.isTrue (abs (tongueAt p ((b.Start + b.End) / 2.0) - (shapeOf "a").TongueIndex) < 0.5) "tongue stays near a"
        }

        test "an utterance starting with a voiceless stop begins silent" {
            let p = planOf "paːt"
            let early = p.Score.Keyframes |> List.filter (fun k -> k.T < p.Marks.[0].Start + 0.04)
            Expect.isTrue (early |> List.forall (fun k -> k.Frame.Intensity = 0.0)) "no voice at the start"
            Expect.isTrue (p.Duration > 0.3) "and it has some length"
        }

        test "long vowels are longer, stressed vowels higher" {
            Expect.isTrue ((planOf "taː").Duration > (planOf "ta").Duration + 0.08) "long is long"
            let flat = { defaultPlanOptions with Declination = 0.0 }
            let peak text = (plan flat text).Score.Keyframes |> List.map (fun k -> k.Frame.F0) |> List.max
            Expect.isTrue (peak "ˈa" > peak "a") "primary stress is higher"
            Expect.isTrue (peak "ˈa" > peak "ˌa" && peak "ˌa" > peak "a") "secondary is in between"
        }

        test "pitch declines over the utterance" {
            let p = plan { defaultPlanOptions with Declination = 0.2 } "a a a a a a"
            let voiced = p.Score.Keyframes |> List.filter (fun k -> k.Frame.Intensity > 0.9)
            Expect.isTrue ((List.last voiced).Frame.F0 < (List.head voiced).Frame.F0 * 0.9) "later is lower"
        }

        test "a falling tone falls and a rising tone rises" {
            let flat = { defaultPlanOptions with Declination = 0.0 }
            let pitches text =
                (plan flat text).Score.Keyframes |> List.filter (fun k -> k.Frame.Intensity > 0.9) |> List.map (fun k -> k.Frame.F0)
            let fall = pitches "ma˥˩"
            let rise = pitches "ma˩˥"
            Expect.isTrue (List.head fall > List.last fall) "5 to 1 falls"
            Expect.isTrue (List.head rise < List.last rise) "1 to 5 rises"
        }

        test "speaking faster is shorter, but a consonant shrinks less than a vowel" {
            let slow = planOf "ata"
            let fast = plan { defaultPlanOptions with Rate = 2.0 } "ata"
            Expect.isTrue (fast.Duration < slow.Duration) "faster is shorter"
            let vowelOf (p: Plan) = p.Marks.[0].End - p.Marks.[0].Start
            let stopOf (p: Plan) = p.Marks.[1].End - p.Marks.[1].Start
            Expect.isTrue (vowelOf fast < vowelOf slow * 0.6) "the vowel roughly halves"
            Expect.isTrue (stopOf fast > stopOf slow * 0.6) "the consonant does not"
        }

        test "scaleForRate leaves the anatomy alone and clamps silly rates" {
            let fast = scaleForRate timing 2.0
            Expect.isTrue (close fast.Vowel (timing.Vowel / 2.0)) "vowel"
            Expect.isTrue (close fast.ConsonantScale (timing.ConsonantScale / sqrt 2.0)) "consonant"
            Expect.equal fast.Transition timing.Transition "transition untouched"
            Expect.equal (scaleForRate timing 100.0) (scaleForRate timing 4.0) "clamped above"
            Expect.equal (scaleForRate timing 0.0) (scaleForRate timing 0.2) "clamped below"
        }

        test "a very short vowel undershoots toward neutral; a long one does not" {
            let target = shapeOf "i"
            Expect.equal (undershoot 0.09 0.2 target) target "long enough"
            let short = undershoot 0.09 0.04 target
            Expect.isTrue (short.TongueIndex < target.TongueIndex && short.TongueIndex > neutralShape.TongueIndex) "part of the way"
            Expect.isTrue (close (short.TongueIndex - neutralShape.TongueIndex) ((target.TongueIndex - neutralShape.TongueIndex) * 0.55)) "55 percent at 0.04 s"
        }

        test "an override fixes a vowel's length and can replace it" {
            let o = { defaultPlanOptions with Overrides = [ (1, { Seconds = Some 0.5; Symbol = Some "u"; Scale = None }) ] }
            let p = plan o "ta"
            Expect.equal (p.Marks |> List.map (fun m -> m.Symbol)) [ "t"; "u" ] "a was replaced by u"
            Expect.isTrue (close (p.Marks.[1].End - p.Marks.[1].Start) 0.5) "and held for half a second"
        }

        test "unknown characters are skipped, pauses reset the start" {
            Expect.equal ((planOf "a?a").Marks.Length) 2 "the ? is skipped"
            let p = planOf "a|pa"
            let early = p.Score.Keyframes |> List.filter (fun k -> k.T > p.Marks.[1].Start - 0.001 && k.T < p.Marks.[1].Start + 0.04)
            Expect.isTrue (early |> List.forall (fun k -> k.Frame.Intensity = 0.0)) "after a pause, a stop starts silent again"
        }

        test "every symbol can be sounded in a sequence" {
            let p = planOf (String.Join(" ", allSymbols))
            Expect.equal p.Marks.Length allSymbols.Length "one mark per symbol"
            Expect.isTrue (p.Score.Keyframes |> List.forall (fun k -> not (Double.IsNaN k.Frame.F0) && not (Double.IsNaN k.Frame.TongueIndex))) "no NaN"
            Expect.isTrue (p.Score.Keyframes |> List.pairwise |> List.forall (fun (a, b) -> b.T >= a.T)) "time never goes backwards"
        }

        test "planning is deterministic" {
            Expect.equal (planOf "ˈhɛloʊ wɜːld") (planOf "ˈhɛloʊ wɜːld") "same text, same plan"
        }

        test "syllableRate counts vowels per second" {
            let p = planOf "banana"
            Expect.isTrue (close (syllableRate p.Marks p.Duration) (3.0 / p.Duration)) "three vowels"
            Expect.equal (syllableRate [] 0.0) 0.0 "no duration, no rate"
        }
    ]
