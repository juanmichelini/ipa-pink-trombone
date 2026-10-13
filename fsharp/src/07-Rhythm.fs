// # Rhythm: stress-timed and syllable-timed speech
//
// Languages differ in how they keep time. In a **syllable-timed** language (Spanish, French,
// Mandarin and many others) syllables come at a roughly even pace, whatever they contain. In a
// **stress-timed** language (English, Russian, Arabic) it is the *stressed* syllables that come at
// a roughly even pace, and the unstressed syllables between them are squeezed or stretched to fit.
// Say "Cats CHASE mice" and "Cats are CHASing the MICE": the second sentence has more syllables but
// takes about as long as the first, because the extra syllables are crammed between the beats.
//
// Real speech is only a tendency in this direction, never perfectly even, and linguists argue
// about how well the categories hold. This file models the tendency, not the debate: it lets you
// *choose* a rhythm and hear what it does. The choice is lesson 4's `Rhythm` tag on a language.
//
// ## How it works
//
// 1. cut the IPA into **syllables** (`syllabify`)
// 2. decide how long each syllable should be, according to the rhythm
// 3. give the planner a *duration for each vowel*, so that vowel plus surrounding consonants add up
//    to the syllable; unstressed vowels that get very short are also **reduced** toward `ə`
//
// The planner does the rest, so this file never touches a keyframe. It talks to the planner in the
// planner's own vocabulary: `Overrides`, a list that pairs a segment index with a duration.
module IpaTrombone.Rhythms

open IpaTrombone.Languages
open IpaTrombone.Ipa
open IpaTrombone.Planner

let private stops : Set<string> = set [ "p"; "b"; "t"; "d"; "k"; "ɡ"; "c"; "ɟ"; "q" ]
let private fricatives : Set<string> = set [ "f"; "v"; "θ"; "ʃ"; "ɸ"; "β"; "x"; "ɣ"; "h" ]
let private liquids : Set<string> = set [ "l"; "ɹ"; "r"; "ɾ"; "ɻ"; "w"; "j" ]
let private noOnset : Set<string> = set [ "ŋ" ]

// The segments the planner works on, in order, breaks included. Indexes into this list are how the
// rhythm talks to the planner, so both must filter the tokens in the same way.
let private segmentsOf (text: string) : Token array =
    tokenize text
    |> List.filter (fun t ->
        match t with
        | Unknown _ -> false
        | _ -> true)
    |> Array.ofList

// ## Syllables
//
// A group of consonants between two vowels has to be shared out. The usual rule is that as many
// consonants as can *start a word* go to the second syllable (the "maximal onset"): `a-stra`, not
// `as-tra`. So the test is whether the last few consonants form something a word can begin with.
let private canStart (symbols: string list) : bool =
    match symbols with
    | [ only ] -> not (noOnset.Contains only)
    | [ a; b ] ->
        if a = "s" then
            (stops.Contains b && not ("bdɡ".Contains b)) || "mnlwfv".Contains b
        elif (stops.Contains a || fricatives.Contains a) && liquids.Contains b then
            not (a = "t" && b = "l") && not (a = "d" && b = "l")
        else
            false
    | [ a; b; c ] -> a = "s" && "ptk".Contains b && liquids.Contains c
    | _ -> false

// Two vowels in a row make one nucleus (a diphthong) if the second is a high or central glide-like
// vowel and the first is not itself high: `aɪ`, `oʊ`, `eɪ`. Otherwise they are separate syllables.
let private glideLike : Set<string> = set [ "ɪ"; "ʊ"; "i"; "u"; "ə"; "ɐ"; "y" ]
let private high : Set<string> = set [ "i"; "u"; "ɪ"; "ʊ"; "y"; "ɨ"; "ʉ"; "ɯ" ]

let private sameNucleus (a: Segment) (b: Segment) : bool =
    glideLike.Contains b.Symbol && not (high.Contains a.Symbol) && not a.Long && b.Stress = 0

