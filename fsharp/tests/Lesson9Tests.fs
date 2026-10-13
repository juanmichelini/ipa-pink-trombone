module Lesson9Tests

open Expecto
open IpaTrombone.Score
open IpaTrombone.Planner
open IpaTrombone.Glottal
open IpaTrombone.Tracts
open IpaTrombone.Render

let private scoreOf (text: string) : Score = (plan defaultPlanOptions text).Score

let private finite (samples: float32[]) : bool =
    samples |> Array.forall (fun s -> not (System.Single.IsNaN s) && not (System.Single.IsInfinity s))

[<Tests>]
let engineTests =
    testList "Lesson 9: the engine" [

        test "44.1 kHz and 17.1 cm make exactly 44 sections; short tubes never go below 16" {
            Expect.equal (tractSections 44100.0 17.1) 44 "the Pink Trombone tract"
            Expect.equal (tractSections 44100.0 1.0) 16 "a floor"
            Expect.isGreaterThan (tractSections 44100.0 8.55) 16 "a child has fewer sections"
            Expect.isLessThan (tractSections 44100.0 8.55) 44 "but still fewer than an adult"
        }

        test "xorshift: the first number from seed 1 is known, 0 means 1, and the stream is in [0,1)" {
            Expect.equal (nextFloat (makeRng 1)) (270369.0 / 4294967296.0) "worked out by hand"
            Expect.equal (nextFloat (makeRng 0)) (nextFloat (makeRng 1)) "seed 0 is replaced by 1"
            let rng = makeRng 7
            for _ in 1 .. 1000 do
                let x = nextFloat rng
                Expect.isTrue (x >= 0.0 && x < 1.0) "in range"
        }

        test "the same seed gives the same numbers, another seed does not" {
            let a = makeRng 42
            let b = makeRng 42
            let c = makeRng 43
            let xs (r: Rng) = [ for _ in 1 .. 20 -> nextFloat r ]
            Expect.equal (xs a) (xs b) "same seed"
            Expect.notEqual (xs (makeRng 42)) (xs c) "different seed"
        }

        test "the glottal pulse starts at 0, closes at -1 and ends at 0, for every tenseness" {
            for tenseness in [ 0.0; 0.3; 0.6; 0.9; 1.0 ] do
                let lf = lfParameters tenseness
                Expect.floatClose Accuracy.high (waveform lf 0.0) 0.0 "starts at 0"
                Expect.floatClose Accuracy.high (waveform lf lf.Te) -1.0 "closes at -1"
                Expect.floatClose Accuracy.high (waveform lf 1.0) 0.0 "ends at 0"
                Expect.isTrue (lf.Te > 0.0 && lf.Te < 1.0) "the closing is inside the period"
        }

        test "a tenser voice closes its folds earlier in the period" {
            Expect.isLessThan (lfParameters 0.9).Te (lfParameters 0.3).Te "pressed closes sooner than breathy"
        }

        test "the band-pass filter passes its own centre and blocks a very low tone" {
            let level (hz: float) =
                let f = makeBandpass 44100.0 1000.0 0.5
                let mutable peakOut = 0.0
                for i in 0 .. 4409 do
                    let y = filterSample f (sin (2.0 * System.Math.PI * hz * float i / 44100.0))
                    if i > 2000 then peakOut <- max peakOut (abs y)
                peakOut
            Expect.isGreaterThan (level 1000.0) (4.0 * level 50.0) "1 kHz comes through, 50 Hz does not"
        }

        test "silence in, silence out" {
            let quiet = { Keyframes = [ { T = 0.0; Frame = defaultFrame }; { T = 0.5; Frame = defaultFrame } ]; Duration = 0.5 }
            let samples = render defaultRenderOptions quiet
            Expect.isTrue (samples |> Array.forall (fun s -> s = 0.0f)) "every sample is exactly zero"
        }

        test "the length is a whole number of blocks and covers the score plus the tail" {
            let score = scoreOf "a"
            let samples = render defaultRenderOptions score
            Expect.equal (samples.Length % block) 0 "whole blocks"
            Expect.isGreaterThanOrEqual (float samples.Length / 44100.0) (score.Duration + 0.15) "covers the tail"
        }

        test "a vowel is finite, audible and inside the limiter" {
            let samples = render defaultRenderOptions (scoreOf "ˈɑ")
            Expect.isTrue (finite samples) "finite"
            Expect.isGreaterThan (rms samples 0 samples.Length) 0.02 "audible"
            Expect.isLessThanOrEqual (peak samples) 1.0 "limited"
        }

        test "rendering twice gives the same samples, a new seed changes a fricative" {
            let score = scoreOf "ˈasa"
            Expect.equal (render defaultRenderOptions score) (render defaultRenderOptions score) "deterministic"
            let other = render { defaultRenderOptions with Seed = 2 } score
            Expect.notEqual (render defaultRenderOptions score) other "the hiss depends on the seed"
        }

        test "the closure of a voiceless stop is much quieter than the vowels around it" {
            let p = plan defaultPlanOptions "ˈapa"
            let samples = render defaultRenderOptions p.Score
            let at (seconds: float) = int (seconds * 44100.0)
            let closure = p.Marks |> List.find (fun m -> m.Symbol = "p")
            let vowel = p.Marks |> List.find (fun m -> m.Symbol = "a")
            let quiet = rms samples (at (closure.Start + 0.01)) (at (closure.End - 0.005))
            let loud = rms samples (at vowel.Start) (at vowel.End)
            Expect.isLessThan quiet (loud * 0.5) "closed lips"
        }

        test "every voice length, rate and phrase stays finite" {
            for cm in [ 8.55; 11.5; 17.1; 26.0 ] do
                for rate in [ 22050.0; 44100.0 ] do
                    let samples = render { defaultRenderOptions with TractCm = cm; SampleRate = rate } (scoreOf "ˈhɛloʊ ˈmaɪ ˈneɪm")
                    Expect.isTrue (finite samples) (sprintf "%.2f cm at %.0f Hz" cm rate)
        }

        test "shapeOf: the lips set the last sections, a constriction at the lips closes them" {
            let relaxed = shapeOf 44100.0 17.1 defaultFrame
            Expect.equal relaxed.Sections 44 "44 sections"
            Expect.floatClose Accuracy.high relaxed.Diameter.[43] 1.5 "relaxed lips"
            let rounded = shapeOf 44100.0 17.1 { defaultFrame with Lips = 0.6 }
            Expect.floatClose Accuracy.high rounded.Diameter.[43] 0.6 "rounded lips"
            let closed = shapeOf 44100.0 17.1 { defaultFrame with C0i = 43.0; C0d = 0.0; C0n = 0.0 }
            Expect.floatClose Accuracy.high closed.Diameter.[43] 0.0 "shut lips"
            Expect.equal closed.Pinches.Length 1 "one constriction"
        }

        test "shapeOf: a high front tongue narrows the palate, a low one opens it" {
            let high = shapeOf 44100.0 17.1 { defaultFrame with TongueIndex = 27.0; TongueDiameter = 2.05 }
            let low = shapeOf 44100.0 17.1 { defaultFrame with TongueIndex = 27.0; TongueDiameter = 3.5 }
            Expect.isLessThan high.Diameter.[27] low.Diameter.[27] "tall tongue, narrow gap"
        }

        test "shapeOf: an open velum opens the nose" {
            let shut = shapeOf 44100.0 17.1 defaultFrame
            let open' = shapeOf 44100.0 17.1 { defaultFrame with Velum = 0.4 }
            Expect.floatClose Accuracy.high shut.NoseDiameter.[0] 0.01 "shut"
            Expect.floatClose Accuracy.high open'.NoseDiameter.[0] 0.4 "open"
        }
    ]
