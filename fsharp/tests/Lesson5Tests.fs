module Lesson5Tests

open Expecto
open IpaTrombone.TongueSpace
open IpaTrombone.Score
open IpaTrombone.Planner
open IpaTrombone.Voices

let private find (id: string) : Voice =
    match voiceById id with
    | Some v -> v
    | None -> failwithf "no voice %s" id

let private close (a: float) (b: float) = abs (a - b) < 1e-9

[<Tests>]
let voiceTests =
    testList "Lesson 5: voices" [

        test "the presets have unique ids and plausible numbers" {
            Expect.equal (voices |> List.map (fun v -> v.Id) |> List.distinct |> List.length) voices.Length "unique ids"
            for v in voices do
                Expect.isTrue (v.TractCm >= 8.0 && v.TractCm <= 28.0) (v.Id + " tract")
                Expect.isTrue (v.F0 >= 50.0 && v.F0 <= 600.0) (v.Id + " pitch")
            for id in [ "soprano"; "child"; "man"; "woman" ] do
                Expect.isSome (voiceById id) id
            Expect.isNone (voiceById "nobody") "unknown voice"
        }

        test "shorter tracts belong to higher voices: children are above men" {
            Expect.isTrue ((find "child").TractCm < (find "man").TractCm) "tract"
            Expect.isTrue ((find "child").F0 > (find "man").F0) "pitch"
            Expect.isTrue ((find "giant").TractCm > (find "bass").TractCm) "giant"
        }

        test "every voice says a phrase, and the speech carries its tract length" {
            for v in voices do
                let s = speak v "ˈhɛloʊ wɜːld"
                Expect.equal s.TractCm v.TractCm v.Id
                Expect.isTrue (s.Plan.Marks.Length > 5) (v.Id + " marks")
                Expect.isTrue (s.Plan.Score.Keyframes |> List.forall (fun k -> not (System.Double.IsNaN k.Frame.F0))) (v.Id + " finite")
        }

        test "a voice sets the pitch of the plan" {
            let high = speak (find "soprano") "aː"
            let low = speak (find "bass") "aː"
            let top (s: Speech) = s.Plan.Score.Keyframes |> List.map (fun k -> k.Frame.F0) |> List.max
            Expect.isTrue (top high > 3.0 * top low) "soprano is far above bass"
        }

        test "a whisper has no voicing and still has breath" {
            let s = speak (find "whisper") "ˈhɛloʊ"
            Expect.isTrue (s.Plan.Score.Keyframes |> List.forall (fun k -> k.Frame.Intensity = 0.0)) "no voicing"
            Expect.isTrue (s.Plan.Score.Keyframes |> List.exists (fun k -> k.Frame.Aspiration > 1.0)) "breath instead"
        }

        test "whisperScore turns voicing into breath and caps it" {
            let loud = { defaultFrame with Intensity = 1.0; Aspiration = 0.5 }
            let w = whisperScore { Keyframes = [ { T = 0.0; Frame = loud } ]; Duration = 0.0 }
            let f = (List.head w.Keyframes).Frame
            Expect.equal f.Intensity 0.0 "voice off"
            Expect.equal f.Aspiration 3.5 "breath in its place"
            let cap = whisperScore { Keyframes = [ { T = 0.0; Frame = { loud with Aspiration = 3.9 } } ]; Duration = 0.0 }
            Expect.equal (List.head cap.Keyframes).Frame.Aspiration 4.0 "never above 4"
        }

        test "a soprano has vibrato and a robot does not, and the robot is monotone" {
            let vibrato id = (speak (find id) "aːːː").Plan.Score.Keyframes |> List.map (fun k -> k.Frame.VibratoDepth) |> List.max
            Expect.isTrue (vibrato "soprano" > 0.02) "soprano"
            Expect.equal (vibrato "robot") 0.0 "robot"
            let pitches =
                (speak (find "robot") "ˈaˈa").Plan.Score.Keyframes
                |> List.filter (fun k -> k.Frame.Intensity > 0.9)
                |> List.map (fun k -> k.Frame.F0)
            Expect.isTrue (List.max pitches / List.min pitches < 1.01) "no accent, no declination"
        }

        test "changing one number of a preset is a record update" {
            let low = speak { (find "man") with F0 = 90.0 } "aː"
            let pitch = low.Plan.Score.Keyframes |> List.map (fun k -> k.Frame.F0) |> List.max
            Expect.isTrue (pitch < 100.0) "a lower man"
        }

        test "formants scale with the tract: halve the length, double the formants" {
            Expect.isTrue (close (formantScale 8.55) 2.0) "half of 17.1"
            Expect.equal (formantScale defaultTractCm) 1.0 "the reference"
            let a = (vowels |> List.find (fun v -> v.Symbol = "a")).Sound
            let child = inTract 11.5 a
            Expect.isTrue (close (child.F1 / a.F1) (17.1 / 11.5)) "F1"
            Expect.isTrue (close (child.F2 / a.F2) (17.1 / 11.5)) "F2"
        }
    ]
