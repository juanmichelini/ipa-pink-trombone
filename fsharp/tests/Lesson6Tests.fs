module Lesson6Tests

open Expecto
open IpaTrombone.Score
open IpaTrombone.Ipa
open IpaTrombone.Planner
open IpaTrombone.Tempo

let private phrase = "ˈhɛloʊ ˈmaɪ ˈneɪm ɪz ˈkætʃ"

let private close (a: float) (b: float) = abs (a - b) < 1e-9

[<Tests>]
let tempoTests =
    testList "Lesson 6: tempo" [

        test "twice the rate is shorter, but less than twice as short: consonants resist" {
            let slow = speechLike 1.0 phrase
            let fast = speechLike 2.0 phrase
            Expect.isTrue (fast.Duration < slow.Duration * 0.8) "faster is shorter"
            Expect.isTrue (fast.Duration > slow.Duration * 0.5) "but not simply halved"
        }

        test "speech-like: vowels compress more than consonants" {
            let s = squeeze SpeechLike 2.0 phrase
            Expect.isTrue (s.Vowels < s.Consonants) (sprintf "vowels %.2f vs consonants %.2f" s.Vowels s.Consonants)
        }

        test "naive: everything compresses by the same factor" {
            let s = squeeze Naive 2.0 phrase
            Expect.isTrue (close s.Whole 0.5) "whole"
            Expect.isTrue (close s.Vowels 0.5) "vowels"
            Expect.isTrue (close s.Consonants 0.5) "consonants"
        }

        test "at rate 1 the two ways are the same" {
            Expect.equal (squeeze Naive 1.0 phrase) { Whole = 1.0; Vowels = 1.0; Consonants = 1.0 } "naive"
            Expect.equal (speechLike 1.0 phrase) (naive 1.0 phrase) "and they plan the same score"
        }

        test "the rate is monotonic: faster is always shorter" {
            let durations = [ 0.5; 0.75; 1.0; 1.5; 2.0; 3.0 ] |> List.map (fun r -> (speechLike r phrase).Duration)
            Expect.isTrue (durations |> List.pairwise |> List.forall (fun (a, b) -> b < a)) "strictly decreasing"
        }

        test "a stop keeps its silent closure at speed, but the naive way squeezes it away" {
            let real = silentClosure "p" (speechLike 3.0 "apa")
            let squeezed = silentClosure "p" (naive 3.0 "apa")
            Expect.isTrue (real >= 0.03) (sprintf "speech-like closure %.0f ms" (real * 1000.0))
            Expect.isTrue (squeezed < 0.02) (sprintf "naive closure %.0f ms" (squeezed * 1000.0))
        }

        test "a fast vowel falls short of its target: the fast i is less front" {
            let front (p: Plan) = p.Score.Keyframes |> List.map (fun k -> k.Frame.TongueIndex) |> List.max
            Expect.isTrue (front (speechLike 3.5 "ti") < front (speechLike 1.0 "ti")) "undershoot"
            Expect.isTrue (close (front (naive 3.5 "ti")) (front (naive 1.0 "ti"))) "naive reaches the same targets"
        }

        test "syllables per second rise with the rate" {
            let rateOf r = let p = speechLike r phrase in syllableRate p.Marks p.Duration
            Expect.isTrue (rateOf 2.0 > rateOf 1.0 * 1.4) "faster speech has more syllables per second"
            Expect.isTrue (rateOf 1.0 > 2.0 && rateOf 1.0 < 7.0) "and normal speech is a few per second"
        }

        test "naive marks stay in step with the score" {
            let p = naive 2.0 "ata"
            Expect.isTrue (p.Marks |> List.forall (fun m -> m.End <= p.Duration + 1e-9)) "no mark outlasts the utterance"
        }

        test "a segment that is not there has no closure" {
            Expect.equal (silentClosure "k" (speechLike 1.0 "apa")) 0.0 "no k in apa"
        }
    ]
