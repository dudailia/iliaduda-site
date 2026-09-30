import { program, type GL } from '@/lib/gl'
import { HALF, HZ, LEVELS, ROWS, START, type Flow, type Stats } from '@/lib/market/flow'
import { fmt, readAt, rowAfter, type Reading } from '@/lib/orderbook/read'
import { DX, DZ, H, POW, REF, REST, ROWS_BY_Q, SWAY, VIS, XW, Z_NOW, eye, fit, height, lens, invert, mul, perspective, restPitch, toScreen, view, type Camera, type M4 } from '@/lib/orderbook/view'
import type { Palette, Renderer, StageEnv } from '@/components/stage/useStage'
import { EASE_IN_OUT_QUAD, EASE_OUT } from '@/lib/ease'
import { spring } from '@/lib/stage/spring'
import { rowRise } from '@/lib/orderbook/sequence'
import { PAD, boxAt, fits, labelSpecs, type Anchor, type Box, type LabelKind } from '@/lib/orderbook/labels'
import { pickTerrain, type KeyProbe, type Terrain } from '@/lib/orderbook/pick'

/**
 * The order book as terrain, in raw WebGL2.
 *
 * The simulation writes one row of cumulative depth per twelfth of a second
 * into a ring; each new row is uploaded into one line of a float texture, so
 * the GPU never re-receives history. A fixed grid — one vertex per price tick
 * and per row — is displaced in the vertex shader by texel fetches, normals
 * from the neighbouring texels. Time scrolls by translating the grid a
 * fraction of a row per frame, and price by the fractional part of the
 * window's centre, so both motions are continuous while every vertex still
 * lands on a real sample.
 *
 * The price river, the front profile ("now") and the probe are screen-space
 * ribbons built on the CPU from the same snapshots; trades are points whose
 * age drives a short rise-and-fade spark and then a dot that rides the
 * terrain into the past. Picking is a ray marched on the CPU against the
 * stored depth, so the readout is the snapshot under the cursor, not a
 * colour read back from the GPU.
 */

export type { KeyProbe }

export interface Shared {
  sim: Flow
  labels: HTMLElement
  /** The keyboard (or tap) probe; the hover probe takes precedence while the mouse is over the terrain. */
  key: KeyProbe | null
  /** A click or tap pinned the probe here: the page's own probe follows, so the arrow keys step on from it. */
  onPin(k: KeyProbe): void
  /** Paused: the market, the drift and the lean stop; the probe still answers. */
  readonly paused: boolean
  /** Advance the page's one market by this frame (components/figures/orderbook/market.ts): once, whoever asks first. */
  advance(): void
  /** The time this frame draws at: the market's clock and the part of a quantum it is owed (market.ts drawnAt). */
  drawnAt(): number
  /** The order chosen in Fig. 2, which this figure marks with its probe when the reader is not probing it: price, time. */
  highlight(): { price: number; t: number } | null
  /** The signature's phases while it waits or plays (lib/orderbook/sequence.ts); null once it is over, or on a visit without one. */
  sequence(): { rise: number; river: number; settle: number; labels: number } | null
  /** The reader's lean, −1…1 each way, from the pointer or the tilt (components/stage/useLean.ts). */
  lean(): { x: number; y: number }
  /** A drawn frame took this long: the signature's clock moves on it. */
  tick(dtMs: number): void
  onFrame(stats: Stats, probe: Reading | null, hovering: boolean): void
}

const MAXP = 512
const SPARK_LIFE = 0.6
/**
 * The price window follows the mid on the figures' spring (ω 3: most of a step in about a second), and jumps outright
 * only where the whole terrain has changed anyway: a gap of 40 ticks, or seconds of rows written while it was away.
 */
const FOLLOW = 3
/** The reader's lean: the home figure's spring (ω 4), held while the pointer reads the terrain, so the level under it
 *  stays put while the reader aims. */
