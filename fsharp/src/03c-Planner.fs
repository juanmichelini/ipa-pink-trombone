// # From IPA to a score
//
// This is where vowels and consonants meet. The planner takes the tokens from the tokenizer and
// builds one score that moves through them, using the vowel shapes from this lesson's first part
// and the consonant gestures from lesson 2.
//
// The hard part is that speech is not a row of separate sounds. The tongue does not return to
// neutral between segments; it is already travelling to the next vowel while the lips close for a
// `b`. This is **coarticulation**, and the planner handles it in one simple way:
//
// - a **vowel** is a target shape, reached by gliding from wherever the tract was
// - a **consonant** is built with the *previous* vowel as its carrier, and then the tongue is
//   steered so that it leaves the previous vowel as the consonant begins and arrives at the *next*
//   vowel as it ends. The consonant gesture itself (lips, tip, velum, noise) is untouched.
//
// So in `aba` the tongue stays near `a` through the whole `b`; in `ibu` it travels from `i` to `u`
// while the lips are closed. Nothing is stored per pair of sounds. It is one rule applied to every
// pair.
//
// The JavaScript planner keeps a timeline and a clock in variables and updates them as it walks the
// segments. Here the walk is a **fold**: each segment takes the state so far (the timeline, the
// time, where the tongue is, the pitch) and returns the next state. Nothing is changed in place.
module IpaTrombone.Planner

open IpaTrombone.Score
open IpaTrombone.Consonants
open IpaTrombone.VowelShape
open IpaTrombone.Ipa

// ## Timing parameters
//
// Seconds at a medium speaking rate. Later lessons (tempo and rhythm) replace these with something
// cleverer.
type Timings =
    { Vowel: float
      DiphthongFactor: float // each half of a vowel pair is shorter than a vowel on its own
      LongFactor: float
      HalfFactor: float
      StressFactor: float
      ConsonantScale: float
      Transition: float // articulators close and open faster than in careful, isolated speech
      Glide: float
      WordGap: float
      StartSilence: float
      EndFade: float // the voice dies away over this long at the end of an utterance
      MinHold: float // no consonant is held for less than this, however fast the speech
      UndershootBelow: float
      PauseScale: float
      NasalVelum: float
      ToneFactor: float // vowels carrying a tone are longer, so the contour has room
      ToneStep: float } // octaves per tone level

let timing : Timings =
    { Vowel = 0.12
      DiphthongFactor = 0.65
      LongFactor = 1.8
      HalfFactor = 1.3
      StressFactor = 1.2
      ConsonantScale = 0.3
      Transition = 0.4
      Glide = 0.05
      WordGap = 0.05
      StartSilence = 0.04
      EndFade = 0.18
      MinHold = 0.035
      UndershootBelow = 0.09
      PauseScale = 1.0
      NasalVelum = 0.3
      ToneFactor = 1.4
      ToneStep = 0.12 }

// The pitch bump for a stressed syllable: primary stress is a little higher than secondary.
let private accent : float list = [ 1.0; 1.05; 1.1 ]

// The tongue and lips at rest, read back from lesson 2's `neutral` so the two never disagree.
let neutralShape : Shape = shapeOfFrame (neutral defaultFrame)

// ## Tempo
//
// Speaking faster is not playing the recording faster. People speed up by shortening their vowels
// a lot, their consonants a little (a consonant has a physical job to do, and a `t` that is too
// short is not a `t`), and their pauses. And when a vowel gets very short, the tongue does not have
// time to reach its target, so it falls short and the vowel drifts toward neutral. That shortfall is
// **undershoot**, and it is why fast speech reduces vowels.
//
// `scaleForRate` applies the first two. Vowels and pauses scale with `1 / rate`, consonant holds
// with `1 / sqrt(rate)`, and the transition times inside a consonant gesture (closing, releasing,
// the burst) are not scaled at all because they belong to the anatomy.
let scaleForRate (t: Timings) (rate: float) : Timings =
    let r = max 0.2 (min 4.0 rate)
    { t with
        Vowel = t.Vowel / r
        ConsonantScale = t.ConsonantScale / sqrt r
        WordGap = t.WordGap / r
        Glide = t.Glide / sqrt r
        PauseScale = 1.0 / r }

