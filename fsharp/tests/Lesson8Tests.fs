module Lesson8Tests

open System.IO
open Expecto
open IpaTrombone.Languages
open IpaTrombone.Ipa
open IpaTrombone.Planner
open IpaTrombone.Accents

let private apply (text: string) (rules: string) : string = (applyAccent (parseAccent rules) text).Ipa

let private sentence = "ðə ˈθɪŋ ɪz ˈvɛɹi ˈɡʊd ˈbʌtə ˈskuːl ˈɪŋɡlɪʃ ˈhɛloʊ ˈmɪlk ˈstɹiːt ˈʃiːp ˈwɔtə"

// The shipped rule files. The tests run from the test project's folder, three levels under the repo.
let private root : string =
    let rec up (dir: DirectoryInfo) =
        if File.Exists(Path.Combine(dir.FullName, "package.json")) then dir.FullName else up dir.Parent
    up (DirectoryInfo(System.AppContext.BaseDirectory))

let private load (id: string) : Accent =
    parseAccent (File.ReadAllText(Path.Combine(root, "data", "accents", id + ".rules")))

[<Tests>]
let accentTests =
    testList "Lesson 8: accents as rewrite rules" [

        test "a plain rule replaces every occurrence" {
            Expect.equal (apply "ˈθɪŋ ˈθɹiː" "θ > t") "ˈtɪŋ ˈtɹiː" "θ becomes t"
        }

        test "contexts: between vowels, word-initial, word-final" {
            Expect.equal (apply "ˈbʌtə ˈtɪn ˈkæt" "t > ʔ / V _ V") "ˈbʌʔə ˈtɪn ˈkæt" "between vowels"
            Expect.equal (apply "ˈhɛloʊ ˈhɪt" "h > ∅ / # _") "ˈɛloʊ ˈɪt" "word-initial"
            Expect.equal (apply "ˈkæt ˈtæk" "t > d / _ #") "ˈkæd ˈtæk" "word-final"
        }

        test "sets and classes" {
            Expect.equal (apply "ˈmɪlk ˈmɪla" "l > ʊ / V _ {C,#}") "ˈmɪʊk ˈmɪla" "a set of a class and a boundary"
            Expect.equal (apply "pit bit" "{p,b} > f") "fit fit" "a set of symbols"
        }

        test "multi-segment patterns and diphthongs" {
            Expect.equal (apply "ˈɡoʊ" "o ʊ > ə ʊ") "ˈɡəʊ" "two segments"
            Expect.equal (apply "ˈmaɪ" "aɪ > ɑɪ") "ˈmɑɪ" "written together"
        }

        test "deletion moves the stress mark on; insertion keeps it on the right segment" {
            Expect.equal (apply "ˈhɛlp" "h > ∅ / # _") "ˈɛlp" "stress moves to the next segment"
            Expect.equal (apply "ˈskuːl" "∅ > e / # _ s {p,t,k}") "eˈskuːl" "stress stays on the s"
        }

        test "rules apply in order, each on the result of the last" {
            Expect.equal (apply "a" "a > b\nb > c") "c" "a to b to c"
            Expect.equal (apply "a" "b > c\na > b") "b" "the other order"
        }

        test "a rule cannot feed itself, and insertion terminates" {
            Expect.equal (apply "ta" "t > t t") "tta" "t > tt once"
            Expect.equal (apply "ka" "∅ > a / # _ k") "aka" "inserted once"
        }

        test "modifiers survive a replacement of the same kind" {
            Expect.equal (apply "ˈiː pʰa" "i > e\np > b") "ˈeː bʰa" "length and aspiration stay"
        }

        test "broken rules are reported with line numbers, not thrown" {
            let a = parseAccent "θ > s\nnonsense\nq? > x\n@rhythm sideways\na > b / _ _"
            Expect.equal a.Rules.Length 1 "one good rule"
            Expect.equal (a.Errors |> List.map (fun e -> e.Line)) [ 2; 3; 4; 5 ] "four bad lines"
            Expect.equal (a.Errors |> List.map (fun e -> e.Message)) [
                "expected  A > B  or  A > B / left _ right"
                "\"q?\" is not IPA"
                "@rhythm must be stress or syllable"
                "a context needs exactly one _" ] "and the reasons"
        }

        test "directives and comments" {
            let a = parseAccent "# a comment\n@name Test\n@about About it.\n@rhythm stress\n@strip length\n\nθ > s"
            Expect.equal a.Name "Test" "name"
            Expect.equal a.About "About it." "about"
            Expect.equal a.Rhythm (Some Rhythm.Stress) "rhythm"
            Expect.equal a.Strip [ "length" ] "strip"
            Expect.equal a.Errors [] "no errors"
            Expect.equal (applyAccent a "ˈaː θ").Ipa "ˈa s" "strip removes length"
        }

        test "the trace says which rule changed what" {
            let steps = (applyAccent (parseAccent "θ > t\nŋ > n") "ˈθɪŋ").Trace
            Expect.equal (steps |> List.map (fun t -> (t.Rule, t.Before, t.After))) [ (0, "θ", "t"); (1, "ŋ", "n") ] "two steps"
        }

        test "syllable breaks are dropped and word breaks are kept" {
            Expect.equal (apply "ˈhɛ.loʊ ˈwɜːld" "θ > s") "ˈhɛloʊ ˈwɜːld" "the dot goes"
        }

        test "every shipped accent is listed, parses cleanly, and has a name" {
            for (id, _) in accents do
                let a = load id
                Expect.equal a.Errors [] id
                Expect.isTrue (a.Name <> "") id
                if id <> "none" then Expect.isTrue (a.Rules.Length > 0) id
        }

        test "every accent changes the sentence (except none), and stays playable" {
            for (id, _) in accents do
                let out = applyAccent (load id) sentence
                if id = "none" then Expect.equal out.Ipa sentence id else Expect.notEqual out.Ipa sentence id
                Expect.isFalse (tokenize out.Ipa |> List.exists (fun t -> match t with Unknown _ -> true | _ -> false)) (id + ": " + out.Ipa)
                Expect.isTrue ((plan defaultPlanOptions out.Ipa).Marks.Length > 10) id
        }

        test "the accents do what they say" {
            let say (id: string) (text: string) = (applyAccent (load id) text).Ipa
            Expect.equal (say "spanish" "ˈskuːl") "eˈskul" "Spanish adds an e"
            Expect.equal (say "spanish" "ðɪs") "dis" "and has no ð"
            Expect.equal (say "cockney" "ˈbʌtə") "ˈbʌʔə" "Cockney glottal stop"
            Expect.equal (say "cockney" "ˈhɛloʊ") "ˈɛloʊ" "drops its h"
            Expect.equal (say "rp" "ˈkɑːɹ") "ˈkɑː" "non-rhotic"
            Expect.equal (say "rp" "ˈɹɛd") "ˈɹɛd" "but keeps r before a vowel"
            Expect.equal (say "american" "ˈbʌtə") "ˈbʌɾə" "flapping"
            Expect.equal (say "german" "ˈɡʊd") "ˈɡʊt" "final devoicing"
            Expect.equal (say "indian" "ˈtɛn") "ˈʈɛn" "retroflex t"
            for word in (say "japanese" "ˈbɛd ˈmɪlk ˈskuːl ˈʃɪp").Split(' ') do
                Expect.isTrue ("aeiou".Contains(word.[word.Length - 1])) word
        }

        test "accents can carry a rhythm" {
            Expect.equal (load "spanish").Rhythm (Some Rhythm.Syllable) "Spanish is syllable-timed"
            Expect.equal (load "rp").Rhythm None "RP says nothing"
        }
    ]
