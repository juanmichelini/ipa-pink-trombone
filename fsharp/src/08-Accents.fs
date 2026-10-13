// # Accents as rewrite rules
//
// An accent is, to a first approximation, a systematic way of pronouncing the *same* words: a
// Spanish speaker says English `θ` as `s`, a Cockney speaker says `t` between vowels as a glottal
// stop. Linguists write such facts as **rewrite rules**, and so does this file:
//
//     θ > s                 every θ becomes s
//     t > ʔ / V _ V         t becomes ʔ between two vowels
//     h > ∅ / # _           h is deleted at the start of a word
//     ∅ > e / # _ s C       an e is inserted before a word-initial s + consonant
//
// Read `A > B / L _ R` as "A becomes B when it follows L and precedes R". `∅` means nothing, so
// `A > ∅` deletes and `∅ > B` inserts. The pieces of a pattern are separated by spaces:
//
// - an IPA symbol (or a few written together, like `aɪ`), matched exactly
// - `V` any vowel, `C` any consonant, `#` a word boundary (or the end of the text)
// - `{a,b,c}` any one of those symbols; the set may also contain `V`, `C` or `#`
//
// Rules are applied **in order**, each to the whole text, so a later rule sees what an earlier one
// made. That is how real sound change is described, and it is why the order of lines matters. In
// F# that sentence is a fold: the text goes in, passes through the first rule, and what comes out
// goes through the second.
//
// A file of rules can also carry directives, one per line:
//
//     @name   Spanish accent (English)
//     @about  One sentence about the accent
//     @rhythm syllable            the timing the accent tends to (lesson 7)
//     @strip  length              drop vowel length (some accents have none)
//
// Everything else is a comment (`#` at the start of a line) or blank. The same file format is used
// by every accent in `data/accents`, so adding an accent is adding a file.
//
// ## Errors are values
//
// A rule file written by a person has mistakes in it. Parsing never throws: each line becomes
// either a rule or an error with its line number, and the parser carries on, so a screen can list
// all the mistakes at once. Inside, a line is a `Result`: `Ok` with what it means, or `Error` with
// why not.
module IpaTrombone.Accents

open System
open IpaTrombone.Languages
open IpaTrombone.Ipa

// ## The pieces of a pattern
type ClassName =
    | AnyVowel
    | AnyConsonant

type Element =
    | Empty // ∅
    | Boundary // #
    | Class of ClassName // V or C
    | OneOf of Element list // {a,b,c}
    | Sym of symbol: string * token: Segment option // an IPA symbol; a symbol in a pattern remembers the token it came from

// A rule: replace `From` by `To` where `Left` comes before and `Right` after. `Text` and `Line` say
// where it was written.
type Rule =
    { From: Element list
      To: Element list
      Left: Element list
      Right: Element list
      Text: string
      Line: int }

type ParseError =
    { Line: int
      Text: string
      Message: string }

type Accent =
    { Name: string
      About: string
      Rhythm: Rhythm option
      Strip: string list
      Rules: Rule list
      Errors: ParseError list }

// ## Parsing a pattern element
//
// The IPA is read by lesson 3's tokenizer, so `tʃ`, `ʧ` and `aɪ` mean what they mean everywhere.
// A chunk with several segments in it (`aɪ`) becomes several elements.
let private isSymbol (s: string) : Result<string, string> =
    match tokenize s with
    | [ Sound segment ] -> Ok segment.Symbol
    | _ -> Error(sprintf "\"%s\" is not a single IPA symbol" s)

