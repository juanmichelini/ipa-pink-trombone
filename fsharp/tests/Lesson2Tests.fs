module Lesson2Tests

open System
open Expecto
open FsCheck
open IpaTrombone.Score
open IpaTrombone.Consonants

let private find (symbol: string) : Consonant =
    match bySymbol symbol with
    | Some c -> c
    | None -> failwithf "no consonant /%s/" symbol

let private withNeutral : Options = { defaultOptions with Carrier = Some neutral }

let private gestureOf (symbol: string) : Gesture = gestureWith withNeutral (find symbol)

let private steadyOf (symbol: string) : Frame =
    match (gestureOf symbol).Steady with
    | Some f -> f
    | None -> failwithf "/%s/ has no steady frame" symbol

let private close (a: float) (b: float) = abs (a - b) < 1e-9

let private restFrame = defaultFrame

let private lipsClosed : Change = fun f -> { f with Lips = 0.5 }

let private times (keys: Keyframe list) = keys |> List.map (fun k -> k.T)

[<Tests>]
let scoreTests =
    testList "Lesson 2, part 1: frames and scores" [

        test "a timeline starts at zero and never goes backwards" {
            let tl =
                Timeline.start restFrame
                |> Timeline.at 0.2 id
                |> Timeline.at 0.1 id
                |> Timeline.at 0.3 id
            Expect.equal (times (Timeline.toScore tl).Keyframes) [ 0.0; 0.2; 0.2; 0.3 ] "a time before the last is lifted to it"
            Expect.equal (Timeline.toScore tl).Duration 0.3 "duration is the last time"
        }

        test "a change touches only what it names; the rest holds" {
            let tl =
                Timeline.start restFrame
                |> Timeline.at 0.1 lipsClosed
                |> Timeline.at 0.2 id
            let last = (Timeline.toScore tl).Keyframes |> List.last
            Expect.equal last.Frame.Lips 0.5 "lips stay closed through the hold"
            Expect.equal last.Frame.Velum restFrame.Velum "the nose is untouched"
        }

        test "frameAt holds outside the keys and blends between them" {
            let keys = (Timeline.start restFrame |> Timeline.at 1.0 lipsClosed |> Timeline.toScore).Keyframes
            Expect.equal (frameAt keys (-5.0)).Lips restFrame.Lips "before the first key"
            Expect.equal (frameAt keys 5.0).Lips 0.5 "after the last key"
            Expect.isTrue (close (frameAt keys 0.5).Lips 1.0) "halfway between 1.5 and 0.5"
            Expect.isTrue (close (frameAt keys 0.25).Lips 1.25) "a quarter of the way"
            Expect.equal (frameAt [] 0.3) defaultFrame "no keys is the default frame"
        }

        test "fromChanges sorts by time and keeps simultaneous changes in the order written" {
            let score =
                fromChanges
                    [ (0.2, (fun f -> { f with Lips = 0.6 }))
                      (0.1, (fun f -> { f with Lips = 1.0 }))
                      (0.2, (fun f -> { f with Lips = 0.7 })) ]
            Expect.equal (times score.Keyframes) [ 0.1; 0.2; 0.2 ] "sorted"
            Expect.equal (List.last score.Keyframes).Frame.Lips 0.7 "the later of two simultaneous changes wins"
            Expect.equal score.Duration 0.2 "duration"
            Expect.equal (fromChanges []).Duration 0.0 "an empty score has no duration"
        }

        test "all applies changes in order" {
            let frame = all [ (fun f -> { f with Lips = 1.0 }); (fun f -> { f with Lips = f.Lips + 1.0 }) ] restFrame
            Expect.equal frame.Lips 2.0 "second change sees the first"
        }

        test "concat shifts each score by what came before plus the gap" {
            let one = Timeline.start restFrame |> Timeline.at 1.0 lipsClosed |> Timeline.toScore
            let both = concat 0.5 [ one; one ]
            Expect.equal (times both.Keyframes) [ 0.0; 1.0; 1.5; 2.5 ] "second score starts at 1.0 + 0.5"
            Expect.isTrue (close both.Duration 2.5) "duration is the end of the last score"
            Expect.equal (concat 0.5 []).Duration 0.0 "nothing joined is nothing"
        }

        test "scaleTime multiplies every time and the duration" {
            let one = Timeline.start restFrame |> Timeline.at 1.0 lipsClosed |> Timeline.toScore
            let slow = scaleTime 2.0 one
            Expect.equal (times slow.Keyframes) [ 0.0; 2.0 ] "times doubled"
            Expect.equal slow.Duration 2.0 "duration doubled"
        }
    ]

let private everyPlace =
    [ Bilabial; Labiodental; Dental; Alveolar; Postalveolar; Retroflex; Palatal; Velar; Uvular; Pharyngeal
      Glottal; AlveoloPalatal; LabialVelar; LabialPalatal ]

