// # Lesson 2, part 1: frames and scores (in F#)
//
// Lesson 1 placed a tongue at a *point* on the vowel chart. Speech is not a point, it is movement,
// and consonants are almost entirely movement: a closing, a hold, a release. So before consonants
// we need a way to write movement down. This file is that, and it is the same idea as
// `lib/score.js`, made pure.
//
// - a **Frame** is the whole instrument at one instant: tongue, lips, nose, two constrictions, and
//   the voice
// - a **Keyframe** is a frame and the time it happens
// - a **Score** is a list of keyframes; the player blends between neighbours
// - a **Timeline** is how you *write* a score: "by 0.15 s, close the lips"
//
// Everything here is a plain value and a plain function. The JavaScript version keeps a timeline in
// an object and mutates it as you call `at`; here `Timeline.at` returns a *new* timeline, so a half
// finished gesture can be kept, compared or thrown away without surprises.
module IpaTrombone.Score

// ## A frame
//
// A frame is a record of numbers. The groups, in the order of the record:
//
// - **tongue**: `TongueIndex` (12 back to 29 front) and `TongueDiameter` (2.05 tall tongue, 3.5 low)
// - `Lips`: the lip opening (1.5 relaxed, about 0.6 rounded)
// - `Velum`: the nasal opening (0.01 closed, 0.4 open)
// - **two constrictions**, `C0` and `C1`. Each has `i` (where along the tract, 0 at the glottis to 44
//   at the lips), `d` (the gap: 3 or more means nothing is there, 0 means closed) and `n` (how much
//   hiss it makes, 0 to 1). `C0m` and `C0mHz` make the first one flutter: that is a trill
// - `NoiseHz`: the centre of the hiss, higher for an `s` than for an `h`
// - **the voice**: `F0` pitch in Hz, `Tenseness` (0 breathy to 1 pressed), `Intensity` (loudness of
//   voicing, 0 to 1), `Aspiration` (extra breath, 0 to 1)
// - small natural wobble: `VibratoDepth`, `VibratoRate`, `Jitter`
type Frame =
    { TongueIndex: float
      TongueDiameter: float
      Lips: float
      Velum: float
      C0i: float
      C0d: float
      C0n: float
      C0m: float
      C0mHz: float
      C1i: float
      C1d: float
      C1n: float
      NoiseHz: float
      F0: float
      Tenseness: float
      Intensity: float
      Aspiration: float
      VibratoDepth: float
      VibratoRate: float
      Jitter: float }

// Where everything starts: a relaxed mouth, nose shut, both constrictions out of the way, voice off.
let defaultFrame : Frame =
    { TongueIndex = 20.0
      TongueDiameter = 2.8
      Lips = 1.5
      Velum = 0.01
      C0i = 30.0
      C0d = 3.0
      C0n = 0.0
      C0m = 0.0
      C0mHz = 0.0
      C1i = 30.0
      C1d = 3.0
      C1n = 0.0
      NoiseHz = 1000.0
      F0 = 140.0
      Tenseness = 0.6
      Intensity = 0.0
      Aspiration = 0.0
      VibratoDepth = 0.0
      VibratoRate = 5.5
      Jitter = 0.0 }

// A **change** says what is different from the frame before it. Describing movement as changes is
// how people think ("now close the lips") and it saves repeating twenty numbers every time. A change
// is just a function from a frame to a frame, so changes compose with ordinary function composition:
// `closeLips >> voiceOff`.
type Change = Frame -> Frame

// Several changes, applied in order.
let all (changes: Change list) : Change =
    fun frame -> List.fold (fun current change -> change current) frame changes

// ## Keyframes and scores
type Keyframe = { T: float; Frame: Frame }

type Score = { Keyframes: Keyframe list; Duration: float }

// ## Blending
//
// Between two keyframes every number moves in a straight line. `u` is how far along we are, 0 at the
// first keyframe and 1 at the second.
let private lerp (u: float) (a: float) (b: float) : float = a + (b - a) * u

