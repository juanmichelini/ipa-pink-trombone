// # Languages and their dictionaries
//
// This is the registry for Demo 4: ten languages, each with a small **word → IPA dictionary** kept
// as plain text in `data/dictionaries/<code>.tsv` (one `word<TAB>ipa` per line, `#` for comments).
// Adding a word is a one-line pull request.
//
// ## Which ten?
//
// The ten most spoken languages by total speakers (native and second-language together) are
// English, Mandarin Chinese, Hindi, Spanish, Modern Standard Arabic, French, Bengali, Portuguese,
// Russian and Urdu or Indonesian, depending on the count. Urdu and Hindi are one spoken language
// with two scripts, and Hindi is already here, so Indonesian takes the tenth place. English and
// Spanish are the two the experiment names; they get the most words.
//
// ## What a dictionary can and cannot do
//
// These are **seed** dictionaries: a few dozen common words each, hand-transcribed in a broad,
// phonemic style, enough to make the idea work. They are not pronunciation authorities. Where the
// engine has no sound for a feature (Russian palatalisation, Arabic emphatics, Hindi dental
// consonants and breathy voice), the nearest available sound is used and the file says so.
//
// ## What stays outside the core
//
// Fetching a dictionary file over the network is input and output, and a pure core does neither.
// The browser does the fetching (`loadDictionary` in `lib/languages.js`) and hands this file the
// *text*; everything from there on is a function of that text.
module IpaTrombone.Languages

open System
open System.Globalization
open IpaTrombone.G2p

// ## Rhythm class
//
// Each language is tagged `Stress` or `Syllable` for the rhythm lesson. This is the traditional
// classification and a simplification: real languages sit on a spectrum (Brazilian Portuguese and
// Arabic are the ones most often argued about, and Hindi and Bengali are sometimes called
// mora-timed). The tag only chooses the default; the demo lets you override it.
type Rhythm =
    | Stress
    | Syllable

// A language, with its spelling rules if it has any. The rules are just a function from a word
// to IPA.
type Language =
    { Code: string
      Rhythm: Rhythm
      Name: string
      Native: string
      Rules: (string -> string) option
      Sample: string }

let private language code rhythm name native rules sample : Language =
    { Code = code
      Rhythm = rhythm
      Name = name
      Native = native
      Rules = rules
      Sample = sample }

let languages : Language list =
    [
        language "en" Stress "English" "English" None "hello world"
        language "es" Syllable "Spanish" "Español" (Some spanishToIpa) "hola mundo"
        language "zh" Syllable "Mandarin Chinese" "普通话" None "ni3hao3"
        language "hi" Syllable "Hindi" "हिन्दी" None "namaste"
        language "ar" Stress "Arabic (Standard)" "العربية" None "marhaban salaam"
        language "fr" Syllable "French" "Français" None "bonjour le monde"
        language "bn" Syllable "Bengali" "বাংলা" None "nomoshkar"
        language "pt" Stress "Portuguese (Brazil)" "Português" None "olá mundo"
        language "ru" Stress "Russian" "Русский" None "привет мир"
        language "id" Syllable "Indonesian" "Bahasa Indonesia" (Some indonesianToIpa) "halo dunia"
    ]

let languageByCode (code: string) : Language option =
    languages |> List.tryFind (fun l -> l.Code = code)

// ## Words
//
// Lower case, and with punctuation stripped from the ends. Interior apostrophes and hyphens stay.
// "Punctuation" here is anything that is neither a letter nor a number.
let private isLetter (c: char) : bool =
    match Char.GetUnicodeCategory c with
    | UnicodeCategory.UppercaseLetter
    | UnicodeCategory.LowercaseLetter
    | UnicodeCategory.TitlecaseLetter
    | UnicodeCategory.ModifierLetter
    | UnicodeCategory.OtherLetter -> true
    | _ -> false

