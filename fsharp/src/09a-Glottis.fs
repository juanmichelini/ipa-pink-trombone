// # Lesson 9, part 1: the source (in F#)
//
// Eight lessons planned sounds: tongues, lips, rhythm, accents. None of them made one. Everything
// stopped at a *score*, a list of frames, and the JavaScript engine turned it into air. This last
// lesson ports that engine, so the F# core can go all the way from text to samples.
//
// The engine is the one place where "pure" needs an honest definition. A waveguide is a loop that
// runs 88,200 times a second, and every step changes the state of the tube. Written as new
// immutable arrays on every step it measured about eleven times slower, below real time. So:
//
// - from the **outside** everything here is a plain function. `render options score` takes a score
//   and returns samples; call it twice and you get the same samples
// - on the **inside** the state lives in mutable arrays and fields that are made inside the call and
//   never leave it. Nothing else can see them change
//
// That is the same trade the standard library makes: `List.sort` is pure, and it sorts an array
// inside. This file is the first half of the engine, the *source* of the sound: random numbers,
// a noise filter, and the vocal folds.
module IpaTrombone.Glottal

open System

let clamp (x: float) (lo: float) (hi: float) : float =
    if x < lo then lo elif x > hi then hi else x

// ## Randomness
//
// Breath and hiss need random numbers. A seeded generator means the same score renders to the same
// samples, which is what makes tests and downloaded recordings reproducible. This is xorshift32:
// three shifts and xors on a 32 bit number. `uint32` matters here, the shifts must wrap at 32 bits.
type Rng = { mutable State: uint32 }

let makeRng (seed: int) : Rng =
    let s = uint32 seed
    { State = (if s = 0u then 1u else s) }

// The next number, from 0 up to but not including 1.
let nextFloat (rng: Rng) : float =
    let mutable s = rng.State
    s <- s ^^^ (s <<< 13)
    s <- s ^^^ (s >>> 17)
    s <- s ^^^ (s <<< 5)
    rng.State <- s
    float s / 4294967296.0

// ## A band-pass filter for noise
//
// White noise is too harsh. Breath and fricative hiss are band-limited, so a standard biquad
// band-pass shapes them. The centre frequency can move (an `s` is higher than an `sh`). The filter
// remembers its last two inputs and outputs: that memory is its mutable state.
type Bandpass =
    { Rate: float
      Q: float
      mutable Freq: float
      mutable B0: float
      mutable B2: float
      mutable A1: float
      mutable A2: float
      mutable X1: float
      mutable X2: float
      mutable Y1: float
      mutable Y2: float }

// Changing to the frequency it already has does nothing. The first call always computes (`nan` is
// different from every number).
let setFreq (f: Bandpass) (freq: float) : unit =
    if freq <> f.Freq then
        f.Freq <- freq
        let w0 = 2.0 * Math.PI * Math.Min(freq, f.Rate * 0.45) / f.Rate
        let alpha = Math.Sin(w0) / (2.0 * f.Q)
        let a0 = 1.0 + alpha
        f.B0 <- alpha / a0
        f.B2 <- -alpha / a0
        f.A1 <- (-2.0 * Math.Cos(w0)) / a0
        f.A2 <- (1.0 - alpha) / a0

let makeBandpass (sampleRate: float) (freq: float) (q: float) : Bandpass =
    let f : Bandpass =
        { Rate = sampleRate; Q = q; Freq = nan
          B0 = 0.0; B2 = 0.0; A1 = 0.0; A2 = 0.0
          X1 = 0.0; X2 = 0.0; Y1 = 0.0; Y2 = 0.0 }
    setFreq f freq
    f

// One sample in, one sample out.
let filterSample (f: Bandpass) (x: float) : float =
    let y = f.B0 * x + f.B2 * f.X2 - f.A1 * f.Y1 - f.A2 * f.Y2
    f.X2 <- f.X1
    f.X1 <- x
    f.Y2 <- f.Y1
    f.Y1 <- y
    y

// ## The glottis
//
// The source is the **Liljencrants-Fant (LF) model** of the glottal flow derivative, controlled by
// a single "tenseness" knob. In one pitch period (time scaled to 0 to 1):
//
// - during the *open phase* the derivative is `E0 e^(αt) sin(ωt)`: it swings up, then dives sharply
//   negative as the folds snap shut at time `Te`
// - during the *return phase* it relaxes back to zero as `-(e^(-ε(t-Te)) - shift) / Δ`
//
// The timing parameters come from Fant's regressions on one parameter, `Rd`. Low tenseness gives a
// large `Rd`: a soft, breathy voice. High tenseness gives a pressed, buzzy one.
type Lf =
    { Te: float
      Alpha: float
      Omega: float
      Epsilon: float
      Shift: float
      Delta: float
      E0: float }

