import { DOMAIN, iv } from '@/lib/svi'
import { EXPIRY_TICKS, STRIKE_TICKS, expiryLabel, type Probe } from '@/lib/surfaceView'
import { fx, fy } from './frames'

/**
 * The live surface. Raw WebGL2, no library: three.js alone is larger than this
 * site's whole transfer budget, and a height field with contour lines needs a
 * few hundred lines, not a scene graph.
 *
 * It renders on demand — there is no animation loop except during the one
 * entrance — so a figure nobody is touching costs nothing, on screen or off.
 * Picking is analytic: a ray from the pointer is marched against the surface's
 * own height function rather than read back from the GPU.
 *
 * World axes: x across strike, z across expiry with the shortest expiry at the
 * back (z < 0), y up in volatility. Same orientation as the contour map, so the
 * map tilting up is the same object standing up.
 */

export type RGB = readonly [number, number, number]
export interface Colors {
  readonly paper: RGB
  readonly ink: RGB
  readonly graphite: RGB
  readonly rule: RGB
  readonly indigo: RGB
  readonly wash: RGB
}

export interface RendererOptions {
  canvas: HTMLCanvasElement
  /** An empty element over the canvas; the renderer owns its children. */
  labels: HTMLElement
  colors: Colors
  /** Play the entrance (first view this session) or appear already standing. */
  entrance: boolean
  onHover: (p: Probe | null) => void
  onPick: (p: Probe) => void
  onReady: () => void
  onLost: () => void
}

export interface Renderer {
  setProbe(p: Probe): void
  setColors(c: Colors): void
  setVisible(v: boolean): void
  turn(direction: -1 | 1): void
  reset(): void
  destroy(): void
}

// ── geometry ─────────────────────────────────────────────────────────────────

const XW = 1.3 // half-width across strike
const ZW = 0.95 // half-depth across expiry
const HMAX = 0.95 // height of the tallest volatility drawn
const V0 = 0.15 // volatility at the floor
const V1 = 0.6 // volatility at HMAX
const NK = 81
const NT = 57

const wx = (k: number) => (fx(k) * 2 - 1) * XW
const wz = (T: number) => (fy(T) * 2 - 1) * ZW
const wy = (v: number) => ((v - V0) / (V1 - V0)) * HMAX
const kOf = (x: number) => DOMAIN.kMin + ((x / XW + 1) / 2) * (DOMAIN.kMax - DOMAIN.kMin)
const tOf = (z: number) => DOMAIN.tMin + ((z / ZW + 1) / 2) * (DOMAIN.tMax - DOMAIN.tMin)

// ── camera ───────────────────────────────────────────────────────────────────

interface Camera {
  yaw: number
  pitch: number
  dist: number
  ty: number
}

const REST: Camera = { yaw: 0.62, pitch: 0.42, dist: 4.1, ty: 0.3 }
const FOV = (30 * Math.PI) / 180
const PITCH_MIN = 0.2
const PITCH_MAX = 1.1
/** Turning is clamped to the arc where the axis labels can all be read; past
 *  it the tick labels stack on each other and the titles leave the box. */
const YAW_MIN = 0.1
const YAW_MAX = 1.25
const clampYaw = (y: number) => Math.min(YAW_MAX, Math.max(YAW_MIN, y))

/** Straight down, close enough that the floor fills the box like the map did. */
function overhead(aspect: number): Camera {
  const t = Math.tan(FOV / 2)
  return { yaw: 0, pitch: Math.PI / 2, dist: Math.max(ZW / t, XW / (t * aspect)) * 1.02, ty: 0 }
}

type M4 = Float32Array

/** Points that must stay in frame: the surface's bounding box and the anchors
 *  of every axis label. */
const BOX_POINTS: readonly (readonly [number, number, number])[] = [
  ...[-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [0, HMAX].map((y) => [sx * XW, y, sz * ZW] as const))),
  [0, 0, ZW + 0.16],
  [XW + 0.2, 0, 0],
  [-XW - 0.1, HMAX + 0.1, -ZW],
]
/** Axis titles need room too — but only where they are shown. */
const TITLE_POINTS: readonly (readonly [number, number, number])[] = [
  [0, 0, ZW + 0.42],
  [XW + 0.62, 0, 0],
]
const NARROW = 480

/**
 * The camera distance at which everything fits, for this angle and this box.
 * A fixed distance cropped the surface in a square phone-width box and left
 * it small in a wide one; fitting per frame keeps it filling whatever shape
 * the figure is, including while it is turned.
 */
