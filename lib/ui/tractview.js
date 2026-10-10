// # Drawing the tract
//
// The picture is a side view of a head facing right, cut down the middle, with the face, jaw, neck,
// tongue, teeth, lips, soft palate, nose and vocal cords drawn around the air passage. Sound starts at the **glottis**
// (bottom left), rises up the throat, turns the corner at the back of the mouth and runs forward
// to the **lips** (right). The **nose** is the tube along the top, joined at the **velum**.
//
// The back and roof of the passage are fixed; the tongue and jaw side move. So a diameter is
// drawn as the gap between a fixed outer wall and a moving inner wall. When the tongue rises
// toward the palate in an `i`, you see the lower wall come up.
//
// `tractGeometry` is pure (numbers in, polygons out) so it can be tested. `drawTract` paints it.
import { LANDMARKS } from '../pinktrombone.js';

// ## The drawing board
//
// All numbers are in canvas pixels on a 640 by 400 board. The centre line of the air passage has
// three parts, joined end to end:
//
// 1. a straight climb up the throat from the glottis at `(70, 350)` to the start of the bend
// 2. a quarter circle of radius 70 that turns the passage from going up to going forward
// 3. a straight run forward along the mouth, at height 130, out to the lips at `x = 600`
//
// `WALL` is how far the fixed outer wall (the back of the throat and the roof of the mouth) sits
// from that line. `SCALE` converts a tract diameter into pixels: a relaxed tract (diameter 1.5) is
// 24 pixels wide, a wide-open one (3.5) is 56.
export const VIEW = { width: 640, height: 400 };
const PATH = { gx: 70, gy: 350, bendX: 140, bendY: 200, radius: 70, mouthY: 130, lipX: 600 };
const WALL = 30;
const SCALE = 16;
const NOSE_Y = 62;

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
  const outer = [], inner = [], normals = [];
  const add = (s, d) => {
    const c = centerline(s);
    const ox = c.x + c.nx * WALL, oy = c.y + c.ny * WALL;
    outer.push({ x: ox, y: oy });
    inner.push({ x: ox - c.nx * d * SCALE, y: oy - c.ny * d * SCALE });
    normals.push({ nx: c.nx, ny: c.ny });
  };
  // The two extra points, at the very start and the very end, make the outline reach the glottis
  // and the lips instead of stopping half a section short.
  add(0, diameter[0]);
  for (let i = 0; i < n; i++) add(((i + 0.5) / n) * TOTAL, diameter[i]);
  add(TOTAL, diameter[n - 1]);

  // The nose is a second, thinner tube along the top of the picture. It leaves the main passage
  // at the velum (found from the engine's `noseStart`) and runs to the nostrils at the right.
  // The connector between them is as wide as the velum is open, so a closed velum is a hairline.
  const velumPoint = outer[Math.min(outer.length - 1, shape.noseStart + 1)];
  const noseX0 = velumPoint.x, noseX1 = PATH.lipX + 10;
  const noseTop = [], noseBottom = [];
  for (let j = 0; j < shape.noseLength; j++) {
    const x = noseX0 + ((j + 0.5) / shape.noseLength) * (noseX1 - noseX0);
    const half = (shape.noseDiameter[Math.max(1, j)] * SCALE * 0.6) / 2;
    noseTop.push({ x, y: NOSE_Y - half });
    noseBottom.push({ x, y: NOSE_Y + half });
  }
  const connector = { x: velumPoint.x, top: NOSE_Y, bottom: velumPoint.y, width: shape.velum * SCALE };

  // The landmarks (see `LANDMARKS` in the engine) tell the painter which stretch of the inner wall
  // is the tongue: from the blade to the lips. They are in index units, so scale them to sections.
  const lipStart = Math.round(LANDMARKS.lipStart * shape.scale);
  const tipStart = Math.round(LANDMARKS.tipStart * shape.scale);
  const bladeStart = Math.round(LANDMARKS.bladeStart * shape.scale);
  return {
    outer, inner, normals, noseTop, noseBottom, connector,
    glottis: { x: PATH.gx, y: PATH.gy },
    lips: { x: PATH.lipX, y: PATH.mouthY },
    tongue: { from: bladeStart + 1, to: lipStart + 1, tip: tipStart + 1 },
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
// downward (away from the roof) by a thickness that is greatest in the middle and thins to the tip.
export function tongueBody(g) {
  const { inner, normals, tongue } = g;
  const from = 2, to = Math.min(inner.length - 1, tongue.to);
  const top = [], bottom = [];
  for (let i = from; i <= to; i++) {
    const u = (i - from) / Math.max(1, to - from);
    const thick = 52 * Math.sin(Math.PI * Math.min(1, 0.15 + u * 0.8)) + 14 * (1 - u);
    top.push(inner[i]);
    bottom.push({ x: inner[i].x - normals[i].nx * thick, y: inner[i].y - normals[i].ny * thick });
  }
  return { top, bottom };
}

// The outline of the head in profile, facing right, as a closed path. It is fixed: only the parts
// inside it move. Coordinates share the 640 by 400 board with the passage.
const HEAD = [
  [14, 400], [16, 300], [10, 200], [24, 90], [90, 22], [250, 4], [400, 10], [480, 28], [524, 56], [540, 70],
  [588, 86], [572, 98], [580, 106], [606, 104], [624, 120], [616, 138], [624, 156], [606, 176],
  [596, 206], [572, 236], [470, 250], [330, 258], [200, 270], [150, 320], [138, 400],
];

// ## Painting
//
// The order matters, back to front: head, the nasal passage, the air passage, the tongue, the soft
// palate, teeth, lips, cords. Colours come from the page's CSS variables: pink for living tissue
// (the Pink Trombone pink), and the page's own greys for everything else.
export function drawTract(canvas, shape, { highlight = null, time = (globalThis.performance ? performance.now() : 0) / 1000 } = {}) {
  const dpr = globalThis.devicePixelRatio || 1;
  if (canvas.width !== VIEW.width * dpr) {
    canvas.width = VIEW.width * dpr;
    canvas.height = VIEW.height * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, VIEW.width, VIEW.height);
  const css = getComputedStyle(canvas);
  const read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const pink = read('--pink', '#ff7aa8');
  const tongueColor = read('--tongue', '#ff5c8d');
  const muted = read('--muted', '#9a9aab');
  const line = read('--line', '#2a2a35');
  const skin = '#1f1a26';
  const cavity = '#0d0a10';

  const g = tractGeometry(shape);
  const poly = (pts) => { ctx.moveTo(pts[0].x, pts[0].y); for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y); };
  const last = g.inner.length - 1;

  // The head.
  ctx.beginPath();
  ctx.moveTo(HEAD[0][0], HEAD[0][1]);
  for (const [x, y] of HEAD.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = skin;
  ctx.fill();
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // The nasal passage, a tube from the soft palate to the nostril. It lights up when the soft
  // palate is open and air can go that way.
  const flap = velumFlap(shape);
  ctx.beginPath();
  poly(g.noseTop);
  for (const p of [...g.noseBottom].reverse()) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.fillStyle = flap.open > 0.15 ? '#3a1d2c' : cavity;
  ctx.fill();
  ctx.strokeStyle = flap.open > 0.15 ? pink : line;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (flap.open > 0.05) {
    ctx.fillStyle = '#3a1d2c';
    ctx.fillRect(g.connector.x - g.connector.width / 2, g.connector.top, g.connector.width, g.connector.bottom - g.connector.top);
  }

  // The air passage: the dark space between the back and roof of the mouth and the tongue.
  ctx.beginPath();
  poly(g.outer);
  for (const p of [...g.inner].reverse()) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.fillStyle = cavity;
  ctx.fill();

  // The tongue: a body with a lighter upper surface.
  const body = tongueBody(g);
  ctx.beginPath();
  poly(body.top);
  for (const p of [...body.bottom].reverse()) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 100, 0, 260);
  grad.addColorStop(0, tongueColor);
  grad.addColorStop(1, pink);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.beginPath();
  poly(body.top);
  ctx.strokeStyle = '#ffd0e0';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.stroke();

  // The roof: the hard palate, a pale band along the outer wall.
  ctx.beginPath();
  poly(g.outer);
  ctx.strokeStyle = '#c9a9b8';
  ctx.lineWidth = 3;
  ctx.stroke();

  // The soft palate, hinged at the back of the roof.
  const hinge = g.outer[Math.min(last, shape.noseStart + 1)];
  const tip = { x: hinge.x - 38 * Math.cos(flap.angle), y: hinge.y + 38 * Math.sin(flap.angle) };
  ctx.beginPath();
  ctx.moveTo(hinge.x, hinge.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.strokeStyle = '#e07aa0';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 4.5, 0, 2 * Math.PI);
  ctx.fillStyle = '#e07aa0';
  ctx.fill();

  // Teeth: upper ones hang from the roof, lower ones stand on the jaw, which is the front of the
  // tongue's floor. They are drawn behind the lips.
  const toothAt = Math.max(2, last - 4);
  const upper = g.outer[toothAt], lower = g.inner[toothAt];
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
  const lipTop = g.outer[last], lipBottom = g.inner[last];
  ctx.fillStyle = '#ff6f9c';
  ctx.strokeStyle = '#b8325f';
  ctx.lineWidth = 2;
  for (const [cy, dir] of [[lipTop.y - 4, -1], [lipBottom.y + 6, 1]]) {
    ctx.beginPath();
    ctx.ellipse(lipsAt.x - 6 + lp.protrusion, cy + dir * 2, 20 + lp.protrusion * 0.5, 15, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }
  void lipTop;

  // Constrictions, marked where the passage is pinched; strong colour when the gap hisses.
  for (const c of shape.constrictions || []) {
    const pt = g.inner[Math.max(0, Math.min(last, Math.round(c.position) + 1))];
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, c.noise > 0 ? 6 : 4, 0, 2 * Math.PI);
    ctx.fillStyle = c.noise > 0 ? '#fff' : pink;
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
  drawCordsInPlace(ctx, g, pose, pink);
  drawCordsInset(ctx, pose, { x: 300, y: 318, r: 52 }, { pink, line, muted, cavity });

  // Labels.
  ctx.fillStyle = muted;
  ctx.font = '12px ui-monospace, Menlo, monospace';
  ctx.fillText('tongue', 330, 232);
  ctx.fillText('soft palate', hinge.x - 60, hinge.y - 12 + 0);
  ctx.fillText('nose', PATH.lipX - 70, NOSE_Y - 22);
  ctx.fillText('lips', g.lips.x - 14, g.lips.y + 62);
  ctx.fillText('vocal cords', g.glottis.x + 18, g.glottis.y + 8);
}

// A small pair of folds across the windpipe at the glottis.
function drawCordsInPlace(ctx, g, pose, color) {
  const left = g.outer[0], right = g.inner[0];
  const width = Math.max(10, Math.hypot(right.x - left.x, right.y - left.y));
  const half = (width / 2) * (1 - pose.gap);
  const cx = (left.x + right.x) / 2, y = g.glottis.y - 4;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(left.x - 4, y - 7);
  ctx.lineTo(cx - Math.max(0.5, (width / 2) * pose.gap), y);
  ctx.lineTo(left.x - 4, y + 7);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(right.x + 4, y - 7);
  ctx.lineTo(cx + Math.max(0.5, (width / 2) * pose.gap), y);
  ctx.lineTo(right.x + 4, y + 7);
  ctx.closePath();
  ctx.fill();
  void half;
}

// The inset: the cords seen from above, as a doctor would see them with a mirror. Two pink folds
// meet at the front (top) and open into a V toward the back (bottom). The V opens wide for breath,
// narrows to a slit for voice, and the slit flickers while the voice is on.
function drawCordsInset(ctx, pose, { x, y, r }, { pink, line, muted, cavity }) {
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
  ctx.fillStyle = pink;
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
  ctx.fillText(`cords from above · ${pose.state}`, x, y + r + 16);
  ctx.textAlign = 'start';
}
