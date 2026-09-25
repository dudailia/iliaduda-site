/**
 * Where the terrain sits in the world and how it is looked at — shared by the
 * server poster and the live renderer, so the still frame and the first live
 * frame are the same picture.
 *
 * World axes: x across price (bids left, asks right), z across time (now at
 * the front, z = Z_NOW; the past recedes toward −z), y up in depth.
 */

/** Ticks shown across the valley: 64 each side of the window's centre. */
export const VIS = 128
export const XW = 1.35
export const DX = (2 * XW) / VIS
/** World depth of one row (1/12 s). 256 rows ≈ 3.3 units. */
export const DZ = 0.013
export const Z_NOW = 1.25
/** Height of the walls at the reference depth. */
export const H = 0.7
/** Cumulative depth, in shares, drawn at height H; above it the walls keep rising, slower. */
export const REF = 320

/** Height of a wall with `cum` shares between it and the touch. A concave power keeps the thin book near the price legible. */
/** Exponent of the height curve; the shader reads the same constant. */
export const POW = 0.7
export const height = (cum: number) => H * Math.pow(Math.abs(cum) / REF, POW)

export type M4 = Float32Array
export interface Camera {
  yaw: number
  pitch: number
  dist: number
  /** Point looked at. */
  tx: number
  ty: number
  tz: number
}

export const FOV = (34 * Math.PI) / 180
export const REST = { yaw: -0.16, pitch: 0.36, ty: 0.12, tz: -0.25 }

/**
 * Perspective with an optional vertical lens shift (in NDC), so a tall phone
 * frame can sit the terrain lower, between its captions, without tilting the
 * camera.
 */
export function perspective(aspect: number, shift = 0, near = 0.05, far = 40): M4 {
  const f = 1 / Math.tan(FOV / 2)
  const m = new Float32Array(16)
  m[0] = f / aspect
  m[5] = f
  m[9] = -shift
  m[10] = (far + near) / (near - far)
  m[11] = -1
  m[14] = (2 * far * near) / (near - far)
  return m
}

/** The lens shift for a frame of this aspect. */
export const lens = (aspect: number) => (aspect < 1 ? -0.1 : 0)

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

/** Camera position for an orbit about the target. */
export function eye(c: Camera): [number, number, number] {
  const cp = Math.cos(c.pitch)
  return [c.tx + c.dist * cp * Math.sin(c.yaw), c.ty + c.dist * Math.sin(c.pitch), c.tz + c.dist * cp * Math.cos(c.yaw)]
}

export function view(c: Camera): M4 {
  const [ex, ey, ez] = eye(c)
  let fx = c.tx - ex, fy = c.ty - ey, fz = c.tz - ez
  const fl = Math.hypot(fx, fy, fz)
  fx /= fl; fy /= fl; fz /= fl
  // side = f × up(0,1,0)
  let sx = -fz, sz = fx
  const sl = Math.hypot(sx, sz)
  sx /= sl; sz /= sl
  const sy = 0
  // up = side × f
  const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx
  return new Float32Array([
    sx, ux, -fx, 0,
    sy, uy, -fy, 0,
    sz, uz, -fz, 0,
    -(sx * ex + sy * ey + sz * ez), -(ux * ex + uy * ey + uz * ez), fx * ex + fy * ey + fz * ez, 1,
  ])
}

export function apply(m: M4, x: number, y: number, z: number): [number, number, number, number] {
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
    m[3]! * x + m[7]! * y + m[11]! * z + m[15]!,
  ]
}

/** Screen position in CSS pixels (origin top-left) of a world point, or null behind the camera. */
export function toScreen(m: M4, w: number, h: number, x: number, y: number, z: number): [number, number] | null {
  const q = apply(m, x, y, z)
  if (q[3] <= 0) return null
  return [((q[0] / q[3]) * 0.5 + 0.5) * w, (1 - ((q[1] / q[3]) * 0.5 + 0.5)) * h]
}

/**
 * The distance at which the terrain fills the frame for this aspect. On a
 * wide screen the whole valley and ~12 s of history fit; on a tall phone the
 * camera comes in so the walls near the price fill the width instead of a
 * postage stamp of all 128 ticks.
 */
export function fit(yaw: number, pitch: number, aspect: number): Camera {
  const narrow = aspect < 1
  const xw = narrow ? XW * 0.44 : XW
  const back = Z_NOW - (narrow ? 1.5 : 2.2)
  const pts: [number, number, number][] = []
  for (const x of [-xw, xw]) for (const z of [Z_NOW, back]) pts.push([x, 0, z], [x, H, z])
  const base = { yaw, pitch, tx: 0, ty: REST.ty, tz: narrow ? REST.tz + 0.3 : REST.tz }
  let lo = 0.5, hi = 20
  for (let i = 0; i < 24; i++) {
    const d = (lo + hi) / 2
    const c = { ...base, dist: d }
    const m = mul(perspective(aspect), view(c))
    const inside = pts.every(([x, y, z]) => {
      const q = apply(m, x, y, z)
      return q[3] > 0 && Math.abs(q[0] / q[3]) <= (narrow ? 1.0 : 0.94) && Math.abs(q[1] / q[3]) <= (narrow ? 0.62 : 0.68)
    })
    if (inside) hi = d
    else lo = d
  }
  return { ...base, dist: hi }
}

export function invert(a: M4): M4 | null {
  const inv = new Float32Array(16)
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
