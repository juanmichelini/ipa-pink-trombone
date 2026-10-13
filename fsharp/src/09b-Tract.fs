// # Lesson 9, part 2: the tract (in F#)
//
// The filter half of the engine. A tube from the glottis to the lips, with a side branch for the
// nose. Sound bounces back and forth inside it, and the shape of the tube decides which frequencies
// ring.
//
// A tube of length `L` cm cut into `n` sections has sections `L / n` long. In a waveguide a wave
// crosses one section per simulation step, so the step rate is `c / (L / n)`, where `c` is the
// speed of sound. The tract is stepped twice per audio sample (a better-behaved model than once),
// so for a given sample rate the number of sections is fixed by the length. At 44.1 kHz, 17.1 cm
// gives exactly 44 sections.
//
// Shapes are written in **index units**, positions 0 to 44 from glottis to lips, whatever the real
// number of sections. That is what lets a child and an adult share the same vowels (lesson 5).
module IpaTrombone.Tracts

open System
open IpaTrombone.Score
open IpaTrombone.Glottal

let speedOfSound = 34300.0 // cm/s
let indexUnits = 44.0
let defaultTractCm = 17.1

// JavaScript's `Math.round` rounds halves up; .NET's rounds them to even. The engine was written
// against the first, so that is the one we keep.
let private roundHalfUp (x: float) : float = Math.Floor(x + 0.5)

let tractSections (sampleRate: float) (lengthCm: float) : int =
    max 16 (int (roundHalfUp (lengthCm * 2.0 * sampleRate / speedOfSound)))

// ## Landmarks along the tract, in index units
//
// The **blade** of the tongue starts at 10, the **tip** zone at 32, the **lips** at 39. The
// **nasal branch** leaves the main tube at 17 and is 28 units long. A constriction at 41 or
// beyond is made by the **lips** (the lower lip rising to the upper lip or teeth); one further back is
// made by the **tongue**.
type Landmarks =
    { BladeStart: float
      TipStart: float
      LipStart: float
      NoseStart: float
      NoseLength: float
      LabialStart: float }

let landmarks : Landmarks =
    { BladeStart = 10.0; TipStart = 32.0; LipStart = 39.0; NoseStart = 17.0; NoseLength = 28.0; LabialStart = 41.0 }

// ## Two surfaces
//
// The upper wall of the tract is fixed: the palate and the back of the throat. What moves is the
// lower wall, and it is *two* things that happen to share a line in a one-dimensional tube: the
// **tongue**, from the throat up to its tip, and the **jaw and lower lip** at the front, whose
// opening is the `Lips` number. Each has its own gap to the upper wall, in the same units as the
// tube's diameter, and the tube is as wide as the *smaller* of the two. Where one is absent its gap is
// `none`, a number so large that the other always wins. Keeping them apart is what stops a tongue tip
// that rises to the ridge from dragging the lips up with it.
let none = 99.0

// How wide the soft skirt of a constriction is, in index units each side. The back of the tongue is
// broad, so a velar closure is long and gentle. The tip is narrow: a `t` touches the ridge over about
// a centimetre. The lips close over even less.
let skirtWidth (index: float) : float =
    if index >= landmarks.LabialStart then 1.8
    elif index < 25.0 then 10.0
    elif index >= landmarks.TipStart + 1.0 then 2.2
    else 10.0 - (7.8 * (index - 25.0)) / (landmarks.TipStart + 1.0 - 25.0)

// ## The pieces of a tract
//
// A **constriction** is a place where the tongue or lips pinch the tube. A **transient** is the pop
// of air when a full closure opens. Both are small records; the tract keeps lists of them.
type Constriction =
    { Index: float
      Gap: float
      Noise: float
      Position: float }

type Transient =
    { Where: int
      mutable Age: float }

