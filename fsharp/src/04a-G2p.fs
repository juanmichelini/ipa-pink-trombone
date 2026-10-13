// # Spelling to sound, by rules
//
// A dictionary only knows the words someone wrote down. Some writing systems are regular enough
// that rules can guess the rest, and **Spanish** and **Indonesian** are two of them. This file holds
// those rules. English, French and Portuguese spelling is too irregular for a short rule set to be
// honest, so those languages rely on their dictionaries alone, and the demo says so when a word is
// missing.
//
// Both converters work the same way, in three steps:
//
// 1. spell the word as a list of **phones**, each a sound with a few flags (is it a vowel? does it
//    stick to the vowel before it? ...)
// 2. cut the list into syllables, using the usual rule that a single consonant between vowels
//    starts the next syllable, and that two consonants split unless they form a cluster that can
//    start a word (`pr`, `bl`, ...)
// 3. put the stress mark before the stressed syllable
//
// The JavaScript version edits the list of units in place, one pass after another. Here every
// pass is a function from a list to a list, so the passes read like the rules in a grammar book:
// each takes the answer of the one before and none of them can reach back and change it.
module IpaTrombone.G2p

// ## A phone
//
// One sound of the word, with flags the later passes need:
//
// - `Vowel`: it can be the middle of a syllable
// - `Joins`: it is stuck to the vowel before it, as the `i` of an Indonesian `ai`
// - `Strong`: an `a`, `e` or `o`. Next to one of these an `i` or `u` is only a glide
// - `Lenite`: a stop that softens between vowels (Spanish `b d g`)
// - `Glide`: a weak vowel that has been turned into `j` or `w`
type Phone =
    { Sound: string
      Vowel: bool
      Joins: bool
      Strong: bool
      Lenite: bool
      Glide: bool }

let private consonant (sound: string) : Phone =
    { Sound = sound
      Vowel = false
      Joins = false
      Strong = false
      Lenite = false
      Glide = false }

let private vowelOf (sound: string) (strong: bool) : Phone =
    { (consonant sound) with Vowel = true; Strong = strong }

// ## Shared: syllables and stress
//
// `syllabify` walks the phones. Each vowel starts a syllable's nucleus, which also takes any
// vowels that join it. Then it looks at the consonants up to the next vowel:
//
// - at the end of the word they all stay with this syllable
// - one consonant between vowels starts the next syllable
// - two or more are split, but the last two start the next syllable together when they form a
//   cluster that may begin a word
//
// `clusters` is that list of allowed pairs, written as the two sounds joined.
let syllabify (clusters: Set<string>) (phones: Phone list) : Phone list list =
    let all = Array.ofList phones
    let count = all.Length
    let rec joined (j: int) : int =
        if j < count && all.[j].Vowel && all.[j].Joins then joined (j + 1) else j
    let rec consonantsEnd (k: int) : int =
        if k < count && not all.[k].Vowel then consonantsEnd (k + 1) else k
    let slice (from: int) (until: int) : Phone list = [ for x in from .. until - 1 -> all.[x] ]
    // `current` holds the onset consonants waiting for their vowel.
    let rec go (i: int) (current: Phone list) (finished: Phone list list) : Phone list list =
        if i >= count then
            match current, finished with
            | [], _ -> List.rev finished
            | _, [] -> [ current ]
            | _, last :: before -> List.rev ((last @ current) :: before)
        elif not all.[i].Vowel then
            go (i + 1) (current @ [ all.[i] ]) finished
        else
            let j = joined (i + 1)
            let k = consonantsEnd j
            let nucleus = current @ [ all.[i] ] @ slice (i + 1) j
            if k = count then
                List.rev ((nucleus @ slice j k) :: finished)
            else
                let between = k - j
                let keep =
                    if between >= 2 then
                        let lastTwo = all.[k - 2].Sound + all.[k - 1].Sound
                        if clusters.Contains lastTwo then between - 2 else between - 1
                    else
                        0
                go (j + keep) [] ((nucleus @ slice j (j + keep)) :: finished)
    go 0 [] []

