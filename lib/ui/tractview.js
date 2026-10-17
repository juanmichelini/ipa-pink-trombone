// # Drawing the tract
//
// The picture is a side view of a head facing right, cut down the middle, with the face, jaw, neck,
// tongue, teeth, lips, soft palate, nose and vocal cords drawn around the air passage. Sound starts at the **glottis**
// (bottom left), rises up the throat, turns the corner at the back of the mouth and runs forward
// to the **lips** (right). The **nose** is the tube along the top, joined at the **velum**.
//
// The back and roof of the passage are fixed; the tongue and the jaw side move. The engine keeps two
// lower surfaces (see `NONE` in `pinktrombone.js`): the **tongue**, and the **jaw and lower lip**.
// The tube is as wide as the gap to the nearer of the two, and the picture draws exactly that: the
// tongue as one body, the jaw and lip line as another, so a tongue tip can rise to the ridge while
// the jaw stays where it is. When the tongue rises toward the palate in an `i`, you see it come up.
//
// `tractGeometry` is pure (numbers in, polygons out) so it can be tested. `drawTract` paints it.
import { LANDMARKS, NONE } from '../pinktrombone.js';

// ## The drawing board
//
// All numbers are in canvas pixels on a 560 by 620 board. The centre line of the air passage has
// three parts, joined end to end:
//
// 1. a straight climb up the throat from the glottis at `(100, 570)` to the start of the bend
// 2. a quarter circle of radius 70 that turns the passage from going up to going forward
// 3. a straight run forward along the mouth, at height 300, out to the lips at `x = 470`
//
// `WALL` is how far the fixed outer wall (the back of the throat and the roof of the mouth) sits
// from that line. `SCALE` converts a tract diameter into pixels: a relaxed tract (diameter 1.5) is
// 33 pixels wide, a wide-open one (3.5) is 77.
export const VIEW = { width: 560, height: 620 };
const PATH = { gx: 100, gy: 570, bendX: 170, bendY: 370, radius: 70, mouthY: 300, lipX: 470 };
const WALL = 34;
const SCALE = 22;
const NOSE_Y = 244;
// The upper and lower teeth stand at section n - 2, one section behind the lips' last one: the tongue
// (see `tongueEnd`) stops a section and a half short of them.
export const TOOTH_FROM_END = 2;
const JAW_REST = 3.6;                 // how far below the palate the jaw line is drawn at most, in tube units

// The lengths of the three parts add up to the total path length. Section `i` of the tract is drawn
// at the fraction `(i + 0.5) / n` of that length, so the picture is stretched evenly along the tube
// and a longer or shorter tract (see Demo 5) still reaches from glottis to lips.
const VERTICAL = PATH.gy - PATH.bendY;
const ARC = (Math.PI / 2) * PATH.radius;
const HORIZONTAL = PATH.lipX - PATH.bendX;
const TOTAL = VERTICAL + ARC + HORIZONTAL;

// ## A point on the path
//
// `centerline(s)` is the point at distance `s` along the path, plus a unit normal `(nx, ny)` that
// points to the fixed side. The normal is the path's direction turned a quarter turn to the left:
// going up, the fixed wall is to the left (the back of the throat); going forward it is above (the
// palate). Using the direction to find the normal is what makes the bend work without special cases.
export function centerline(s) {
  const t = Math.max(0, Math.min(TOTAL, s));
  let x, y, tx, ty;
  if (t < VERTICAL) {
    x = PATH.gx; y = PATH.gy - t; tx = 0; ty = -1;
  } else if (t < VERTICAL + ARC) {
    const theta = Math.PI + (t - VERTICAL) / PATH.radius;
    x = PATH.bendX + PATH.radius * Math.cos(theta);
    y = PATH.bendY + PATH.radius * Math.sin(theta);
    tx = -Math.sin(theta); ty = Math.cos(theta);
  } else {
    x = PATH.bendX + (t - VERTICAL - ARC); y = PATH.mouthY; tx = 1; ty = 0;
  }
  return { x, y, nx: ty, ny: -tx };
}

