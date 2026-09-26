import { MODEL } from './mc'
import { FRAME, LABELS, X0, X1, wy } from './world'

/**
 * The camera, as pure maths the renderer and the tests share: projection and
 * view matrices and the five poses of the optional flythrough. The clock that
 * flies it is lib/futures/flight.ts, kept apart so the figure's island, which
 * ships with the page, doesn't carry the camera the lazy renderer needs.
 *
 * The composed frame — what the figure rests on, and what the server's poster
 * draws — is the first pose. The flythrough leaves it only when the reader
 * presses Fly through, and comes back by itself.
 */

export type V3 = [number, number, number]
export type M4 = Float32Array

const FOV = (34 * Math.PI) / 180
const TAN = Math.tan(FOV / 2)

export function perspective(aspect: number, near: number, far: number): M4 {
  const f = 1 / TAN
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
  zx /= l; zy /= l; zz /= l
  // x = up × z, up = (0, 1, 0)
  let xx = zz, xz = -zx
  l = Math.hypot(xx, xz) || 1
  xx /= l; xz /= l
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

/** Clip-space x and y after the divide, and w (≤ 0 means behind the camera). */
export function project(m: M4, x: number, y: number, z: number): [number, number, number] {
  const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!
  return [(m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w, (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w, w]
}

/** Camera distance that fits a world rectangle on z = 0, looking straight at it. */
const fitDist = (hw: number, hh: number, aspect: number) => Math.max(hh / TAN, hw / (TAN * aspect))

const orbit = (t: V3, d: number, yaw: number, pitch: number): V3 => [
  t[0] + d * Math.sin(yaw) * Math.cos(pitch),
  t[1] + d * Math.sin(pitch),
  t[2] + d * Math.cos(yaw) * Math.cos(pitch),
]

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/**
 * The flight, as five poses: the side-on fan the poster shows; a turn to
 * three-quarters so the cone reads as depth; up behind today, looking down
 * the time axis; lower, with the futures opening ahead; out to face the
 * expiry plane and its histogram.
 *
 * The lab's version plunged the camera into the cloud at 0.4–0.58 and lost
 * every anchor — a hairball. Here the camera stays behind today, so today's
 * price is in frame until the turn to expiry, and the expiry axis is in frame
 * from then on (tests/futures-flight.test.ts holds both at three aspects).
 */
export function keys(aspect: number): { at: number; eye: V3; target: V3 }[] {
  const cx = (FRAME.x0 + FRAME.x1) / 2, cy = (FRAME.y0 + FRAME.y1) / 2
  const hh = (FRAME.y1 - FRAME.y0) / 2
  const y0 = wy(MODEL.s0)
  // The first pose fills FRAME exactly (see `stretch`), so it is fitted on height.
  const d0 = hh / TAN
  // Aimed left of centre: the orbit swings today toward the edge, and this keeps it in.
  const t1: V3 = [X0 + 1.2, cy - 0.05, 0]
  const e4x0 = X1 - 0.95, e4x1 = LABELS.strike.x + 0.2
  const t4: V3 = [(e4x0 + e4x1) / 2, cy, 0]
  const d4 = fitDist((e4x1 - e4x0) / 2, hh, aspect)
  return [
    { at: 0.02, eye: [cx, cy, d0], target: [cx, cy, 0] },
    { at: 0.2, eye: orbit(t1, fitDist(1.9, hh, aspect) * 0.95, -0.6, 0.28), target: t1 },
    { at: 0.4, eye: [X0 - 2.1, y0 + 1.0, 1.3], target: [X0 + 0.9, y0 + 0.1, 0] },
    { at: 0.62, eye: [X0 - 1.8, y0 + 0.3, 0.45], target: [(X0 + X1) / 2, y0, 0] },
    { at: 0.78, eye: orbit(t4, d4, -0.2, 0.05), target: t4 },
  ]
}

/**
 * Horizontal stretch of the projection. At the first pose FRAME fills the box
 * exactly, as the poster does; it relaxes to a true aspect as the camera
 * turns away, and stays true for the rest of the flight.
 */
export function stretch(p: number, aspect: number): number {
  const frameAspect = (FRAME.x1 - FRAME.x0) / (FRAME.y1 - FRAME.y0)
  return 1 + (aspect / frameAspect - 1) * (1 - smooth(0.02, 0.2, p))
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t, t3 = t2 * t
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}

export function pose(p: number, aspect: number): { eye: V3; target: V3 } {
  const k = keys(aspect)
  if (p <= k[0]!.at) return k[0]!
  const last = k[k.length - 1]!
  if (p >= last.at) return last
  let i = 0
  while (p > k[i + 1]!.at) i++
  const t = (p - k[i]!.at) / (k[i + 1]!.at - k[i]!.at)
  const a = k[Math.max(0, i - 1)]!, b = k[i]!, c = k[i + 1]!, d = k[Math.min(k.length - 1, i + 2)]!
  const f = (sel: 'eye' | 'target') => [0, 1, 2].map((j) => catmull(a[sel][j]!, b[sel][j]!, c[sel][j]!, d[sel][j]!, t)) as V3
  return { eye: f('eye'), target: f('target') }
}

/** The whole camera at flight progress `p`: projection (with the opening stretch) times view. */
export function viewProjection(p: number, aspect: number): M4 {
  const { eye, target } = pose(p, aspect)
  const proj = perspective(aspect, 0.02, 40)
  proj[0] = proj[0]! * stretch(p, aspect)
  return mul(proj, lookAt(eye, target))
}
