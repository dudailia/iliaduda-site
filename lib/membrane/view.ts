import { besselJ } from './bessel'
import type { Expansion } from './expand'

/**
 * How the drum is seen: a polar mesh over the unit disc, the camera, and the membrane's height on the mesh at any
 * moment. Pure, shared by the live renderer, the server's poster, the still frame and the Contents' miniature, so all
 * four draw the same drum from the same point of view.
 *
 * World: the drum lies in the x–z plane, radius 1, centred at the origin; height is y.
 */

export type V3 = [number, number, number]
export type M4 = Float32Array

/** How many modes of each kind the reader may keep, how many the figure opens with, and the exercises' two terms. */
export const MODES_MAX = 20
export const MODES_START = 4
export const MODES_EXERCISE = 2

/** The mesh: rings out from the centre and spokes round it (the centre is one vertex). */
export const RINGS = 40
export const SPOKES = 96

/** The tallest the drum's surface is drawn, as a share of its radius: every shape is scaled to it. */
export const PEAK = 0.42

/**
 * Model time per second of the reader's: the fundamental of the axisymmetric drum (λ ≈ 2.40) then rings about every
 * four seconds, and the higher modes visibly faster, as the drum's own inharmonic spectrum has them.
 */
export const TEMPO = 0.62

const FOV = (32 * Math.PI) / 180

export function perspective(aspect: number, near = 0.05, far = 20): M4 {
  const f = 1 / Math.tan(FOV / 2)
  const m = new Float32Array(16)
  m[0] = f / aspect
  m[5] = f
  m[10] = (far + near) / (near - far)
  m[11] = -1
  m[14] = (2 * far * near) / (near - far)
  return m
}

export function lookAt(e: V3, t: V3): M4 {
  let zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2]
  let l = Math.hypot(zx, zy, zz)
  zx /= l
  zy /= l
  zz /= l
  let xx = zz, xz = -zx
  l = Math.hypot(xx, xz) || 1
  xx /= l
  xz /= l
  const yx = zy * xz, yy = zz * xx - zx * xz, yz = -zy * xx
  return new Float32Array([
    xx, yx, zx, 0,
    0, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * e[0] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1,
  ])
}

export function mul(a: M4, b: M4): M4 {
  const o = new Float32Array(16)
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!
      o[c * 4 + r] = s
    }
  return o
}