// ## Geometry
//
// For each tract section, the outer wall point and the inner wall point. The outer wall is the
// centre line pushed toward the normal by `WALL`; the inner wall is `diameter` pixels back from it.
export function tractGeometry(shape) {
  const { n, diameter } = shape;
  // Older shapes (and tests) may carry only the diameter: then the tongue is the whole lower wall
  // and there is no separate jaw.
  const tongueGap = shape.tongue || diameter;
  const floorGap = shape.floor || Array.from(diameter, () => NONE);
  const outer = [], inner = [], normals = [], jaw = [];
  const add = (s, d, f) => {
    const c = centerline(s);
    const ox = c.x + c.nx * WALL, oy = c.y + c.ny * WALL;
    outer.push({ x: ox, y: oy });
    inner.push({ x: ox - c.nx * d * SCALE, y: oy - c.ny * d * SCALE });
    // The jaw line is drawn at the lip opening, and never lower than a resting jaw would hang.
    const g = Math.min(f, JAW_REST);
    jaw.push({ x: ox - c.nx * g * SCALE, y: oy - c.ny * g * SCALE });
    normals.push({ nx: c.nx, ny: c.ny });
  };
  // The two extra points, at the very start and the very end, make the outline reach the glottis
  // and the lips instead of stopping half a section short.
  add(0, diameter[0], floorGap[0]);
  for (let i = 0; i < n; i++) add(((i + 0.5) / n) * TOTAL, diameter[i], floorGap[i]);
  add(TOTAL, diameter[n - 1], floorGap[n - 1]);

  // The nose is a second, thinner tube along the top of the picture. It leaves the main passage
  // at the velum, where the roof meets the back of the throat, and runs to the nostrils at the right.
  // The connector between them is as wide as the velum is open, so a closed velum is a hairline.
  const hingeAt = centerline(VERTICAL + ARC * 0.95);
  const velumPoint = { x: hingeAt.x + hingeAt.nx * WALL, y: hingeAt.y + hingeAt.ny * WALL };
  const noseX0 = velumPoint.x, noseX1 = PATH.lipX + 10;
  const noseTop = [], noseBottom = [];
  for (let j = 0; j < shape.noseLength; j++) {
    const x = noseX0 + ((j + 0.5) / shape.noseLength) * (noseX1 - noseX0);
    const half = (shape.noseDiameter[Math.max(1, j)] * SCALE * 0.4) / 2;
    noseTop.push({ x, y: NOSE_Y - half });
    noseBottom.push({ x, y: NOSE_Y + half });
  }
  const connector = { x: velumPoint.x, top: NOSE_Y, bottom: velumPoint.y, width: shape.velum * SCALE };

  // The landmarks (see `LANDMARKS` in the engine) tell the painter which stretch of the inner wall
  // is the tongue: from the blade to the lips. They are in index units, so scale them to sections.
  const lipStart = Math.round(LANDMARKS.lipStart * shape.scale);
  const tipStart = Math.round(LANDMARKS.tipStart * shape.scale);
  const bladeStart = Math.round(LANDMARKS.bladeStart * shape.scale);
  // The tongue body runs from the throat to just short of the teeth. A constriction made with the
  // tip carries it further: wherever, past `lipStart`, the tongue is the nearer surface (its gap is
  // smaller than the jaw's), the tongue is what forms the wall, so the body reaches that far.
  let tongueEnd = lipStart - 2;
  for (let i = lipStart; i < n; i++) if (tongueGap[i] < floorGap[i] - 0.02) tongueEnd = Math.max(tongueEnd, i + 1);
  // ...but never past the teeth. The tongue can reach their back face and no further, whatever the
  // frame says: the engine makes anything further forward a lip movement (`labialStart`).
  tongueEnd = Math.min(tongueEnd, Math.floor(LANDMARKS.labialStart * shape.scale));
  return {
    outer, inner, normals, jaw, noseTop, noseBottom, connector,
    glottis: { x: PATH.gx, y: PATH.gy },
    velum: velumPoint,
    lips: { x: PATH.lipX, y: PATH.mouthY },
    tongue: { from: bladeStart + 1, to: tongueEnd + 1, tip: tipStart + 1 },
    jawFrom: lipStart + 1,
  };
}