// Writes syllables out as IPA, with the stress mark in front of syllable `stressed`, if there is
// more than one syllable. A one-syllable word carries no mark.
let render (syllables: Phone list list) (stressed: int) : string =
    let count = List.length syllables
    syllables
    |> List.mapi (fun n s ->
        (if count > 1 && n = stressed then "ˈ" else "")
        + (s |> List.map (fun p -> p.Sound) |> String.concat ""))
    |> String.concat ""

// ## Spanish
//
// Latin American Spanish: `c` before `e`, `i` and `z` are `s` (seseo) and `ll` is `ʝ`. The stop
// consonants `b d g` turn into approximants `β ð ɣ` between vowels, because the tongue does not
// quite close. Stress is on the next-to-last syllable unless the word ends in a consonant other
// than `n` or `s`, or has an accent mark that says otherwise.
let private spanishClusters : Set<string> =
    set [ "pɾ"; "pl"; "bɾ"; "bl"; "tɾ"; "dɾ"; "kɾ"; "kl"; "ɡɾ"; "ɡl"; "fɾ"; "fl"; "βɾ"; "ðɾ"; "ɣɾ"; "ɣl"; "βl"; "kw"; "ɡw" ]

let private accented : Map<char, char> =
    Map.ofList [ 'á', 'a'; 'é', 'e'; 'í', 'i'; 'ó', 'o'; 'ú', 'u' ]

let private plainVowels : Set<char> = set [ 'a'; 'e'; 'i'; 'o'; 'u' ]

// Which phone is the `n`th vowel (counting glides, which started as vowels)?
let private nthVowel (phones: Phone[]) (n: int) : int =
    phones
    |> Array.indexed
    |> Array.filter (fun (_, p) -> p.Vowel || p.Glide)
    |> Array.tryItem n
    |> Option.map fst
    |> Option.defaultValue -1

// ### Pass 1: spell it
//
// Read the letters left to right. Most rules look at the next letter (`c` is `s` before `e` and
// `i`), and a few use two letters at once (`ch`, `ll`, `rr`, `qu`). The function also notes where
// an accent mark was seen, as "this is the `n`th vowel", because an accent overrides the stress
// rule at the end.
let private spanishSpelling (w: string) : Phone list * int option =
    let letter (k: int) : char option = if k >= 0 && k < w.Length then Some w.[k] else None
    let rec go (i: int) (reversed: Phone list) (stress: int option) : Phone list * int option =
        if i >= w.Length then
            (List.rev reversed, stress)
        else
            let c = w.[i]
            let n = letter (i + 1)
            let two = w.Substring(i, min 2 (w.Length - i))
            let front (ch: char option) = (ch = Some 'e' || ch = Some 'i' || ch = Some 'é' || ch = Some 'í')
            let frontNext = front n
            let emit (p: Phone) = go (i + 1) (p :: reversed) stress
            let emitAndSkip (extra: int) (ps: Phone list) = go (i + 1 + extra) (List.rev ps @ reversed) stress
            if accented.ContainsKey c then
                let plain = accented.[c]
                let vowelsSoFar = reversed |> List.filter (fun p -> p.Vowel && not p.Glide) |> List.length
                go (i + 1) (vowelOf (string plain) (plain <> 'i' && plain <> 'u') :: reversed) (Some vowelsSoFar)
            elif plainVowels.Contains c then
                emit (vowelOf (string c) (c = 'a' || c = 'e' || c = 'o'))
            elif two = "ch" then
                emitAndSkip 1 [ consonant "t͡ʃ" ]
            elif two = "ll" then
                emitAndSkip 1 [ consonant "ʝ" ]
            elif two = "rr" then
                emitAndSkip 1 [ consonant "r" ]
            elif c = 'q' && n = Some 'u' then
                emitAndSkip 1 [ consonant "k" ]
            elif c = 'g' && n = Some 'u' && front (letter (i + 2)) then
                emitAndSkip 1 [ consonant "ɡ" ]
            elif c = 'g' && n = Some 'ü' then
                emitAndSkip 1 [ consonant "ɡ"; consonant "w" ]
            elif c = 'c' then
                emit (consonant (if frontNext then "s" else "k"))
            elif c = 'z' || c = 's' then
                emit (consonant "s")
            elif c = 'g' then
                emit { (consonant (if frontNext then "x" else "ɡ")) with Lenite = not frontNext }
            elif c = 'j' then
                emit (consonant "x")
            elif c = 'h' then
                go (i + 1) reversed stress
            elif c = 'ñ' then
                emit (consonant "ɲ")
            elif c = 'v' || c = 'b' then
                emit { (consonant "b") with Lenite = true }
            elif c = 'd' then
                emit { (consonant "d") with Lenite = true }
            elif c = 'r' then
                let atStart = List.isEmpty reversed || (letter (i - 1) = Some 'n' || letter (i - 1) = Some 'l' || letter (i - 1) = Some 's')
                emit (consonant (if atStart then "r" else "ɾ"))
            elif c = 'y' then
                match n with
                | Some next when plainVowels.Contains next -> emit (consonant "ʝ")
                | _ -> emit (vowelOf "i" false)
            elif c = 'x' then
                emitAndSkip 0 [ consonant "k"; consonant "s" ]
            else
                // k m n p t l f w are themselves, and anything else is passed through untouched so
                // the caller can see it.
                emit (consonant (string c))
    go 0 [] None