// A syllable, as indexes into the segments:
//
// - `Segments`: everything in it, in order (onset, nucleus, coda)
// - `Nucleus`: the vowels at its heart; one, or two for a diphthong
// - `Stressed` (primary) and `Secondary` stress, `Word` it belongs to, and how many `Consonants`
type SyllableInfo =
    { Segments: int list
      Nucleus: int list
      Stressed: bool
      Secondary: bool
      Word: int
      Consonants: int }

// What the walk knows so far. `Closed` is newest first. `Open` is the syllable still taking
// consonants for its coda. `Pending` is the consonants seen since the last vowel: they belong to
// neither syllable yet.
type private Walk =
    { Closed: SyllableInfo list
      Open: SyllableInfo option
      Pending: int list
      Word: int }

let syllabify (text: string) : SyllableInfo list =
    let segs = segmentsOf text
    let sound (k: int) : Segment =
        match segs.[k] with
        | Sound s -> s
        | _ -> failwithf "segment %d is not a sound" k
    // Close the open syllable, and give it the given segments as its coda first.
    let closeWith (coda: int list) (w: Walk) : Walk =
        match w.Open with
        | Some s -> { w with Closed = { s with Segments = s.Segments @ coda } :: w.Closed; Open = None }
        | None -> w
    // Where do the pending consonants split? Stress forces a boundary right before the stressed
    // segment; otherwise the coda gives up as many consonants as can start a word (at most three).
    let splitPoint (pending: int[]) : int =
        match pending |> Array.tryFindIndex (fun k -> (sound k).Stress > 0) with
        | Some stressAt -> stressAt
        | None ->
            let tailFrom (split: int) : string list = [ for x in split - 1 .. pending.Length - 1 -> (sound pending.[x]).Symbol ]
            let rec shrink (split: int) : int =
                if split > 0 && canStart (tailFrom split) && pending.Length - split + 1 <= 3 then shrink (split - 1) else split
            shrink pending.Length
    let step (w: Walk) (i: int) : Walk =
        match segs.[i] with
        | Unknown _ -> w
        // An explicit break: the consonants before the dot belong to the syllable before it.
        | Break Syllable -> { (closeWith w.Pending w) with Pending = [] }
        // A word or a pause ends the syllable too, and starts a new word.
        | Break _ ->
            let closed = closeWith w.Pending w
            { closed with Pending = []; Word = w.Word + 1 }
        | Sound s when s.Kind = Kind.Consonant -> { w with Pending = w.Pending @ [ i ] }
        | Sound s ->
            let extends =
                w.Open.IsSome
                && w.Pending.IsEmpty
                && i > 0
                && (match segs.[i - 1] with
                    | Sound previous -> previous.Kind = Kind.Vowel && sameNucleus previous s
                    | _ -> false)
            match w.Open with
            | Some current when extends ->
                { w with Open = Some { current with Segments = current.Segments @ [ i ]; Nucleus = current.Nucleus @ [ i ] } }
            | _ ->
                // A new syllable starts here.
                let split = if w.Open.IsSome && not w.Pending.IsEmpty then splitPoint (Array.ofList w.Pending) else 0
                let (coda, onset) = List.splitAt split w.Pending
                let closed = closeWith coda w
                let fresh =
                    { Segments = onset @ [ i ]
                      Nucleus = [ i ]
                      Stressed = false
                      Secondary = false
                      Word = w.Word
                      Consonants = 0 }
                { closed with Open = Some fresh; Pending = [] }
    let start : Walk = { Closed = []; Open = None; Pending = []; Word = 0 }
    let walked = [ 0 .. segs.Length - 1 ] |> List.fold step start
    let finished = closeWith walked.Pending walked
    // The stress mark can sit on the onset or on the nucleus; either way it marks the syllable.
    List.rev finished.Closed
    |> List.map (fun s ->
        let stressed = s.Segments |> List.exists (fun k -> (sound k).Stress = 2)
        { s with
            Stressed = stressed
            Secondary = not stressed && (s.Segments |> List.exists (fun k -> (sound k).Stress = 1))
            Consonants = s.Segments |> List.filter (fun k -> not (List.contains k s.Nucleus)) |> List.length })