let private isLetterOrNumber (c: char) : bool =
    isLetter c
    || (match Char.GetUnicodeCategory c with
        | UnicodeCategory.DecimalDigitNumber
        | UnicodeCategory.LetterNumber
        | UnicodeCategory.OtherNumber -> true
        | _ -> false)

let normalizeWord (word: string) : string =
    let lowered = word.Normalize().ToLowerInvariant()
    let chars = lowered.ToCharArray()
    let first = chars |> Array.tryFindIndex isLetterOrNumber
    let last = chars |> Array.tryFindIndexBack isLetterOrNumber
    match first, last with
    | Some a, Some b -> lowered.Substring(a, b - a + 1)
    | _ -> ""

// Accents removed, by taking the word apart (`é` becomes `e` and an accent) and dropping every
// accent. That is what lets `dias` find `días`.
let private stripAccents (word: string) : string =
    word.Normalize(Text.NormalizationForm.FormD).ToCharArray()
    |> Array.filter (fun c ->
        match Char.GetUnicodeCategory c with
        | UnicodeCategory.NonSpacingMark
        | UnicodeCategory.SpacingCombiningMark
        | UnicodeCategory.EnclosingMark -> false
        | _ -> true)
    |> Array.map string
    |> String.concat ""

// ## Reading a dictionary file
//
// A dictionary is an ordered list of pairs, not a hash table: the order matters, because when a
// word is looked up without its accents the *first* entry that matches wins. A word written twice
// keeps its first place and takes the second meaning.
type Dictionary = (string * string) list

let private put (key: string) (value: string) (entries: Dictionary) : Dictionary =
    if List.exists (fun (k, _) -> k = key) entries then
        entries |> List.map (fun (k, v) -> if k = key then (k, value) else (k, v))
    else
        entries @ [ (key, value) ]

let parseDictionary (text: string) : Dictionary =
    text.Replace("\r\n", "\n").Split('\n')
    |> Array.map (fun raw -> raw.Trim())
    |> Array.filter (fun line -> line <> "" && not (line.StartsWith "#"))
    |> Array.fold
        (fun entries line ->
            let parts = line.Split('\t')
            if parts.Length >= 2 && parts.[0] <> "" && parts.[1] <> "" then
                put (normalizeWord parts.[0]) (parts.[1].Trim()) entries
            else
                entries)
        []

// ## Words to IPA
//
// For each word, try the dictionary, then the same word without accents (so `dias` finds `días`),
// then the language's spelling rules if it has them. A word nothing knows is reported rather than
// guessed, so the page can say which words were skipped.
type Source =
    | FromDictionary
    | FromRules
    | Missing

type Lookup =
    { Word: string
      Ipa: string option
      Source: Source }

let lookupWord (language: Language option) (entries: Dictionary) (word: string) : Lookup option =
    let key = normalizeWord word
    if key = "" then
        None
    else
        let found (ipa: string) : Lookup = { Word = word; Ipa = Some ipa; Source = FromDictionary }
        match List.tryFind (fun (k, _) -> k = key) entries with
        | Some(_, ipa) -> Some(found ipa)
        | None ->
            let plain = stripAccents key
            match List.tryFind (fun (k, _) -> stripAccents k = plain) entries with
            | Some(_, ipa) -> Some(found ipa)
            | None ->
                match language |> Option.bind (fun l -> l.Rules) with
                | Some rules when key |> String.forall isLetter ->
                    Some({ Word = word; Ipa = Some(rules key); Source = FromRules } : Lookup)
                | _ -> Some({ Word = word; Ipa = None; Source = Missing } : Lookup)

type Phrase = { Ipa: string; Words: Lookup list }

let textToIpa (language: Language option) (entries: Dictionary) (text: string) : Phrase =
    let words =
        text.Split([| ' '; '\t'; '\n'; '\r' |], StringSplitOptions.RemoveEmptyEntries)
        |> Array.toList
        |> List.choose (lookupWord language entries)
    ({ Ipa = words |> List.choose (fun (w: Lookup) -> w.Ipa) |> String.concat " "
       Words = words } : Phrase)
