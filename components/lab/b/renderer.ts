import { program, type GL } from '@/lib/lab/gl'
import { HALF, HZ, LEVELS, ROWS, START, TICK, type Sim, type Stats } from '@/lib/lab/b/sim'
import { fmt, readAt, type Reading } from '@/lib/lab/b/read'
import { DX, DZ, H, POW, REF, REST, VIS, XW, Z_NOW, apply, eye, fit, height, lens, invert, mul, perspective, toScreen, view, type Camera, type M4 } from '@/lib/lab/b/view'
import type { Palette, Renderer, StageEnv } from '../useStage'

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

export interface KeyProbe {
  /** Ticks from the window's centre. */
  dp: number
  /** Rows before the newest. */
  age: number
}

export interface Shared {
  sim: Sim
  labels: HTMLElement
  /** The keyboard (or tap) probe; the hover probe takes precedence while the mouse is over the terrain. */
  key: KeyProbe | null
  /** Paused: the market and the clock stop; the camera and the probe still answer. */
  paused: boolean
  onFrame(stats: Stats, probe: Reading | null, hovering: boolean): void
}

const ROWS_BY_Q = [96, 150, 208, 256] as const
const MAXP = 512
const SPARK_LIFE = 0.6
const DRIFT = { amp: 0.07, period: 48 }
/** Window follow speed, ticks per second: linear, never eased. */
const FOLLOW = 4
const OMEGA = 4.5

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
uniform float uFracX, uFracZ;
uniform mat4 uMVP;
out vec3 vPos; out vec3 vN; out float vCum; out float vRow; out float vPx; out float vAge;
float hgt(float c) { return H * pow(abs(c) / REF, POW); }
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
  float y = hgt(d);
  float x = (float(j) - ${VIS / 2}.0 - uFracX) * DX;
  float z = ZNOW - (float(a) + uFracZ) * DZ;
  float hl = hgt(dep(j - 1, a)), hr = hgt(dep(j + 1, a)), hb = hgt(dep(j, a + 1)), hf = hgt(dep(j, max(a - 1, 0)));
  vN = normalize(vec3((hl - hr) / (2.0 * DX), 1.0, (hb - hf) / (2.0 * DZ)));
  vCum = d;
  vRow = float(uWmod - a);
  vPx = float(j + ((uBase % 10) + 10) % 10);
  vAge = (float(a) + uFracZ) / float(uRows);
  vPos = vec3(x, y, z);
  gl_Position = uMVP * vec4(x, y, z, 1.0);
}`

const TERRAIN_FS = `${HEAD}
in vec3 vPos; in vec3 vN; in float vCum; in float vRow; in float vPx; in float vAge;
uniform vec3 uPaper, uInk, uGraphite, uRule, uIndigo, uWash, uEye, uLight;
uniform float uDark, uProbeOn, uProbeRow, uProbePx;
out vec4 o;
float hair(float f, float w) { float d = abs(fract(f + 0.5) - 0.5) / max(fwidth(f), 1e-5); return 1.0 - clamp(d - w, 0.0, 1.0); }
void main() {
  vec3 n = normalize(vN);
  float t = clamp(pow(abs(vCum) / REF, POW), 0.0, 1.3);
  vec3 bid = uDark > 0.5 ? mix(uWash, uIndigo, 0.16 + 0.34 * t) : mix(uWash, uIndigo, 0.08 + 0.30 * t);
  vec3 ask = uDark > 0.5 ? mix(uRule, uGraphite, 0.18 + 0.40 * t) : mix(uPaper, uGraphite, 0.05 + 0.30 * t);
  vec3 floorC = uDark > 0.5 ? mix(uPaper, uRule, 0.6) : mix(uPaper, uRule, 0.7);
  vec3 c = mix(floorC, vCum < 0.0 ? bid : ask, smoothstep(0.0, 2.5, abs(vCum)));
  float diff = max(dot(n, uLight), 0.0);
  c *= (uDark > 0.5 ? 0.66 : 0.84) + (uDark > 0.5 ? 0.62 : 0.2) * diff;
  vec3 v = normalize(uEye - vPos);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  c = mix(c, uDark > 0.5 ? uIndigo : uPaper, rim * 0.22);
  float f = abs(vCum) / 40.0;
  c = mix(c, uInk, (f < 0.5 ? 0.0 : hair(f, 0.15)) * 0.16);
  c = mix(c, uInk, hair(vRow / 12.0, 0.05) * 0.07);
  c = mix(c, uInk, hair(vPx / 10.0, 0.05) * 0.05);
  if (uProbeOn > 0.5) {
    float pr = 1.0 - clamp(abs(vRow - uProbeRow) / max(fwidth(vRow), 1e-5) - 0.5, 0.0, 1.0);
    float pc = 1.0 - clamp(abs(vPx - uProbePx) / max(fwidth(vPx), 1e-5) - 0.4, 0.0, 1.0);
    c = mix(c, uInk, max(pr * 0.7, pc * 0.3));
  }
  c = mix(c, uPaper, smoothstep(0.4, 1.0, vAge) * 0.94);
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
uniform mat4 uMVP; uniform float uNow, uCentre, uDpr, uMode, uHist;
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
  gl_PointSize = gone ? 0.0 : size * uDpr;
  gl_Position = gone ? vec4(2.0, 2.0, 2.0, 1.0) : uMVP * vec4(x, y + 0.006, z, 1.0);
}`

const POINT_FS = `${HEAD}
in float vA;
uniform vec3 uColor, uCore; uniform float uMode;
out vec4 o;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = dot(q, q);
  if (r > 1.0) discard;
  if (uMode > 0.5) {
    float g = exp(-3.5 * r) * vA;
    float core = (1.0 - smoothstep(0.05, 0.2, r)) * vA;
    vec3 col = mix(uColor, uCore, core);
    float a = max(g, core);
    o = vec4(col * a, a);
  } else {
    float a = (1.0 - smoothstep(0.55, 1.0, r)) * vA;
    o = vec4(uColor * a, a);
  }
}`

type Prog = ReturnType<typeof program>

export function createBookRenderer(env: StageEnv, sh: Shared): Renderer {
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
  const addRibbon = (pts: number[], fades: number[]): [number, number] => {
    const n = pts.length / 3
    const first = ribN
    for (let i = 0; i < n; i++) {
      const pi = Math.max(0, i - 1), ni = Math.min(n - 1, i + 1)
      for (const side of [-1, 1]) {
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
  type Label = { el: HTMLSpanElement; text: string; w: number; h: number }
  const mk = (cls: string): Label => {
    const el = document.createElement('span')
    el.className = `absolute left-0 top-0 whitespace-nowrap font-mono text-meta leading-none ${cls}`
    sh.labels.appendChild(el)
    return { el, text: '', w: 0, h: 0 }
  }
  const priceLabels = Array.from({ length: 8 }, () => mk('text-graphite bg-paper/80 px-0.5 rounded-sm'))
  const timeLabels = [0, 5, 10, 15].map(() => mk('text-graphite bg-paper/80 px-0.5 rounded-sm'))
  const buyers = mk('text-ink bg-paper/85 px-1 py-0.5 rounded-sm')
  const sellers = mk('text-ink bg-paper/85 px-1 py-0.5 rounded-sm')
  const priceTag = mk('text-indigo bg-paper/85 px-1 py-0.5 rounded-sm')
  const probeTag = mk('text-ink bg-paper/90 px-1 py-0.5 rounded-sm')
  /** Boxes already placed this frame: a label that would overlap one, or leave the frame, is hidden. */
  const placed: [number, number, number, number][] = []
  const place = (l: Label, text: string, at: [number, number] | null, anchor: 'c' | 'l' | 'r' = 'c') => {
    if (l.text !== text) {
      l.el.textContent = text
      l.text = text
      l.w = 0
    }
    if (at && text) {
      if (!l.w) {
        l.el.style.visibility = 'hidden'
        l.w = l.el.offsetWidth
        l.h = l.el.offsetHeight
      }
      const x0 = anchor === 'c' ? at[0] - l.w / 2 : anchor === 'l' ? at[0] : at[0] - l.w
      const box: [number, number, number, number] = [x0 - 3, at[1] - l.h / 2 - 2, x0 + l.w + 3, at[1] + l.h / 2 + 2]
      const clash = box[0] < 4 || box[2] > cssW - 4 || box[1] < 0 || box[3] > cssH || placed.some((b) => box[0] < b[2] && b[0] < box[2] && box[1] < b[3] && b[1] < box[3])
      if (!clash) {
        placed.push(box)
        l.el.style.visibility = 'visible'
        l.el.style.transform = `translate(${x0.toFixed(1)}px, ${(at[1] - l.h / 2).toFixed(1)}px)`
        return
      }
    }
    l.el.style.visibility = 'hidden'
  }

  // ── state ──────────────────────────────────────────────────────────────────
  let cssW = 1, cssH = 1, dpr = 1
  let q = 2
  let dist = 4
  let centre = sim.mids[sim.row(0)]!
  const spring = { yaw: 0, pitch: 0, vy: 0, vp: 0 }
  let hover: [number, number] | null = null
  let pointerN: [number, number] | null = null
  let mvp: M4 = new Float32Array(16)
  let inv: M4 | null = null
  let fracZ = 0
  /** The camera's drift clock: stops while paused. */
  let clock = 0
  let first = false
  let disposed = false

  const cam = (t: number): Camera => ({
    yaw: REST.yaw + DRIFT.amp * Math.sin((2 * Math.PI * t) / DRIFT.period) + spring.yaw,
    pitch: REST.pitch + spring.pitch,
    dist,
    tx: 0,
    ty: REST.ty,
    tz: cssW / cssH < 1 ? REST.tz + 0.35 : REST.tz,
  })

  // ── picking ────────────────────────────────────────────────────────────────
  const base = () => Math.floor(centre) - VIS / 2
  const heightAt = (x: number, z: number): number | null => {
    const jf = x / DX + VIS / 2 + (centre - Math.floor(centre))
    const af = (Z_NOW - z) / DZ - fracZ
    if (jf < 0 || jf > VIS || af < 0 || af > rows - 1 || af > sim.written - 1) return null
    const j0 = Math.floor(jf), a0 = Math.floor(af)
    const fj = jf - j0, fa = af - a0
    const b = base()
    const hAt = (j: number, a: number) => height(sim.depthAt(sim.row(Math.min(a, rows - 1)), b + j))
    const top = hAt(j0, a0) * (1 - fj) + hAt(j0 + 1, a0) * fj
    const bot = hAt(j0, a0 + 1) * (1 - fj) + hAt(j0 + 1, a0 + 1) * fj
    return top * (1 - fa) + bot * fa
  }
  const pick = (cx: number, cy: number): KeyProbe | null => {
    if (!inv) return null
    const nx = (cx / cssW) * 2 - 1, ny = 1 - (cy / cssH) * 2
    const a = apply(inv, nx, ny, -1), b = apply(inv, nx, ny, 1)
    const P0 = [a[0] / a[3], a[1] / a[3], a[2] / a[3]], P1 = [b[0] / b[3], b[1] / b[3], b[2] / b[3]]
    // Clip the ray to the slab the terrain can occupy, then march it.
    const top = H * 1.6
    let t0 = 0, t1 = 1
    const dy = P1[1]! - P0[1]!
    if (Math.abs(dy) > 1e-9) {
      const ta = (top - P0[1]!) / dy, tb = (0 - P0[1]!) / dy
      t0 = Math.max(0, Math.min(ta, tb))
      t1 = Math.min(1, Math.max(ta, tb))
    }
    const at = (t: number) => [P0[0]! + (P1[0]! - P0[0]!) * t, P0[1]! + dy * t, P0[2]! + (P1[2]! - P0[2]!) * t] as const
    const above = (t: number) => {
      const p = at(t)
      const hh = heightAt(p[0], p[2])
      return hh === null ? null : p[1] - hh
    }
    let prevT = t0, prev: number | null = null
    const steps = 240
    for (let s = 0; s <= steps; s++) {
      const t = t0 + ((t1 - t0) * s) / steps
      const d = above(t)
      if (d !== null && prev !== null && prev > 0 && d <= 0) {
        let lo = prevT, hi = t
        for (let i = 0; i < 20; i++) {
          const mid = (lo + hi) / 2
          const dm = above(mid)
          if (dm !== null && dm > 0) lo = mid
          else hi = mid
        }
        const p = at((lo + hi) / 2)
        const price = Math.round(p[0] / DX + centre)
        const age = Math.max(0, Math.round((Z_NOW - p[2]) / DZ - fracZ))
        return { dp: price - Math.round(centre), age }
      }
      prev = d
      prevT = t
    }
    return null
  }

  // ── input ──────────────────────────────────────────────────────────────────
  const local = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    const p = local(e)
    hover = p
    pointerN = [(p[0] / cssW) * 2 - 1, (p[1] / cssH) * 2 - 1]
  }
  const onLeave = () => {
    hover = null
    pointerN = null
  }
  const onUp = (e: PointerEvent) => {
    const p = local(e)
    const hit = pick(p[0], p[1])
    if (hit) sh.key = hit
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('pointerup', onUp)

  // ── frame ──────────────────────────────────────────────────────────────────
  const setVec = (p: Prog, name: string, c: readonly number[]) => gl.uniform3f(p.u(name), c[0]!, c[1]!, c[2]!)

  const draw = (dt: number): boolean => {
    // Advance the market. dt is capped by the stage, so a slice is at most 0.1 s: ~1–2 events.
    const newRows = first && !sh.paused ? sim.advance(sim.t + dt) : 0
    if (newRows) uploadRows(newRows)
    if (pDirty) {
      gl.bindBuffer(gl.ARRAY_BUFFER, pBuf)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, pData)
      pDirty = false
    }
    const head = sim.row(0)
    fracZ = Math.min(1, (sim.t - sim.times[head]!) * HZ)
    const target = sim.mids[head]!
    const step = FOLLOW * dt
    centre += Math.max(-step, Math.min(step, target - centre))
    if (Math.abs(target - centre) > 40) centre = target

    // The pointer orbit: a critically damped spring toward the pointer's offset.
    const ty = pointerN ? -0.12 * pointerN[0] : 0
    const tp = pointerN ? 0.05 * pointerN[1] : 0
    for (let left = dt; left > 1e-6; left -= 1 / 60) {
      const h = Math.min(left, 1 / 60)
      spring.vy += (-OMEGA * OMEGA * (spring.yaw - ty) - 2 * OMEGA * spring.vy) * h
      spring.vp += (-OMEGA * OMEGA * (spring.pitch - tp) - 2 * OMEGA * spring.vp) * h
      spring.yaw += spring.vy * h
      spring.pitch += spring.vp * h
    }

    const aspect = cssW / cssH
    if (!sh.paused) clock += dt
    const c = cam(clock)
    const e = eye(c)
    mvp = mul(perspective(aspect, lens(aspect)), view(c))
    inv = invert(mvp)

    // Probe: hover wins; else the keyboard/tap probe.
    const hovered = hover ? pick(hover[0], hover[1]) : null
    const probe = hovered ?? sh.key
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
    gl.uniform1i(terrain.u('uBase'), b - START)
    const wmod = (sim.written - 1) % 1200
    gl.uniform1i(terrain.u('uWmod'), wmod)
    gl.uniform1f(terrain.u('uFracX'), fracX)
    gl.uniform1f(terrain.u('uFracZ'), fracZ)
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
    const glow = () => (dark ? gl.blendFunc(gl.ONE, gl.ONE) : gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA))
    const over = () => gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    const n = Math.min(rows, sim.written)
    const xOf = (price: number) => (price - centre) * DX
    const zOf = (age: number) => Z_NOW - (age + fracZ) * DZ

    // Build ribbons: the river (mid price), the front profile, the probe's drop line.
    ribN = 0
    const river: number[] = [], riverFade: number[] = []
    for (let a = 0; a < n; a++) {
      const r = sim.row(a)
      const mid = sim.mids[r]!
      const lo = Math.floor(mid), f = mid - lo
      const y = height(sim.depthAt(r, lo)) * (1 - f) + height(sim.depthAt(r, lo + 1)) * f
      river.push(xOf(mid), y + 0.006, zOf(a))
      riverFade.push(1 - Math.min(1, Math.max(0, (a / rows - 0.45) / 0.55)))
    }
    const riverR = addRibbon(river, riverFade)
    const front: number[] = [], frontFade: number[] = []
    const r0 = head
    for (let j = 0; j <= VIS; j++) {
      const price = b + j
      front.push((j - VIS / 2 - fracX) * DX, height(sim.depthAt(r0, price)) + 0.002, zOf(0))
      frontFade.push(1)
    }
    const frontR = addRibbon(front, frontFade)
    let dropR: [number, number] | null = null
    if (reading) {
      const r = sim.row(probeAge)
      const x = xOf(probePrice), z = zOf(probeAge)
      const y = height(sim.depthAt(r, probePrice))
      dropR = addRibbon([x, y, z, x, y + 0.16, z], [1, 1])
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, ribBuf)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, ribData, 0, ribN * 11)

    ribbon.use()
    gl.bindVertexArray(ribVao)
    gl.uniformMatrix4fv(ribbon.u('uMVP'), false, mvp)
    gl.uniform2f(ribbon.u('uView'), cssW / 2, cssH / 2)
    const strip = (r: [number, number], width: number, color: readonly number[], opacity: number, soft: boolean) => {
      gl.uniform1f(ribbon.u('uWidth'), width)
      setVec(ribbon, 'uColor', color)
      gl.uniform1f(ribbon.u('uAlpha'), opacity)
      gl.uniform1f(ribbon.u('uSoft'), soft ? 1 : 0)
      gl.drawArrays(gl.TRIANGLE_STRIP, r[0], r[1])
    }
    over()
    strip(frontR, 0.9, pal.ink, dark ? 0.75 : 0.85, false)

    // Trade dots ride the terrain into the past.
    points.use()
    gl.bindVertexArray(pVao)
    gl.uniformMatrix4fv(points.u('uMVP'), false, mvp)
    gl.uniform1f(points.u('uNow'), sim.t - T0)
    gl.uniform1f(points.u('uCentre'), centre - START)
    gl.uniform1f(points.u('uDpr'), dpr)
    gl.uniform1f(points.u('uHist'), rows)
    gl.uniform1f(points.u('uMode'), 0)
    setVec(points, 'uColor', pal.indigo)
    setVec(points, 'uCore', dark ? pal.ink : mixc(pal.indigo, pal.paper, 0.45))
    over()
    gl.drawArrays(gl.POINTS, 0, MAXP)

    // The river: a soft halo, then the core.
    ribbon.use()
    gl.bindVertexArray(ribVao)
    if (q > 0) {
      glow()
      strip(riverR, dark ? 14 : 12, pal.indigo, dark ? 0.38 : 0.3, true)
    }
    over()
    strip(riverR, 2.1, dark ? mixc(pal.indigo, pal.ink, 0.35) : pal.indigo, 1, false)
    if (dropR) strip(dropR, 1, pal.ink, 1, false)

    // Sparks: short, strong ease-out rise and fade.
    points.use()
    gl.bindVertexArray(pVao)
    gl.uniform1f(points.u('uMode'), 1)
    glow()
    gl.drawArrays(gl.POINTS, 0, MAXP)
    gl.bindVertexArray(null)
    gl.depthMask(true)

    // Labels follow the projection, most important first; any that would
    // overlap one already placed is dropped for this frame.
    placed.length = 0
    const S = (x: number, y: number, z: number) => toScreen(mvp, cssW, cssH, x, y, z)
    const narrow = aspect < 1
    const midNow = sim.mids[head]!
    const tagAt = S(xOf(midNow), 0, Z_NOW + 0.02)
    place(priceTag, `Price ${fmt.mid(midNow)}`, tagAt ? [tagAt[0], tagAt[1] + 18] : null)
    // The probe's reading, beside the pin: the answer where the hand is.
    if (reading) {
      const r = sim.row(probeAge)
      const at = S(xOf(probePrice), height(sim.depthAt(r, probePrice)) + 0.16, zOf(probeAge))
      const text = reading.side === 'spread' ? `${fmt.usd(reading.price)} · inside the spread` : `${fmt.usd(reading.price)} · ${fmt.shares(reading.queue)} · ${fmt.ago(reading.ago)}`
      place(probeTag, text, at ? [at[0] + 6, at[1] - 10] : null, 'l')
    } else place(probeTag, '', null)
    const wallX = narrow ? 0.26 : 0.8
    const times = [0, 5, 10, 15]
    const placeTime = (i: number) => {
      const s = times[i]!
      const age = s * HZ
      const r = sim.row(Math.round(age))
      const ok = age < n * 0.62 && r >= 0
      const edge = narrow ? Math.round(VIS * (0.13 + 0.035 * i)) : VIS / 2 - 1
      const y = ok ? height(sim.depthAt(r, Math.round(centre) + edge)) : 0
      place(timeLabels[i]!, s === 0 ? 'now' : `${s} s ago`, ok ? S(edge * DX + 0.04, y + 0.02, zOf(age)) : null, narrow ? 'r' : 'l')
    }
    placeTime(0)
    place(buyers, 'Buyers waiting', S(-XW * wallX, height(REF * 0.8) + 0.06, Z_NOW - 0.25))
    place(sellers, 'Sellers waiting', S(XW * wallX, height(REF * 0.8) + 0.06, Z_NOW - 0.25))
    for (let i = 1; i < times.length; i++) placeTime(i)
    const stepTicks = 20
    let k = 0
    for (let p = Math.ceil((b + 2) / stepTicks) * stepTicks; p <= b + VIS - 2 && k < priceLabels.length; p += stepTicks) {
      const at = S(xOf(p), height(sim.depthAt(head, p)), zOf(0))
      place(priceLabels[k++]!, `$${(p * TICK).toFixed(2)}`, at ? [at[0], at[1] + 16] : null)
    }
    for (; k < priceLabels.length; k++) place(priceLabels[k]!, '', null)

    sh.onFrame(sim.stats(), reading, !!hovered)
    first = true
    return true
  }

  // A software rasteriser (what audits run on) draws every other frame: the
  // market and the camera still advance by the full elapsed time.
  const halve = env.tier === 'software'
  let pending = 0
  let tick = 0
  const frame = (_t: number, dt: number): boolean => {
    if (disposed) return false
    if (!progs.every((p) => p.ready())) return false
    pending += dt
    if (halve && first && tick++ % 2 === 1) return true
    const d = pending
    pending = 0
    return draw(d)
  }

  return {
    frame,
    resize(w, h, cw, ch) {
      cssW = Math.max(1, cw)
      cssH = Math.max(1, ch)
      dpr = w / cssW
      void h
      dist = fit(REST.yaw, REST.pitch, cssW / cssH).dist
    },
    setQuality(level) {
      q = level
      const nz = ROWS_BY_Q[Math.max(0, Math.min(3, level))]!
      if (nz !== rows) buildGrid(nz)
    },
    setPalette(p) {
      pal = p
    },
    dispose() {
      disposed = true
      sim.onTrade = null
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('pointerup', onUp)
      sh.labels.replaceChildren()
      for (const p of progs) gl.deleteProgram(p.program)
      gl.deleteTexture(depthTex)
      gl.deleteTexture(centreTex)
      for (const b of [gridBuf, idxBuf, ribBuf, pBuf]) gl.deleteBuffer(b)
      for (const v of [gridVao, ribVao, pVao]) gl.deleteVertexArray(v)
    },
  }
}

const mixc = (a: readonly number[], b: readonly number[], t: number) => [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t]
