// # Drawing the tract
//
// The picture is a stylised side view of a head facing right. Sound starts at the **glottis**
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
  const outer = [], inner = [];
  const add = (s, d) => {
    const c = centerline(s);
    const ox = c.x + c.nx * WALL, oy = c.y + c.ny * WALL;
    outer.push({ x: ox, y: oy });
    inner.push({ x: ox - c.nx * d * SCALE, y: oy - c.ny * d * SCALE });
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
    outer, inner, noseTop, noseBottom, connector,
    glottis: { x: PATH.gx, y: PATH.gy },
    lips: { x: PATH.lipX, y: PATH.mouthY },
    tongue: { from: bladeStart + 1, to: lipStart + 1, tip: tipStart + 1 },
  };
}

// ## Painting
//
// Colours come from the page's CSS variables, so the picture follows light and dark mode.
export function drawTract(canvas, shape, { highlight = null } = {}) {
  const dpr = globalThis.devicePixelRatio || 1;
  if (canvas.width !== VIEW.width * dpr) {
    canvas.width = VIEW.width * dpr;
    canvas.height = VIEW.height * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, VIEW.width, VIEW.height);
  // The colours are read from the page's CSS variables so the picture follows light and dark mode.
  const css = getComputedStyle(canvas);
  const pink = css.getPropertyValue('--pink').trim() || '#e0457b';
  const soft = css.getPropertyValue('--pink-soft').trim() || '#f7d4e0';
  const tongue = css.getPropertyValue('--tongue').trim() || '#d9486f';
  const ink = css.getPropertyValue('--muted').trim() || '#7a6068';

  const g = tractGeometry(shape);
  const poly = (pts) => { ctx.moveTo(pts[0].x, pts[0].y); for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y); };

  // Layer one: the nose. Solid when the velum is open (air can go that way), a faint outline when
  // it is shut, so you can see where the nasal passage is even when it is not in use.
  const open = shape.velum > 0.08;
  ctx.beginPath();
  poly(g.noseTop);
  for (const p of [...g.noseBottom].reverse()) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.fillStyle = open ? soft : 'transparent';
  ctx.globalAlpha = open ? 1 : 0.5;
  ctx.fill();
  ctx.strokeStyle = pink;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (open) {
    ctx.fillStyle = soft;
    ctx.fillRect(g.connector.x - g.connector.width / 2, g.connector.top, g.connector.width, g.connector.bottom - g.connector.top);
  }

  // Layer two: the air passage. The polygon runs along the outer wall to the lips and back along
  // the inner wall, so the filled shape is exactly the open space the sound travels through.
  ctx.beginPath();
  poly(g.outer);
  for (const p of [...g.inner].reverse()) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.fillStyle = soft;
  ctx.fill();
  ctx.strokeStyle = pink;
  ctx.lineWidth = 2;
  ctx.stroke();

  // The tongue: the moving wall from the blade to the lips, drawn heavier.
  ctx.beginPath();
  poly(g.inner.slice(g.tongue.from, g.tongue.to + 1));
  ctx.strokeStyle = tongue;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Layer three: any constrictions, marked with a dot where the passage is pinched. A filled dot in
  // the strong colour means the gap is making noise (a fricative); a pale one is a stop or glide.
  for (const c of shape.constrictions || []) {
    const p = g.inner[Math.max(0, Math.min(g.inner.length - 1, Math.round(c.position) + 1))];
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = c.noise > 0 ? tongue : pink;
    ctx.fill();
  }
  if (highlight !== null) {
    const p = g.inner[Math.max(0, Math.min(g.inner.length - 1, Math.round(highlight)))];
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, 2 * Math.PI);
    ctx.strokeStyle = tongue;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Finally, three small labels so a first-time viewer knows which end is which.
  ctx.fillStyle = ink;
  ctx.font = '12px ui-monospace, Menlo, monospace';
  ctx.fillText('glottis', g.glottis.x - 20, g.glottis.y + 22);
  ctx.fillText('lips', g.lips.x - 12, g.lips.y + 52);
  ctx.fillText('nose', PATH.lipX - 20, NOSE_Y - 28);
}