// Each section has a diameter, and an area `A` (the square of the diameter). Two arrays carry the
// waves: `R` moving toward the lips and `L` moving back toward the glottis. Where the area changes,
// part of a wave reflects. The reflection coefficient between sections `i-1` and `i` is
// `(A[i-1] - A[i]) / (A[i-1] + A[i])`. That one formula is the entire acoustics.
//
// The shape changes once per block, so the tract keeps the old coefficients and the new ones and
// slides from one to the other across the block (`lambda` in `step`). Without that the walls would
// jump every 32 samples and the voice would click.
type Tract =
    { Rate: float
      N: int
      Scale: float
      NoseLength: int
      NoseStart: int
      R: float[]
      L: float[]
      Reflection: float[]
      NewReflection: float[]
      JunctionR: float[]
      JunctionL: float[]
      Diameters: float[]
      Areas: float[]
      Rest: float[]
      // The two lower surfaces behind `Rest` (the tube is as wide as the smaller of the two).
      Tongue: float[]
      Floor: float[]
      NoseR: float[]
      NoseL: float[]
      NoseJunctionR: float[]
      NoseJunctionL: float[]
      NoseDiameters: float[]
      NoseAreas: float[]
      NoseReflection: float[]
      // The weights of the velum junction (throat, mouth, nose), before and after the latest shape.
      Weights: float[]
      NewWeights: float[]
      Constrictions: ResizeArray<Constriction>
      Transients: ResizeArray<Transient>
      mutable Velum: float
      mutable LastObstruction: int
      mutable LipOutput: float
      mutable NoseOutput: float }

let private glottalReflection = 0.75
let private lipReflection = -0.85
let private wallLoss = 0.999

let private copyInto (source: float[]) (target: float[]) : unit =
    for i in 0 .. source.Length - 1 do
        target[i] <- source[i]

let private reflectionOf (a: float[]) (i: int) : float = (a[i - 1] - a[i]) / (a[i - 1] + a[i])

// ## Reflections
//
// Recompute the reflection coefficients for the new shape, keeping the old ones for the slide. When
// a full closure opens (and the nose is shut) the pressure behind it escapes as a pop: that is the
// burst of a `p` or a `t`, and it is added as a transient.
let private updateReflections (t: Tract) : unit =
    let n = t.N
    let mutable newLast = -1
    for i in 0 .. n - 1 do
        t.Diameters[i] <- t.Rest[i]
        t.Areas[i] <- t.Diameters[i] ** 2.0
        if t.Diameters[i] <= 0.001 then newLast <- i
    for i in 1 .. n - 1 do
        t.Reflection[i] <- t.NewReflection[i]
        t.NewReflection[i] <- if t.Areas[i] = 0.0 then 0.999 else reflectionOf t.Areas i
    copyInto t.NewWeights t.Weights
    let a = t.NoseStart
    let sum = Math.Max(1e-9, t.Areas[a - 1] + t.Areas[a] + t.NoseAreas[0])
    t.NewWeights[0] <- (2.0 * t.Areas[a - 1]) / sum
    t.NewWeights[1] <- (2.0 * t.Areas[a]) / sum
    t.NewWeights[2] <- (2.0 * t.NoseAreas[0]) / sum
    if t.LastObstruction > -1 && newLast = -1 && t.NoseAreas[0] < 0.05 then
        t.Transients.Add({ Where = t.LastObstruction; Age = 0.0 })
    t.LastObstruction <- newLast