// The unknown is the growth rate `α` of the open phase. It is chosen so the flow returns to zero
// over a period, that is the open and the return areas cancel. We find it by bisection: halve a
// bracket 60 times. If the bracket does not straddle a root there is a closed form to fall back on.
// Everything in this function is a value computed from `tenseness`, so it is a pure function even
// though the bisection loop uses two mutable variables.
let lfParameters (tenseness: float) : Lf =
    let rd = clamp (3.0 * (1.0 - tenseness)) 0.5 2.7
    let ra = -0.01 + 0.048 * rd
    let rk = 0.224 + 0.118 * rd
    let rg = ((rk / 4.0) * (0.5 + 1.2 * rk)) / (0.11 * rd - ra * (0.5 + 1.2 * rk))
    let ta = ra
    let tp = 1.0 / (2.0 * rg)
    let te = tp + tp * rk
    let epsilon = 1.0 / ta
    let shift = Math.Exp(-epsilon * (1.0 - te))
    let delta = 1.0 - shift
    let returnArea = ((1.0 / epsilon) * (shift - 1.0) + (1.0 - te) * shift) / delta
    let omega = Math.PI / tp
    let s = Math.Sin(omega * te)
    let openArea (a: float) =
        -((a * s - omega * Math.Cos(omega * te)) + omega * Math.Exp(-a * te)) / ((a * a + omega * omega) * s)
    let net (a: float) = openArea a + returnArea
    let alpha =
        if net 0.0 * net 40.0 < 0.0 then
            let mutable lo = 0.0
            let mutable hi = 40.0
            for _ in 1 .. 60 do
                let mid = (lo + hi) / 2.0
                if net mid * net lo > 0.0 then lo <- mid else hi <- mid
            (lo + hi) / 2.0
        else
            let upper = (te - tp) / 2.0 - returnArea
            Math.Log(-(Math.PI * s * upper) / (tp * 2.0)) / (tp / 2.0 - te)
    { Te = te
      Alpha = alpha
      Omega = omega
      Epsilon = epsilon
      Shift = shift
      Delta = delta
      E0 = -1.0 / (s * Math.Exp(alpha * te)) }

// The waveform at normalised time `t` (0 to 1) within a period. It starts at 0, closes at -1 when
// `t` reaches `Te`, and is back at 0 at the end.
let waveform (lf: Lf) (t: float) : float =
    if t > lf.Te then
        (-Math.Exp(-lf.Epsilon * (t - lf.Te)) + lf.Shift) / lf.Delta
    else
        lf.E0 * Math.Exp(lf.Alpha * t) * Math.Sin(lf.Omega * t)

// The vocal folds. The settings (`F0` and so on) are changed by the voice once per block; `Phase`
// is where we are in the current period and `VibPhase` where we are in the vibrato.
type Glottis =
    { Rate: float
      Rng: Rng
      mutable F0: float
      mutable Tenseness: float
      mutable Intensity: float
      mutable Aspiration: float
      mutable VibratoDepth: float
      mutable VibratoRate: float
      mutable Jitter: float
      mutable Phase: float
      mutable VibPhase: float
      mutable Freq: float
      mutable Lf: Lf
      mutable Loudness: float }

let private loudnessOf (tenseness: float) : float = Math.Pow(clamp tenseness 0.02 1.0, 0.25)

let makeGlottis (sampleRate: float) (rng: Rng) : Glottis =
    { Rate = sampleRate
      Rng = rng
      F0 = 140.0
      Tenseness = 0.6
      Intensity = 0.0
      Aspiration = 0.0
      VibratoDepth = 0.0
      VibratoRate = 5.5
      Jitter = 0.0
      Phase = 0.0
      VibPhase = 0.0
      Freq = 140.0
      Lf = lfParameters 0.6
      Loudness = loudnessOf 0.6 }

// The waveform is recomputed at the start of every period, so a change of tenseness takes effect
// at the next cycle and never in the middle of one.
let setupWaveform (g: Glottis) : unit =
    g.Lf <- lfParameters g.Tenseness
    g.Loudness <- loudnessOf g.Tenseness

// Noise that rides with the voice. Turbulence in the throat is strongest while the folds are open,
// so breath and fricative noise are modulated by the glottal cycle. With the voice off it is steady.
let noiseModulator (g: Glottis) : float =
    let voiced = 0.1 + 0.2 * Math.Max(0.0, Math.Sin(2.0 * Math.PI * g.Phase))
    let v = g.Tenseness * g.Intensity
    v * voiced + (1.0 - v) * 0.3

// One sample of source. `noise` is band-limited breath noise from the caller. The pitch wobbles by
// the vibrato (a slow sine) and the jitter (a little randomness each sample).
let step (g: Glottis) (noise: float) : float =
    g.VibPhase <- g.VibPhase + (2.0 * Math.PI * g.VibratoRate) / g.Rate
    if g.VibPhase > 2.0 * Math.PI then g.VibPhase <- g.VibPhase - 2.0 * Math.PI
    let wobble = g.VibratoDepth * Math.Sin(g.VibPhase) + g.Jitter * (nextFloat g.Rng - 0.5)
    g.Freq <- Math.Max(20.0, g.F0 * (1.0 + wobble))
    g.Phase <- g.Phase + g.Freq / g.Rate
    if g.Phase >= 1.0 then
        g.Phase <- g.Phase - 1.0
        setupWaveform g
    let voiced = waveform g.Lf g.Phase * g.Intensity * g.Loudness
    let breath =
        (g.Aspiration + g.Intensity * (1.0 - Math.Sqrt(clamp g.Tenseness 0.0 1.0))) * noiseModulator g
    voiced + breath * noise * 0.2