let private everyManner =
    [ Plosive; Nasal; Trill; Tap; Fricative; LateralFricative; Approximant; LateralApproximant; Affricate ]

let private sampleTimes : Arbitrary<float> =
    Gen.choose (-500, 1500) |> Gen.map (fun i -> float i / 1000.0) |> Arb.fromGen

[<Tests>]
let inventoryTests =
    testList "Lesson 2, part 2: the inventory" [

        test "74 consonants with distinct symbols" {
            Expect.equal (List.length consonants) 74 "74 consonants"
            Expect.equal (consonants |> List.map (fun c -> c.Symbol) |> List.distinct |> List.length) 74 "distinct"
        }

        test "every place and every manner is used by some consonant" {
            for place in everyPlace do
                Expect.isTrue (consonants |> List.exists (fun c -> c.Place = place)) (sprintf "%A is used" place)
            for manner in everyManner do
                Expect.isTrue (consonants |> List.exists (fun c -> c.Manner = manner)) (sprintf "%A is used" manner)
        }

        test "places run from the lips at the front to the throat at the back, and the glottis has no position" {
            let index place = (placeIndex place).Value
            Expect.isTrue (index Bilabial > index Alveolar) "lips are in front of the ridge"
            Expect.isTrue (index Alveolar > index Palatal) "ridge in front of palate"
            Expect.isTrue (index Palatal > index Velar) "palate in front of velum"
            Expect.isTrue (index Velar > index Uvular) "velum in front of uvula"
            Expect.isTrue (index Uvular > index Pharyngeal) "uvula in front of the throat"
            Expect.equal (placeIndex Glottal) None "the glottis is not in the mouth"
            for place in everyPlace do
                match placeIndex place with
                | Some i -> Expect.isTrue (i > 0.0 && i < 44.0) (sprintf "%A is inside the tract" place)
                | None -> ()
        }

        test "the families add up" {
            let count kind = consonants |> List.filter (fun c -> kindOf c = kind) |> List.length
            Expect.equal (count Kind.Stop) 13 "stops"
            Expect.equal (count Kind.Affricate) 10 "affricates"
            Expect.equal (count Kind.Tap) 3 "taps"
            Expect.equal (count Kind.Trill) 3 "trills"
            Expect.equal (count Kind.Continuant) 45 "continuants"
        }
    ]