// ## Shapes
//
// A shape comes from a *frame* (lesson 2):
//
// - `TongueIndex` and `TongueDiameter`: a raised-cosine hump of the tongue. The index says where
//   along the tract the hump peaks; the diameter says how high it rises (small is a tall tongue).
// - `Lips`: the diameter of the lip opening
// - `Velum`: how open the nose is, 0.01 closed and about 0.4 open
// - up to two **constrictions**, each with an index, a gap and how much hiss it makes
//
// The hump is `1.5 - (g + 1.5 - d') cos(t)` with `d' = 2 + (d - 2) / 1.5` and `g = 1.7`, tapered at
// the ends so it joins the rest of the tract.
let setShape (t: Tract) (frame: Frame) : unit =
    let n = t.N
    let scale = t.Scale
    let fixedGap = 2.0 + (frame.TongueDiameter - 2.0) / 1.5
    let tongue = t.Tongue
    let floor = t.Floor
    for i in 0 .. n - 1 do
        let u = float i / scale
        if u >= landmarks.LipStart then
            tongue[i] <- none
            floor[i] <- Math.Max(0.0, frame.Lips)
        else
            let mutable d = if u < 7.0 - 0.5 then 0.6 elif u < 12.0 then 1.1 else 1.5
            if u >= landmarks.BladeStart then
                let angle = 1.1 * Math.PI * (frame.TongueIndex - u) / (landmarks.TipStart - landmarks.BladeStart)
                let mutable curve = (1.5 - fixedGap + 1.7) * Math.Cos(angle)
                if u < landmarks.BladeStart + 1.0 || u >= landmarks.LipStart - 1.0 then curve <- curve * 0.8
                elif u < landmarks.BladeStart + 2.0 || u >= landmarks.LipStart - 2.0 then curve <- curve * 0.94
                d <- 1.5 - curve
            tongue[i] <- Math.Max(0.0, d)
            floor[i] <- none
    // Constrictions pinch one of the two surfaces with a soft skirt: the lips for an index of 41 or
    // more, the tongue otherwise. A gap of 3 or more is "not there".
    t.Constrictions.Clear()
    for (index, gap, noise) in [ (frame.C0i, frame.C0d, frame.C0n); (frame.C1i, frame.C1d, frame.C1n) ] do
        if gap < 3.0 then
            t.Constrictions.Add({ Index = index; Gap = gap; Noise = noise; Position = index * scale })
            let surface = if index >= landmarks.LabialStart then floor else tongue
            let width = skirtWidth index
            for i in 0 .. n - 1 do
                let u = float i / scale
                let rel = Math.Abs(u - index) - 0.5
                let shrink =
                    if rel <= 0.0 then 0.0
                    elif rel > width then 1.0
                    else 0.5 * (1.0 - Math.Cos(Math.PI * rel / width))
                if shrink < 1.0 && gap < surface[i] then surface[i] <- gap + (surface[i] - gap) * shrink
    for i in 0 .. n - 1 do
        t.Rest[i] <- Math.Min(tongue[i], floor[i])
    t.Velum <- clamp frame.Velum 0.01 0.6
    t.NoseDiameters[0] <- t.Velum
    t.NoseAreas[0] <- t.Velum ** 2.0
    for i in 1 .. t.NoseLength - 1 do
        t.NoseReflection[i] <- reflectionOf t.NoseAreas i
    updateReflections t

// After the first shape, make the old and new coefficients the same, so nothing slides.
let settle (t: Tract) : unit =
    copyInto t.NewReflection t.Reflection
    copyInto t.NewWeights t.Weights
    t.Transients.Clear()

// Empty the tube of sound. A safety net: if anything ever goes non-finite in a live audio thread,
// silence and a restart beat a permanent screech.
let reset (t: Tract) : unit =
    for a in [ t.R; t.L; t.JunctionR; t.JunctionL; t.NoseR; t.NoseL; t.NoseJunctionR; t.NoseJunctionL ] do
        for i in 0 .. a.Length - 1 do
            a[i] <- 0.0
    t.Transients.Clear()
    t.LipOutput <- 0.0
    t.NoseOutput <- 0.0

// The block is over, so the shape it was heading toward is now the shape it is at.
let hold (t: Tract) : unit =
    copyInto t.NewReflection t.Reflection
    copyInto t.NewWeights t.Weights