// ## The parts that are not the tube
//
// The air passage is only the space *inside* a head. The rest of the anatomy is drawn around it,
// and each moving part gets a small pure function that says where it is, so the numbers can be
// tested and the painting stays simple.

// ### The vocal cords
//
// The cords are two folds across the windpipe. What they do depends on the sound:
//
// - **voiced** sounds: the cords are pulled together and the air pushes them apart again and again,
//   once per pitch period. They are drawn closed with a narrow, flickering gap. (Real folds vibrate
//   far too fast to see, so the flicker is slowed to a rate the eye can follow.)
// - **breath and hiss** (aspiration, `h`, whisper): the cords are held apart and air rushes through.
// - **silence with the voice off**, as in the closure of `p` or `t`: the cords are drawn apart,
//   ready, so that the voice can start again after the release. This is why `p` and `b` differ.
// - **pressed closed**, as in the glottal stop `ʔ`: voice off but the cords squeezed together.
//
// `gap` runs from 0 (shut) to 1 (wide open).
export function cordsPose(source = {}, time = 0) {
  const { intensity = 0, aspiration = 0, tenseness = 0.6 } = source;
  if (intensity > 0.08) {
    // Voiced: mostly closed. A creakier, tenser voice presses harder; a breathy one leaks.
    const base = 0.04 + 0.22 * (1 - Math.min(1, tenseness)) + 0.2 * Math.min(1, aspiration);
    const flutter = 0.5 + 0.5 * Math.sin(time * 2 * Math.PI * 7);
    return { state: 'voiced', gap: Math.min(1, base + 0.18 * intensity * flutter), vibrating: true };
  }
  if (aspiration > 0.08) return { state: 'breath', gap: 0.55 + 0.3 * Math.min(1, aspiration), vibrating: false };
  if (tenseness > 0.85) return { state: 'closed', gap: 0, vibrating: false };
  return { state: 'open', gap: 0.85, vibrating: false };
}

// ### The lips
//
// `opening` is the gap in pixels between the lips. `protrusion` is how far they push forward: a
// rounded vowel like `u` pouts, a spread one like `i` does not.
export function lipPose(shape) {
  const d = shape.diameter[shape.n - 1];
  return { opening: Math.max(0, d * SCALE), protrusion: Math.max(0, Math.min(1, (1.3 - d) / 0.8)) * 14 };
}

// ### The soft palate
//
// A flap at the back of the roof. Shut, it lies along the roof and blocks the way to the nose; open
// it hangs down and lets air through. `angle` is in radians below the roof.
export function velumFlap(shape) {
  const open = Math.max(0, Math.min(1, (shape.velum - 0.01) / 0.4));
  return { angle: 0.12 + open * 1.1, open };
}

