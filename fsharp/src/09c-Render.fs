// # Lesson 9, part 3: from a score to samples (in F#)
//
// The last piece. A **voice** wires a glottis, a tract and two noise filters together and turns
// blocks of frames into samples. `render` walks a score block by block: ask the score for the frame
// at that moment, hand it to the voice, let the voice make 32 samples.
//
// The block is the unit of control. Shapes change once per block and are slid into place within it.
// Thirty-two samples at 44.1 kHz is under a millisecond, far finer than any articulator moves.
//
// The output goes through a soft limiter (`tanh`). Quiet sounds pass almost unchanged, and a burst
// or a loud vowel is rounded off instead of clipping.
//
// `render` is the only function of this lesson you need to call. Its type is the point:
//
//     render : RenderOptions -> Score -> float32[]
//
// Everything mutable (the tube, the filters, the random numbers) is created inside that call.
module IpaTrombone.Render

open System
open IpaTrombone.Score
open IpaTrombone.Glottal
open IpaTrombone.Tracts

type Voice =
    { SampleRate: float
      Rng: Rng
      Glottis: Glottis
      Tract: Tract
      Aspirate: Bandpass
      Fricative: Bandpass
      Gain: float
      // How many times the safety net had to fire; it should stay 0.
      mutable Resets: int
      mutable TrillPhase: float
      mutable TrillHz: float }

let makeVoice (sampleRate: float) (tractCm: float) (seed: int) (gain: float) : Voice =
    let rng = makeRng seed
    { SampleRate = sampleRate
      Rng = rng
      Glottis = makeGlottis sampleRate rng
      Tract = makeTract sampleRate tractCm
      Aspirate = makeBandpass sampleRate 500.0 0.5
      Fricative = makeBandpass sampleRate 1000.0 0.5
      Gain = gain
      Resets = 0
      TrillPhase = 0.0
      TrillHz = 0.0 }

// Apply a frame: its shape to the tract and its source settings to the glottis.
//
// A trill makes the first constriction flutter. The phase of the flutter advances as samples are
// produced (see `run`); here it only decides how wide the gap is at the start of this block.
let setFrame (v: Voice) (frame: Frame) : unit =
    let g = v.Glottis
    g.F0 <- frame.F0
    g.Tenseness <- clamp frame.Tenseness 0.0 1.0
    g.Intensity <- clamp frame.Intensity 0.0 1.0
    g.Aspiration <- clamp frame.Aspiration 0.0 4.0
    g.VibratoDepth <- frame.VibratoDepth
    g.VibratoRate <- frame.VibratoRate
    g.Jitter <- frame.Jitter
    setFreq v.Fricative frame.NoiseHz
    v.TrillHz <- if frame.C0m > 0.0 && frame.C0mHz > 0.0 && frame.C0d < 3.0 then frame.C0mHz else 0.0
    setShape
        v.Tract
        (if v.TrillHz > 0.0 then
             { frame with C0d = Math.Max(0.0, frame.C0d + frame.C0m * Math.Sin(v.TrillPhase)) }
         else
             frame)

// Generate `count` samples into `out`, starting at `offset`. Each sample steps the tract twice,
// once at each half of the sample, and adds what came out of the lips and the nose.
let run (v: Voice) (out: float32[]) (offset: int) (count: int) : unit =
    let g = v.Glottis
    let t = v.Tract
    for j in 0 .. count - 1 do
        let lambda1 = float j / float count
        let lambda2 = (float j + 0.5) / float count
        let aspirate = filterSample v.Aspirate (nextFloat v.Rng * 2.0 - 1.0)
        let hiss = filterSample v.Fricative (nextFloat v.Rng * 2.0 - 1.0)
        let source = Glottal.step g aspirate
        let turbulence = hiss * noiseModulator g
        Tracts.step t source turbulence lambda1
        let first = t.LipOutput + t.NoseOutput
        Tracts.step t source turbulence lambda2
        let sum = first + (t.LipOutput + t.NoseOutput)
        out[offset + j] <- float32 (Math.Tanh(sum * 0.125 * v.Gain))
    if v.TrillHz > 0.0 then
        v.TrillPhase <- (v.TrillPhase + 2.0 * Math.PI * v.TrillHz * float count / v.SampleRate) % (2.0 * Math.PI)
    // If `run` is called again without a new frame, the tract simply holds still. (Without this the
    // coefficients would slide from old to new again every block, a sawtooth that pumps energy in.)
    hold t
    // The safety net: a block that ends outside [-1, 1] (or not a number) means the tube blew up.
    let last = out[offset + count - 1]
    if not (last >= -1.0f && last <= 1.0f) then
        reset t
        v.Resets <- v.Resets + 1
        for j in 0 .. count - 1 do
            out[offset + j] <- 0.0f

// ## Rendering a score
//
// `Tail` adds a little silence after the last keyframe so releases and ringing are not cut off.
// `Seed` picks the random numbers, `Gain` the loudness before the limiter.
type RenderOptions =
    { SampleRate: float
      TractCm: float
      Seed: int
      Tail: float
      Gain: float }

let defaultRenderOptions : RenderOptions =
    { SampleRate = 44100.0; TractCm = defaultTractCm; Seed = 1; Tail = 0.15; Gain = 2.0 }

let block = 32

// The frame of a sorted array of keyframes at time `t`: hold before the first and after the last,
// and in between binary-search for the two around `t` and blend. (`Score.frameAt` does the same on
// a list; a list costs a walk per block, an array costs a handful of comparisons.)
let private frameIn (keys: Keyframe[]) (t: float) : Frame =
    if keys.Length = 0 then
        defaultFrame
    elif t <= keys[0].T then
        keys[0].Frame
    else
        let last = keys[keys.Length - 1]
        if t >= last.T then
            last.Frame
        else
            let mutable lo = 0
            let mutable hi = keys.Length - 1
            while hi - lo > 1 do
                let mid = (lo + hi) >>> 1
                if keys[mid].T <= t then lo <- mid else hi <- mid
            let a = keys[lo]
            let b = keys[hi]
            blend ((t - a.T) / Math.Max(1e-9, b.T - a.T)) a.Frame b.Frame

let render (options: RenderOptions) (score: Score) : float32[] =
    // A stable sort: two keyframes at the same time keep the order they were written in.
    let keys = score.Keyframes |> List.sortBy (fun k -> k.T) |> Array.ofList
    let total =
        int (Math.Ceiling((score.Duration + options.Tail) * options.SampleRate / float block)) * block
    let out : float32[] = Array.zeroCreate total
    let voice = makeVoice options.SampleRate options.TractCm options.Seed options.Gain
    for pos in 0 .. block .. total - 1 do
        setFrame voice (frameIn keys (float pos / options.SampleRate))
        run voice out pos block
    out

// ## Measuring
//
// Level measures, used by tests and for choosing a gain.
let peak (samples: float32[]) : float =
    let mutable p = 0.0
    for s in samples do
        p <- Math.Max(p, Math.Abs(float s))
    p

let rms (samples: float32[]) (from: int) (until: int) : float =
    let mutable sum = 0.0
    for i in from .. until - 1 do
        sum <- sum + float samples[i] * float samples[i]
    Math.Sqrt(sum / float (max 1 (until - from)))