// Build a tract for a sample rate and a length, already shaped like a relaxed mouth. The nose is a
// tube that swells and narrows again, as a nasal passage does.
let makeTract (sampleRate: float) (lengthCm: float) : Tract =
    let n = tractSections sampleRate lengthCm
    let scale = float n / indexUnits
    let noseLength = max 8 (int (roundHalfUp (landmarks.NoseLength * scale)))
    let make (size: int) : float[] = Array.zeroCreate size
    let noseDiameters = make noseLength
    let noseAreas = make noseLength
    let noseReflection = make noseLength
    for i in 0 .. noseLength - 1 do
        let x = 2.0 * (float i / float noseLength)
        let d = if x < 1.0 then 0.4 + 1.6 * x else 0.5 + 1.5 * (2.0 - x)
        noseDiameters[i] <- Math.Min(d, 1.9)
        noseAreas[i] <- noseDiameters[i] ** 2.0
    noseDiameters[0] <- 0.01
    noseAreas[0] <- 0.01 ** 2.0
    for i in 1 .. noseLength - 1 do
        noseReflection[i] <- reflectionOf noseAreas i
    let tract : Tract =
        { Rate = sampleRate
          N = n
          Scale = scale
          NoseLength = noseLength
          NoseStart = n - noseLength + 1
          R = make n
          L = make n
          Reflection = make n
          NewReflection = make n
          JunctionR = make n
          JunctionL = make (n + 1)
          Diameters = make n
          Areas = make n
          Rest = make n
          Tongue = make n
          Floor = make n
          NoseR = make noseLength
          NoseL = make noseLength
          NoseJunctionR = make noseLength
          NoseJunctionL = make (noseLength + 1)
          NoseDiameters = noseDiameters
          NoseAreas = noseAreas
          NoseReflection = noseReflection
          Weights = make 3
          NewWeights = make 3
          Constrictions = ResizeArray<Constriction>()
          Transients = ResizeArray<Transient>()
          Velum = 0.01
          LastObstruction = -1
          LipOutput = 0.0
          NoseOutput = 0.0 }
    setShape tract defaultFrame
    settle tract
    tract

// ## Turbulence
//
// Air squeezed through a narrow gap makes noise. A gap that is too wide makes none, and a closed
// one makes none either, so noise is strongest around 0.3 to 0.7 across. It is split between the two
// neighbouring sections in proportion to where in between it sits.
let private addTurbulence (t: Tract) (noise: float) (position: float) (gap: float) : unit =
    let i = int (Math.Floor(position))
    let delta = position - float i
    let thinness = clamp (8.0 * (0.7 - gap)) 0.0 1.0
    let openness = clamp (30.0 * (gap - 0.3)) 0.0 1.0
    let amount = noise * thinness * openness
    let a = amount * (1.0 - delta)
    let b = amount * delta
    if i >= 0 && i + 2 < t.N then
        t.R[i + 1] <- t.R[i + 1] + a / 2.0
        t.L[i + 1] <- t.L[i + 1] + a / 2.0
        t.R[i + 2] <- t.R[i + 2] + b / 2.0
        t.L[i + 2] <- t.L[i + 2] + b / 2.0