function fit(c: Camera, aspect: number, narrow: boolean): number {
  const points = narrow ? BOX_POINTS : [...BOX_POINTS, ...TITLE_POINTS]
  let lo = 1.5, hi = 30
  for (let i = 0; i < 22; i++) {
    const d = (lo + hi) / 2
    const m = mul(perspective(aspect), view({ ...c, dist: d }))
    const inside = points.every(([x, y, z]) => {
      const q = apply(m, x, y, z)
      return q[3] > 0 && Math.abs(q[0] / q[3]) <= (narrow ? 0.93 : 0.88) && Math.abs(q[1] / q[3]) <= (narrow ? 0.9 : 0.86)
    })
    if (inside) hi = d
    else lo = d
  }
  return hi
}

function perspective(aspect: number): M4 {
  const f = 1 / Math.tan(FOV / 2)
  const near = 0.1, far = 50
  const m = new Float32Array(16)
  m[0] = f / aspect
  m[5] = f
  m[10] = (far + near) / (near - far)
  m[11] = -1
  m[14] = (2 * far * near) / (near - far)
  return m
}

function mul(a: M4, b: M4): M4 {
  const o = new Float32Array(16)
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!
      o[c * 4 + r] = s
    }
  return o
}

/** View = translate(0,0,−dist) · rotX(pitch) · rotY(−yaw) · translate(−target).
 *  Composed from rotations rather than lookAt, which degenerates overhead. */
function view(c: Camera): M4 {
  const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch)
  const cy = Math.cos(-c.yaw), sy = Math.sin(-c.yaw)
  // rotX(pitch) · rotY(−yaw), column-major
  const r = new Float32Array([
    cy, sp * sy, -cp * sy, 0,
    0, cp, sp, 0,
    sy, -sp * cy, cp * cy, 0,
    0, 0, 0, 1,
  ])
  const t = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -c.ty, 0, 1])
  const back = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -c.dist, 1])
  return mul(back, mul(r, t))
}