/** Clip-space x and y after the divide. */
export function project(m: M4, x: number, y: number, z: number): [number, number] {
  const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!
  return [(m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w, (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w]
}

/** The resting view: three-quarters, looking down on the drum, which fills the stage. `yaw` and `pitch` add to it. */
export const REST = { yaw: 0.62, pitch: 0.5, dist: 3.15 } as const

export function camera(aspect: number, yaw = 0, pitch = 0): { mvp: M4; eye: V3 } {
  const y = REST.yaw + yaw
  const p = Math.min(1.3, Math.max(0.2, REST.pitch + pitch))
  // A tall stage (a phone) stands further back, so the whole rim stays in it.
  const d = REST.dist * Math.max(1, 1.25 / aspect)
  const eye: V3 = [d * Math.sin(y) * Math.cos(p), d * Math.sin(p), d * Math.cos(y) * Math.cos(p)]
  return { mvp: mul(perspective(aspect), lookAt(eye, [0, -0.04, 0])), eye }
}

/** The slow drift at rest, `t` seconds in: two sines in yaw and one in pitch, at periods that never line up. */
export function drift(t: number): { yaw: number; pitch: number } {
  return {
    yaw: 0.16 * Math.sin((2 * Math.PI * t) / 47) + 0.05 * Math.sin((2 * Math.PI * t) / 19),
    pitch: 0.05 * Math.sin((2 * Math.PI * t) / 31),
  }
}

// ── the membrane on the mesh ────────────────────────────────────────────────────────────────────────────────────────

/** Radius of ring i (0 is the centre, RINGS the rim). */
export const ringR = (i: number) => i / RINGS
/** Angle of spoke j. */
export const spokeA = (j: number) => (2 * Math.PI * j) / SPOKES

/**
 * Everything a frame needs that does not depend on time: Jₙ(λₘ rᵢ) on every ring, the angular factor on every spoke,
 * and the scale that brings the shape to PEAK. Computed once per shape and mode count.
 */
export interface Table {
  readonly e: Expansion
  readonly radial: Float64Array // modes × (RINGS + 1)
  readonly angular: Float64Array // SPOKES
  readonly scale: number
}

export function table(e: Expansion): Table {
  const M = e.lambda.length
  const radial = new Float64Array(M * (RINGS + 1))
  for (let m = 0; m < M; m++) for (let i = 0; i <= RINGS; i++) radial[m * (RINGS + 1) + i] = besselJ(e.order, e.lambda[m]! * ringR(i))
  const angular = new Float64Array(SPOKES)
  for (let j = 0; j < SPOKES; j++) {
    const a = spokeA(j)
    angular[j] = e.order === 0 ? 1 : e.shape.trig === 'cos' ? Math.cos(e.order * a) : Math.sin(e.order * a)
  }
  // The scale: the largest the drum gets over one period of its fundamental, sampled.
  let peak = 0
  const prof = new Float64Array(RINGS + 1)
  const period = (2 * Math.PI) / e.lambda[0]!
  for (let s = 0; s <= 24; s++) {
    profile({ e, radial, angular, scale: 1 }, (s / 24) * period, prof)
    for (let i = 0; i <= RINGS; i++) peak = Math.max(peak, Math.abs(prof[i]!))
  }
  return { e, radial, angular, scale: peak > 0 ? PEAK / peak : 1 }
}

/** The radial profile at time t, ring by ring, scaled (before the angular factor). */
export function profile(tb: Table, t: number, out: Float64Array): Float64Array {
  const { e, radial } = tb
  out.fill(0)
  for (let m = 0; m < e.lambda.length; m++) {
    const l = e.lambda[m]!
    const k = (e.A[m]! * Math.cos(l * t) + e.B[m]! * Math.sin(l * t)) * tb.scale
    if (k === 0) continue
    const row = m * (RINGS + 1)
    for (let i = 0; i <= RINGS; i++) out[i] = out[i]! + k * radial[row + i]!
  }
  return out
}

/** The drum's surface points at time t, scaled by `rise` (0 flat, 1 the shape), into `out` as x, y, z per vertex. */
export function surface(tb: Table, t: number, rise: number, out: Float32Array, prof = new Float64Array(RINGS + 1)): Float32Array {
  profile(tb, t, prof)
  let k = 0
  // The centre: one vertex (a nonzero order has no height there).
  out[k++] = 0
  out[k++] = prof[0]! * (tb.e.order === 0 ? 1 : 0) * rise
  out[k++] = 0
  for (let i = 1; i <= RINGS; i++) {
    const r = ringR(i)
    for (let j = 0; j < SPOKES; j++) {
      const a = spokeA(j)
      out[k++] = r * Math.cos(a)
      out[k++] = prof[i]! * tb.angular[j]! * rise
      out[k++] = r * Math.sin(a)
    }
  }
  return out
}

export const VERTS = 1 + RINGS * SPOKES

/** The mesh's triangles: a fan round the centre, then quads between rings. */
export function indices(): Uint16Array {
  const out: number[] = []
  const v = (i: number, j: number) => (i === 0 ? 0 : 1 + (i - 1) * SPOKES + (j % SPOKES))
  for (let j = 0; j < SPOKES; j++) out.push(0, v(1, j), v(1, j + 1))
  for (let i = 1; i < RINGS; i++)
    for (let j = 0; j < SPOKES; j++) {
      const a = v(i, j), b = v(i, j + 1), c = v(i + 1, j), d = v(i + 1, j + 1)
      out.push(a, c, b, b, c, d)
    }
  return new Uint16Array(out)
}

/**
 * The drum as a wireframe in a box of w × h: rings every `ringStep`-th (every fourth; the miniature thins them),
 * spokes every sixth, the rim, projected through the resting camera, and for every ring point whether it is on the
 * drum's far half, away from the camera (a still frame draws that half quieter, so the rings do not tangle). For the
 * server's poster, the still frame and the miniature.
 */
export function wire(
  tb: Table,
  t: number,
  rise: number,
  w: number,
  h: number,
  yaw = 0,
  ringStep = 4,
): { rings: [number, number][][]; far: boolean[][]; spokes: [number, number][][]; rim: [number, number][] } {
  const { mvp, eye } = camera(w / h, yaw)
  const prof = profile(tb, t, new Float64Array(RINGS + 1))
  const at = (i: number, a: number): [number, number] => {
    const r = ringR(i)
    const ang = tb.e.order === 0 ? 1 : tb.e.shape.trig === 'cos' ? Math.cos(tb.e.order * a) : Math.sin(tb.e.order * a)
    const y = (i === 0 && tb.e.order !== 0 ? 0 : prof[i]! * ang) * rise
    const [cx, cy] = project(mvp, r * Math.cos(a), y, r * Math.sin(a))
    return [(cx * 0.5 + 0.5) * w, (1 - (cy * 0.5 + 0.5)) * h]
  }
  const rings: [number, number][][] = []
  const far: boolean[][] = []
  const behind = Array.from({ length: SPOKES + 1 }, (_, j) => Math.cos(spokeA(j)) * eye[0] + Math.sin(spokeA(j)) * eye[2] < 0)
  for (let i = ringStep; i < RINGS; i += ringStep) {
    rings.push(Array.from({ length: SPOKES + 1 }, (_, j) => at(i, spokeA(j))))
    far.push(behind)
  }
  const spokes: [number, number][][] = []
  for (let j = 0; j < SPOKES; j += 6) spokes.push(Array.from({ length: RINGS + 1 }, (_, i) => at(i, spokeA(j))))
  const rim = Array.from({ length: SPOKES + 1 }, (_, j) => at(RINGS, spokeA(j)))
  return { rings, far, spokes, rim }
}