// ## One step
//
// `lambda` (0 to 1) says how far through the block we are, to slide between old and new
// reflections. After this call `LipOutput` and `NoseOutput` hold what escaped.
let step (t: Tract) (glottal: float) (turbulence: float) (lambda: float) : unit =
    let n = t.N
    let r = t.R
    let l = t.L
    let junctionR = t.JunctionR
    let junctionL = t.JunctionL
    // The pops of released closures fade away in a few milliseconds.
    for k in t.Transients.Count - 1 .. -1 .. 0 do
        let tr = t.Transients[k]
        let amp = 0.3 * Math.Pow(2.0, -200.0 * tr.Age)
        r[tr.Where] <- r[tr.Where] + amp / 2.0
        l[tr.Where] <- l[tr.Where] + amp / 2.0
        tr.Age <- tr.Age + 1.0 / (t.Rate * 2.0)
        if tr.Age > 0.2 then t.Transients.RemoveAt(k)
    for c in t.Constrictions do
        if c.Noise > 0.0 then addTurbulence t (0.66 * turbulence * c.Noise) c.Position c.Gap

    junctionR[0] <- l[0] * glottalReflection + glottal
    junctionL[n] <- r[n - 1] * lipReflection
    for i in 1 .. n - 1 do
        let refl = t.Reflection[i] * (1.0 - lambda) + t.NewReflection[i] * lambda
        let w = refl * (r[i - 1] + l[i])
        junctionR[i] <- r[i - 1] - w
        junctionL[i] <- l[i] + w

    // The velum junction: three tubes meet (the throat below, the mouth above, the nose). The waves
    // are volume-velocity waves (that is why the closed glottis end reflects with a plus sign and
    // the open lips with a minus). For such waves, flow continuity and a common pressure at the
    // junction give one formula for every port: what leaves port `k` is `2 A_k / (A_1 + A_2 + A_3)`
    // times the sum of everything arriving, minus what arrived on `k`. With the nose shut (a tiny
    // area) it leaves the main tube unchanged, and it cannot create energy.
    let i = t.NoseStart
    let wl = t.Weights[0] * (1.0 - lambda) + t.NewWeights[0] * lambda
    let wr = t.Weights[1] * (1.0 - lambda) + t.NewWeights[1] * lambda
    let wn = t.Weights[2] * (1.0 - lambda) + t.NewWeights[2] * lambda
    let arriving = r[i - 1] + l[i] + t.NoseL[0]
    junctionL[i] <- wl * arriving - r[i - 1]
    junctionR[i] <- wr * arriving - l[i]
    t.NoseJunctionR[0] <- wn * arriving - t.NoseL[0]

    for k in 0 .. n - 1 do
        r[k] <- junctionR[k] * wallLoss
        l[k] <- junctionL[k + 1] * wallLoss
    t.LipOutput <- r[n - 1]

    let m = t.NoseLength
    t.NoseJunctionL[m] <- t.NoseR[m - 1] * lipReflection
    for k in 1 .. m - 1 do
        let w = t.NoseReflection[k] * (t.NoseR[k - 1] + t.NoseL[k])
        t.NoseJunctionR[k] <- t.NoseR[k - 1] - w
        t.NoseJunctionL[k] <- t.NoseL[k] + w
    for k in 0 .. m - 1 do
        t.NoseR[k] <- t.NoseJunctionR[k] * wallLoss
        t.NoseL[k] <- t.NoseJunctionL[k + 1] * wallLoss
    t.NoseOutput <- t.NoseR[m - 1]

// ## The picture of a shape
//
// A drawing of the tract needs actual widths, not a frame. `shapeOf` builds a tract, shapes it and
// reads the widths back. It touches no audio, and it returns copies, so nothing the caller holds
// can change the tract. The JavaScript version caches one tract per length for speed; here a fresh
// one is made each time, which is simpler and just as correct, because a shape depends only on its
// frame.
type TractShape =
    { Sections: int
      Scale: float
      Diameter: float[]
      Tongue: float[]
      Floor: float[]
      NoseLength: int
      NoseStart: int
      NoseDiameter: float[]
      Velum: float
      Pinches: Constriction list }

let shapeOf (sampleRate: float) (lengthCm: float) (frame: Frame) : TractShape =
    let t = makeTract sampleRate lengthCm
    setShape t frame
    { Sections = t.N
      Scale = t.Scale
      Diameter = Array.copy t.Diameters
      Tongue = Array.copy t.Tongue
      Floor = Array.copy t.Floor
      NoseLength = t.NoseLength
      NoseStart = t.NoseStart
      NoseDiameter = Array.copy t.NoseDiameters
      Velum = t.Velum
      Pinches = List.ofSeq t.Constrictions }
