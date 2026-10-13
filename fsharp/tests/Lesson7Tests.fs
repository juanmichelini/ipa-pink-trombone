module Lesson7Tests

open Expecto
open IpaTrombone.Languages
open IpaTrombone.Ipa
open IpaTrombone.Planner
open IpaTrombone.Rhythms

let private sentence = "ðə ˈkæts ɑː ˈtʃeɪsɪŋ ðə ˈmaɪs ɪn ðə ˈɡɑːdən"

// A rhythm, then the planner told to follow it.
let private run (text: string) (mode: Rhythm) : RhythmPlan * Plan =
    let r = rhythmPlan mode defaultRhythmOptions text
    (r, plan { defaultPlanOptions with Overrides = r.Overrides } text)

let private variation (xs: float list) : float =
    let mean = List.average xs
    sqrt (xs |> List.averageBy (fun x -> (x - mean) * (x - mean))) / mean

[<Tests>]
let rhythmTests =
    testList "Lesson 7: rhythm" [

        test "syllabification: maximal onsets, diphthongs, stress boundaries" {
            Expect.equal (describe "ˈhɛloʊ") "ˈhɛ.loʊ" "hello"
            Expect.equal (describe "əˈstɹɔŋ") "ə.ˈstɹɔŋ" "the st cluster starts the second syllable"
            Expect.equal (describe "ˈsɪŋə") "ˈsɪŋ.ə" "ŋ cannot start a syllable"
            Expect.equal (describe "ˈbɛɹi ˈkaza") "ˈbɛ.ɹi ˈka.za" "two words"
            Expect.equal (describe "ˈtʃeɪsɪŋ") "ˈt͡ʃeɪ.sɪŋ" "eɪ is one nucleus"
            Expect.equal (describe "pɑː.ɾa") "pɑː.ɾa" "an explicit break"
        }

        test "every syllable has a nucleus and every vowel is in exactly one" {
            let syllables = syllabify sentence
            let vowels =
                tokenize sentence
                |> List.indexed
                |> List.choose (fun (i, t) ->
                    match t with
                    | Sound s when s.Kind = Kind.Vowel -> Some i
                    | _ -> None)
            Expect.equal (syllables |> List.collect (fun s -> s.Nucleus) |> List.sort) vowels "each vowel once"
            Expect.isTrue (syllables |> List.forall (fun s -> s.Nucleus.Length >= 1 && s.Nucleus.Length <= 2)) "one or two vowels"
        }

        test "syllables carry stress and count their consonants" {
            let s = syllabify "ˈhɛloʊ"
            Expect.equal (s |> List.map (fun x -> x.Stressed)) [ true; false ] "the first is stressed"
            Expect.equal (s |> List.map (fun x -> x.Consonants)) [ 1; 1 ] "h and l"
            Expect.isTrue (syllabify "ˌaˈa" |> List.head |> fun x -> x.Secondary) "secondary stress"
        }

        test "syllable-timed: syllables are nearly equal in length" {
            let (r, p) = run "ˈkasa ˈpero ˈnino ˈlibɾo" Rhythm.Syllable
            Expect.isTrue (variation (syllableDurations r.Syllables p.Marks) < 0.12) "the spread is small"
        }

        test "stress-timed: extra syllables squeeze into the beat" {
            let (_, bare) = run "ˈkæts ˈtʃeɪs ˈmaɪs" Rhythm.Stress
            let (_, extra) = run "ˈkæts ɑː ˈtʃeɪsɪŋ ðə ˈmaɪs" Rhythm.Stress
            Expect.isTrue (extra.Duration / bare.Duration < 1.3) "barely longer"
            let (_, bareS) = run "ˈkæts ˈtʃeɪs ˈmaɪs" Rhythm.Syllable
            let (_, extraS) = run "ˈkæts ɑː ˈtʃeɪsɪŋ ðə ˈmaɪs" Rhythm.Syllable
            Expect.isTrue (extraS.Duration / bareS.Duration > 1.5) "but a syllable-timed one grows with its syllables"
        }

        test "stress-timed rhythm is more uneven than syllable-timed rhythm (nPVI)" {
            let score mode =
                let (r, p) = run sentence mode
                nPVI (syllableDurations r.Syllables p.Marks)
            let stress = score Rhythm.Stress
            let syllable = score Rhythm.Syllable
            Expect.isTrue (stress > syllable + 15.0) (sprintf "stress %.0f vs syllable %.0f" stress syllable)
            Expect.isTrue (stress > 35.0 && syllable < 20.0) "in the textbook ranges"
        }

        test "unstressed vowels in a squeezed stress-timed syllable reduce toward schwa" {
            let (r, p) = run "ˈkæts ɑː ˈtʃeɪsɪŋ ðə ˈmaɪs" Rhythm.Stress
            Expect.isTrue (r.Overrides |> List.exists (fun (_, o) -> o.Symbol = Some "ə")) "something was reduced"
            Expect.isTrue (p.Marks |> List.exists (fun m -> m.Symbol = "ə")) "and the planner said it"
            let calm = rhythmPlan Rhythm.Syllable defaultRhythmOptions "ˈkæts ɑː ˈtʃeɪsɪŋ"
            Expect.isFalse (calm.Overrides |> List.exists (fun (_, o) -> o.Symbol.IsSome)) "syllable-timed speech does not reduce"
        }

        test "a language's own rhythm class chooses the mode" {
            let modeOf code = (languageByCode code).Value.Rhythm
            Expect.equal (modeOf "en") Rhythm.Stress "English"
            Expect.equal (modeOf "es") Rhythm.Syllable "Spanish"
        }

        test "durations: syllable-timed are equal but for stress; stress-timed feet fill a beat" {
            let s = syllabify "ˈa a ˈa"
            Expect.equal (durationsFor Rhythm.Syllable defaultRhythmOptions s) [ 0.24 * 1.1; 0.24; 0.24 * 1.1 ] "syllable-timed"
            let feet = durationsFor Rhythm.Stress defaultRhythmOptions s
            Expect.isTrue (abs (feet.[0] + feet.[1] - 0.45) < 1e-9) "a stressed syllable and its unstressed one share a beat"
        }

        test "rhythm and rate compose" {
            let r = rhythmPlan Rhythm.Stress defaultRhythmOptions sentence
            let at rate = (plan { defaultPlanOptions with Overrides = r.Overrides; Rate = rate } sentence).Duration
            Expect.isTrue (at 2.0 < at 1.0 * 0.8) "faster is shorter"
        }

        test "nPVI: equal durations are perfectly even, alternating ones are not" {
            Expect.equal (nPVI [ 0.1; 0.1; 0.1 ]) 0.0 "even"
            Expect.equal (nPVI [ 0.1 ]) 0.0 "one vowel has no variability"
            Expect.isTrue (nPVI [ 0.05; 0.15; 0.05; 0.15 ] > 90.0) "uneven"
        }

        test "vowelDurations merges a diphthong into one interval" {
            let p = plan defaultPlanOptions "ta ˈmaɪ"
            Expect.equal (vowelDurations p.Marks |> List.length) 2 "a, then aɪ"
        }
    ]