function invert(m: M4): M4 | null {
  const inv = new Float32Array(16)
  const a = m
  inv[0] = a[5]! * a[10]! * a[15]! - a[5]! * a[11]! * a[14]! - a[9]! * a[6]! * a[15]! + a[9]! * a[7]! * a[14]! + a[13]! * a[6]! * a[11]! - a[13]! * a[7]! * a[10]!
  inv[4] = -a[4]! * a[10]! * a[15]! + a[4]! * a[11]! * a[14]! + a[8]! * a[6]! * a[15]! - a[8]! * a[7]! * a[14]! - a[12]! * a[6]! * a[11]! + a[12]! * a[7]! * a[10]!
  inv[8] = a[4]! * a[9]! * a[15]! - a[4]! * a[11]! * a[13]! - a[8]! * a[5]! * a[15]! + a[8]! * a[7]! * a[13]! + a[12]! * a[5]! * a[11]! - a[12]! * a[7]! * a[9]!
  inv[12] = -a[4]! * a[9]! * a[14]! + a[4]! * a[10]! * a[13]! + a[8]! * a[5]! * a[14]! - a[8]! * a[6]! * a[13]! - a[12]! * a[5]! * a[10]! + a[12]! * a[6]! * a[9]!
  inv[1] = -a[1]! * a[10]! * a[15]! + a[1]! * a[11]! * a[14]! + a[9]! * a[2]! * a[15]! - a[9]! * a[3]! * a[14]! - a[13]! * a[2]! * a[11]! + a[13]! * a[3]! * a[10]!
  inv[5] = a[0]! * a[10]! * a[15]! - a[0]! * a[11]! * a[14]! - a[8]! * a[2]! * a[15]! + a[8]! * a[3]! * a[14]! + a[12]! * a[2]! * a[11]! - a[12]! * a[3]! * a[10]!
  inv[9] = -a[0]! * a[9]! * a[15]! + a[0]! * a[11]! * a[13]! + a[8]! * a[1]! * a[15]! - a[8]! * a[3]! * a[13]! - a[12]! * a[1]! * a[11]! + a[12]! * a[3]! * a[9]!
  inv[13] = a[0]! * a[9]! * a[14]! - a[0]! * a[10]! * a[13]! - a[8]! * a[1]! * a[14]! + a[8]! * a[2]! * a[13]! + a[12]! * a[1]! * a[10]! - a[12]! * a[2]! * a[9]!
  inv[2] = a[1]! * a[6]! * a[15]! - a[1]! * a[7]! * a[14]! - a[5]! * a[2]! * a[15]! + a[5]! * a[3]! * a[14]! + a[13]! * a[2]! * a[7]! - a[13]! * a[3]! * a[6]!
  inv[6] = -a[0]! * a[6]! * a[15]! + a[0]! * a[7]! * a[14]! + a[4]! * a[2]! * a[15]! - a[4]! * a[3]! * a[14]! - a[12]! * a[2]! * a[7]! + a[12]! * a[3]! * a[6]!
  inv[10] = a[0]! * a[5]! * a[15]! - a[0]! * a[7]! * a[13]! - a[4]! * a[1]! * a[15]! + a[4]! * a[3]! * a[13]! + a[12]! * a[1]! * a[7]! - a[12]! * a[3]! * a[5]!
  inv[14] = -a[0]! * a[5]! * a[14]! + a[0]! * a[6]! * a[13]! + a[4]! * a[1]! * a[14]! - a[4]! * a[2]! * a[13]! - a[12]! * a[1]! * a[6]! + a[12]! * a[2]! * a[5]!
  inv[3] = -a[1]! * a[6]! * a[11]! + a[1]! * a[7]! * a[10]! + a[5]! * a[2]! * a[11]! - a[5]! * a[3]! * a[10]! - a[9]! * a[2]! * a[7]! + a[9]! * a[3]! * a[6]!
  inv[7] = a[0]! * a[6]! * a[11]! - a[0]! * a[7]! * a[10]! - a[4]! * a[2]! * a[11]! + a[4]! * a[3]! * a[10]! + a[8]! * a[2]! * a[7]! - a[8]! * a[3]! * a[6]!
  inv[11] = -a[0]! * a[5]! * a[11]! + a[0]! * a[7]! * a[9]! + a[4]! * a[1]! * a[11]! - a[4]! * a[3]! * a[9]! - a[8]! * a[1]! * a[7]! + a[8]! * a[3]! * a[5]!
  inv[15] = a[0]! * a[5]! * a[10]! - a[0]! * a[6]! * a[9]! - a[4]! * a[1]! * a[10]! + a[4]! * a[2]! * a[9]! + a[8]! * a[1]! * a[6]! - a[8]! * a[2]! * a[5]!
  const det = a[0]! * inv[0]! + a[1]! * inv[4]! + a[2]! * inv[8]! + a[3]! * inv[12]!
  if (Math.abs(det) < 1e-12) return null
  for (let i = 0; i < 16; i++) inv[i] = inv[i]! / det
  return inv
}

function apply(m: M4, x: number, y: number, z: number): [number, number, number, number] {
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
    m[3]! * x + m[7]! * y + m[11]! * z + m[15]!,
  ]
}

// ── shaders ──────────────────────────────────────────────────────────────────

const SURFACE_VS = `#version 300 es
in vec3 aPos; in vec2 aGrad; in vec2 aKT; in float aIv;
uniform mat4 uMVP; uniform float uLift;
out float vIv; out vec3 vN; out vec2 vKT;
void main() {
  vIv = aIv; vKT = aKT;
  vN = normalize(vec3(-uLift * aGrad.x, 1.0, -uLift * aGrad.y));
  gl_Position = uMVP * vec4(aPos.x, aPos.y * uLift, aPos.z, 1.0);
}`

// Contour index: an integer at every level in LEVELS — two points apart to
// 30%, five points apart above it. Lines are one device pixel wide by fwidth.
const SURFACE_FS = `#version 300 es
precision highp float;
in float vIv; in vec3 vN; in vec2 vKT;
uniform vec3 uPaper, uWash, uInk, uGraphite, uIndigo, uLight;
uniform vec2 uProbe; uniform float uProbeOn;
out vec4 o;
float level(float v) { return v < 0.30 ? v * 50.0 : 15.0 + (v - 0.30) * 20.0; }
float hair(float f, float w) { float d = abs(fract(f + 0.5) - 0.5) / max(fwidth(f), 1e-5); return 1.0 - clamp(d - w, 0.0, 1.0); }
void main() {
  float f = level(vIv);
  float line = f < 8.5 ? 0.0 : hair(f, 0.35);
  float n = floor(f + 0.5);
  bool major = n == 10.0 || n == 12.0 || n == 15.0 || n == 17.0 || n == 19.0;
  float t = clamp((vIv - 0.16) / 0.3, 0.0, 1.0);
  vec3 c = mix(uPaper, uWash, 0.35 + 0.65 * t);
  c *= 0.8 + 0.2 * max(dot(normalize(vN), uLight), 0.0);
  c = mix(c, major ? uInk : uGraphite, line * (major ? 0.9 : 0.5));
  if (uProbeOn > 0.5) {
    float smile = 1.0 - clamp(abs(vKT.y - uProbe.y) / max(fwidth(vKT.y), 1e-5) - 0.6, 0.0, 1.0);
    float term = 1.0 - clamp(abs(vKT.x - uProbe.x) / max(fwidth(vKT.x), 1e-5) - 0.3, 0.0, 1.0);
    c = mix(c, uIndigo, max(smile, 0.55 * term));
    vec2 d = (vKT - uProbe) / max(fwidth(vKT), vec2(1e-5));
    c = mix(c, uIndigo, 1.0 - smoothstep(3.5, 5.0, length(d)));
  }
  o = vec4(c, 1.0);
}`