// The first error wins, as it would if the elements were read left to right.
let private collect (results: Result<'a, string> list) : Result<'a list, string> =
    List.foldBack
        (fun r acc ->
            match r, acc with
            | Error e, _ -> Error e
            | Ok _, Error e -> Error e
            | Ok x, Ok xs -> Ok(x :: xs))
        results
        (Ok [])

let private parseElement (chunk: string) : Result<Element list, string> =
    if chunk = "∅" || chunk = "0" then
        Ok [ Empty ]
    elif chunk = "#" then
        Ok [ Boundary ]
    elif chunk = "V" then
        Ok [ Class AnyVowel ]
    elif chunk = "C" then
        Ok [ Class AnyConsonant ]
    elif chunk.StartsWith "{" && chunk.EndsWith "}" && chunk.Length >= 2 then
        chunk.Substring(1, chunk.Length - 2).Split(',')
        |> Array.filter (fun s -> s <> "")
        |> Array.toList
        |> List.map (fun s ->
            if s = "V" then Ok(Class AnyVowel)
            elif s = "C" then Ok(Class AnyConsonant)
            elif s = "#" then Ok Boundary
            else isSymbol s |> Result.map (fun symbol -> Sym(symbol, None)))
        |> collect
        |> Result.map (fun items -> [ OneOf items ])
    else
        let tokens = tokenize chunk
        let segments =
            tokens
            |> List.choose (fun t ->
                match t with
                | Sound s -> Some s
                | _ -> None)
        if List.isEmpty tokens || segments.Length <> tokens.Length then
            Error(sprintf "\"%s\" is not IPA" chunk)
        else
            Ok(segments |> List.map (fun s -> Sym(s.Symbol, Some s)))

let private words (text: string) : string list =
    text.Split([| ' '; '\t'; '\n'; '\r' |], StringSplitOptions.RemoveEmptyEntries) |> Array.toList

let private parseElements (text: string) : Result<Element list, string> =
    words text |> List.map parseElement |> collect |> Result.map List.concat

// ## Parsing a rule line
//
// `A > B` or `A > B / left _ right`. The line is cut at the first `>` that has something before it,
// and the replacement runs up to the first `/` that has something before it.
let private skipSpaces (text: string) (from: int) : int =
    let rec go i = if i < text.Length && Char.IsWhiteSpace(text.[i]) then go (i + 1) else i
    go from

// Where does a `/` start after position `j` (skipping spaces)?
let private slashAfter (line: string) (j: int) : int option =
    let p = skipSpaces line j
    if p < line.Length && line.[p] = '/' then Some p else None

// Where the replacement ends, and the context if there is one: scanning from `start`, the first
// place (at least one character on) where the rest is either nothing or a `/`.
let private cutReplacement (line: string) (start: int) : (string * string option) option =
    let rec go j =
        if j > line.Length then
            None
        else
            match slashAfter line j with
            | Some p -> Some(line.Substring(start, j - start), Some(line.Substring(skipSpaces line (p + 1))))
            | None -> if j = line.Length then Some(line.Substring(start, j - start), None) else go (j + 1)
    if start >= line.Length then None else go (start + 1)

let private cutRule (line: string) : (string * string * string option) option =
    let rec go k =
        if k >= line.Length then
            None
        else
            let p = skipSpaces line k
            if p < line.Length && line.[p] = '>' then
                match cutReplacement line (skipSpaces line (p + 1)) with
                | Some(replacement, context) -> Some(line.Substring(0, k), replacement, context)
                | None -> go (k + 1)
            else
                go (k + 1)
    go 1

let private parseRule (number: int) (line: string) : Result<Rule, string> =
    match cutRule line with
    | None -> Error "expected  A > B  or  A > B / left _ right"
    | Some(from, replacement, context) ->
        let sides =
            match context with
            | None -> Ok([], [])
            | Some c ->
                let parts = c.Split('_')
                if parts.Length <> 2 then
                    Error "a context needs exactly one _"
                else
                    match parseElements parts.[0], parseElements parts.[1] with
                    | Error e, _ -> Error e
                    | _, Error e -> Error e
                    | Ok left, Ok right -> Ok(left, right)
        match sides with
        | Error e -> Error e
        | Ok(left, right) ->
            match parseElements from, parseElements replacement with
            | Error e, _ -> Error e
            | _, Error e -> Error e
            | Ok fromElements, Ok toAll ->
                let toElements = toAll |> List.filter (fun e -> e <> Empty)
                let isInsert = (fromElements = [ Empty ])
                let isSym e =
                    match e with
                    | Sym _ -> true
                    | _ -> false
                if not (List.forall isSym toElements) then
                    Error "the replacement must be IPA symbols or ∅"
                elif not isInsert && (fromElements |> List.exists (fun e -> e = Empty || e = Boundary)) then
                    Error "∅ and # cannot be inside the thing being replaced"
                else
                    Ok
                        { From = (if isInsert then [] else fromElements)
                          To = toElements
                          Left = left
                          Right = right
                          Text = line
                          Line = number }

// ## Parsing a rule file
let private isWordChar (c: char) : bool =
    (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c = '_'

let private directive (line: string) : Result<Accent -> Accent, string> =
    let body = line.Substring 1
    let key = body.ToCharArray() |> Array.takeWhile isWordChar |> Array.map string |> String.concat ""
    let rest = body.Substring(key.Length).TrimStart()
    match key with
    | "name" -> Ok(fun a -> { a with Name = rest })
    | "about" -> Ok(fun a -> { a with About = rest })
    | "rhythm" ->
        if rest = "stress" then Ok(fun a -> { a with Rhythm = Some Rhythm.Stress })
        elif rest = "syllable" then Ok(fun a -> { a with Rhythm = Some Rhythm.Syllable })
        else Error "@rhythm must be stress or syllable"
    | "strip" -> Ok(fun a -> { a with Strip = a.Strip @ [ rest ] })
    | _ -> Error(sprintf "unknown directive @%s" key)

let parseAccent (text: string) : Accent =
    let start : Accent =
        { Name = ""
          About = ""
          Rhythm = None
          Strip = []
          Rules = []
          Errors = [] }
    text.Replace("\r\n", "\n").Split('\n')
    |> Array.toList
    |> List.indexed
    |> List.fold
        (fun (accent: Accent) (n, raw) ->
            let line = raw.Trim()
            if line = "" || line.StartsWith "#" then
                accent
            else
                let failed (message: string) : Accent =
                    { accent with Errors = accent.Errors @ [ ({ Line = n + 1; Text = line; Message = message } : ParseError) ] }
                if line.StartsWith "@" then
                    match directive line with
                    | Ok change -> change accent
                    | Error message -> failed message
                else
                    match parseRule (n + 1) line with
                    | Ok rule -> { accent with Rules = accent.Rules @ [ rule ] }
                    | Error message -> failed message)
        start

// ## Matching
//
// A text is a list of items (segments and word breaks). An element matches one item, except `#`,
// which also matches the edge of the text, where there is no item at all.
let rec private matches (element: Element) (item: Token option) : bool =
    match element with
    | Boundary ->
        (match item with
         | None
         | Some(Break _) -> true
         | _ -> false)
    | OneOf items -> items |> List.exists (fun e -> matches e item)
    | _ ->
        match item with
        | Some(Sound s) ->
            match element with
            | Class AnyVowel -> s.Kind = Kind.Vowel
            | Class AnyConsonant -> s.Kind = Kind.Consonant
            | Sym(symbol, _) -> s.Symbol = symbol
            | _ -> false
        | _ -> false

let private at (items: Token[]) (i: int) : Token option =
    if i >= 0 && i < items.Length then Some items.[i] else None

// Does the left context match, ending just before `i`? Elements are matched right to left.
let private leftOk (items: Token[]) (i: int) (left: Element list) : bool =
    let elements = Array.ofList left
    let rec go k p =
        if k < 0 then
            true
        elif not (matches elements.[k] (at items p)) then
            false
        // A boundary at the edge consumes nothing; further elements cannot match beyond it.
        elif elements.[k] = Boundary && p < 0 then
            k = 0
        else
            go (k - 1) (p - 1)
    go (elements.Length - 1) (i - 1)

let private rightOk (items: Token[]) (i: int) (right: Element list) : bool =
    let elements = Array.ofList right
    let rec go k p =
        if k >= elements.Length then
            true
        elif not (matches elements.[k] (at items p)) then
            false
        elif elements.[k] = Boundary && p >= items.Length then
            k = elements.Length - 1
        else
            go (k + 1) (p + 1)
    go 0 i

// ## Making tokens
//
// A replacement symbol becomes a token. It carries the stress of the segment it replaces.
let private makeToken (element: Element) (like: Token option) : Token =
    let segment =
        match element with
        | Sym(_, Some s) -> s
        | Sym(symbol, None) ->
            (match tokenize symbol with
             | Sound s :: _ -> s
             | _ -> failwithf "no segment for %s" symbol)
        | _ -> failwith "a replacement is made of symbols"
    let stress =
        match like with
        | Some(Sound s) -> s.Stress
        | _ -> 0
    Sound { segment with Stress = stress }

let private symbolOf (token: Token) : string =
    match token with
    | Sound s -> s.Symbol
    | _ -> ""

// What a rule did, for the trace: which rule, where, and what became what.
type Step =
    { Rule: int
      Text: string
      At: int
      Before: string
      After: string }

// ## Applying one rule
//
// Scans the text once, left to right. Matches are found against the text as it was when the rule
// started, so a rule cannot feed itself (`t > tt` does not run away).
let private applyRule (rule: Rule) (number: int) (start: Token list) : Token list * Step list =
    let note (position: int) (before: string list) (after: string list) : Step =
        { Rule = number
          Text = rule.Text
          At = position
          Before = String.concat " " before
          After = String.concat " " after }
    let isBreak (t: Token) : bool =
        match t with
        | Break _ -> true
        | _ -> false
    if rule.From.IsEmpty then
        // Insertion: test every gap, and put the new segments in the ones that fit. Two breaks in
        // a row never get something between them.
        let items = Array.ofList start
        let n = items.Length
        let gaps =
            [ 0 .. n ]
            |> List.map (fun g ->
                let bothBreaks =
                    match at items g, at items (g - 1) with
                    | Some a, Some b -> isBreak a && isBreak b
                    | _ -> false
                let fires = leftOk items g rule.Left && rightOk items g rule.Right && not bothBreaks
                let inserted = if fires then rule.To |> List.map (fun el -> makeToken el None) else []
                let step = if fires then Some(note g [ "\u2205" ] (inserted |> List.map symbolOf)) else None
                (inserted @ (if g < n then [ items.[g] ] else []), step))
        (gaps |> List.collect fst, gaps |> List.choose snd)
    else
        let length = rule.From.Length
        // `items` can change under us: a deleted segment hands its stress to the next one.
        let rec go (i: int) (items: Token[]) (out: Token list) (steps: Step list) : Token list * Step list =
            let n = items.Length
            if i >= n then
                (List.rev out, List.rev steps)
            else
                let fits =
                    i + length <= n
                    && (rule.From |> List.mapi (fun k el -> matches el (at items (i + k)) && not (isBreak items.[i + k])) |> List.forall id)
                if fits && leftOk items i rule.Left && rightOk items (i + length) rule.Right then
                    let removed = [ for k in 0 .. length - 1 -> items.[i + k] ]
                    let made = rule.To |> List.mapi (fun k el -> makeToken el (if k = 0 then Some removed.Head else None))
                    // Keep the modifiers the replaced segment had (length, aspiration, nasalisation)
                    // when the replacement is a single, same-kind segment.
                    let kept =
                        match made, removed with
                        | [ Sound m ], [ Sound r ] when m.Kind = r.Kind ->
                            [ Sound
                                  { m with
                                      Long = m.Long || r.Long
                                      Half = m.Half || r.Half
                                      Aspirated = m.Aspirated || r.Aspirated
                                      Nasalized = m.Nasalized || r.Nasalized
                                      Tone = (if m.Tone.IsSome then m.Tone else r.Tone) } ]
                        | _ -> made
                    let stress =
                        removed
                        |> List.map (fun t ->
                            match t with
                            | Sound s -> s.Stress
                            | _ -> 0)
                        |> List.max
                    // Stress lives on the first segment of a syllable. The replacement takes over
                    // the stress of what it replaced; if nothing replaces it, the next segment does.
                    let (final, items) =
                        match kept with
                        | Sound s :: rest -> (Sound { s with Stress = max s.Stress stress } :: rest, items)
                        | [] when stress > 0 ->
                            let next = [ i + length .. n - 1 ] |> List.tryFind (fun idx -> not (isBreak items.[idx]))
                            match next with
                            | Some j ->
                                match items.[j] with
                                | Sound s when s.Stress < stress ->
                                    (kept, items |> Array.mapi (fun idx t -> if idx = j then Sound { s with Stress = stress } else t))
                                | _ -> (kept, items)
                            | None -> (kept, items)
                        | _ -> (kept, items)
                    let step = note i (removed |> List.map symbolOf) (final |> List.map symbolOf)
                    go (i + length) items (List.rev final @ out) (step :: steps)
                else
                    go (i + 1) items (items.[i] :: out) steps
        go 0 (Array.ofList start) [] []

// ## Applying an accent
//
// Returns the IPA, the tokens, and the trace: every change, which rule made it, where, and what
// became what. The trace is what lets a screen show *why* the output differs.
type Accented =
    { Ipa: string
      Tokens: Token list
      Trace: Step list }

let applyRules (rules: Rule list) (strip: string list) (input: string) : Accented =
    let start =
        tokenize input
        |> List.filter (fun t ->
            match t with
            | Unknown _
            | Break Syllable -> false
            | _ -> true)
    let (items, trace) =
        rules
        |> List.indexed
        |> List.fold
            (fun (items, trace) (number, rule) ->
                let (next, steps) = applyRule rule number items
                (next, trace @ steps))
            (start, [])
    let stripped =
        if List.contains "length" strip then
            items
            |> List.map (fun t ->
                match t with
                | Sound s when s.Long -> Sound { s with Long = false }
                | _ -> t)
        else
            items
    { Ipa = format stripped
      Tokens = stripped
      Trace = trace }

let applyAccent (accent: Accent) (input: string) : Accented = applyRules accent.Rules accent.Strip input

// ## The accents that ship with the repo
//
// Each id is a file in `data/accents`. Fetching the file is the browser's job; this file takes its
// text.
let accents : (string * string) list =
    [ ("none", "No accent (as written)")
      ("spanish", "Spanish speaker of English")
      ("french", "French speaker of English")
      ("german", "German speaker of English")
      ("japanese", "Japanese speaker of English")
      ("indian", "Indian English")
      ("cockney", "Cockney")
      ("rp", "Southern British (non-rhotic)")
      ("american", "American flapping") ]
