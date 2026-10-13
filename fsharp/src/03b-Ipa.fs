// # Reading IPA
//
// Before anything can be sounded, a string like `ˈhɛloʊ wɜːld` has to be split into **tokens**: a
// vowel or consonant plus whatever marks are attached to it, or a break. This file is the
// tokenizer, and it knows no acoustics. It only answers "what did the person write?".
//
// The marks it understands:
//
// - `ː` after a segment makes it long; `ˑ` half long
// - `ʰ` after a consonant makes it aspirated
// - `̃` (combining tilde) after a vowel makes it nasalised
// - `̥` (ring below) makes a segment voiceless, `̬` voiced
// - `ˈ` and `ˌ` before a syllable mark primary and secondary stress
// - `.` is a syllable break, a space is a word break, `|` and `‖` are short and long pauses
// - Chao tone letters `˥˦˧˨˩` (5 high to 1 low) after a syllable give it a pitch contour: `ma˥˩` falls
// - a tie bar `͡` joins two consonants into an affricate: `t͡ʃ`
//
// Anything else becomes an `Unknown` token rather than being dropped, so a screen can point at the
// character it did not understand. The tokenizer never throws.
//
// The tokenizer is a loop that reads one character at a time and builds a list. There is no state
// outside the loop: the position, the stress waiting for the next segment and the tokens so far are
// all arguments of the function that calls itself.
module IpaTrombone.Ipa

open IpaTrombone.TongueSpace
open IpaTrombone.Consonants

// ## What a token is
//
// A **segment** is a vowel or a consonant with its marks. The marks are plain fields; the ones that
// might be absent are options (`None` is "not said", which is different from "said it is voiced").
[<RequireQualifiedAccess>]
type Kind =
    | Vowel
    | Consonant

type Segment =
    { Kind: Kind
      Symbol: string
      Long: bool
      Half: bool
      Aspirated: bool
      Nasalized: bool
      Voicing: bool option
      Stress: int // 0 none, 1 secondary, 2 primary
      Tone: int list option } // Chao levels, 5 high to 1 low

type Break =
    | Word
    | Syllable
    | Pause of seconds: float

type Token =
    | Sound of Segment
    | Break of Break
    | Unknown of string

// ## The alphabet
//
// The symbols come from the earlier lessons' tables, so there is one list of what exists.
let private vowelSymbols : Set<string> = vowels |> List.map (fun v -> v.Symbol) |> Set.ofList
let private consonantSymbols : string list = consonants |> List.map (fun c -> c.Symbol)

// Longest first, so `t͡ʃ` wins over `t`.
let private consonantsByLength : string list =
    consonantSymbols |> List.sortByDescending (fun s -> s.Length)

let private tie = "͡"
let private nasal = '̃'
let private voiceless = '̥'
let private voiced = '̬'

let private toneLevel (c: char) : int option =
    match c with
    | '˥' -> Some 5
    | '˦' -> Some 4
    | '˧' -> Some 3
    | '˨' -> Some 2
    | '˩' -> Some 1
    | _ -> None

let private toneLetter (level: int) : string =
    match level with
    | 5 -> "˥"
    | 4 -> "˦"
    | 3 -> "˧"
    | 2 -> "˨"
    | _ -> "˩"

// Some people write the tie bar, some do not (`tʃ`), and some use ligatures (`ʧ`). All of these
// become the same affricate.
let private affricateAliases : Map<char, string> =
    Map.ofList [ 'ʦ', "t͡s"; 'ʣ', "d͡z"; 'ʧ', "t͡ʃ"; 'ʤ', "d͡ʒ"; 'ʨ', "t͡ɕ"; 'ʥ', "d͡ʑ" ]

// Other common spellings of standard symbols: the ASCII `g` is the IPA `ɡ`, and `ɫ` is a dark `l`.
let private aliases : Map<string, string> =
    Map.ofList [ "g", "ɡ"; "ɫ", "l"; "ɚ", "ɜ"; "ɝ", "ɜ" ]

let private alias (symbol: string) : string = Map.tryFind symbol aliases |> Option.defaultValue symbol

// Normalising text to NFD would split `ç` into `c` and a cedilla, so only the precomposed nasal
// vowels are split, into the vowel and a combining tilde.
let private spreadNasals (text: string) : string =
    text
    |> String.collect (fun c ->
        match c with
        | 'ã' -> "ã"
        | 'ẽ' -> "ẽ"
        | 'ĩ' -> "ĩ"
        | 'õ' -> "õ"
        | 'ũ' -> "ũ"
        | other -> string other)

// ## Reading one segment
//
// What starts at position `i`? Three guesses, in order, and the first that fits wins:
//
// 1. an affricate ligature, `ʧ`
// 2. the longest consonant symbol that matches here (`t͡ʃ` before `t`), where a bare `tʃ` or `dʒ`
//    counts as an affricate too. (`ts` is left alone: it is a cluster in English `cats` and an
//    affricate in German; write the tie to be sure.)
// 3. a vowel, or a spelling that stands for one
//
// The answer is the symbol, its kind and how many characters it used.
let private startsAt (text: string) (i: int) (symbol: string) : bool =
    text.Length - i >= symbol.Length && text.Substring(i, symbol.Length) = symbol