// ### The tongue
//
// The tongue's upper surface is the inner wall of the passage. Its body is that surface pushed
// downward (away from the roof) by a thickness that is greatest in the middle and thins toward the
// tip. At the root, down in the throat, it is thin: the tongue root is only the front wall of the
// pharynx, not a lump filling it.
//
// The body stops a little before the lips. Past `lipStart` the inner wall is the lip opening, not
// the tongue, and that wall can jump (the jaw drops for an `a`, the lips close for a `p`), which
// used to tear a spike or a square cut-off into the tip. The tongue ends instead in a rounded tip:
// a half circle as wide as the tongue is thick there. `cap` is that half circle, from the end of
// the top surface round to the end of the bottom.
export function tongueBody(g) {
  const { inner, normals, tongue } = g;
  const from = 2, to = Math.max(from + 1, Math.min(inner.length - 1, tongue.to));
  const top = [], bottom = [];
  let thickness = 0;
  // The underside is measured from a smoothed copy of the top. The top follows the tube exactly (a
  // raised tip is a narrow peak), but a tongue is a lump of muscle, so its underside should not
  // follow every peak. Averaging over a few sections turns a peak on the top into a rounded mass.
  const SMOOTH = 3;
  for (let i = from; i <= to; i++) {
    const u = (i - from) / Math.max(1, to - from);
    const hump = 7 + 42 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + u * 0.9)), 1.3) + 8 * (1 - u);
    thickness = Math.max(hump, 10 + 22 * u);          // a tongue tip is blunt, never a knife edge
    let sx = 0, sy = 0, k = 0;
    for (let j = Math.max(from, i - SMOOTH); j <= Math.min(to, i + SMOOTH); j++) { sx += inner[j].x; sy += inner[j].y; k++; }
    const level = { x: sx / k, y: sy / k };
    top.push(inner[i]);
    bottom.push({ x: level.x - normals[i].nx * thickness, y: level.y - normals[i].ny * thickness });
  }
  const end = top.length - 1;
  const mid = { x: (top[end].x + bottom[end].x) / 2, y: (top[end].y + bottom[end].y) / 2 };
  const up = { x: top[end].x - mid.x, y: top[end].y - mid.y };
  // Forward is `up` turned a quarter turn, so the cap is a true half circle whichever way the end of the
  // tongue happens to lean.
  const r = Math.hypot(up.x, up.y);
  const forward = r === 0 ? { x: 1, y: 0 } : { x: -up.y / r, y: up.x / r };
  const cap = [];
  for (let k = 1; k < 8; k++) {
    const phi = (Math.PI * k) / 8;
    cap.push({ x: mid.x + Math.cos(phi) * up.x + Math.sin(phi) * r * forward.x, y: mid.y + Math.cos(phi) * up.y + Math.sin(phi) * r * forward.y });
  }
  return { top, bottom, cap };
}

// The outline of the head in profile, facing right, as a closed path. It is fixed: only the parts
// inside it move. Coordinates share the 640 by 400 board with the passage.
const HEAD = [
  // the back of the neck, the hollow of the nape, then up round the back of the skull (the brain case is as
  // deep as the face is long, as in the 🗣️ emoji, which keeps the nose from looking like a slit)
  [28, 620], [30, 580], [38, 528], [24, 470], [8, 400], [4, 320], [14, 236], [44, 150], [100, 80],
  // the dome of the skull, then the forehead sloping forward to the brow
  [180, 34], [270, 14], [352, 22], [414, 52], [446, 100], [458, 150], [458, 176],
  // the bridge of the nose, the nose (small and pointed), under the nose
  [454, 192], [468, 210], [490, 232], [486, 248],
  // upper lip, the mouth, lower lip, the dip above the chin, the chin
  [490, 270], [482, 296], [490, 322], [474, 340], [482, 368], [474, 398],
  // under the jaw sweeping back to its angle, then the front of the neck
  [446, 418], [392, 432], [330, 442], [268, 458], [226, 484], [206, 526], [200, 572], [198, 620],
];

// Joined as a smooth curve, not a polygon: a Catmull-Rom spline through the points, as Bézier segments,
// with the end points doubled so that the curve starts and stops on them.
function smoothCurve(ctx, pts) {
  const at = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    ctx.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
      p2[0], p2[1],
    );
  }
}