// A readable form: `ˈhɛ.loʊ ˈwɜːld`.
let describe (text: string) : string =
    let segs = segmentsOf text
    let label (s: SyllableInfo) : string =
        let symbols =
            s.Segments
            |> List.map (fun k ->
                match segs.[k] with
                | Sound x -> x.Symbol + (if x.Long then "ː" else "")
                | _ -> "")
            |> String.concat ""
        (if s.Stressed then "ˈ" elif s.Secondary then "ˌ" else "") + symbols
    syllabify text
    |> List.groupBy (fun s -> s.Word)
    |> List.map (fun (_, group) -> group |> List.map label |> String.concat ".")
    |> String.concat " "

// ## Durations
//
// Seconds at the default speed, one per syllable.
//
// - **syllable-timed:** every syllable is about the same length; stressed ones are a little longer
// - **stress-timed:** a stressed syllable starts a *foot*; the foot lasts about one beat; the
//   unstressed syllables share what the stressed one does not use. Syllables before the first
//   stress form a short lead-in foot of their own.
type RhythmOptions =
    { Beat: float option
      ReduceBelow: float option }

let defaultRhythmOptions : RhythmOptions = { Beat = None; ReduceBelow = None }

let private clamp (low: float) (high: float) (x: float) : float = max low (min high x)

let private syllableTimed (beat: float) (syllables: SyllableInfo list) : float list =
    syllables |> List.map (fun s -> beat * (if s.Stressed then 1.1 else 1.0))

let private stressTimed (beat: float) (syllables: SyllableInfo list) : float list =
    let all = Array.ofList syllables
    let count = all.Length
    // The foot ends before the next stressed syllable; a pause or word end does not end it.
    let rec footEnd (j: int) : int = if j < count && not all.[j].Stressed then footEnd (j + 1) else j
    let rec go (i: int) (feet: float list list) : float list =
        if i >= count then
            List.concat (List.rev feet)
        else
            let j = footEnd (i + 1)
            let k = j - i
            let values =
                if not all.[i].Stressed then
                    // A foot with no stressed head.
                    List.replicate k (clamp 0.06 0.17 ((beat * 0.6) / float k))
                else
                    let rest = k - 1
                    let total = max beat (0.16 + float rest * 0.065)
                    let u = if rest > 0 then clamp 0.065 0.15 ((total - 0.16) / float rest) else 0.0
                    (total - float rest * u) :: List.replicate rest u
            go j (values :: feet)
    go 0 []

let durationsFor (mode: Rhythm) (options: RhythmOptions) (syllables: SyllableInfo list) : float list =
    match mode with
    | Rhythm.Syllable -> syllableTimed (Option.defaultValue 0.24 options.Beat) syllables
    | Rhythm.Stress -> stressTimed (Option.defaultValue 0.45 options.Beat) syllables

// ## Putting it together
//
// A syllable is its consonants plus its vowel, so the vowel gets what is left of the syllable once
// the consonants have taken theirs. But consonants are not fixed either: in a syllable with a heavy
// cluster, speakers squeeze the consonants too. So for each syllable:
//
// 1. if the consonants would leave less than a minimum for the vowel, shrink their holds (a scale,
//    never below half)
// 2. plan the text once to see how long the consonants really come out
// 3. give the vowel the rest of the syllable
//
// The answer is the syllables, their durations, and `Overrides` for the planner: a duration (and
// maybe a replacement vowel) for each vowel, or a squeeze for each consonant. An unstressed vowel
// that ends up shorter than `ReduceBelow` seconds is replaced by `ə`.
type RhythmPlan =
    { Syllables: SyllableInfo list
      Durations: float list
      Overrides: (int * Override) list }

let private minimumVowel = 0.045