// ### Pass 2: glides
//
// Weak vowels next to another vowel are glides: `bwenos`, `djes`. A weak vowel is an `i` or `u`
// (the ones that are not `Strong`), and an accent mark protects it: `día` keeps its two vowels.
let private glides (stress: int option) (phones: Phone list) : Phone list =
    let all = Array.ofList phones
    let accentedAt = stress |> Option.map (nthVowel all)
    all
    |> Array.indexed
    |> Array.fold
        (fun (processed: Phone list) (i, p) ->
            let before = match processed with b :: _ -> b.Vowel | [] -> false
            let after = i + 1 < all.Length && all.[i + 1].Vowel
            if p.Vowel && not p.Strong && accentedAt <> Some i && (before || after) then
                { p with Sound = (if p.Sound = "i" then "j" else "w"); Glide = true; Vowel = false } :: processed
            else
                p :: processed)
        []
    |> List.rev

// ### Pass 3: lenition
//
// Stops become approximants after a vowel (or a glide).
let private lenition (phones: Phone list) : Phone list =
    let all = Array.ofList phones
    all
    |> Array.mapi (fun i p ->
        if i > 0 && p.Lenite && (all.[i - 1].Vowel || all.[i - 1].Glide) then
            let soft =
                match p.Sound with
                | "b" -> "β"
                | "d" -> "ð"
                | "ɡ" -> "ɣ"
                | other -> other
            { p with Sound = soft }
        else
            p)
    |> List.ofArray

// ### Pass 4: `n` before a velar is itself velar: `cinco` is `siŋko`.
let private velarNasal (phones: Phone list) : Phone list =
    let all = Array.ofList phones
    all
    |> Array.mapi (fun i p ->
        if p.Sound = "n" && i + 1 < all.Length && List.contains all.[i + 1].Sound [ "k"; "ɡ"; "x" ] then
            { p with Sound = "ŋ" }
        else
            p)
    |> List.ofArray

// ### Stress
//
// Penultimate stress, unless the word ends in a consonant other than `n` or `s`. An accent mark
// moves it to the syllable holding the accented vowel.
let spanishToIpa (word: string) : string =
    let w = word.ToLowerInvariant().Normalize()
    let (spelled, stress) = spanishSpelling w
    let phones = spelled |> glides stress |> lenition |> velarNasal
    let syllables = syllabify spanishClusters phones
    let lastLetter = if w.Length = 0 then ' ' else w.[w.Length - 1]
    let endsVowelNS = plainVowels.Contains lastLetter || accented.ContainsKey lastLetter || lastLetter = 'n' || lastLetter = 's'
    let byRule = List.length syllables - (if endsVowelNS then 2 else 1)
    let stressed =
        match stress with
        | None -> byRule
        | Some n ->
            let accentedPhone = nthVowel (Array.ofList phones) n
            let starts = syllables |> List.map List.length |> List.scan (+) 0
            starts
            |> List.pairwise
            |> List.tryFindIndex (fun (a, b) -> accentedPhone >= a && accentedPhone < b)
            |> Option.defaultValue -1
    render syllables (max 0 stressed)