// How far a vowel of duration `d` gets toward its target. Full at `below` seconds or longer,
// falling to 55 % at 0.04 s. Below that the tongue barely moves.
let undershoot (below: float) (d: float) (shape: Shape) : Shape =
    let u = max 0.0 (min 1.0 ((d - 0.04) / (below - 0.04)))
    let reach = 0.55 + 0.45 * u
    if reach >= 1.0 then
        shape
    else
        let n = neutralShape
        { TongueIndex = n.TongueIndex + (shape.TongueIndex - n.TongueIndex) * reach
          TongueDiameter = n.TongueDiameter + (shape.TongueDiameter - n.TongueDiameter) * reach
          Lips = n.Lips + (shape.Lips - n.Lips) * reach }

// ## What the planner is asked and what it answers
//
// A rhythm lesson later takes control of timing through `Overrides`, a list that pairs a segment
// index with a fixed duration and optionally a replacement vowel. The other options:
//
// - `F0` base pitch; `Tenseness` voice quality
// - `Declination`: the fraction by which pitch falls over the utterance, as speakers let it drift down
// - `Rate`: speaking speed, 1 is medium (see `scaleForRate`)
// - `VibratoDepth`, `VibratoRate`, `Jitter`: small natural wobble for the voice
// - `Range`: scales every pitch movement (stress accents and tone contours), so a lively voice
//   moves more than a flat one
type Override =
    { Seconds: float option
      Symbol: string option
      Scale: float option }

type PlanOptions =
    { F0: float
      Tenseness: float
      Declination: float
      Timing: Timings
      Rate: float
      Overrides: (int * Override) list // segment index, and what to change about it
      VibratoDepth: float
      VibratoRate: float
      Jitter: float
      Range: float }

let defaultPlanOptions : PlanOptions =
    { F0 = 130.0
      Tenseness = 0.6
      Declination = 0.08
      Timing = timing
      Rate = 1.0
      Overrides = []
      VibratoDepth = 0.0
      VibratoRate = 5.5
      Jitter = 0.0
      Range = 1.0 }

// The answer: the score, and a mark for each segment saying when it sounds, so a screen can
// highlight what is being said. `Index` counts tokens, unknown ones excluded.
type Mark =
    { Index: int
      Symbol: string
      Kind: Kind
      Start: float
      End: float }

type Plan =
    { Score: Score
      Marks: Mark list
      Duration: float }

// Syllables (vowel segments) per second over the voiced part of an utterance.
let syllableRate (marks: Mark list) (duration: float) : float =
    let vowelCount = marks |> List.filter (fun m -> m.Kind = Kind.Vowel) |> List.length
    if duration > 0.0 then float vowelCount / duration else 0.0

// Which segment is sounding at time `t`, for highlighting. Between two segments it is the earlier.
let markAt (marks: Mark list) (t: float) : Mark option =
    marks |> List.takeWhile (fun m -> m.Start <= t) |> List.tryLast

// ## Declination
//
// Pitch in a statement drifts downward from start to end. Applying it after planning means no other
// part of the planner needs to know about it.
let private applyDeclination (amount: float) (score: Score) : Score =
    let total = if score.Duration = 0.0 then 1.0 else score.Duration
    { score with
        Keyframes =
            score.Keyframes
            |> List.map (fun k -> { k with Frame = { k.Frame with F0 = k.Frame.F0 * (1.0 - amount * (k.T / total)) } }) }

// ## The walk
//
// The state the fold carries from one segment to the next.
type private State =
    { Line: Timeline
      Time: float
      Previous: Shape // where the tongue is now
      AtStart: bool // nothing has been voiced yet
      Pitch: float // the pitch the voice is at now, so consonants do not reset it
      Marks: Mark list } // newest first

// With the mouth open and no noise: what a vowel needs on top of its shape.
let private openMouth : Change =
    fun f -> { f with C0d = 3.0; C1d = 3.0; C0n = 0.0; C1n = 0.0; C0m = 0.0; C0mHz = 0.0; Aspiration = 0.0 }

let private shapeOrFail (symbol: string) : Shape =
    match shapeOfSymbol symbol with
    | Some s -> s
    | None -> failwithf "no vowel /%s/" symbol

