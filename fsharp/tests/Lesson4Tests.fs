module Lesson4Tests

open System
open Expecto
open FsCheck
open IpaTrombone.G2p
open IpaTrombone.Languages

let private wordsFrom (alphabet: string) : Arbitrary<string> =
    Gen.elements (alphabet.ToCharArray())
    |> Gen.nonEmptyListOf
    |> Gen.resize 9
    |> Gen.map (fun (chars: char list) -> String(Array.ofList chars))
    |> Arb.fromGen

let private spanishWords = wordsFrom "abcdefghijklmnñopqrstuvwxyzáéíóúü"
let private indonesianWords = wordsFrom "abcdefghijklmnopqrstuvwxyzé"

let private count (ch: char) (text: string) : int = text |> Seq.filter (fun c -> c = ch) |> Seq.length

[<Tests>]
let spanishTests =
    testList "Lesson 4, part 1: Spanish spelling rules" [

        test "common words" {
            let cases =
                [ ("hola", "ˈola")
                  ("mundo", "ˈmundo")
                  ("gato", "ˈɡato")
                  ("queso", "ˈkeso")
                  ("niño", "ˈniɲo")
                  ("tren", "tɾen")
                  ("perro", "ˈpero")
                  ("jamón", "xaˈmon")
                  ("leer", "leˈeɾ")
                  ("xilófono", "ksiˈlofono") ]
            for (word, ipa) in cases do
                Expect.equal (spanishToIpa word) ipa word
        }

        test "c before e or i is s; guerra keeps its g hard; pingüino pronounces the u" {
            Expect.equal (spanishToIpa "cinco") "ˈsiŋko" "c is s and n before k is ŋ"
            Expect.equal (spanishToIpa "guerra") "ˈɡera" "gu before e is ɡ"
            Expect.equal (spanishToIpa "pingüino") "piŋˈɡwino" "ü is pronounced"
            Expect.equal (spanishToIpa "quien") "kjen" "qu is k"
        }

        test "b d g soften between vowels and not at the start of a word" {
            Expect.equal (spanishToIpa "lago") "ˈlaɣo" "g between vowels"
            Expect.equal (spanishToIpa "ciudad") "sjuˈðað" "d after a vowel"
            Expect.equal (spanishToIpa "vaca") "ˈbaka" "v at the start is b"
        }

        test "an accent mark moves the stress and protects a weak vowel" {
            Expect.equal (spanishToIpa "canción") "kansˈjon" "stress on the last syllable"
            Expect.equal (spanishToIpa "día") "ˈdia" "í is a vowel, not a glide"
            Expect.equal (spanishToIpa "bueno") "ˈbweno" "u is a glide next to e"
        }

        test "stress is on the next-to-last syllable, or the last if the word ends in a consonant but n or s" {
            Expect.equal (spanishToIpa "ciudad") "sjuˈðað" "ends in d: last"
            Expect.equal (spanishToIpa "mesa") "ˈmesa" "ends in a: next to last"
            Expect.equal (spanishToIpa "casas") "ˈkasas" "ends in s: next to last"
        }

        test "a word of one syllable carries no stress mark" {
            Expect.equal (spanishToIpa "rey") "rej" "ey is one syllable"
            Expect.isFalse ((spanishToIpa "tren").Contains "ˈ") "tren"
        }

        test "the empty word is empty" {
            Expect.equal (spanishToIpa "") "" "nothing in, nothing out"
        }

        testProperty "any spelling gives at most one stress mark, and never throws" (Prop.forAll spanishWords (fun w ->
            count 'ˈ' (spanishToIpa w) <= 1))
    ]

[<Tests>]
let indonesianTests =
    testList "Lesson 4, part 1: Indonesian spelling rules" [

        test "common words" {
            let cases =
                [ ("halo", "ˈhalo")
                  ("dunia", "duˈnia")
                  ("nyanyi", "ˈɲaɲi")
                  ("bangun", "ˈbaŋun")
                  ("saya", "ˈsaja")
                  ("syukur", "ˈʃukur")
                  ("khas", "xas")
                  ("ya", "ja")
                  ("baik", "baiʔ")
                  ("pulau", "ˈpulau") ]
            for (word, ipa) in cases do
                Expect.equal (indonesianToIpa word) ipa word
        }

        test "a schwa does not take the stress" {
            Expect.equal (indonesianToIpa "sekolah") "səˈkolah" "stress moves off the schwa"
            Expect.equal (indonesianToIpa "kerja") "kərˈd͡ʒa" "and again"
        }

        testProperty "any spelling gives at most one stress mark, and never throws" (Prop.forAll indonesianWords (fun w ->
            count 'ˈ' (indonesianToIpa w) <= 1))
    ]

let private entriesOf (text: string) : Dictionary = parseDictionary text

[<Tests>]
let languageTests =
    testList "Lesson 4, part 2: languages and dictionaries" [

        test "there are ten languages with unique codes, including English and Spanish" {
            Expect.equal languages.Length 10 "ten"
            Expect.equal (languages |> List.map (fun l -> l.Code) |> List.distinct |> List.length) 10 "unique codes"
            Expect.isSome (languageByCode "en") "English"
            Expect.isSome (languageByCode "es") "Spanish"
            Expect.isNone (languageByCode "xx") "no such language"
        }

        test "only Spanish and Indonesian have spelling rules" {
            let withRules = languages |> List.filter (fun l -> l.Rules.IsSome) |> List.map (fun l -> l.Code)
            Expect.equal withRules [ "es"; "id" ] "rules"
        }

        test "parsing skips comments and blank lines, and trims" {
            let d = entriesOf "# comment\n\nHola\thˈola \r\n  mundo\tmˈundo\nbad line\nempty\t\n"
            Expect.equal d [ ("hola", "hˈola"); ("mundo", "mˈundo") ] "two entries, in order"
        }

        test "a word written twice keeps its place and takes the later meaning" {
            let d = entriesOf "a\t1\nb\t2\na\t3"
            Expect.equal d [ ("a", "3"); ("b", "2") ] "replaced in place"
        }

        test "words are lower-cased and stripped of punctuation at the ends only" {
            Expect.equal (normalizeWord "¡Hola!") "hola" "inverted marks"
            Expect.equal (normalizeWord "don't") "don't" "inside stays"
            Expect.equal (normalizeWord "...") "" "nothing left"
            Expect.equal (normalizeWord "Привет,") "привет" "other scripts"
        }

        test "lookup ignores accents, and says where an answer came from" {
            let d = entriesOf "días\tdˈias"
            let es = languageByCode "es"
            let hit = (lookupWord es d "Dias,").Value
            Expect.equal hit.Ipa (Some "dˈias") "found without the accent"
            Expect.equal hit.Source FromDictionary "from the dictionary"
            Expect.equal (lookupWord es d "zapato").Value.Source FromRules "an unknown word falls back to the rules"
            Expect.equal (lookupWord (languageByCode "en") d "zxqv").Value.Source Missing "English has no rules"
            Expect.isNone (lookupWord es d "?!") "nothing to look up"
        }

        test "text becomes IPA, and the words nothing knows are reported but not spoken" {
            let d = entriesOf "hello\thɛlˈoʊ\nworld\twˈɜːld"
            let phrase = textToIpa (languageByCode "en") d "Hello, xyz world"
            Expect.equal phrase.Ipa "hɛlˈoʊ wˈɜːld" "known words only"
            Expect.equal (phrase.Words |> List.map (fun w -> w.Source)) [ FromDictionary; Missing; FromDictionary ] "each word's source"
        }
    ]