const LINE_VS = `#version 300 es
in vec3 aPos; uniform mat4 uMVP; uniform float uLift;
void main() { gl_Position = uMVP * vec4(aPos.x, aPos.y * uLift, aPos.z, 1.0); }`

const LINE_FS = `#version 300 es
precision highp float; uniform vec3 uColor; out vec4 o;
void main() { o = vec4(uColor, 1.0); }`

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram | null {
  const p = gl.createProgram()
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const s = gl.createShader(type)
    if (!s) return null
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null
    gl.attachShader(p, s)
  }
  gl.linkProgram(p)
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null
}

// ── the renderer ─────────────────────────────────────────────────────────────

const ENTRANCE_MS = 900
/** How long heights and zoom take to settle when a hand takes over mid-tilt. */
const HANDOFF_MS = 180
/** A shortened tilt, for a pointer that lands before the entrance has begun. */
const SETTLE_MS = 240

/** A CSS cubic-bezier, solved for y at x = t by bisection. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const b = (u: number, p1: number, p2: number) => 3 * u * (1 - u) * (1 - u) * p1 + 3 * u * u * (1 - u) * p2 + u * u * u
  return (t: number) => {
    let lo = 0, hi = 1
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (b(mid, x1, x2) < t) lo = mid
      else hi = mid
    }
    return b((lo + hi) / 2, y1, y2)
  }
}
/** Strong ease-in-out: an on-screen object moving from one state to another. */
const easeInOut = bezier(0.77, 0, 0.175, 1)
/** Strong ease-out: the system settling in response to the reader. */
const easeOut = bezier(0.23, 1, 0.32, 1)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function createRenderer(o: RendererOptions): Renderer | null {
  const gl = o.canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: false })
  if (!gl) return null
  const surf = compile(gl, SURFACE_VS, SURFACE_FS)
  const lines = compile(gl, LINE_VS, LINE_FS)
  if (!surf || !lines) return null

  // Surface mesh
  const n = NK * NT
  const pos = new Float32Array(n * 3)
  const grad = new Float32Array(n * 2)
  const kt = new Float32Array(n * 2)
  const vol = new Float32Array(n)
  const ks = Array.from({ length: NK }, (_, i) => DOMAIN.kMin + ((DOMAIN.kMax - DOMAIN.kMin) * i) / (NK - 1))
  const Ts = Array.from({ length: NT }, (_, j) => DOMAIN.tMin + ((DOMAIN.tMax - DOMAIN.tMin) * j) / (NT - 1))
  for (let j = 0; j < NT; j++)
    for (let i = 0; i < NK; i++) {
      const q = j * NK + i
      const k = ks[i]!, T = Ts[j]!
      const v = iv(k, T)
      pos.set([wx(k), wy(v), wz(T)], q * 3)
      kt.set([fx(k), fy(T)], q * 2)
      vol[q] = v
      const hk = 1e-3, hT = 1e-3
      const dx = wx(k + hk) - wx(k - hk), dz = wz(T + hT) - wz(T - hT)
      grad.set([(wy(iv(k + hk, T)) - wy(iv(k - hk, T))) / dx, (wy(iv(k, T + hT)) - wy(iv(k, Math.max(T - hT, 1e-3)))) / dz], q * 2)
    }
  const idx = new Uint16Array((NK - 1) * (NT - 1) * 6)
  let p = 0
  for (let j = 0; j < NT - 1; j++)
    for (let i = 0; i < NK - 1; i++) {
      const a = j * NK + i, b = a + 1, c = a + NK, d = c + 1
      idx.set([a, c, b, b, c, d], p)
      p += 6
    }

  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const attr = (prog: WebGLProgram, name: string, data: Float32Array, size: number) => {
    const loc = gl.getAttribLocation(prog, name)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0)
  }
  attr(surf, 'aPos', pos, 3)
  attr(surf, 'aGrad', grad, 2)
  attr(surf, 'aKT', kt, 2)
  attr(surf, 'aIv', vol, 1)
  const ibuf = gl.createBuffer()
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibuf)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW)
  gl.bindVertexArray(null)

  // Floor grid, frame and the vertical axis — static
  const floor: number[] = []
  const seg = (a: number[], b: number[]) => floor.push(...a, ...b)
  for (const K of STRIKE_TICKS) seg([wx(Math.log(K)), 0, -ZW], [wx(Math.log(K)), 0, ZW])
  for (const T of EXPIRY_TICKS) seg([-XW, 0, wz(T)], [XW, 0, wz(T)])
  const frame: number[] = []
  const fseg = (a: number[], b: number[]) => frame.push(...a, ...b)
  fseg([-XW, 0, -ZW], [XW, 0, -ZW]); fseg([XW, 0, -ZW], [XW, 0, ZW]); fseg([XW, 0, ZW], [-XW, 0, ZW]); fseg([-XW, 0, ZW], [-XW, 0, -ZW])
  fseg([-XW, 0, -ZW], [-XW, HMAX, -ZW])
  for (const v of [0.2, 0.3, 0.4, 0.5]) fseg([-XW, wy(v), -ZW], [-XW + 0.05, wy(v), -ZW])
  const lineVao = (data: number[] | Float32Array, dynamic = false) => {
    const v = gl.createVertexArray()
    gl.bindVertexArray(v)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, data instanceof Float32Array ? data : new Float32Array(data), dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(lines, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)
    return { vao: v, buf, count: (data.length / 3) | 0 }
  }
  const floorL = lineVao(floor)
  const frameL = lineVao(frame)
  const drop = lineVao(new Float32Array(6), true)

  const u = (prog: WebGLProgram, name: string) => gl.getUniformLocation(prog, name)
  const U = {
    sMVP: u(surf, 'uMVP'), sLift: u(surf, 'uLift'), paper: u(surf, 'uPaper'), wash: u(surf, 'uWash'), ink: u(surf, 'uInk'),
    graphite: u(surf, 'uGraphite'), indigo: u(surf, 'uIndigo'), light: u(surf, 'uLight'), probe: u(surf, 'uProbe'), probeOn: u(surf, 'uProbeOn'),
    lMVP: u(lines, 'uMVP'), lLift: u(lines, 'uLift'), lColor: u(lines, 'uColor'),
  }

  // Labels: HTML, projected each frame
  // `wide` labels are dropped in a narrow box, where they would touch.
  type Label = { el: HTMLSpanElement; at: [number, number, number]; lifted: boolean; wide: boolean; rank: number; w: number; h: number }
  const labels: Label[] = []
  // rank: lower is kept first when two labels would overlap.
  const addLabel = (text: string, at: [number, number, number], lifted: boolean, wide: boolean, cls: string, rank = 2) => {
    const el = document.createElement('span')
    el.textContent = text
    el.className = `absolute left-0 top-0 whitespace-nowrap rounded-sm bg-paper/80 px-0.5 font-mono text-meta leading-none ${cls}`
    o.labels.appendChild(el)
    labels.push({ el, at, lifted, wide, rank, w: 0, h: 0 })
  }
  STRIKE_TICKS.forEach((K, i) => addLabel(`${Math.round(K * 100)}%`, [wx(Math.log(K)), 0, ZW + 0.12], false, i % 2 === 1, 'text-graphite'))
  EXPIRY_TICKS.forEach((T, i) => addLabel(expiryLabel(T), [XW + 0.14, 0, wz(T)], false, i % 2 === 1, 'text-graphite'))
  for (const v of [0.2, 0.3, 0.4, 0.5]) addLabel(`${Math.round(v * 100)}%`, [-XW - 0.1, wy(v), -ZW], true, v === 0.3 || v === 0.5, 'text-graphite')
  addLabel('Strike, % of forward', [0, 0, ZW + 0.42], false, true, 'text-ink', 0)
  addLabel('Expiry', [XW + 0.62, 0, 0], false, true, 'text-ink', 0)
  addLabel('Implied vol', [-XW - 0.1, HMAX + 0.1, -ZW], true, false, 'text-ink', 0)

  let colors = o.colors
  let probe: Probe | null = null
  let cam: Camera = { ...REST }
  let lift = 1
  // Not visible until the figure says so: the entrance counts down from the
  // moment it is seen, not from the moment it was loaded.
  let visible = false
  let countdown = false
  let raf = 0
  let destroyed = false
  let entering = false
  /** Standing overhead, waiting for the canvas to finish fading in. */
  let waiting = false
  /**
   * A hand took over. `full`: it landed before the tilt began, so the camera
   * settles to rest quickly. Otherwise it landed mid-tilt: yaw and pitch
   * belong to the reader from wherever they were, and only zoom and height
   * finish — retargeted from their current values, never snapped.
   */
  let settle: { start: number; from: Camera; fromLift: number; full: boolean } | null = null
  let enterStart = 0
  let enterFrom: Camera = REST
  let mvp: M4 = new Float32Array(16)
  let inv: M4 | null = null

  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = o.canvas.clientWidth, h = o.canvas.clientHeight
    if (o.canvas.width !== Math.round(w * dpr) || o.canvas.height !== Math.round(h * dpr)) {
      o.canvas.width = Math.round(w * dpr)
      o.canvas.height = Math.round(h * dpr)
    }
    return { w, h }
  }

  const draw = () => {
    raf = 0
    if (destroyed) return
    const { w, h } = size()
    if (!w || !h) return
    if (entering) {
      // The clock starts on the first frame that actually draws, so a stall
      // between scheduling and painting costs the tilt nothing.
      if (!enterStart) enterStart = performance.now()
      const t = Math.min(1, (performance.now() - enterStart) / ENTRANCE_MS)
      const e = easeInOut(t)
      const rest = { ...REST, dist: fit(REST, w / h, w < NARROW) }
      cam = { yaw: lerp(enterFrom.yaw, rest.yaw, e), pitch: lerp(enterFrom.pitch, rest.pitch, e), dist: lerp(enterFrom.dist, rest.dist, e), ty: lerp(enterFrom.ty, rest.ty, e) }
      lift = e
      if (t >= 1) entering = false
      else raf = requestAnimationFrame(draw)
    } else if (settle) {
      const t = Math.min(1, (performance.now() - settle.start) / (settle.full ? SETTLE_MS : HANDOFF_MS))
      const e = easeOut(t)
      const f = settle.from
      if (settle.full) {
        const rest = { ...REST, dist: fit(REST, w / h, w < NARROW) }
        cam = { yaw: lerp(f.yaw, rest.yaw, e), pitch: lerp(f.pitch, rest.pitch, e), dist: lerp(f.dist, rest.dist, e), ty: lerp(f.ty, rest.ty, e) }
      } else {
        cam = { ...cam, dist: lerp(f.dist, fit(cam, w / h, w < NARROW), e), ty: lerp(f.ty, REST.ty, e) }
      }
      lift = lerp(settle.fromLift, 1, e)
      if (t >= 1) settle = null
      else raf = requestAnimationFrame(draw)
    } else if (!waiting) {
      cam = { ...cam, dist: fit(cam, w / h, w < NARROW) }
    }
    mvp = mul(perspective(w / h), view(cam))
    inv = invert(mvp)

    gl.viewport(0, 0, o.canvas.width, o.canvas.height)
    gl.clearColor(colors.paper[0], colors.paper[1], colors.paper[2], 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)

    gl.useProgram(lines)
    gl.uniformMatrix4fv(U.lMVP, false, mvp)
    gl.uniform1f(U.lLift, Math.max(lift, 0.001))
    gl.uniform3fv(U.lColor, colors.rule)
    gl.bindVertexArray(floorL.vao)
    gl.drawArrays(gl.LINES, 0, floorL.count)
    gl.uniform3fv(U.lColor, colors.graphite)
    gl.bindVertexArray(frameL.vao)
    gl.drawArrays(gl.LINES, 0, frameL.count)

    gl.useProgram(surf)
    gl.uniformMatrix4fv(U.sMVP, false, mvp)
    gl.uniform1f(U.sLift, Math.max(lift, 0.001))
    gl.uniform3fv(U.paper, colors.paper)
    gl.uniform3fv(U.wash, colors.wash)
    gl.uniform3fv(U.ink, colors.ink)
    gl.uniform3fv(U.graphite, colors.graphite)
    gl.uniform3fv(U.indigo, colors.indigo)
    const L = [-0.35, 0.85, 0.4], ln = Math.hypot(L[0]!, L[1]!, L[2]!)
    gl.uniform3f(U.light, L[0]! / ln, L[1]! / ln, L[2]! / ln)
    gl.uniform2f(U.probe, probe ? fx(probe.k) : -1, probe ? fy(probe.T) : -1)
    gl.uniform1f(U.probeOn, probe ? 1 : 0)
    gl.bindVertexArray(vao)
    gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0)

    if (probe) {
      const x = wx(probe.k), z = wz(probe.T), y = wy(iv(probe.k, probe.T))
      gl.useProgram(lines)
      gl.uniform1f(U.lLift, Math.max(lift, 0.001))
      gl.uniform3fv(U.lColor, colors.indigo)
      gl.bindBuffer(gl.ARRAY_BUFFER, drop.buf)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array([x, 0, z, x, y, z]))
      gl.bindVertexArray(drop.vao)
      gl.drawArrays(gl.LINES, 0, 2)
    }
    gl.bindVertexArray(null)

    // Labels follow the projection; lifted ones rise with the surface. Any
    // label that would overlap one already placed is dropped for this frame,
    // titles first, so a turned view never prints two labels on each other.
    const narrow = w < NARROW
    const placed: [number, number, number, number][] = []
    for (const l of [...labels].sort((a, b) => a.rank - b.rank)) {
      l.el.hidden = narrow && l.wide
      if (l.el.hidden) continue
      if (!l.w) {
        l.w = l.el.offsetWidth
        l.h = l.el.offsetHeight
      }
      const [x, y, z] = l.at
      const c = apply(mvp, x, l.lifted ? y * lift : y, z)
      const sx = ((c[0] / c[3]) * 0.5 + 0.5) * w
      const sy = (1 - ((c[1] / c[3]) * 0.5 + 0.5)) * h
      const box: [number, number, number, number] = [sx - l.w / 2 - 2, sy - l.h / 2 - 1, sx + l.w / 2 + 2, sy + l.h / 2 + 1]
      const clash = placed.some((b) => box[0] < b[2] && b[0] < box[2] && box[1] < b[3] && b[1] < box[3])
      if (!clash) placed.push(box)
      l.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%)`
      l.el.style.opacity = waiting || clash ? '0' : String(Math.max(0, lift * 2 - 1))
    }
  }

  const request = () => {
    if (!raf && visible && !destroyed) raf = requestAnimationFrame(draw)
  }

  // ── picking ──────────────────────────────────────────────────────────────
  const pick = (clientX: number, clientY: number): Probe | null => {
    if (!inv) return null
    const r = o.canvas.getBoundingClientRect()
    const nx = ((clientX - r.left) / r.width) * 2 - 1
    const ny = 1 - ((clientY - r.top) / r.height) * 2
    const a = apply(inv, nx, ny, -1), b = apply(inv, nx, ny, 1)
    const P0 = [a[0] / a[3], a[1] / a[3], a[2] / a[3]] as const
    const P1 = [b[0] / b[3], b[1] / b[3], b[2] / b[3]] as const
    const at = (t: number) => [P0[0] + (P1[0] - P0[0]) * t, P0[1] + (P1[1] - P0[1]) * t, P0[2] + (P1[2] - P0[2]) * t] as const
    const above = (q: readonly [number, number, number]) => {
      if (Math.abs(q[0]) > XW || Math.abs(q[2]) > ZW) return null
      return q[1] - wy(iv(kOf(q[0]), tOf(q[2]))) * lift
    }
    let prev = 0, prevAbove: number | null = null
    const steps = 400
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const d = above(at(t))
      if (d !== null && prevAbove !== null && prevAbove > 0 && d <= 0) {
        let lo = prev, hi = t
        for (let i = 0; i < 24; i++) {
          const mid = (lo + hi) / 2
          const dm = above(at(mid))
          if (dm !== null && dm > 0) lo = mid
          else hi = mid
        }
        const q = at((lo + hi) / 2)
        return { k: kOf(q[0]), T: tOf(q[2]) }
      }
      if (d !== null) prevAbove = d
      prev = t
    }
    return null
  }

  // ── input ────────────────────────────────────────────────────────────────
  let drag: { id: number; x: number; y: number; moved: number; t: number; type: string } | null = null
  let hoverAt: [number, number] | null = null
  let hoverRaf = 0
  /** Keyboard: instant, like every keyboard action on this figure. */
  const finishEntrance = () => {
    if (entering || waiting || settle) {
      entering = false
      waiting = false
      settle = null
      cam = { ...REST }
      lift = 1
      request()
    }
  }
  /** Pointer: hand over from where the motion is, not from where it was going. */
  const handOff = () => {
    if (!entering && !waiting) return
    settle = { start: performance.now(), from: { ...cam }, fromLift: lift, full: waiting }
    entering = false
    waiting = false
    request()
  }
  const onDown = (e: PointerEvent) => {
    if (drag) return // one pointer at a time: a second finger must not jump the view
    handOff()
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, t: performance.now(), type: e.pointerType }
    o.canvas.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      drag.moved += Math.abs(dx) + Math.abs(dy)
      drag.x = e.clientX
      drag.y = e.clientY
      // While a pre-tilt settle runs, the camera is still arriving; a drag
      // takes effect from the pose it arrives at.
      if (drag.moved > 4 && !settle?.full) {
        cam = {
          ...cam,
          yaw: clampYaw(cam.yaw - dx * 0.008),
          // Touch turns only: vertical drags belong to the page scroll.
          pitch: drag.type === 'touch' ? cam.pitch : Math.min(PITCH_MAX, Math.max(PITCH_MIN, cam.pitch + dy * 0.006)),
        }
        request()
      }
      return
    }
    // At most one pick per frame: pointermove fires faster than the screen
    // refreshes, and each hover is a React render as well as a ray march.
    if (e.pointerType === 'mouse') {
      hoverAt = [e.clientX, e.clientY]
      if (!hoverRaf)
        hoverRaf = requestAnimationFrame(() => {
          hoverRaf = 0
          if (hoverAt && !destroyed) o.onHover(pick(hoverAt[0], hoverAt[1]))
        })
    }
  }
  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return
    const wasClick = drag.moved <= (drag.type === 'touch' ? 8 : 4)
    drag = null
    if (wasClick) {
      const hit = pick(e.clientX, e.clientY)
      if (hit) o.onPick(hit)
    }
  }
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && !drag) {
      hoverAt = null
      o.onHover(null)
    }
  }
  o.canvas.addEventListener('pointerdown', onDown)
  o.canvas.addEventListener('pointermove', onMove)
  o.canvas.addEventListener('pointerup', onUp)
  o.canvas.addEventListener('pointercancel', () => (drag = null))
  o.canvas.addEventListener('pointerleave', onLeave)

  const ro = new ResizeObserver(() => request())
  ro.observe(o.canvas)

  const lost = (e: Event) => {
    e.preventDefault()
    destroyed = true
    o.onLost()
  }
  o.canvas.addEventListener('webglcontextlost', lost)

  // ── start ────────────────────────────────────────────────────────────────
  let begin: (() => void) | null = null
  /** The canvas fades in over the map (240ms), then the tilt waits for an idle
   *  main thread — right after load the page is still hydrating, and a tilt
   *  started then drops most of its middle frames, which is exactly where an
   *  ease-in-out does its moving. */
  const startCountdown = () => {
    if (countdown || !begin) return
    countdown = true
    const go = begin
    window.setTimeout(() => {
      if ('requestIdleCallback' in window) window.requestIdleCallback(go, { timeout: 1200 })
      else go()
    }, 240)
  }

  const { w, h } = size()
  if (o.entrance && w && h) {
    enterFrom = overhead(w / h)
    cam = { ...enterFrom }
    lift = 0
    waiting = true
    draw()
    o.onReady()
    begin = () => {
      if (destroyed || !waiting) return
      waiting = false
      entering = true
      enterStart = 0
      request()
    }
  } else {
    draw()
    o.onReady()
  }

  return {
    setProbe(next) {
      probe = next
      request()
    },
    setColors(c) {
      colors = c
      request()
    },
    setVisible(v) {
      visible = v
      if (v && waiting) startCountdown()
      if (v) request()
    },
    turn(direction) {
      finishEntrance()
      cam = { ...cam, yaw: clampYaw(cam.yaw + direction * (Math.PI / 12)) }
      request()
    },
    reset() {
      finishEntrance()
      cam = { ...REST }
      request()
    },
    destroy() {
      destroyed = true
      if (raf) cancelAnimationFrame(raf)
      if (hoverRaf) cancelAnimationFrame(hoverRaf)
      ro.disconnect()
      o.canvas.removeEventListener('webglcontextlost', lost)
      o.labels.replaceChildren()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