// ## Painting
//
// The order matters, back to front: head, the nasal passage, the air passage, the tongue, the soft
// palate, teeth, lips, cords. Colours come from the page's CSS variables, as in the 🗣️ emoji: a blue head
// (`--head`) with the parts that move green (`--tissue`: tongue, soft palate, lips, vocal cords), and the
// page's own greys for the labels.
export function drawTract(canvas, shape, { highlight = null, time = (globalThis.performance ? performance.now() : 0) / 1000 } = {}) {
  const dpr = globalThis.devicePixelRatio || 1;
  if (canvas.width !== VIEW.width * dpr) {
    canvas.width = VIEW.width * dpr;
    canvas.height = VIEW.height * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, VIEW.width, VIEW.height);
  // The head faces left, so that the front of the mouth is on the left as it is on the vowel chart (front
  // vowels on the left) and on the chart of consonants (lips on the left). Everything is drawn facing right
  // and mirrored here; the text goes through `mirroredText` so that it still reads the right way round.
  ctx.translate(VIEW.width, 0);
  ctx.scale(-1, 1);
  const css = getComputedStyle(canvas);
  const read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const tissue = read('--tissue', '#5fd68a');
  const tongueColor = read('--tongue', '#3fbf6f');
  const head = read('--head', '#55acee');
  const muted = read('--muted', '#9a9aab');
  const line = read('--line', '#2a2a35');
  const skin = '#10213a';
  const cavity = '#07101d';
  const airOn = '#12304f';   // the nasal passage when the soft palate is open and air can go that way

  const g = tractGeometry(shape);
  const poly = (pts) => { ctx.moveTo(pts[0].x, pts[0].y); for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y); };
  const last = g.inner.length - 1;

  // The head.
  ctx.beginPath();
  smoothCurve(ctx, HEAD);
  ctx.closePath();
  ctx.fillStyle = skin;
  ctx.fill();
  ctx.strokeStyle = head;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
  // an eye, so that the outline reads as a face
  ctx.beginPath();
  ctx.arc(428, 168, 4.5, 0, 2 * Math.PI);
  ctx.fillStyle = '#9cc9f2';
  ctx.fill();

  // The nasal passage, a tube from the soft palate to the nostril. It lights up when the soft
  // palate is open and air can go that way.
  const flap = velumFlap(shape);
  ctx.beginPath();
  poly(g.noseTop);
  for (const p of [...g.noseBottom].reverse()) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.fillStyle = flap.open > 0.15 ? airOn : cavity;
  ctx.fill();
  ctx.strokeStyle = flap.open > 0.15 ? head : line;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (flap.open > 0.05) {
    ctx.fillStyle = airOn;
    ctx.fillRect(g.connector.x - g.connector.width / 2, g.connector.top, g.connector.width, g.connector.bottom - g.connector.top);
  }

  // The air passage: the dark space between the back and roof of the mouth and the tongue.
  ctx.beginPath();
  poly(g.outer);
  for (const p of [...g.inner].reverse()) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.fillStyle = cavity;
  ctx.fill();

  // The jaw and lower lip: the second lower surface. It is only drawn at the front, where it is the
  // lip opening; further back the tongue is the whole floor.
  const jawPoints = g.jaw.slice(g.jawFrom);
  ctx.beginPath();
  poly(jawPoints);
  for (const p of [...jawPoints].reverse()) ctx.lineTo(p.x, p.y + 30);
  ctx.closePath();
  ctx.fillStyle = skin;
  ctx.fill();
  ctx.beginPath();
  poly(jawPoints);
  ctx.strokeStyle = '#6aa7e0';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // The tongue: a body with a lighter upper surface.
  const body = tongueBody(g);
  ctx.beginPath();
  poly([...body.top, ...body.cap]);
  for (const p of [...body.bottom].reverse()) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 300, 0, 440);
  grad.addColorStop(0, tongueColor);
  grad.addColorStop(1, tissue);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.beginPath();
  poly([...body.top, ...body.cap]);
  ctx.strokeStyle = '#d2f7de';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.stroke();

  // The roof: the hard palate, a pale band along the outer wall.
  ctx.beginPath();
  poly(g.outer);
  ctx.strokeStyle = '#9ec5ef';
  ctx.lineWidth = 3;
  ctx.stroke();

  // The soft palate, hinged where the roof of the mouth meets the back of the throat.
  const hinge = g.velum;
  const tip = { x: hinge.x - 38 * Math.cos(flap.angle), y: hinge.y + 38 * Math.sin(flap.angle) };
  ctx.beginPath();
  ctx.moveTo(hinge.x, hinge.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.strokeStyle = '#52c47c';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 4.5, 0, 2 * Math.PI);
  ctx.fillStyle = '#52c47c';
  ctx.fill();

  // Teeth: upper ones hang from the roof, lower ones stand on the jaw, which is the front of the
  // tongue's floor. They are drawn behind the lips.
  const toothAt = Math.max(2, last - TOOTH_FROM_END);
  const upper = g.outer[toothAt], lower = g.jaw[toothAt];
  ctx.fillStyle = '#f3eee6';
  ctx.beginPath();
  ctx.roundRect(upper.x - 7, upper.y, 14, 17, 3);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(lower.x - 7, lower.y - 15, 14, 15, 3);
  ctx.fill();

  // Lips: two pads at the end of the passage. When the gap is zero they touch, which is a /p/, /b/
  // or /m/. Rounding pushes them forward.
  const lipsAt = g.lips;
  const lp = lipPose(shape);
  // The upper lip stays where it is. The lower lip goes where the lower lip is narrowest among the
  // front sections, so for `m` it meets the upper lip, and for `f` and `ɱ` it is drawn back
  // against the upper teeth: two places along the same line, and the picture tells them apart.
  const floorGap = shape.floor || shape.diameter;
  // (The outline has a point at each end besides one per section, so point `k` is section `k - 1`.)
  const gapAt = (k) => floorGap[Math.max(0, Math.min(shape.n - 1, k - 1))];
  let lowerAt = last;
  for (let k = last; k >= toothAt; k--) if (gapAt(k) < gapAt(lowerAt) - 0.05) lowerAt = k;
  const lipTop = g.outer[last];
  const pads = [
    { cy: lipTop.y - 4, dir: -1, dx: 0 },
    { cy: g.jaw[lowerAt].y + 6, dir: 1, dx: g.jaw[lowerAt].x - g.jaw[last].x },
  ];
  ctx.fillStyle = '#4fd37f';
  ctx.strokeStyle = '#1f7a45';
  ctx.lineWidth = 2;
  for (const { cy, dir, dx } of pads) {
    ctx.beginPath();
    ctx.ellipse(lipsAt.x - 6 + lp.protrusion + dx, cy + dir * 2, 20 + lp.protrusion * 0.5, 15, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }

  // Constrictions, marked where the passage is pinched; strong colour when the gap hisses.
  for (const c of shape.constrictions || []) {
    const pt = g.inner[Math.max(0, Math.min(last, Math.round(c.position) + 1))];
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, c.noise > 0 ? 6 : 4, 0, 2 * Math.PI);
    ctx.fillStyle = c.noise > 0 ? '#fff' : '#b9f5cf';
    ctx.globalAlpha = c.noise > 0 ? 0.9 : 0.7;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (highlight !== null) {
    const pt = g.inner[Math.max(0, Math.min(last, Math.round(highlight)))];
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 8, 0, 2 * Math.PI);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // The vocal cords, in place at the bottom of the throat and again enlarged in a corner inset,
  // because at their true size in the picture the difference between open and closed is a few
  // pixels.
  const pose = cordsPose(shape.source, time);
  drawLarynx(ctx, g, pose, { color: tissue, line, muted, cavity });
  drawCordsInset(ctx, pose, { x: 340, y: 548, r: 48 }, { color: tissue, line, muted, cavity });

  // Labels.
  ctx.fillStyle = muted;
  ctx.font = '12px ui-monospace, Menlo, monospace';
  mirroredText(ctx, 'tongue', 250, 426);
  mirroredText(ctx, 'soft palate', hinge.x - 128, hinge.y - 20);
  mirroredText(ctx, 'nose', PATH.lipX - 170, NOSE_Y - 30);
  mirroredText(ctx, 'lips', g.lips.x - 40, g.lips.y + 104);
  mirroredText(ctx, 'larynx', g.glottis.x + 42, g.glottis.y - 36);
  mirroredText(ctx, 'vocal cords', g.glottis.x + 42, g.glottis.y + 4);
  mirroredText(ctx, 'windpipe', g.glottis.x + 42, g.glottis.y + 38);
}