let rhythmPlan (mode: Rhythm) (options: RhythmOptions) (text: string) : RhythmPlan =
    let segs = segmentsOf text
    let syllables = syllabify text
    let durations = durationsFor mode options syllables
    let reduceBelow = Option.defaultValue (if mode = Rhythm.Stress then 0.07 else 0.0) options.ReduceBelow
    let consonantsOf (s: SyllableInfo) : int list = s.Segments |> List.filter (fun k -> not (List.contains k s.Nucleus))
    // How long the consonants of a syllable come out in a given plan.
    let spent (marks: Mark list) (s: SyllableInfo) : float =
        consonantsOf s
        |> List.sumBy (fun k ->
            match marks |> List.tryFind (fun m -> m.Index = k) with
            | Some m -> m.End - m.Start
            | None -> 0.0)
    let indexed = List.zip syllables durations
    let planWith (overrides: Map<int, Override>) : Mark list =
        (plan { defaultPlanOptions with Overrides = Map.toList overrides } text).Marks
    // Pass 1: squeeze consonants in syllables that are too tight.
    let natural = planWith Map.empty
    let squeezes =
        indexed
        |> List.fold
            (fun (acc: Map<int, Override>) (s, duration) ->
                let c = spent natural s
                let room = duration - (if s.Stressed then 0.09 else 0.05)
                if c > room && c > 0.0 then
                    let scale = max 0.5 (room / c)
                    consonantsOf s
                    |> List.fold (fun m k -> Map.add k { Seconds = None; Symbol = None; Scale = Some scale } m) acc
                else
                    acc)
            Map.empty
    // Pass 2: with the consonants as they will really be, give the vowels the rest.
    let squeezed = planWith squeezes
    let overrides =
        indexed
        |> List.fold
            (fun (acc: Map<int, Override>) (s, duration) ->
                let vowelTime = max minimumVowel (duration - spent squeezed s)
                s.Nucleus
                |> List.fold
                    (fun m k ->
                        let seg =
                            match segs.[k] with
                            | Sound x -> x
                            | _ -> failwith "a nucleus is a vowel"
                        let reduced =
                            not s.Stressed
                            && not s.Secondary
                            && vowelTime < reduceBelow
                            && not seg.Long
                            && not seg.Nasalized
                            && seg.Tone.IsNone
                            && s.Nucleus.Length = 1
                        let o =
                            { Seconds = Some(vowelTime / float s.Nucleus.Length)
                              Symbol = (if reduced then Some "ə" else None)
                              Scale = None }
                        Map.add k o m)
                    acc)
            squeezes
    { Syllables = syllables
      Durations = durations
      Overrides = Map.toList overrides }

// ## Measuring rhythm
//
// The normalised Pairwise Variability Index (nPVI) of vowel durations is the standard number for
// "how uneven is this rhythm?". It is the average difference between neighbouring vowels, relative
// to their size, times 100. Stress-timed speech scores high (English is about 55-65) and
// syllable-timed speech low (Spanish and French about 30-45).
let nPVI (durations: float list) : float =
    if List.length durations < 2 then
        0.0
    else
        let sum = durations |> List.pairwise |> List.sumBy (fun (a, b) -> abs (a - b) / ((a + b) / 2.0))
        100.0 * sum / float (List.length durations - 1)

// The vowel durations of a planned utterance, from its marks. Two vowels with nothing between them
// are one vocalic interval (a diphthong), which is how the index is defined.
let vowelDurations (marks: Mark list) : float list =
    marks
    |> List.fold
        (fun (found: float list, previousWasVowel: bool) m ->
            if m.Kind = Kind.Vowel then
                match found with
                | last :: rest when previousWasVowel -> ((last + (m.End - m.Start)) :: rest, true)
                | _ -> ((m.End - m.Start) :: found, true)
            else
                (found, false))
        ([], false)
    |> fst
    |> List.rev

// The duration of each syllable in a planned utterance: from the start of its first segment to the
// end of its last. This is the quantity rhythm classes are really about, and the better thing to
// take the nPVI of when the syllables have different amounts of consonant in them.
let syllableDurations (syllables: SyllableInfo list) (marks: Mark list) : float list =
    syllables
    |> List.map (fun s ->
        let own = s.Segments |> List.choose (fun k -> marks |> List.tryFind (fun m -> m.Index = k))
        if List.isEmpty own then 0.0 else (List.last own).End - (List.head own).Start)