const LEAN_W = 4
/** The signature opens looking down on the flat page, and settles into the resting three-quarter view. */
const PAGE_PITCH = 1.05
/** Labels fade in and out over about 150ms (95%), never pop. */
const LABEL_TAU = 0.05

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
const float DX = ${DX.toFixed(8)};
const float DZ = ${DZ.toFixed(8)};
const float ZNOW = ${Z_NOW.toFixed(4)};
const float H = ${H.toFixed(4)};
const float REF = ${REF.toFixed(1)};
const float POW = ${POW.toFixed(3)};
const float HZ = ${HZ.toFixed(1)};
const float XW = ${XW.toFixed(4)};
`

const TERRAIN_VS = `${HEAD}
layout(location = 0) in vec2 aGrid;
uniform sampler2D uDepth;
uniform sampler2D uCentre;
uniform int uHead, uRows, uBase, uWmod;
uniform float uFracX, uFracZ, uRowsF, uRise, uSink;
uniform mat4 uMVP;
out vec3 vPos; out vec3 vN; out float vCum; out float vRow; out float vPx; out float vAge; out float vRise;
float hgt(float c) { return H * pow(abs(c) / REF, POW); }
// The signature's wave (lib/orderbook/sequence.ts, rowRise): row a rises from the page in turn, now first. uSink
// lowers the whole terrain back into the page when Replay starts the story over.
float rise(int a) {
  float u = clamp((uRise - float(a) / max(1.0, uRowsF - 1.0) * 0.6) / 0.4, 0.0, 1.0);
  return (1.0 - pow(1.0 - u, 5.0)) * uSink;
}
float dep(int j, int a) {
  a = clamp(a, 0, uRows - 1);
  int r = (uHead - a + ${ROWS * 4}) % ${ROWS};
  int c = int(texelFetch(uCentre, ivec2(r, 0), 0).r);
  int x = clamp(uBase + j - c + ${HALF}, 0, ${LEVELS - 1});
  return texelFetch(uDepth, ivec2(x, r), 0).r;
}
void main() {
  int j = int(aGrid.x), a = int(aGrid.y);
  float d = dep(j, a);
  float ra = rise(a);
  float y = hgt(d) * ra;
  float x = (float(j) - ${VIS / 2}.0 - uFracX) * DX;
  float z = ZNOW - (float(a) + uFracZ) * DZ;
  float hl = hgt(dep(j - 1, a)) * ra, hr = hgt(dep(j + 1, a)) * ra, hb = hgt(dep(j, a + 1)) * rise(a + 1), hf = hgt(dep(j, max(a - 1, 0))) * rise(max(a - 1, 0));
  vN = normalize(vec3((hl - hr) / (2.0 * DX), 1.0, (hb - hf) / (2.0 * DZ)));
  vCum = d;
  vRise = ra;
  vRow = float(uWmod - a);
  vPx = float(j + ((uBase % 10) + 10) % 10);
  vAge = (float(a) + uFracZ) / uRowsF;
  vPos = vec3(x, y, z);
  gl_Position = uMVP * vec4(x, y, z, 1.0);
}`

const TERRAIN_FS = `${HEAD}
in vec3 vPos; in vec3 vN; in float vCum; in float vRow; in float vPx; in float vAge; in float vRise;
uniform vec3 uPaper, uInk, uGraphite, uRule, uIndigo, uWash, uEye, uLight;
uniform float uDark, uProbeOn, uProbeRow, uProbePx;
out vec4 o;
float hair(float f, float w) { float d = abs(fract(f + 0.5) - 0.5) / max(fwidth(f), 1e-5); return 1.0 - clamp(d - w, 0.0, 1.0); }
void main() {
  vec3 n = normalize(vN);
  // Ink comes with height: a row still flat on the page is paper, with the graph-paper grid on it.
  float t = clamp(pow(abs(vCum) / REF, POW), 0.0, 1.3) * vRise;
  // The shares waiting are the figure's claim, so both walls are indigo, the one colour a figure keeps for what it
  // claims: bids the lighter, asks the deeper, either side of the price, which is ink, the threshold between them.
  vec3 bid = uDark > 0.5 ? mix(uWash, uIndigo, 0.16 + 0.34 * t) : mix(uWash, uIndigo, 0.36 + 0.4 * t);
  vec3 ask = uDark > 0.5 ? mix(uWash, uIndigo, 0.45 + 0.45 * t) : mix(uWash, uIndigo, 0.6 + 0.36 * t);
  vec3 floorC = uDark > 0.5 ? mix(uPaper, uRule, 0.6) : mix(uPaper, uRule, 0.7);
  vec3 c = mix(floorC, vCum < 0.0 ? bid : ask, smoothstep(0.0, 2.5, abs(vCum)) * vRise);
  float diff = max(dot(n, uLight), 0.0);
  c *= (uDark > 0.5 ? 0.66 : 0.78) + (uDark > 0.5 ? 0.62 : 0.32) * diff;
  vec3 v = normalize(uEye - vPos);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  // Rims catch light by night and turn toward ink by day, so a wall's edge reads against the paper either way.
  c = mix(c, uDark > 0.5 ? uIndigo : uInk, rim * (uDark > 0.5 ? 0.22 : 0.18));
  float f = abs(vCum) / 40.0;
  c = mix(c, uInk, (f < 0.5 ? 0.0 : hair(f, 0.15)) * 0.16);
  c = mix(c, uInk, hair(vRow / 12.0, 0.05) * 0.07);
  c = mix(c, uInk, hair(vPx / 10.0, 0.05) * 0.05);
  if (uProbeOn > 0.5) {
    float pr = 1.0 - clamp(abs(vRow - uProbeRow) / max(fwidth(vRow), 1e-5) - 0.5, 0.0, 1.0);
    float pc = 1.0 - clamp(abs(vPx - uProbePx) / max(fwidth(vPx), 1e-5) - 0.4, 0.0, 1.0);
    c = mix(c, uInk, max(pr * 0.7, pc * 0.3));
  }
  // The past recedes: by night into the dark, by day only to a wash, so the oldest rows still read as terrain.
  c = mix(c, uDark > 0.5 ? uPaper : mix(uPaper, uWash, 0.5), smoothstep(0.4, 1.0, vAge) * (uDark > 0.5 ? 0.94 : 0.55));
  o = vec4(c, 1.0);
}`

const RIBBON_VS = `${HEAD}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aPrev;
layout(location = 2) in vec3 aNext;
layout(location = 3) in float aSide;
layout(location = 4) in float aFade;
uniform mat4 uMVP; uniform vec2 uView; uniform float uWidth;
out float vS; out float vFade;
void main() {
  vec4 c = uMVP * vec4(aPos, 1.0);
  vec4 p = uMVP * vec4(aPrev, 1.0);
  vec4 n = uMVP * vec4(aNext, 1.0);
  vec2 sp = p.xy / p.w * uView, sn = n.xy / n.w * uView;
  vec2 d = sn - sp;
  d = length(d) < 1e-4 ? vec2(1.0, 0.0) : normalize(d);
  c.xy += vec2(-d.y, d.x) * aSide * uWidth / uView * c.w;
  vS = aSide; vFade = aFade;
  gl_Position = c;
}`

const RIBBON_FS = `${HEAD}
in float vS; in float vFade;
uniform vec3 uColor; uniform float uAlpha, uSoft;
out vec4 o;
void main() {
  float a = uSoft > 0.5 ? exp(-3.2 * vS * vS) : 1.0 - smoothstep(0.55, 1.0, abs(vS));
  a *= uAlpha * vFade;
  o = vec4(uColor * a, a);
}`

const POINT_VS = `${HEAD}
layout(location = 0) in vec4 aT;
uniform mat4 uMVP; uniform float uNow, uCentre, uDpr, uMode, uHist, uShow;
out float vA;
void main() {
  float age = uNow - aT.z;
  float x = (aT.x - uCentre) * DX;
  float z = ZNOW - age * HZ * DZ;
  float y = aT.y;
  float size;
  bool gone = abs(x) > XW || age < 0.0;
  if (uMode > 0.5) {
    float k = clamp(age / ${SPARK_LIFE.toFixed(2)}, 0.0, 1.0);
    float e = 1.0 - pow(1.0 - k, 3.0);
    y += 0.15 * e;
    size = (10.0 + 7.0 * sqrt(aT.w)) * (1.0 - 0.45 * e);
    vA = pow(1.0 - k, 2.0);
    gone = gone || age > ${SPARK_LIFE.toFixed(2)};
  } else {
    size = 3.0 + 0.6 * sqrt(aT.w);
    vA = min(1.0, age / 0.25) * (1.0 - smoothstep(0.4, 1.0, age * HZ / uHist));
    gone = gone || age * HZ > uHist;
  }
  vA *= uShow;
  gl_PointSize = gone ? 0.0 : size * uDpr;
  gl_Position = gone ? vec4(2.0, 2.0, 2.0, 1.0) : uMVP * vec4(x, y + 0.006, z, 1.0);
}`

const POINT_FS = `${HEAD}
in float vA;
uniform vec3 uColor; uniform float uMode;
out vec4 o;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = dot(q, q);
  if (r > 1.0) discard;
  if (uMode > 0.5) {
    float g = exp(-3.5 * r) * vA;
    float core = (1.0 - smoothstep(0.05, 0.2, r)) * vA;
    float a = max(g, core);
    o = vec4(uColor * a, a);
  } else {
    float a = (1.0 - smoothstep(0.55, 1.0, r)) * vA;
    o = vec4(uColor * a, a);
  }
}`

type Prog = ReturnType<typeof program>

/** How long Replay takes to lower the terrain into the page (its labels go in 150ms), and to lift the camera back to it. */
const SINK_S = 0.35
const LIFT_S = 0.7

export interface BookRenderer extends Renderer {
  /** Replay: lower what is shown back into the page, then call `done`, which starts the story again from there. */
  sink(done: () => void): void
}

export function createBookRenderer(env: StageEnv, sh: Shared): BookRenderer {
  const gl: GL = env.gl
  const { canvas } = env
  const sim = sh.sim
  let pal: Palette = env.palette

  const terrain = program(gl, TERRAIN_VS, TERRAIN_FS)
  const ribbon = program(gl, RIBBON_VS, RIBBON_FS)
  const points = program(gl, POINT_VS, POINT_FS)
  const progs: Prog[] = [terrain, ribbon, points]

  // ── textures ───────────────────────────────────────────────────────────────
  const depthTex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, depthTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, LEVELS, ROWS, 0, gl.RED, gl.FLOAT, sim.depth)
  for (const [k, v] of [
    [gl.TEXTURE_MIN_FILTER, gl.NEAREST],
    [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
  ] as const)
    gl.texParameteri(gl.TEXTURE_2D, k, v)
  const centreTex = gl.createTexture()!
  const centreData = new Float32Array(ROWS)
  const fillCentres = () => {
    for (let r = 0; r < ROWS; r++) centreData[r] = sim.centre[r]! - START
  }
  fillCentres()
  gl.bindTexture(gl.TEXTURE_2D, centreTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, ROWS, 1, 0, gl.RED, gl.FLOAT, centreData)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)

  const uploadRows = (n: number) => {
    gl.bindTexture(gl.TEXTURE_2D, depthTex)
    if (n >= ROWS) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, LEVELS, ROWS, gl.RED, gl.FLOAT, sim.depth)
    else
      for (let a = 0; a < n; a++) {
        const r = sim.row(a)
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, r, LEVELS, 1, gl.RED, gl.FLOAT, sim.depth.subarray(r * LEVELS, (r + 1) * LEVELS))
      }
    fillCentres()
    gl.bindTexture(gl.TEXTURE_2D, centreTex)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ROWS, 1, gl.RED, gl.FLOAT, centreData)
  }

  // ── grid ───────────────────────────────────────────────────────────────────
  const NX = VIS + 1
  const gridVao = gl.createVertexArray()!
  const gridBuf = gl.createBuffer()!
  const idxBuf = gl.createBuffer()!
  let rows: number = ROWS_BY_Q[2]
  let rowsF = 0
  let idxCount = 0
  const buildGrid = (nz: number) => {
    const g = new Float32Array(NX * nz * 2)
    for (let a = 0; a < nz; a++) for (let j = 0; j < NX; j++) g.set([j, a], (a * NX + j) * 2)
    const idx = new Uint16Array((NX - 1) * (nz - 1) * 6)
    let p = 0
    for (let a = 0; a < nz - 1; a++)
      for (let j = 0; j < NX - 1; j++) {
        const i0 = a * NX + j, i1 = i0 + 1, i2 = i0 + NX, i3 = i2 + 1
        idx.set([i0, i2, i1, i1, i2, i3], p)
        p += 6
      }
    gl.bindVertexArray(gridVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf)
    gl.bufferData(gl.ARRAY_BUFFER, g, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW)
    gl.bindVertexArray(null)
    idxCount = idx.length
    rows = nz
  }
  buildGrid(rows)

  // ── ribbons ────────────────────────────────────────────────────────────────
  // 11 floats per vertex: pos, prev, next, side, fade. Two vertices per point.
  const RIB_MAX = (ROWS + NX * 2 + 8) * 2
  const ribData = new Float32Array(RIB_MAX * 11)
  const ribVao = gl.createVertexArray()!
  const ribBuf = gl.createBuffer()!
  gl.bindVertexArray(ribVao)
  gl.bindBuffer(gl.ARRAY_BUFFER, ribBuf)
  gl.bufferData(gl.ARRAY_BUFFER, ribData.byteLength, gl.DYNAMIC_DRAW)
  ;(
    [
      [0, 3, 0],
      [1, 3, 3],
      [2, 3, 6],
      [3, 1, 9],
      [4, 1, 10],
    ] as const
  ).forEach(([loc, size, off]) => {
    // Attribute locations are fixed in the shaders, so nothing here waits on the link.
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 44, off * 4)
  })
  gl.bindVertexArray(null)
  let ribN = 0
  /** Append a polyline; returns [first vertex, count] for drawArrays(TRIANGLE_STRIP). */
  /**
   * A ribbon of `n` points, `pts` three numbers a point and `fades` one, written into the ribbons' buffer; returns
   * where it starts and how many vertices it has. Its points come from buffers kept for it (below), so a frame's
   * ribbons make no arrays.
   */
  const addRibbon = (pts: ArrayLike<number>, fades: ArrayLike<number>, n: number): [number, number] => {
    const first = ribN
    for (let i = 0; i < n; i++) {
      const pi = Math.max(0, i - 1), ni = Math.min(n - 1, i + 1)
      for (let side = -1; side <= 1; side += 2) {
        const o = ribN * 11
        ribData[o] = pts[i * 3]!
        ribData[o + 1] = pts[i * 3 + 1]!
        ribData[o + 2] = pts[i * 3 + 2]!
        ribData[o + 3] = pts[pi * 3]!
        ribData[o + 4] = pts[pi * 3 + 1]!
        ribData[o + 5] = pts[pi * 3 + 2]!
        ribData[o + 6] = pts[ni * 3]!
        ribData[o + 7] = pts[ni * 3 + 1]!
        ribData[o + 8] = pts[ni * 3 + 2]!
        ribData[o + 9] = side
        ribData[o + 10] = fades[i]!
        ribN++
      }
    }
    return [first, n * 2]
  }

  /** The buffers each frame's ribbons are built in: the river (a point a row), the front profile, the probe's drop. */
  const riverPts = new Float64Array(ROWS * 3), riverFades = new Float64Array(ROWS)
  const frontPts = new Float64Array((VIS + 1) * 3), dropPts = new Float64Array(6)
  const ONES = new Float64Array(VIS + 1).fill(1)

  // ── trades ─────────────────────────────────────────────────────────────────
  const pData = new Float32Array(MAXP * 4).fill(0)
  for (let i = 0; i < MAXP; i++) pData[i * 4 + 2] = -1e9
  const pVao = gl.createVertexArray()!
  const pBuf = gl.createBuffer()!
  gl.bindVertexArray(pVao)
  gl.bindBuffer(gl.ARRAY_BUFFER, pBuf)
  gl.bufferData(gl.ARRAY_BUFFER, pData, gl.DYNAMIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)
  let pNext = 0
  let pDirty = false
  // Times are stored relative to the renderer's start, so float32 keeps millisecond precision for hours.
  const T0 = sim.t
  /** Rows of the market this figure has uploaded: the rows written since are what it owes the texture. */
  let uploaded = sim.written
  const addTrade = (price: number, size: number, t: number) => {
    const r = sim.row(0)
    const y = r >= 0 ? height(sim.depthAt(r, price)) : 0
    pData.set([price - START, y, t - T0, size], pNext * 4)
    pNext = (pNext + 1) % MAXP
    pDirty = true
  }
  // The poster's recent trades become the first dots, so the crossfade loses nothing.
  for (const tr of sim.trades.slice(-MAXP)) addTrade(tr.price, tr.size, tr.t)
  sim.onTrade = (tr) => addTrade(tr.price, tr.size, tr.t)

  // ── labels ─────────────────────────────────────────────────────────────────
  // One list with the poster (lib/orderbook/labels.ts), kept by id: a label that stops applying (a price tick
  // scrolled out of the window) fades where it last stood, and one that starts fades in; none is retexted in place.
  type Kind = LabelKind | 'probe'
  type Label = { el: HTMLSpanElement; kind: Kind; text: string; w: number; h: number; o: number; want: number; seen: boolean }
  const LOOK: Record<Kind, string> = {
    // As wide as its longest price ("Price $100.215", 14 of the mono face's 0.6em characters, and its padding), so it
    // does not jump a few pixels each way as the mid passes between whole and half cents.
    tag: 'text-paper bg-ink min-w-[calc(8.4em+8px)] text-center',
    wall: 'text-ink bg-paper/85',
    time: 'text-graphite bg-paper/90',
    tick: 'text-graphite bg-paper/90',
    probe: 'text-ink bg-paper/90',
  }
  const pool = new Map<string, Label>()
  const label = (id: string, kind: Kind): Label => {
    let l = pool.get(id)
    if (!l) {
      const el = document.createElement('span')
      el.className = `absolute left-0 top-0 whitespace-nowrap rounded-sm font-mono text-meta leading-none ${LOOK[kind]}`
      const [px, py] = PAD[kind === 'probe' ? 'wall' : kind]
      el.style.padding = `${py}px ${px}px`
      el.style.opacity = '0'
      el.style.visibility = 'hidden'
      sh.labels.appendChild(el)
      l = { el, kind, text: '', w: 0, h: 0, o: 0, want: 0, seen: false }
      pool.set(id, l)
    }
    l.seen = true
    return l
  }
  /** Boxes already placed this frame: a label that would cover one, or leave the frame, is not shown. */
  const placed: Box[] = []
  const place = (l: Label, text: string, at: [number, number] | null, anchor: Anchor = 'c') => {
    if (l.text !== text) {
      l.el.textContent = text
      l.text = text
      l.w = 0
    }
    if (at && text) {
      if (!l.w) {
        l.w = l.el.offsetWidth
        l.h = l.el.offsetHeight
      }
      const b = boxAt(at[0], at[1], l.w, l.h, anchor)
      if (fits(b, placed, cssW, cssH, l.want > 0)) {
        placed.push(b)
        l.want = 1
        l.el.style.transform = `translate3d(${b.x0.toFixed(1)}px, ${b.y0.toFixed(1)}px, 0)`
        return
      }
    }
    // Gone, or crowded out: it fades where it last stood.
    l.want = 0
  }
  /**
   * Ease every label toward shown or hidden, times the signature's labels phase: through the phase's 640ms they arrive
   * one after another, 40ms apart in the order they matter, each over 200ms on the ease-out.
   */
  const fadeLabels = (dt: number, k: number): boolean => {
    const f = 1 - Math.exp(-Math.max(0, dt) / LABEL_TAU)
    let fading = false
    let rank = 0
    for (const [id, l] of pool) {
      const ki = k >= 1 ? 1 : EASE_OUT(Math.min(1, Math.max(0, (k * 640 - rank++ * 40) / 200)))
      const asked = l.seen
      if (!asked) l.want = 0
      l.seen = false
      l.o += (l.want - l.o) * (dt > 0 ? f : 1)
      if (Math.abs(l.want - l.o) > 0.002) fading = true
      const a = l.o * ki
      l.el.style.opacity = a.toFixed(3)
      l.el.style.visibility = a > 0.01 ? 'visible' : 'hidden'
      // A price the window has left for good leaves the page once it has faded. One still in the window but crowded
      // out stays, hidden and measured: removing it would make it again, and measure it again, the very next frame.
      if (l.kind === 'tick' && !asked && l.o < 0.001) {
        l.el.remove()
        pool.delete(id)
      }
    }
    return fading
  }

  // ── state ──────────────────────────────────────────────────────────────────
  let cssW = 1, cssH = 1, dpr = 1
  let q = 2
  /** The two fitted cameras the signature moves between: looking down on the page, and at rest. */
  let rest: Camera = fit(REST.yaw, restPitch(1), 1)
  let page: Camera = fit(REST.yaw, PAGE_PITCH, 1, false)
  /** Replay's way back into the page: from what was shown when it was pressed, on the site's ease-out. */
  let sinking: { t: number; rise: number; river: number; settle: number; labels: number; done: () => void } | null = null
  /** What the last frame showed of the signature, for a sink to start from. */
  let shown = { rise: 1, river: 1, settle: 1, labels: 1 }
  let draws = 0
  let centre = sim.mids[sim.row(0)]!
  const lean = { yaw: { x: 0, v: 0 }, pitch: { x: 0, v: 0 } }
  /**
   * The reader's turn: a drag's offset from the resting view, as the IV surface takes one. The terrain follows the hand,
   * easing into soft limits rather than stopping dead, and when let go the IV surface's spring (ω 7) carries it home
   * with the hand's speed.
   */
  const turn = { yaw: { x: 0, v: 0 }, pitch: { x: 0, v: 0 } }
  let drag: { id: number; x: number; y: number; moved: number; t: number; rawYaw: number; rawPitch: number; touch: boolean; live: boolean } | null = null
  const follow = { x: centre, v: 0 }
  /** The drift's speed: 1 running, coasting to 0 over 240ms on Pause and back over 400ms on Resume, as the home figure's. */
  let driftK = 1
  /** Whether the pointer was reading the terrain last frame. */
  let reading0 = false
  let hover: [number, number] | null = null
  let mvp: M4 = new Float32Array(16)
  let inv: M4 | null = null
  let fracZ = 0
  /** The camera's drift clock: stops while paused. */
  let clock = 0
  let first = false
  let disposed = false
  /** Paused, a frame that would only draw what is on screen is skipped: these say whether the next one would not. */
  let dirty = true
  let settling = true
  let lastKey: KeyProbe | null = null
  let lastChosen: { price: number; t: number } | null = null

  /** The camera: from the page to rest as the signature settles (`k` 0 → 1), then drifting and leaning with the reader. */
  const cam = (t: number, k: number): Camera => ({
    yaw: REST.yaw + (SWAY.drift * Math.sin((2 * Math.PI * t) / SWAY.period) + lean.yaw.x + turn.yaw.x) * k,
    pitch: page.pitch + (rest.pitch - page.pitch) * k + (lean.pitch.x + turn.pitch.x) * k,
    dist: page.dist + (rest.dist - page.dist) * k,
    tx: page.tx + (rest.tx - page.tx) * k,
    ty: rest.ty,
    tz: rest.tz,
  })


  // ── picking ────────────────────────────────────────────────────────────────
  const base = () => Math.floor(centre) - VIS / 2
  // The terrain as this frame draws it: its centre, its newest row's fraction, and the rows it keeps (lib/orderbook/pick.ts).
  const terrainNow: Terrain = {
    centre: 0,
    frac: 0,
    rows: 0,
    depth: (age, price) => sim.depthAt(sim.row(Math.min(age, rows - 1)), price),
  }
  const pick = (cx: number, cy: number): KeyProbe | null => {
    if (!inv) return null
    terrainNow.centre = centre
    terrainNow.frac = fracZ
    terrainNow.rows = Math.min(rows, sim.written)
    return pickTerrain(inv, (cx / cssW) * 2 - 1, 1 - (cy / cssH) * 2, terrainNow)
  }

  // ── input ──────────────────────────────────────────────────────────────────
  const local = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  // The soft limits a drag eases into (tanh), and their inverses, so a terrain grabbed again near a limit picks up from
  // where it is.
  const soft = { yaw: (r: number) => 0.6 * Math.tanh(r / 0.6), pitch: (r: number) => 0.3 * Math.tanh(r / 0.3) }
  const unsoft = (y: number, a: number) => a * Math.atanh(Math.max(-0.999, Math.min(0.999, y / a)))
  const onDown = (e: PointerEvent) => {
    if (drag) return
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, t: e.timeStamp, rawYaw: unsoft(turn.yaw.x, 0.6), rawPitch: unsoft(turn.pitch.x, 0.3), touch: e.pointerType === 'touch', live: false }
    canvas.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      drag.moved += Math.abs(dx) + Math.abs(dy)
      drag.x = e.clientX
      drag.y = e.clientY
      if (drag.moved > (drag.touch ? 8 : 4)) {
        // The first real move takes the terrain where it is (its spring home ran on under a mere press), still.
        if (!drag.live) {
          drag.live = true
          drag.rawYaw = unsoft(turn.yaw.x, 0.6)
          drag.rawPitch = unsoft(turn.pitch.x, 0.3)
          turn.yaw.v = turn.pitch.v = 0
        }
        // The hand's grip shows while the terrain turns under it.
        canvas.style.cursor = 'grabbing'
        const dtS = Math.max(1e-3, (e.timeStamp - drag.t) / 1000)
        drag.t = e.timeStamp
        drag.rawYaw -= dx * 0.006
        const yaw = soft.yaw(drag.rawYaw)
        turn.yaw.v = turn.yaw.v * 0.6 + ((yaw - turn.yaw.x) / dtS) * 0.4
        turn.yaw.x = yaw
        // A finger turns it only sideways: a vertical swipe belongs to the page.
        if (!drag.touch) {
          drag.rawPitch += dy * 0.004
          const pitch = soft.pitch(drag.rawPitch)
          turn.pitch.v = turn.pitch.v * 0.6 + ((pitch - turn.pitch.x) / dtS) * 0.4
          turn.pitch.x = pitch
        }
        hover = null
        dirty = true
      }
      return
    }
    if (e.pointerType !== 'mouse') return
    hover = local(e)
    dirty = true
  }
  const onLeave = () => {
    if (drag) return
    hover = null
    dirty = true
  }
  const onUp = (e: PointerEvent) => {
    if (drag && e.pointerId !== drag.id) return
    const click = !drag || drag.moved <= (drag.touch ? 8 : 4)
    // A hand that had stopped before it let go throws nothing: the speed kept from its last move is spent.
    if (drag) {
      const still = (e.timeStamp - drag.t) / 1000
      if (still > 0.05) {
        const k = Math.exp(-(still - 0.05) / 0.05)
        turn.yaw.v *= k
        turn.pitch.v *= k
      }
    }
    drag = null
    canvas.style.cursor = ''
    if (click) {
      const p = local(e)
      const hit = pick(p[0], p[1])
      if (hit) {
        sh.key = hit
        sh.onPin(hit)
      }
    }
    dirty = true
  }
  const onCancel = () => {
    drag = null
    canvas.style.cursor = ''
    dirty = true
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onCancel)

  // ── frame ──────────────────────────────────────────────────────────────────
  const setVec = (p: Prog, name: string, c: readonly number[]) => gl.uniform3f(p.u(name), c[0]!, c[1]!, c[2]!)

  // The frame's helpers, made once, so the calls to them in every frame's loops go to the same functions and are
  // inlined, rather than to new closures each frame whose every answer is boxed.
  const xOf = (price: number) => (price - centre) * DX
  const zOf = (age: number) => Z_NOW - (age + fracZ) * DZ
  const glow = () => (pal.dark ? gl.blendFunc(gl.ONE, gl.ONE) : gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA))
  const over = () => gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  const strip = (r: [number, number], width: number, color: readonly number[], opacity: number, soft: boolean) => {
    gl.uniform1f(ribbon.u('uWidth'), width)
    setVec(ribbon, 'uColor', color)
    gl.uniform1f(ribbon.u('uAlpha'), opacity)
    gl.uniform1f(ribbon.u('uSoft'), soft ? 1 : 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, r[0], r[1])
  }
  const S = (x: number, y: number, z: number) => toScreen(mvp, cssW, cssH, x, y, z)
  /** The river: the mid price down the valley floor, a point a row, fading into the past. */
  const buildRiver = (count: number, rise: number, lift: number) => {
    const hist = rowsF || rows
    for (let a = 0; a < count; a++) {
      const r = sim.row(a)
      const mid = sim.mids[r]!
      const lo = Math.floor(mid), f = mid - lo
      const y = (height(sim.depthAt(r, lo)) * (1 - f) + height(sim.depthAt(r, lo + 1)) * f) * rowRise(rise, a, hist) * lift
      riverPts[a * 3] = xOf(mid)
      riverPts[a * 3 + 1] = y + 0.006
      riverPts[a * 3 + 2] = zOf(a)
      riverFades[a] = 1 - Math.min(1, Math.max(0, (a / hist - 0.45) / 0.55))
    }
    return addRibbon(riverPts, riverFades, count)
  }
  /** The front profile: the newest row's depth across the window, the terrain's edge. */
  const buildFront = (r0: number, b: number, fracX: number, rise: number, lift: number) => {
    const up = rowRise(rise, 0, rowsF || rows) * lift
    const z = zOf(0)
    for (let j = 0; j <= VIS; j++) {
      frontPts[j * 3] = (j - VIS / 2 - fracX) * DX
      frontPts[j * 3 + 1] = height(sim.depthAt(r0, b + j)) * up + 0.002
      frontPts[j * 3 + 2] = z
    }
    return addRibbon(frontPts, ONES, VIS + 1)
  }

  const draw = (dt: number): boolean => {
    sh.tick(dt * 1000)
    const ph = sh.sequence()
    // What is shown of the signature: its phases, exactly. While Replay sinks the last one, the terrain lowers into
    // the page and its river draws back (350ms), the labels go (150ms), both on the ease-out, and the camera lifts
    // back to the page (700ms, a move on screen: in-out); only then does the story start again, from there.
    let rise = ph ? ph.rise : 1
    let riverK = ph ? ph.river : 1
    let settleK = EASE_IN_OUT_QUAD(ph ? ph.settle : 1)
    let labelsK = ph ? ph.labels : 1
    let lift = 1
    if (sinking) {
      const k = sinking
      k.t += dt
      const out = (secs: number) => 1 - EASE_OUT(Math.min(1, k.t / secs))
      lift = out(SINK_S)
      rise = k.rise
      riverK = k.river * lift
      labelsK = k.labels * out(0.15)
      settleK = k.settle * (1 - EASE_IN_OUT_QUAD(Math.min(1, k.t / LIFT_S)))
      if (k.t >= LIFT_S) {
        sinking = null
        k.done()
      }
    }
    shown = { rise, river: riverK, settle: settleK, labels: labelsK }
    // Advance the market by the time the frames owe it. It moves in whole 1/60 s quanta, so the fraction a frame
    // leaves over is carried, never dropped: at 120 Hz each frame owes half a quantum. dt is capped by the stage.
    // The page's one market moves once a frame, whichever figure asks first (./market.ts): this figure uploads every
    // row written since it last drew, however many, and whoever wrote them. dt is capped by the stage.
    sh.advance()
    const fresh = sim.written - uploaded
    if (fresh) {
      uploadRows(Math.min(ROWS, fresh))
      uploaded = sim.written
    }
    if (pDirty) {
      gl.bindBuffer(gl.ARRAY_BUFFER, pBuf)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, pData)
      pDirty = false
    }
    const head = sim.row(0)
    // At the time the frames have reached, not the market's last whole quantum, so at 120 Hz the rows glide every frame.
    const at = sh.drawnAt()
    fracZ = Math.min(1, (at - sim.times[head]!) * HZ)
    const target = sim.mids[head]!
    if (Math.abs(target - follow.x) > 40 || fresh > 5 * HZ) {
      follow.x = target
      follow.v = 0
    } else spring(follow, target, dt * driftK, FOLLOW)
    // On the drift's clock: paused, the price window coasts to rest with the camera (240ms) and holds where it is.
    centre = follow.x

    // The reader's lean (pointer or tilt), on the spring. Paused, or while the pointer reads the terrain, it comes to
    // rest where it is.
    const leaning = sh.paused || reading0 || drag ? null : sh.lean()
    spring(lean.yaw, leaning ? -SWAY.yaw * leaning.x : lean.yaw.x, dt, LEAN_W)
    spring(lean.pitch, leaning ? -SWAY.pitch * leaning.y : lean.pitch.x, dt, LEAN_W)
    // Let go, the turn goes home on the IV surface's spring, carrying the hand's speed.
    if (!drag || !drag.live) {
      spring(turn.yaw, 0, dt, 7)
      spring(turn.pitch, 0, dt, 7)
    }

    const aspect = cssW / cssH
    driftK = sh.paused ? Math.max(0, driftK - dt / 0.24) : Math.min(1, driftK + dt / 0.4)
    clock += dt * driftK
    const c = cam(clock, settleK)
    const e = eye(c)
    mvp = mul(perspective(aspect, lens(aspect)), view(c))
    inv = invert(mvp)

    // Probe: hover wins; else the keyboard/tap probe.
    const hovered = hover ? pick(hover[0], hover[1]) : null
    reading0 = hovered !== null
    // The reader's own probe wins; otherwise the order chosen in Fig. 2, where and when it was, while it is in view.
    const chosen = !hovered && !sh.key ? sh.highlight() : null
    const probe =
      hovered ?? sh.key ?? (chosen && sim.t - chosen.t < Math.min(rows, sim.written) / HZ ? { dp: chosen.price - Math.round(centre), age: rowAfter(sim, chosen.t) } : null)
    const probePrice = probe ? Math.round(centre) + probe.dp : 0
    const probeAge = probe ? Math.min(Math.max(0, probe.age), Math.min(rows, sim.written) - 1) : 0
    const reading = probe ? readAt(sim, probePrice, probeAge, fracZ) : null

    const b = base()
    const fracX = centre - Math.floor(centre)
    const dark = pal.dark

    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(pal.paper[0], pal.paper[1], pal.paper[2], 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.depthMask(true)
    gl.disable(gl.BLEND)

    // Terrain
    terrain.use()
    gl.enable(gl.POLYGON_OFFSET_FILL)
    gl.polygonOffset(1, 2)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, depthTex)
    gl.uniform1i(terrain.u('uDepth'), 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, centreTex)
    gl.uniform1i(terrain.u('uCentre'), 1)
    gl.uniform1i(terrain.u('uHead'), head)
    gl.uniform1i(terrain.u('uRows'), Math.min(rows, sim.written))
    // The age fade eases toward a new history depth (τ ≈ 250ms) instead of
    // rescaling in one frame when quality steps: rows a step adds emerge out
    // of the fade rather than the whole terrain jumping 23% deeper.
    const rowsTarget = Math.min(rows, sim.written)
    rowsF = rowsF ? rowsF + (rowsTarget - rowsF) * (1 - Math.exp(-dt * 4)) : rowsTarget
    gl.uniform1f(terrain.u('uRowsF'), Math.max(1, rowsF))
    gl.uniform1i(terrain.u('uBase'), b - START)
    const wmod = (sim.written - 1) % 1200
    gl.uniform1i(terrain.u('uWmod'), wmod)
    gl.uniform1f(terrain.u('uFracX'), fracX)
    gl.uniform1f(terrain.u('uFracZ'), fracZ)
    gl.uniform1f(terrain.u('uRise'), rise)
    gl.uniform1f(terrain.u('uSink'), lift)
    gl.uniformMatrix4fv(terrain.u('uMVP'), false, mvp)
    setVec(terrain, 'uPaper', pal.paper)
    setVec(terrain, 'uInk', pal.ink)
    setVec(terrain, 'uGraphite', pal.graphite)
    setVec(terrain, 'uRule', pal.rule)
    setVec(terrain, 'uIndigo', pal.indigo)
    setVec(terrain, 'uWash', pal.wash)
    setVec(terrain, 'uEye', e)
    const L = [-0.45, 0.8, 0.4], ln = Math.hypot(L[0]!, L[1]!, L[2]!)
    gl.uniform3f(terrain.u('uLight'), L[0]! / ln, L[1]! / ln, L[2]! / ln)
    gl.uniform1f(terrain.u('uDark'), dark ? 1 : 0)
    gl.uniform1f(terrain.u('uProbeOn'), reading ? 1 : 0)
    gl.uniform1f(terrain.u('uProbeRow'), wmod - probeAge)
    gl.uniform1f(terrain.u('uProbePx'), probePrice - START - (b - START) + ((((b - START) % 10) + 10) % 10))
    gl.bindVertexArray(gridVao)
    gl.drawElements(gl.TRIANGLES, idxCount, gl.UNSIGNED_SHORT, 0)
    gl.disable(gl.POLYGON_OFFSET_FILL)

    // Overlays: premultiplied; additive at night so the glow reads as light.
    gl.enable(gl.BLEND)
    gl.depthMask(false)
    // The river's history eases with the terrain's (rowsF) when quality steps, rather than growing 48 rows in a frame.
    const n = Math.min(Math.round(rowsF || rows), sim.written)

    // Build ribbons: the river (mid price), the front profile, the probe's drop line.
    ribN = 0
    const riverR = buildRiver(Math.min(ROWS, Math.ceil(n * riverK)), rise, lift)
    const frontR = buildFront(head, b, fracX, rise, lift)
    let dropR: [number, number] | null = null
    if (reading) {
      const r = sim.row(probeAge)
      const x = xOf(probePrice), z = zOf(probeAge)
      const y = height(sim.depthAt(r, probePrice))
      dropPts[0] = x
      dropPts[1] = y
      dropPts[2] = z
      dropPts[3] = x
      dropPts[4] = y + 0.16
      dropPts[5] = z
      dropR = addRibbon(dropPts, ONES, 2)
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, ribBuf)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, ribData, 0, ribN * 11)

    ribbon.use()
    gl.bindVertexArray(ribVao)
    gl.uniformMatrix4fv(ribbon.u('uMVP'), false, mvp)
    gl.uniform2f(ribbon.u('uView'), cssW / 2, cssH / 2)
    over()
    strip(frontR, 0.9, pal.ink, dark ? 0.75 : 0.85, false)

    // Trade dots ride the terrain into the past.
    points.use()
    gl.bindVertexArray(pVao)
    gl.uniformMatrix4fv(points.u('uMVP'), false, mvp)
    gl.uniform1f(points.u('uNow'), at - T0)
    gl.uniform1f(points.u('uCentre'), centre - START)
    gl.uniform1f(points.u('uDpr'), dpr)
    gl.uniform1f(points.u('uHist'), rowsF || rows)
    gl.uniform1f(points.u('uMode'), 0)
    gl.uniform1f(points.u('uShow'), Math.min(1, Math.max(0, (rise - 0.55) / 0.45)) * lift)
    // Trades are the price's own marks: ink, the threshold's colour, which by night is light.
    setVec(points, 'uColor', pal.ink)
    over()
    gl.drawArrays(gl.POINTS, 0, MAXP)

    // The river: a soft halo, then the core.
    ribbon.use()
    gl.bindVertexArray(ribVao)
    // The halo fades out and in with a quality step (over about a quarter of a second) rather than switching.
    haloK += ((q > 0 ? 1 : 0) - haloK) * (1 - Math.exp(-dt / 0.08))
    // The price is ink, the threshold between the two walls: by night it glows, and by day a paper halo lifts it off
    // the indigo either side, as a value label's halo lifts it off a band.
    if (haloK > 0.01) {
      if (dark) {
        glow()
        strip(riverR, 14, pal.ink, 0.3 * haloK, true)
      } else {
        over()
        strip(riverR, 8, pal.paper, 0.55 * haloK, true)
      }
    }
    over()
    strip(riverR, 2.1, pal.ink, 1, false)
    if (dropR) strip(dropR, 1, pal.ink, 1, false)

    // Sparks: short, strong ease-out rise and fade.
    points.use()
    gl.bindVertexArray(pVao)
    gl.uniform1f(points.u('uMode'), 1)
    glow()
    gl.drawArrays(gl.POINTS, 0, MAXP)
    gl.bindVertexArray(null)
    gl.depthMask(true)

    // Labels follow the projection, most important first (lib/orderbook/labels.ts); any that would cover one
    // already placed waits for room.
    placed.length = 0
    // First every label's text and where it would go; then the new texts are measured, all at once; then they are
    // placed: one layout a frame at most, never one after another label's write.
    const todo: { l: Label; text: string; at: [number, number] | null; anchor: Anchor }[] = []
    for (const l of labelSpecs(sim, { centre, fracZ, narrow: aspect < 1, rows, rise, lift })) {
      const at = S(l.at[0], l.at[1], l.at[2])
      todo.push({ l: label(l.id, l.kind), text: l.text, at: at ? [at[0] + l.dx, at[1] + l.dy] : null, anchor: l.anchor })
      if (l.id !== 'price') continue
      // The probe's reading, beside the pin, second only to the price: the answer where the hand is.
      const probeTag = label('probe', 'probe')
      if (reading) {
        const r = sim.row(probeAge)
        const pin = S(xOf(probePrice), height(sim.depthAt(r, probePrice)) + 0.16, zOf(probeAge))
        const text = reading.side === 'spread' ? `${fmt.usd(reading.price)} · inside the spread` : `${fmt.usd(reading.price)} · ${fmt.shares(reading.queue)} · ${fmt.ago(reading.ago)}`
        todo.push({ l: probeTag, text, at: pin ? [pin[0] + 6, pin[1] - 10] : null, anchor: 'l' })
      } else todo.push({ l: probeTag, text: '', at: null, anchor: 'c' })
    }
    for (const t of todo)
      if (t.l.text !== t.text) {
        t.l.el.textContent = t.text
        t.l.text = t.text
        t.l.w = 0
      }
    for (const t of todo)
      if (t.text && !t.l.w) {
        t.l.w = t.l.el.offsetWidth
        t.l.h = t.l.el.offsetHeight
      }
    for (const t of todo) place(t.l, t.text, t.at, t.anchor)

    const fading = fadeLabels(dt, labelsK)
    settling =
      fading ||
      Math.abs(lean.yaw.v) + Math.abs(lean.pitch.v) > 1e-5 ||
      drag !== null ||
      Math.abs(turn.yaw.x) + Math.abs(turn.pitch.x) + Math.abs(turn.yaw.v) + Math.abs(turn.pitch.v) > 1e-4 ||
      (sh.paused && driftK > 0) ||
      (driftK > 0 && (Math.abs(follow.v) > 1e-4 || Math.abs(target - centre) > 1e-3)) ||
      Math.abs(rowsTarget - rowsF) > 0.01 ||
      ph !== null ||
      sinking !== null
    // For the specs and ?debug=1: frames drawn, and the market's simulated clock.
    sh.labels.dataset.draws = String(++draws)
    sh.labels.dataset.simT = sim.t.toFixed(3)
    sh.labels.dataset.turn = turn.yaw.x.toFixed(3)
    sh.onFrame(sim.stats(), reading, !!hovered)
    first = true
    return true
  }

  // A software rasteriser (what audits run on) draws every other frame: the
  // market and the camera still advance by the full elapsed time.
  const halve = env.tier === 'software'
  let pending = 0
  let tick = 0
  /** The programs have linked: asked once, not every frame (a GPU round trip in some browsers). */
  let linked = false
  /** The river's halo, 0…1: off at the lowest quality, eased across a step. */
  let haloK = 1
  const frame = (_t: number, dt: number): boolean | 'idle' => {
    if (disposed) return false
    if (!linked) {
      if (!progs.every((p) => p.ready())) return false
      linked = true
    }
    pending += dt
    // Paused, with nothing settling, no new rows, no story and the reader's probe where it was, the frame on screen
    // is already right: draw nothing (the page's still-frame budget; WCAG 2.2.2 holds either way).
    const key = sh.key, chosen = sh.highlight()
    if (first && sh.paused && !dirty && !settling && key === lastKey && chosen === lastChosen && !sh.sequence() && sim.written === uploaded) {
      pending = 0
      return 'idle'
    }
    lastKey = key
    lastChosen = chosen
    dirty = false
    if (halve && first && tick++ % 2 === 1) return true
    const d = pending
    pending = 0
    return draw(d)
  }

  return {
    frame,
    resize(w, h, cw, ch) {
      dirty = true
      cssW = Math.max(1, cw)
      cssH = Math.max(1, ch)
      dpr = w / cssW
      void h
      rest = fit(REST.yaw, restPitch(cssW / cssH), cssW / cssH)
      page = fit(REST.yaw, PAGE_PITCH, cssW / cssH, false)
    },
    setQuality(level) {
      dirty = true
      q = level
      const nz = ROWS_BY_Q[Math.max(0, Math.min(3, level))]!
      if (nz !== rows) buildGrid(nz)
    },
    setPalette(p) {
      dirty = true
      pal = p
    },
    sink(done) {
      if (sinking) return
      sinking = { t: 0, ...shown, done }
      dirty = true
    },
    dispose() {
      disposed = true
      sim.onTrade = null
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointercancel', onCancel)
      sh.labels.replaceChildren()
      for (const p of progs) gl.deleteProgram(p.program)
      gl.deleteTexture(depthTex)
      gl.deleteTexture(centreTex)
      for (const b of [gridBuf, idxBuf, ribBuf, pBuf]) gl.deleteBuffer(b)
      for (const v of [gridVao, ribVao, pVao]) gl.deleteVertexArray(v)
    },
  }
}