let blend (u: float) (a: Frame) (b: Frame) : Frame =
    { TongueIndex = lerp u a.TongueIndex b.TongueIndex
      TongueDiameter = lerp u a.TongueDiameter b.TongueDiameter
      Lips = lerp u a.Lips b.Lips
      Velum = lerp u a.Velum b.Velum
      C0i = lerp u a.C0i b.C0i
      C0d = lerp u a.C0d b.C0d
      C0n = lerp u a.C0n b.C0n
      C0m = lerp u a.C0m b.C0m
      C0mHz = lerp u a.C0mHz b.C0mHz
      C1i = lerp u a.C1i b.C1i
      C1d = lerp u a.C1d b.C1d
      C1n = lerp u a.C1n b.C1n
      NoiseHz = lerp u a.NoiseHz b.NoiseHz
      F0 = lerp u a.F0 b.F0
      Tenseness = lerp u a.Tenseness b.Tenseness
      Intensity = lerp u a.Intensity b.Intensity
      Aspiration = lerp u a.Aspiration b.Aspiration
      VibratoDepth = lerp u a.VibratoDepth b.VibratoDepth
      VibratoRate = lerp u a.VibratoRate b.VibratoRate
      Jitter = lerp u a.Jitter b.Jitter }

// ## The frame at a moment
//
// Before the first keyframe and after the last, hold. In between, find the two keyframes around `t`
// and blend. Two keyframes a hair apart make a near-instant change, which is how a stop consonant
// snaps shut.
let frameAt (keyframes: Keyframe list) (t: float) : Frame =
    match keyframes with
    | [] -> defaultFrame
    | first :: _ when t <= first.T -> first.Frame
    | _ ->
        let last = List.last keyframes
        if t >= last.T then
            last.Frame
        else
            let before = keyframes |> List.filter (fun k -> k.T <= t) |> List.last
            let after = keyframes |> List.find (fun k -> k.T > t)
            let u = (t - before.T) / max 1e-9 (after.T - before.T)
            blend u before.Frame after.Frame

// ## Writing a score: the timeline
//
// A timeline remembers the current frame and the keyframes so far (newest first, which is the cheap
// end of an F# list). `at t change` says "by time `t`, this is different": it applies the change
// to the current frame and records a keyframe. Numbers the change does not touch keep their value,
// so they hold steady through that interval; numbers it does touch glide from where they were.
// Reading a gesture then reads like a description of it:
//
//     Timeline.start rest
//     |> Timeline.at 0.15 closeLips     // over 0.15 s, shut the lips
//     |> Timeline.at 0.22 id            // hold the closure until 0.22 s
//     |> Timeline.at 0.23 openLips      // release in 10 ms
//
// A time earlier than the last keyframe is lifted to it: a score never goes backwards.
type Timeline = { Current: Frame; Keys: Keyframe list }

module Timeline =
    let start (frame: Frame) : Timeline =
        { Current = frame; Keys = [ { T = 0.0; Frame = frame } ] }

    let at (t: float) (change: Change) (timeline: Timeline) : Timeline =
        let last = List.head timeline.Keys
        let next = change timeline.Current
        { Current = next; Keys = { T = max t last.T; Frame = next } :: timeline.Keys }

    // The finished score: keyframes oldest first, and a duration that is the time of the last.
    let toScore (timeline: Timeline) : Score =
        let keys = List.rev timeline.Keys
        { Keyframes = keys; Duration = (List.last keys).T }

// A score written as changes at times, in any order. Sorting is stable, so two changes at the same
// time keep the order they were written in.
let fromChanges (changes: (float * Change) list) : Score =
    let sorted = changes |> List.sortBy fst
    let keys, _ =
        sorted
        |> List.mapFold (fun current (t, change) ->
            let next = change current
            ({ T = t; Frame = next }, next)) defaultFrame
    { Keyframes = keys
      Duration = (match List.tryLast keys with Some k -> k.T | None -> 0.0) }

// ## Joining and stretching
//
// `concat` plays scores one after another with a gap between them; each keeps its own timing and
// only its start moves. `scaleTime` multiplies every time by a factor. That is the *naive* way to
// change speed, like playing a recording faster: every closure, burst and glide shrinks by the same
// amount, which is exactly what real speakers do not do. A later lesson (tempo) shows what they do
// instead.
let concat (gap: float) (scores: Score list) : Score =
    let keys, offset =
        scores
        |> List.mapFold (fun offset score ->
            let shifted = score.Keyframes |> List.map (fun k -> { k with T = k.T + offset })
            (shifted, offset + score.Duration + gap)) 0.0
    { Keyframes = List.concat keys; Duration = max 0.0 (offset - gap) }

let scaleTime (factor: float) (score: Score) : Score =
    { Keyframes = score.Keyframes |> List.map (fun k -> { k with T = k.T * factor })
      Duration = score.Duration * factor }