// Text under the mirror of `drawTract`: drawn the right way round, ending where it would have started (a
// label that ran to the right of its anchor now runs to the left of the mirrored anchor).
function mirroredText(ctx, text, x, y) {
  const align = ctx.textAlign;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(-1, 1);
  ctx.textAlign = align === 'start' || align === 'left' ? 'right' : align === 'end' || align === 'right' ? 'left' : align;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// ### The larynx
//
// Below the glottis the air passage does not stop: it continues down as the windpipe, a tube held
// open by rings of cartilage. The cords sit in the larynx, a short chamber at the top of that tube,
// and the bump on the front of the neck (the Adam's apple) is the cartilage that shields them. So
// the cords are drawn here as two green folds growing out of the walls of that chamber, with the
// windpipe going on beneath, and not as part of the throat above.
function drawLarynx(ctx, g, pose, { color, line, muted, cavity }) {
  const a = g.outer[0], b = g.inner[0];
  const cx = (a.x + b.x) / 2, y = g.glottis.y;
  const wall = 20;                                   // half the width of the windpipe
  ctx.fillStyle = cavity;
  ctx.fillRect(cx - wall, y, wall * 2, VIEW.height - y);
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  for (let ry = y + 14; ry < VIEW.height; ry += 12) {
    ctx.beginPath();
    ctx.moveTo(cx - wall, ry);
    ctx.lineTo(cx + wall, ry);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - wall, y); ctx.lineTo(cx - wall, VIEW.height);
  ctx.moveTo(cx + wall, y); ctx.lineTo(cx + wall, VIEW.height);
  ctx.stroke();
  // the chamber around the cords, a little wider than the tube
  ctx.beginPath();
  ctx.roundRect(cx - wall - 8, y - 26, (wall + 8) * 2, 44, 10);
  ctx.fillStyle = cavity;
  ctx.fill();
  ctx.strokeStyle = muted;
  ctx.lineWidth = 2;
  ctx.stroke();
  // the two folds: wedges from each wall toward the middle, leaving a gap that opens and closes
  const reach = (wall + 4) * (1 - 0.92 * pose.gap);
  ctx.fillStyle = color;
  for (const side of [-1, 1]) {
    const wx = cx + side * (wall + 4);
    ctx.beginPath();
    ctx.moveTo(wx, y - 9);
    ctx.lineTo(wx - side * reach, y - 1);
    ctx.lineTo(wx, y + 8);
    ctx.closePath();
    ctx.fill();
  }
}

// The inset: the cords seen from above, as a doctor would see them with a mirror. Two green folds
// meet at the front (top) and open into a V toward the back (bottom). The V opens wide for breath,
// narrows to a slit for voice, and the slit flickers while the voice is on.
function drawCordsInset(ctx, pose, { x, y, r }, { color, line, muted, cavity }) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fillStyle = cavity;
  ctx.fill();
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.stroke();
  const spread = pose.gap * 0.62;               // half-angle of the V, in radians
  const len = r * 0.82;
  const front = { x, y: y - len * 0.85 };
  ctx.fillStyle = color;
  for (const side of [-1, 1]) {
    const tipX = x + side * Math.sin(spread) * len * 1.05;
    const tipY = front.y + Math.cos(spread) * len * 1.7;
    ctx.beginPath();
    ctx.moveTo(front.x, front.y);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(tipX + side * 9, tipY - 4);
    ctx.lineTo(front.x + side * 10, front.y + 5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = muted;
  ctx.font = '11px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  mirroredText(ctx, `cords from above · ${pose.state}`, x, y + r + 16);
  ctx.textAlign = 'start';
}