// ## The planner
let planTokens (o: PlanOptions) (input: Token list) : Plan =
    let tm = scaleForRate o.Timing o.Rate
    let segs : Token array = input |> List.filter (fun t -> match t with Unknown _ -> false | _ -> true) |> Array.ofList
    let overrideOf (k: int) : Override option =
        o.Overrides |> List.tryFind (fun (index, _) -> index = k) |> Option.map snd
    let isVowel (k: int) : bool =
        k >= 0 && k < segs.Length && (match segs.[k] with Sound s -> s.Kind = Kind.Vowel | _ -> false)
    let symbolOf (s: Segment) (k: int) : string =
        overrideOf k |> Option.bind (fun x -> x.Symbol) |> Option.defaultValue s.Symbol
    // A rhythm override is written for speed 1, so it is scaled by the same factor as the vowels.
    let speed = tm.Vowel / timing.Vowel
    // A vowel next to another vowel (a diphthong, or two vowels in hiatus) is half of a pair.
    let paired (k: int) : bool = isVowel (k - 1) || isVowel (k + 1)
    let vowelSeconds (s: Segment) (k: int) : float =
        match overrideOf k |> Option.bind (fun x -> x.Seconds) with
        | Some seconds -> seconds * speed
        | None ->
            tm.Vowel
            * (if s.Long then tm.LongFactor elif s.Half then tm.HalfFactor else 1.0)
            * (if s.Stress > 0 then tm.StressFactor else 1.0)
            * (if paired k then tm.DiphthongFactor else 1.0)
    // The shape the tongue is heading for: the next vowel in this phrase, as far as it will reach.
    let rec nextVowelShape (from: int) : Shape option =
        let j = from + 1
        if j >= segs.Length then
            None
        else
            match segs.[j] with
            | Sound s when s.Kind = Kind.Vowel ->
                Some(undershoot tm.UndershootBelow (vowelSeconds s j) (shapeOrFail (symbolOf s j)))
            | Break(Pause _) -> None
            | _ -> nextVowelShape j

    // A vowel: glide to the target shape, hold, and set the pitch (a flat accent, or a tone contour).
    let vowel (state: State) (k: int) (s: Segment) : State =
        let d0 = vowelSeconds s k
        let voiced = s.Voicing <> Some false
        let shape = undershoot tm.UndershootBelow d0 (shapeOrFail (symbolOf s k))
        let peak = o.F0 * (1.0 + (List.item s.Stress accent - 1.0) * o.Range)
        let d = if s.Tone.IsSome then d0 * tm.ToneFactor else d0
        let start = state.Time
        // A tone is a list of pitch levels (5 high, 1 low) spread evenly across the vowel.
        let levels = Option.defaultValue [ 3 ] s.Tone
        let hz (level: int) : float =
            if s.Tone.IsSome then peak * (2.0 ** (float (level - 3) * tm.ToneStep * o.Range)) else peak
        let glide = min tm.Glide (d * 0.4)
        let source (f: Frame) : Frame =
            { f with
                Velum = (if s.Nasalized then tm.NasalVelum else 0.01)
                Intensity = (if voiced then 1.0 else 0.0)
                Aspiration = (if voiced then 0.0 else 0.8)
                F0 = hz (List.head levels)
                Tenseness = o.Tenseness }
        let arrive : Change = apply shape >> openMouth >> source
        let line = Timeline.at (start + glide) arrive state.Line
        let count = List.length levels
        let contour =
            levels
            |> List.indexed
            |> List.skip 1
            |> List.fold
                (fun tl (index, level) ->
                    let at = start + glide + ((d - glide) * float index) / float (count - 1)
                    Timeline.at at (fun f -> { f with F0 = hz level }) tl)
                line
        let finish = start + d
        { state with
            Line = (if count = 1 then Timeline.at finish id contour else contour)
            Time = finish
            Previous = shape
            Pitch = hz (List.last levels)
            AtStart = false
            Marks = { Index = k; Symbol = symbolOf s k; Kind = Kind.Vowel; Start = start; End = finish } :: state.Marks }

    // A consonant: build its gesture around the previous vowel, then lay its core on the timeline
    // with the tongue steered between the vowels on either side.
    let consonant (state: State) (k: int) (s: Segment) : State =
        let found =
            match bySymbol s.Symbol with
            | Some c -> c
            | None -> failwithf "no consonant /%s/" s.Symbol
        let c = match s.Voicing with Some v -> { found with Voiced = v } | None -> found
        let options =
            { defaultOptions with
                Pitch = o.F0
                Carrier = Some(apply state.Previous)
                Aspirated = s.Aspirated
                TransitionScale = tm.Transition }
        let natural = gestureWith options c
        // Isolated, a consonant is held long enough to study. In running speech it is shorter.
        let g =
            match natural.Hold with
            | Some hold when hold.End - hold.Start <> 0.0 ->
                let scale = overrideOf k |> Option.bind (fun x -> x.Scale) |> Option.defaultValue 1.0
                let factor =
                    tm.ConsonantScale * scale * (if s.Long then tm.LongFactor elif s.Half then tm.HalfFactor else 1.0)
                let seconds = max tm.MinHold ((hold.End - hold.Start) * factor)
                gestureWith { options with HoldFor = Some seconds } c
            | _ -> natural
        let next = nextVowelShape k |> Option.defaultValue state.Previous
        let hold = Option.defaultValue g.Core g.Hold
        let offset = state.Time - g.Core.Start
        let place (tl: Timeline) (key: Keyframe) : Timeline =
            if key.T < g.Core.Start - 1e-9 || key.T > g.Core.End + 1e-9 then
                tl
            else
                let leaving = key.T <= hold.Start + 1e-9
                // Steer the tongue: previous vowel until the gesture begins, next vowel once it ends.
                let steered = apply (if leaving then state.Previous else next) key.Frame
                // The first sound of an utterance starts from silence, not from a vowel never said.
                let quiet =
                    if state.AtStart && leaving then { steered with Intensity = 0.0; Aspiration = 0.0 } else steered
                let frame = { quiet with F0 = state.Pitch }
                Timeline.at (key.T + offset) (fun _ -> frame) tl
        let line = List.fold place state.Line g.Score.Keyframes
        let finish = g.Core.End + offset
        { state with
            Line = line
            Time = finish
            Previous = next
            AtStart = false
            Marks = { Index = k; Symbol = s.Symbol; Kind = Kind.Consonant; Start = state.Time; End = finish } :: state.Marks }

    let step (state: State) (k: int) : State =
        match segs.[k] with
        | Unknown _ -> state
        | Break Word ->
            let t = state.Time + tm.WordGap
            { state with Line = Timeline.at t id state.Line; Time = t }
        | Break Syllable -> state
        | Break(Pause seconds) ->
            let line = Timeline.at (state.Time + 0.03) (fun f -> { f with Intensity = 0.0; Aspiration = 0.0 }) state.Line
            let t = state.Time + seconds * tm.PauseScale
            { state with Line = Timeline.at t id line; Time = t; AtStart = true }
        | Sound s when s.Kind = Kind.Vowel -> vowel state k s
        | Sound s -> consonant state k s

    let start : Frame =
        { defaultFrame with
            TongueIndex = neutralShape.TongueIndex
            TongueDiameter = neutralShape.TongueDiameter
            Lips = neutralShape.Lips
            F0 = o.F0
            Tenseness = o.Tenseness
            Intensity = 0.0
            Velum = 0.01
            VibratoDepth = o.VibratoDepth
            VibratoRate = o.VibratoRate
            Jitter = o.Jitter }
    let initial =
        { Line = Timeline.at tm.StartSilence id (Timeline.start start)
          Time = tm.StartSilence
          Previous = neutralShape
          AtStart = true
          Pitch = o.F0
          Marks = [] }
    let final = [ 0 .. segs.Length - 1 ] |> List.fold step initial
    let faded =
        Timeline.at
            (final.Time + tm.EndFade)
            (fun f -> { f with Intensity = 0.0; Aspiration = 0.0; C0n = 0.0; C1n = 0.0 })
            final.Line
    let score = faded |> Timeline.toScore |> applyDeclination o.Declination
    { Score = score
      Marks = List.rev final.Marks
      Duration = score.Duration }

// Plan from text: tokenize, then plan.
let plan (o: PlanOptions) (text: string) : Plan = planTokens o (tokenize text)
