module Tests

open System
open Expecto
open FsCheck
open IpaTrombone.TongueSpace

// Tongues for the property tests: every position on the chart, in steps of a thousandth.
let private unit01 = Gen.choose (0, 1000) |> Gen.map (fun i -> float i / 1000.0)

let private tongues : Arbitrary<Tongue> =
    Gen.map3 (fun h b r -> { Height = h; Backness = b; Rounding = r }) unit01 unit01 unit01
    |> Arb.fromGen

// Energy at one frequency (the Goertzel algorithm), to check where a rendered vowel has its peaks.
let private power (samples: float[]) (frequency: float) (sampleRate: float) : float =
    let w = 2.0 * Math.PI * frequency / sampleRate
    let c = 2.0 * cos w
    let mutable s1 = 0.0
    let mutable s2 = 0.0
    for v in samples do
        let s = v + c * s1 - s2
        s2 <- s1
        s1 <- s
    s1 * s1 + s2 * s2 - c * s1 * s2

let private symbolPower (symbol: string) (frequency: float) : float =
    let v = vowels |> List.find (fun x -> x.Symbol = symbol)
    power (render v.Sound 120.0 16000.0 0.5) frequency 16000.0

[<Tests>]
let lesson1 =
    testList "Lesson 1: the tongue space" [

        test "there are 28 vowels with distinct symbols" {
            Expect.equal (List.length vowels) 28 "28 vowels"
            Expect.equal (vowels |> List.map (fun v -> v.Symbol) |> List.distinct |> List.length) 28 "distinct symbols"
        }

        test "toSound reproduces every anchor exactly" {
            for v in vowels do
                let s = toSound v.Tongue
                Expect.isTrue (abs (s.F1 - v.Sound.F1) < 1e-6 && abs (s.F2 - v.Sound.F2) < 1e-6) (sprintf "/%s/ is an anchor" v.Symbol)
        }

        test "toSound clamps a tongue that is off the chart" {
            let off = toSound { Height = -3.0; Backness = 9.0; Rounding = 2.0 }
            let edge = toSound { Height = 0.0; Backness = 1.0; Rounding = 1.0 }
            Expect.isTrue (soundDistance off edge < 1e-9) "off-chart equals the nearest edge"
        }

        test "front vowels have a higher F2 than back vowels, close vowels a lower F1 than open ones" {
            let i = toSound { Height = 0.0; Backness = 0.0; Rounding = 0.0 }
            let u = toSound { Height = 0.0; Backness = 1.0; Rounding = 1.0 }
            let a = toSound { Height = 1.0; Backness = 0.0; Rounding = 0.0 }
            Expect.isTrue (i.F2 > u.F2) "F2 of i is above F2 of u"
            Expect.isTrue (a.F1 > i.F1) "F1 of a is above F1 of i"
        }

        testProperty "toSound stays inside the range of the anchors" (Prop.forAll tongues (fun t ->
            let s = toSound t
            s.F1 >= 234.0 && s.F1 <= 851.0 && s.F2 >= 594.0 && s.F2 <= 2401.0))

        testProperty "the sound survives the round trip: a sound asked for is a sound made" (Prop.forAll tongues (fun t ->
            let s = toSound t
            soundDistance (toSound (fromSound s)) s < 0.05))

        test "fromSound is deterministic" {
            let s = { F1 = 500.0; F2 = 1500.0 }
            Expect.equal (fromSound s) (fromSound s) "same sound, same mouth"
        }

        test "every named vowel comes back as itself" {
            for v in vowels do
                let back = nearest (fromSound v.Sound)
                Expect.equal back.Symbol v.Symbol (sprintf "/%s/ round trips to its own symbol" v.Symbol)
        }

        test "the mouth does not survive the round trip: rounding is not recoverable from F1 and F2" {
            let grid =
                [ for i in 0 .. 10 do
                    for j in 0 .. 10 do
                        for k in 0 .. 4 ->
                            { Height = float i / 10.0; Backness = float j / 10.0; Rounding = float k / 4.0 } ]
            let meanRoundingError =
                grid
                |> List.averageBy (fun t -> abs (t.Rounding - (fromSound (toSound t)).Rounding))
            Expect.isTrue (meanRoundingError > 0.05) (sprintf "mean rounding error %.3f shows many mouths share a sound" meanRoundingError)
        }

        test "nearest and ofIpa agree" {
            for v in vowels do
                Expect.equal (ofIpa v.Symbol) (Some v.Tongue) "ofIpa finds the tongue"
                Expect.equal (nearest v.Tongue).Symbol v.Symbol "nearest names it"
            Expect.equal (ofIpa "not a vowel") None "unknown symbol"
        }

        test "render makes the right number of samples, never louder than 0.8, and is repeatable" {
            let s = { F1 = 500.0; F2 = 1500.0 }
            let a = render s 120.0 16000.0 0.25
            Expect.equal a.Length 4000 "a quarter second at 16 kHz"
            Expect.isTrue (a |> Array.forall (fun v -> abs v <= 0.8 + 1e-12)) "peak is 0.8"
            Expect.equal a (render s 120.0 16000.0 0.25) "pure: same inputs, same samples"
        }

        test "a rendered /i/ has far more energy near 2400 Hz than a rendered /u/" {
            Expect.isTrue (symbolPower "i" 2400.0 > 10.0 * symbolPower "u" 2400.0) "F2 of i is high"
        }

        test "a rendered /a/ has far more energy near 850 Hz than a rendered /i/" {
            Expect.isTrue (symbolPower "a" 850.0 > 10.0 * symbolPower "i" 850.0) "F1 of a is high"
        }
    ]

[<EntryPoint>]
let main argv = runTestsInAssemblyWithCLIArgs [] argv