// ## Indonesian
//
// Spelling is nearly phonemic. `c` is `t͡ʃ`, `j` is `d͡ʒ`, `y` is `j`, `ny` is `ɲ`, `ng` is `ŋ`,
// `sy` is `ʃ`, `kh` is `x`, and the plain `e` is the schwa `ə`. A final `k` is a glottal stop.
// Stress falls on the next-to-last syllable unless that syllable's vowel is a schwa.
let private indonesianClusters : Set<string> =
    set [ "pr"; "pl"; "br"; "bl"; "tr"; "dr"; "kr"; "kl"; "ɡr"; "ɡl"; "fr"; "fl"; "st"; "sk"; "sp" ]

let private indonesianVowels : Set<char> = set [ 'a'; 'i'; 'u'; 'e'; 'o'; 'é' ]

let private indonesianSpelling (w: string) : Phone list =
    let rec go (i: int) (reversed: Phone list) : Phone list =
        if i >= w.Length then
            List.rev reversed
        else
            let c = w.[i]
            let two = w.Substring(i, min 2 (w.Length - i))
            let emit (p: Phone) = go (i + 1) (p :: reversed)
            let emit2 (sound: string) = go (i + 2) (consonant sound :: reversed)
            if indonesianVowels.Contains c then
                emit (vowelOf (if c = 'e' then "ə" elif c = 'é' then "e" else string c) false)
            elif two = "ny" then emit2 "ɲ"
            elif two = "ng" then emit2 "ŋ"
            elif two = "sy" then emit2 "ʃ"
            elif two = "kh" then emit2 "x"
            elif c = 'c' then emit (consonant "t͡ʃ")
            elif c = 'j' then emit (consonant "d͡ʒ")
            elif c = 'y' then emit (consonant "j")
            elif c = 'k' && i = w.Length - 1 then emit (consonant "ʔ")
            elif c = 'g' then emit (consonant "ɡ")
            else emit (consonant (string c))
    go 0 []

// Diphthongs `ai`, `au` and `oi`: the second vowel is glued to the first, and the first knows it
// has a partner, so `syllabify` keeps the pair in one syllable.
let private diphthongs (phones: Phone list) : Phone list =
    let all = Array.ofList phones
    let isTail (i: int) =
        i > 0
        && all.[i - 1].Vowel
        && all.[i].Vowel
        && ((all.[i - 1].Sound = "a" && (all.[i].Sound = "i" || all.[i].Sound = "u"))
            || (all.[i - 1].Sound = "o" && all.[i].Sound = "i"))
    all
    |> Array.mapi (fun i p ->
        let tail = p.Joins || isTail i
        let hasTail = i + 1 < all.Length && (all.[i + 1].Joins || isTail (i + 1))
        { p with Joins = tail || hasTail })
    |> List.ofArray

let indonesianToIpa (word: string) : string =
    let w = word.ToLowerInvariant().Normalize()
    let syllables = indonesianSpelling w |> diphthongs |> syllabify indonesianClusters
    let penultimate = List.length syllables - 2
    // A schwa does not take the stress; it moves to the last syllable.
    let stressed =
        if penultimate >= 0 && List.length syllables >= 2 then
            match List.item penultimate syllables |> List.tryFind (fun p -> p.Vowel) with
            | Some v when v.Sound = "ə" -> List.length syllables - 1
            | _ -> penultimate
        else
            penultimate
    render syllables (max 0 stressed)