let private symbolAt (text: string) (i: int) : (string * Kind * int) option =
    let ch = text.[i]
    let key = string ch
    match Map.tryFind ch affricateAliases with
    | Some affricate -> Some(affricate, Kind.Consonant, 1)
    | None ->
        match consonantsByLength |> List.tryFind (startsAt text i) with
        | Some symbol ->
            let pair = if i + 1 < text.Length then key + string text.[i + 1] else key
            let joined =
                if symbol.Contains tie then None
                elif pair = "tʃ" then Some "t͡ʃ"
                elif pair = "dʒ" then Some "d͡ʒ"
                else None
            match joined with
            | Some affricate -> Some(affricate, Kind.Consonant, 2)
            | None -> Some(alias symbol, Kind.Consonant, symbol.Length)
        | None ->
            if vowelSymbols.Contains(alias key) then Some(alias key, Kind.Vowel, 1)
            elif List.contains (alias key) consonantSymbols then Some(alias key, Kind.Consonant, 1)
            else None

// ## The marks after a segment
//
// Marks come after the symbol, in any order, and each one switches something on. The loop stops at
// the first character that is not a mark.
let rec private readMarks (text: string) (i: int) (kind: Kind) (segment: Segment) : Segment * int =
    if i >= text.Length then
        (segment, i)
    else
        let next (s: Segment) = readMarks text (i + 1) kind s
        match text.[i] with
        | 'ː' -> next { segment with Long = true }
        | 'ˑ' -> next { segment with Half = true }
        | 'ʰ' -> next { segment with Aspirated = true }
        | c when c = nasal -> next { segment with Nasalized = true }
        | c when c = voiceless -> next { segment with Voicing = Some false }
        | c when c = voiced -> next { segment with Voicing = Some true }
        | '͡' when kind = Kind.Consonant -> next segment // a tie we did not need
        | _ -> (segment, i)

// ## Tones
//
// Tone letters belong to the syllable's vowel, which may be a few segments back (`ʊŋ˥`). Tokens are
// kept newest first while we read, so "a few segments back" is "further down the list". If there is
// no vowel in this syllable the tone goes on the previous segment, and if there is nothing before
// it the letters are reported as unknown.
let rec private toneOnVowel (levels: int list) (tokens: Token list) : Token list option =
    match tokens with
    | [] -> None
    | Break _ :: _ -> None
    | Sound s :: rest when s.Kind = Kind.Vowel -> Some(Sound { s with Tone = Some levels } :: rest)
    | other :: rest -> toneOnVowel levels rest |> Option.map (fun r -> other :: r)

let private attachTone (levels: int list) (tokens: Token list) : Token list =
    match toneOnVowel levels tokens with
    | Some updated -> updated
    | None ->
        match tokens with
        | Sound s :: rest -> Sound { s with Tone = Some levels } :: rest
        | Unknown _ :: _ -> tokens
        | _ -> Unknown(levels |> List.map toneLetter |> String.concat "") :: tokens

// ## The tokenizer
//
// `go i stress tokens` reads from position `i`, with `stress` waiting to be given to the next
// segment and `tokens` read so far (newest first, reversed at the end).
let tokenize (input: string) : Token list =
    let text = spreadNasals (input.Normalize())
    let rec go (i: int) (stress: int) (tokens: Token list) : Token list =
        if i >= text.Length then
            List.rev tokens
        else
            let ch = text.[i]
            match ch with
            | ' '
            | '\n'
            | '\t' -> go (i + 1) stress (Break Word :: tokens)
            | '.' -> go (i + 1) stress (Break Syllable :: tokens)
            | '|' -> go (i + 1) stress (Break(Pause 0.15) :: tokens)
            | '‖' -> go (i + 1) stress (Break(Pause 0.35) :: tokens)
            | 'ˈ' -> go (i + 1) 2 tokens
            | 'ˌ' -> go (i + 1) 1 tokens
            | _ when (toneLevel ch).IsSome ->
                let rec levelsFrom (j: int) (found: int list) =
                    if j < text.Length && (toneLevel text.[j]).IsSome then
                        levelsFrom (j + 1) (found @ [ (toneLevel text.[j]).Value ])
                    else
                        (found, j)
                let (levels, after) = levelsFrom i []
                go after stress (attachTone levels tokens)
            | _ ->
                match symbolAt text i with
                | None -> go (i + 1) stress (Unknown(string ch) :: tokens)
                | Some(symbol, kind, length) ->
                    let bare =
                        { Kind = kind
                          Symbol = symbol
                          Long = false
                          Half = false
                          Aspirated = false
                          Nasalized = false
                          Voicing = None
                          Stress = stress
                          Tone = None }
                    let (segment, after) = readMarks text (i + length) kind bare
                    go after 0 (Sound segment :: tokens)
    go 0 0 []

// ## And back
//
// `format` turns tokens into a string, for display and for tests: `tokenize` then `format` gives IPA
// that means the same thing, with the marks in one fixed order.
let format (tokens: Token list) : string =
    let one (token: Token) : string =
        match token with
        | Break Word -> " "
        | Break Syllable -> "."
        | Break(Pause seconds) -> if seconds > 0.2 then "‖" else "|"
        | Unknown text -> text
        | Sound s ->
            String.concat
                ""
                [ (if s.Stress = 2 then "ˈ" elif s.Stress = 1 then "ˌ" else "")
                  s.Symbol
                  (if s.Nasalized then string nasal else "")
                  (match s.Voicing with
                   | Some false -> string voiceless
                   | Some true -> string voiced
                   | None -> "")
                  (if s.Aspirated then "ʰ" else "")
                  (if s.Long then "ː" else "")
                  (if s.Half then "ˑ" else "")
                  (match s.Tone with
                   | Some levels -> levels |> List.map toneLetter |> String.concat ""
                   | None -> "") ]
    (tokens |> List.map one |> String.concat "").Normalize()

// Characters in `text` that were not understood, in order.
let unknownCharacters (text: string) : string list =
    tokenize text
    |> List.choose (fun t ->
        match t with
        | Unknown c -> Some c
        | _ -> None)