[<Tests>]
let gestureTests =
    testList "Lesson 2, part 2: gestures" [

        test "every gesture is a well formed score, alone or with a vowel" {
            for options in [ defaultOptions; withNeutral ] do
                for c in consonants do
                    let g = gestureWith options c
                    let ts = times g.Score.Keyframes
                    Expect.equal (List.head ts) 0.0 (sprintf "/%s/ starts at 0" c.Symbol)
                    Expect.isTrue (List.length ts >= 5) (sprintf "/%s/ has some movement" c.Symbol)
                    Expect.equal (List.sort ts) ts (sprintf "/%s/ times never go backwards" c.Symbol)
                    Expect.equal g.Score.Duration (List.last ts) (sprintf "/%s/ duration" c.Symbol)
                    Expect.isTrue (g.Core.Start < g.Core.End) (sprintf "/%s/ has a core" c.Symbol)
        }

        test "every gesture ends with the mouth open and the nose shut" {
            for options in [ defaultOptions; withNeutral ] do
                for c in consonants do
                    let last = (gestureWith options c).Score.Keyframes |> List.last
                    Expect.equal last.Frame.C0d 3.0 (sprintf "/%s/ first constriction open" c.Symbol)
                    Expect.equal last.Frame.C1d 3.0 (sprintf "/%s/ second constriction open" c.Symbol)
                    Expect.equal last.Frame.Velum 0.01 (sprintf "/%s/ nose shut" c.Symbol)
                    Expect.equal last.Frame.C0m 0.0 (sprintf "/%s/ not fluttering" c.Symbol)
        }

        test "with a vowel every gesture ends voiced; its frames stay inside sensible bounds" {
            for c in consonants do
                let g = gestureWith withNeutral c
                Expect.equal (List.last g.Score.Keyframes).Frame.Intensity 1.0 (sprintf "/%s/ voice back on" c.Symbol)
                for k in g.Score.Keyframes do
                    Expect.isTrue (k.Frame.Intensity >= 0.0 && k.Frame.Intensity <= 1.0) (sprintf "/%s/ intensity" c.Symbol)
                    Expect.isTrue (k.Frame.C0d >= 0.0 && k.Frame.C0d <= 3.0) (sprintf "/%s/ gap" c.Symbol)
                    Expect.isTrue (k.Frame.Velum >= 0.0 && k.Frame.Velum <= 0.5) (sprintf "/%s/ nose" c.Symbol)
        }

        // (The hiss level is a gain, not a fraction: lips radiate little, so their hiss is turned up.)
        testProperty "frameAt stays in bounds at any moment of any gesture" (Prop.forAll sampleTimes (fun t ->
            consonants
            |> List.forall (fun c ->
                let f = frameAt (gestureWith withNeutral c).Score.Keyframes t
                f.Intensity >= 0.0 && f.Intensity <= 1.0 && f.C0d >= 0.0 && f.C0d <= 3.0 && f.C0n >= 0.0 && f.C0n <= 20.0)))

        test "a voiceless stop is closed and silent in the middle of its hold; a voiced one murmurs" {
            for symbol in [ "p"; "t"; "k"; "q" ] do
                let f = steadyOf symbol
                Expect.equal f.C0d 0.015 (sprintf "/%s/ closed but for the leak" symbol)
                Expect.equal f.Intensity 0.0 (sprintf "/%s/ silent" symbol)
            for symbol in [ "b"; "d"; "ɡ"; "ɢ" ] do
                let f = steadyOf symbol
                Expect.isTrue (f.C0d > 0.0 && f.C0d < 0.08) (sprintf "/%s/ nearly closed: a leak" symbol)
                Expect.equal f.Intensity 0.85 (sprintf "/%s/ voiced" symbol)
        }

        test "a stop releases through a burst of noise" {
            let keys = (gestureOf "t").Score.Keyframes
            Expect.isTrue (keys |> List.exists (fun k -> k.Frame.C0d = 0.38 && k.Frame.C0n = 0.325)) "a hissing gap opens at the release"
        }

        test "aspirated stops wait longer for the voice, by exactly the difference in voice onset time" {
            let plain = (gestureWith withNeutral (find "p")).Score.Duration
            let puff = (gestureWith { withNeutral with Aspirated = true } (find "p")).Score.Duration
            Expect.isTrue (close (puff - plain) (0.07 - 0.025)) "0.07 s against 0.025 s"
        }

        test "fricatives hiss through a narrow gap; s is higher and further forward than sh" {
            // Narrower than about 0.5 hisses. (The glottal fricatives are breath, not a gap.)
            for c in consonants do
                if (c.Manner = Fricative || c.Manner = Affricate) && c.Place <> Glottal then
                    let g = gestureWith withNeutral c
                    let hiss = g.Score.Keyframes |> List.exists (fun k -> k.Frame.C0d <= 0.5 && k.Frame.C0n > 0.0)
                    Expect.isTrue hiss (sprintf "/%s/ hisses" c.Symbol)
            let s = steadyOf "s"
            let sh = steadyOf "ʃ"
            Expect.isTrue (s.NoiseHz > sh.NoiseHz) "the hiss of s is higher"
            Expect.isTrue (s.C0i > sh.C0i) "and the gap is nearer the lips"
            Expect.equal s.Intensity 0.0 "s is voiceless"
            Expect.equal (steadyOf "z").Intensity 0.12 "z is voiced, with the voice well under the hiss"
        }

        test "nasals close the mouth and open the nose" {
            for symbol in [ "m"; "n"; "ŋ"; "ɲ" ] do
                let f = steadyOf symbol
                Expect.equal f.C0d 0.0 (sprintf "/%s/ mouth closed" symbol)
                Expect.equal f.Velum 0.42 (sprintf "/%s/ nose open" symbol)
                Expect.equal f.Intensity 0.15 (sprintf "/%s/ voiced, but quiet: the gap is shut" symbol)
        }

        test "trills flutter, the uvular one a little faster" {
            Expect.equal (steadyOf "r").C0mHz 25.0 "r"
            Expect.equal (steadyOf "ʀ").C0mHz 30.0 "ʀ"
            Expect.isTrue ((steadyOf "ʙ").C0m > 0.0) "ʙ flutters"
        }

        test "a lateral narrows the midline; w rounds the lips and raises the back of the tongue" {
            Expect.equal (steadyOf "l").C0d 0.32 "l"
            let w = steadyOf "w"
            Expect.equal w.Lips 0.55 "w rounds"
            Expect.equal w.C1i 24.5 "w raises the back"
            Expect.equal (steadyOf "ʍ").Lips 0.6 "voiceless w rounds a little less"
        }

        test "h is breath: no voice, full aspiration" {
            let h = steadyOf "h"
            Expect.equal h.Aspiration 1.0 "breath"
            Expect.equal h.Intensity 0.0 "no voice"
            Expect.equal (steadyOf "ɦ").Aspiration 0.55 "breathy voice"
        }

        test "taps cannot be held and get a vowel even when none is asked for" {
            for symbol in [ "ɾ"; "ⱱ"; "ɽ" ] do
                let g = gesture (find symbol)
                Expect.equal g.Kind Kind.Tap "a tap"
                Expect.equal g.Hold None "cannot be held"
                Expect.equal g.Steady None "no steady frame"
                Expect.equal (List.head g.Score.Keyframes).Frame.Intensity 1.0 "voiced from the start"
        }

        test "HoldFor sets the length of the hold; TransitionScale speeds the movement into it" {
            let slow = gestureWith { defaultOptions with HoldFor = Some 0.2 } (find "k")
            let span = slow.Hold.Value
            Expect.isTrue (close (span.End - span.Start) 0.2) "held for 0.2 s"
            let careful = (gesture (find "s")).Hold.Value
            let quick = (gestureWith { defaultOptions with TransitionScale = 0.5 } (find "s")).Hold.Value
            Expect.isTrue (close (careful.Start - 0.03) 0.05) "careful: 50 ms to close"
            Expect.isTrue (close (quick.Start - 0.03) 0.025) "quick: half of that"
        }

        test "pitch is the voice's pitch" {
            let g = gestureWith { withNeutral with Pitch = 200.0 } (find "m")
            Expect.isTrue (g.Score.Keyframes |> List.forall (fun k -> k.Frame.F0 = 200.0)) "every frame at 200 Hz"
        }
    ]

// The answer is right if it is the consonant itself or one with exactly the same held shape.
let private isSelfOrSynonym (c: Consonant) (found: Consonant) : bool =
    found.Symbol = c.Symbol
    || synonyms |> List.exists (fun (a, b) -> (a.Symbol = c.Symbol && b.Symbol = found.Symbol) || (b.Symbol = c.Symbol && a.Symbol = found.Symbol))

[<Tests>]
let identifyTests =
    testList "Lesson 2, part 2: from the mouth back to the consonant" [

        test "seventy-one consonants can be held; the taps cannot" {
            Expect.equal (List.length held) 71 "71 held shapes"
            Expect.isFalse (held |> List.exists (fun (c, _) -> c.Manner = Tap)) "no tap among them"
        }

        test "every held consonant is identified as itself or as a symbol with exactly its shape" {
            for (c, frame) in held do
                let (found, d) = identify frame
                Expect.equal d 0.0 (sprintf "/%s/ at distance zero" c.Symbol)
                Expect.isTrue (isSelfOrSynonym c found) (sprintf "/%s/ read back as /%s/" c.Symbol found.Symbol)
        }

        test "the symbols that are the same shape are stops and their affricates, which differ only in time" {
            let names = synonyms |> List.map (fun (a, b) -> Set.ofList [ a.Symbol; b.Symbol ]) |> Set.ofList
            let expected =
                [ ("t", "t͡s"); ("d", "d͡z"); ("ʈ", "ʈ͡ʂ"); ("ɖ", "ɖ͡ʐ") ]
                |> List.map (fun (a, b) -> Set.ofList [ a; b ])
                |> Set.ofList
            Expect.equal names expected "four pairs, each differing only in the release"
        }

        test "the shape of the mouth does not depend on the vowel around it" {
            // A different tongue, the same lips: the constrictions, nose and voice are what identify.
            let aroundI = { defaultOptions with Carrier = Some (carrierOf 27.5 2.05 1.5) }
            for (c, _) in held do
                let frame = (gestureWith aroundI c).Steady.Value
                let found = fst (identify frame)
                Expect.isTrue (isSelfOrSynonym c found) (sprintf "/%s/ around an i" c.Symbol)
        }

        test "the two closest different shapes are about one index unit apart" {
            let (_, _, d) = closestPair
            Expect.isTrue (d > 0.09 && d < 0.15) "about 1 index unit over a scale of 10, plus a little hiss pitch"
            Expect.equal margin d "margin is that distance"
        }

        test "any wobble smaller than half the margin still identifies the consonant" {
            let wobble = 0.45 * margin
            for (c, frame) in held do
                for sign in [ 1.0; -1.0 ] do
                    let shaken =
                        [ { frame with C0i = frame.C0i + sign * wobble * 10.0 }
                          { frame with C0d = frame.C0d + sign * wobble * 1.0 }
                          { frame with NoiseHz = frame.NoiseHz + sign * wobble * 5000.0 }
                          { frame with Velum = frame.Velum + sign * wobble * 0.4 } ]
                    for f in shaken do
                        Expect.isTrue (isSelfOrSynonym c (fst (identify f))) (sprintf "/%s/ survives a wobble" c.Symbol)
        }

        test "something that is no consonant at all is still given a nearest answer, far away" {
            let (_, d) = identify { defaultFrame with C0i = 5.0; C0d = 0.0; Velum = 0.4; Aspiration = 1.0; Intensity = 1.0 }
            Expect.isTrue (d > 0.5) "distance says it is not really any of them"
        }
    ]
