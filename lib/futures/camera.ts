import { AXIS, FRAME, HLEN, HX0, X0, X1, priceOfY, wy } from './world'

/**
 * The camera, as pure maths the renderer and the tests share: projection and
 * view matrices; the composed frame, which the server's poster draws; the
 * resting three-quarter view the figure settles into, with its drift and the
 * reader's parallax; and Fly through. The clock that flies it is
 * lib/futures/flight.ts, kept apart so the figure's island, which ships with
 * the page, doesn't carry the camera the lazy renderer needs.
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

/** The composed frame's camera: looking straight at FRAME, fitted on its height (see `stretch`). */
function frameEye(): { eye: V3; target: V3 } {
  const cx = (FRAME.x0 + FRAME.x1) / 2, cy = (FRAME.y0 + FRAME.y1) / 2
  const hh = (FRAME.y1 - FRAME.y0) / 2
  return { eye: [cx, cy, hh / TAN], target: [cx, cy, 0] }
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

// ── The camera of the three-dimensional figure ──────────────────────────────
//
// A pose is an eye, a target, a field of view and a horizontal stretch (1 is a
// true aspect; the composed frame stretches so the poster's rectangle fills
// the box exactly). Poses are blended in spherical coordinates about their
// targets, so a move between two of them swings around the scene instead of
// cutting through it.

export interface Pose {
  eye: V3
  target: V3
  stretch: number
  /** Vertical field of view, radians. */
  fov: number
}

const FOV_FRAME = FOV
const FOV_REST = (38 * Math.PI) / 180

/** Half-depth of the expiry wall: the widest lane at expiry is about ±0.7. */
export const ZWALL = 0.78
/** Half-depth of a histogram bar: a thin slab, standing out from the wall; deeper, the bars read as one block. */
export const BAR_D = 0.035

/** What the resting view must hold: today, the expiry wall, the bars at full length, and the fan at its widest mid-way. */
export const SCENE: readonly V3[] = [
  [X0, 0, 0],
  [X1, wy(AXIS.lo), -ZWALL], [X1, wy(AXIS.lo), ZWALL], [X1, wy(AXIS.hi), -ZWALL], [X1, wy(AXIS.hi), ZWALL],
  [HX0 + HLEN, wy(AXIS.lo), -BAR_D], [HX0 + HLEN, wy(AXIS.lo), BAR_D], [HX0 + HLEN, wy(AXIS.hi), -BAR_D], [HX0 + HLEN, wy(AXIS.hi), BAR_D],
  [0, wy(190), -0.5], [0, wy(190), 0.5], [0, wy(50), -0.5], [0, wy(50), 0.5],
]

/** The expiry wall and the bars at full length: what the flight's last view must hold. */
const WALL: readonly V3[] = SCENE.slice(1, 9)

/** The whole camera for a pose: projection (with its stretch) times view. */
export function viewProjection(a: Pose, aspect: number): M4 {
  const proj = perspectiveFov(a.fov, aspect, 0.02, 60)
  proj[0] = proj[0]! * a.stretch
  return mul(proj, lookAt(a.eye, a.target))
}

function perspectiveFov(fov: number, aspect: number, near: number, far: number): M4 {
  const m = perspective(aspect, near, far)
  const k = TAN / Math.tan(fov / 2)
  m[0] = m[0]! * k
  m[5] = m[5]! * k
  return m
}

/** The composed frame: the poster's rectangle, filling the box at any aspect. */
export function framePose(aspect: number): Pose {
  const k = frameEye()
  return { eye: k.eye, target: k.target, stretch: stretch(0, aspect), fov: FOV_FRAME }
}

interface Sph {
  target: V3
  dist: number
  yaw: number
  pitch: number
  stretch: number
  fov: number
}
const toSph = (p: Pose): Sph => {
  const dx = p.eye[0] - p.target[0], dy = p.eye[1] - p.target[1], dz = p.eye[2] - p.target[2]
  const dist = Math.hypot(dx, dy, dz)
  return { target: p.target, dist, yaw: Math.atan2(dx, dz), pitch: Math.asin(dy / dist), stretch: p.stretch, fov: p.fov }
}
const fromSph = (s: Sph): Pose => ({ eye: orbit(s.target, s.dist, s.yaw, s.pitch), target: s.target, stretch: s.stretch, fov: s.fov })
const lerp = (a: number, b: number, u: number) => a + (b - a) * u

/** A pose between a and b: target and angles straight, distance by ratio, so the eye arcs around the scene. */
export function blend(a: Pose, b: Pose, u: number): Pose {
  if (u <= 0) return a
  if (u >= 1) return b
  const A = toSph(a), B = toSph(b)
  let dyaw = B.yaw - A.yaw
  if (dyaw > Math.PI) dyaw -= 2 * Math.PI
  if (dyaw < -Math.PI) dyaw += 2 * Math.PI
  return fromSph({
    target: [lerp(A.target[0], B.target[0], u), lerp(A.target[1], B.target[1], u), lerp(A.target[2], B.target[2], u)],
    dist: A.dist * (B.dist / A.dist) ** u,
    yaw: A.yaw + dyaw * u,
    pitch: lerp(A.pitch, B.pitch, u),
    stretch: lerp(A.stretch, B.stretch, u),
    fov: lerp(A.fov, B.fov, u),
  })
}

/** How fast a camera is moving, in the coordinates `blend` moves it in, per second: distance as a log-rate. */
export interface Drift {
  target: V3
  dist: number
  yaw: number
  pitch: number
  stretch: number
  fov: number
}

/** The rate a camera moved at between two poses a frame apart. */
export function driftOf(a: Pose, b: Pose, dt: number): Drift {
  const A = toSph(a), B = toSph(b)
  let dyaw = B.yaw - A.yaw
  if (dyaw > Math.PI) dyaw -= 2 * Math.PI
  if (dyaw < -Math.PI) dyaw += 2 * Math.PI
  const k = 1 / Math.max(1e-4, dt)
  return {
    target: [(B.target[0] - A.target[0]) * k, (B.target[1] - A.target[1]) * k, (B.target[2] - A.target[2]) * k],
    dist: Math.log(B.dist / A.dist) * k,
    yaw: dyaw * k,
    pitch: (B.pitch - A.pitch) * k,
    stretch: (B.stretch - A.stretch) * k,
    fov: (B.fov - A.fov) * k,
  }
}

/** A pose carried `t` seconds along a drift. */
export function along(p: Pose, d: Drift, t: number): Pose {
  if (t === 0) return p
  const P = toSph(p)
  return fromSph({
    target: [P.target[0] + d.target[0] * t, P.target[1] + d.target[1] * t, P.target[2] + d.target[2] * t],
    dist: P.dist * Math.exp(d.dist * t),
    yaw: P.yaw + d.yaw * t,
    pitch: P.pitch + d.pitch * t,
    stretch: P.stretch + d.stretch * t,
    fov: P.fov + d.fov * t,
  })
}

/** The widest a set of points reaches, in clip space, from a pose; Infinity if any is behind the eye. */
function reach(pose: Pose, aspect: number, pts: readonly V3[]): { worst: number; cx: number; cy: number } {
  const m = viewProjection(pose, aspect)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const p of pts) {
    const [x, y, w] = project(m, p[0], p[1], p[2])
    if (w <= 0.05) return { worst: Infinity, cx: 0, cy: 0 }
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
  }
  return { worst: Math.max(-x0, x1, -y0, y1), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }
}

/**
 * The closest eye, looking from (yaw, pitch), that holds `pts` inside ±limit,
 * with the target moved so they sit centred. Found by bisection on distance,
 * then a nudge of the target by what is left off-centre, twice over.
 */
function fit(yaw: number, pitch: number, target: V3, aspect: number, pts: readonly V3[], limit: number, fov: number): Pose {
  let t: V3 = [...target]
  let pose: Pose = { eye: orbit(t, 10, yaw, pitch), target: t, stretch: 1, fov }
  for (let pass = 0; pass < 3; pass++) {
    let lo = 0.5, hi = 60
    for (let i = 0; i < 44; i++) {
      const mid = (lo + hi) / 2
      if (reach({ eye: orbit(t, mid, yaw, pitch), target: t, stretch: 1, fov }, aspect, pts).worst <= limit) hi = mid
      else lo = mid
    }
    pose = { eye: orbit(t, hi, yaw, pitch), target: t, stretch: 1, fov }
    const { cx, cy } = reach(pose, aspect, pts)
    // Right and up of the camera, and how much world one unit of clip space is at the target's depth.
    const f = [t[0] - pose.eye[0], t[1] - pose.eye[1], t[2] - pose.eye[2]]
    const fl = Math.hypot(f[0]!, f[1]!, f[2]!)
    const r = [-f[2]! / fl, 0, f[0]! / fl]
    const rl = Math.hypot(r[0]!, r[2]!) || 1
    const right: V3 = [r[0]! / rl, 0, r[2]! / rl]
    const up: V3 = [
      right[1] * (f[2]! / fl) - right[2] * (f[1]! / fl),
      right[2] * (f[0]! / fl) - right[0] * (f[2]! / fl),
      right[0] * (f[1]! / fl) - right[1] * (f[0]! / fl),
    ]
    const hy = hi * Math.tan(fov / 2), hx = hy * aspect
    t = [t[0] + right[0] * cx * hx + up[0] * cy * hy, t[1] + right[1] * cx * hx + up[1] * cy * hy, t[2] + right[2] * cx * hx + up[2] * cy * hy]
  }
  let lo = 0.5, hi = 60
  for (let i = 0; i < 44; i++) {
    const mid = (lo + hi) / 2
    if (reach({ eye: orbit(t, mid, yaw, pitch), target: t, stretch: 1, fov }, aspect, pts).worst <= limit) hi = mid
    else lo = mid
  }
  return { eye: orbit(t, hi, yaw, pitch), target: t, stretch: 1, fov }
}

/**
 * The resting view's direction. A wide stage looks across the fan; a tall one
 * (a phone) turns further toward the time axis and looks down more, so the
 * futures run from today at the bottom corner up to the wall, and the scene
 * fills the stage's height as well as its width.
 */
const restDir = (aspect: number) => {
  const k = smooth(0.6, 1.8, aspect)
  const tall = 1 - smooth(0.7, 1.05, aspect)
  return { yaw: -0.8 + 0.4 * k - 0.3 * tall, pitch: 0.56 - 0.36 * k + 0.14 * tall }
}

/**
 * The fitted view, raised in its frame by whatever height it has to spare, up
 * to `lift` of clip space: on a laptop the stage runs past the first screen,
 * and what is high in it is what is seen.
 */
function raise(pose: Pose, aspect: number, pts: readonly V3[], limit: number, lift: number): Pose {
  const m = viewProjection(pose, aspect)
  let y0 = Infinity, y1 = -Infinity
  for (const p of pts) {
    const y = project(m, p[0], p[1], p[2])[1]
    y0 = Math.min(y0, y)
    y1 = Math.max(y1, y)
  }
  const by = Math.min(lift, limit - y1)
  if (!(by > 1e-4)) return pose
  // Moving the camera down (eye and target together, along its own up) moves the picture up.
  const f = [pose.target[0] - pose.eye[0], pose.target[1] - pose.eye[1], pose.target[2] - pose.eye[2]]
  const fl = Math.hypot(f[0]!, f[1]!, f[2]!)
  const rl = Math.hypot(f[0]!, f[2]!) || 1
  const right = [-f[2]! / rl, 0, f[0]! / rl]
  const up = [right[1]! * (f[2]! / fl) - right[2]! * (f[1]! / fl), right[2]! * (f[0]! / fl) - right[0]! * (f[2]! / fl), right[0]! * (f[1]! / fl) - right[1]! * (f[0]! / fl)]
  const d = fl * Math.tan(pose.fov / 2) * by
  const move = (v: V3): V3 => [v[0] - up[0]! * d, v[1] - up[1]! * d, v[2] - up[2]! * d]
  return { ...pose, eye: move(pose.eye), target: move(pose.target) }
}

const restCache = new Map<number, Pose>()
function restBase(aspect: number): Pose {
  const key = Math.round(aspect * 1000) / 1000
  let p = restCache.get(key)
  if (!p) {
    const { yaw, pitch } = restDir(key)
    // 0.8, not the tests' 0.88: the drift and the lean need the rest. A phone's gentler parallax gives back a little
    // (0.83); its view along the time axis puts today and the wall in opposite corners, where a turn tells most, and
    // takes more (0.78).
    const limit = 0.8 + 0.03 * (1 - smooth(0.6, 1.2, key)) - 0.05 * (1 - smooth(0.7, 1.05, key))
    p = raise(fit(yaw, pitch, [0.45, 0.35, 0], key, SCENE, limit, FOV_REST), key, SCENE, limit, 0.07)
    if (restCache.size > 64) restCache.clear()
    restCache.set(key, p)
  }
  return p
}

export interface Offsets {
  yaw: number
  pitch: number
  dolly: number
}
const ZERO: Offsets = { yaw: 0, pitch: 0, dolly: 0 }

/**
 * The slow drift at rest, `t` seconds in: two sines each in yaw and pitch at
 * periods that never line up (53, 23, 41 and 17 s) and a breath of distance
 * (67 s), so the view is never still and never repeats within a minute.
 */
export function driftAt(t: number): Offsets {
  const w = (period: number, phase = 0) => Math.sin((2 * Math.PI * t) / period + phase)
  return {
    yaw: 0.075 * w(53) + 0.025 * w(23, 1.3),
    pitch: 0.035 * w(41, 0.7) + 0.012 * w(17),
    dolly: 0.03 * w(67, 2.1),
  }
}

/** The resting view, with the drift and the reader's parallax (x and y in −1…1) added about its target. */
export function restPose(aspect: number, drift: Offsets = ZERO, parallax: { x: number; y: number } = { x: 0, y: 0 }): Pose {
  const s = toSph(restBase(aspect))
  // A phone's narrow stage has the least room to lean in: its parallax is gentler.
  const lean = 0.65 + 0.35 * smooth(0.6, 1.2, aspect)
  return fromSph({
    ...s,
    // Enough to feel the depth move with the hand, little enough that the labels riding it stay under the reader's eye.
    yaw: s.yaw + drift.yaw + 0.07 * lean * parallax.x,
    pitch: s.pitch + drift.pitch + 0.045 * lean * parallax.y,
    dist: s.dist * (1 + drift.dolly),
  })
}

const endCache = new Map<number, Pose>()
/** Fly through's last view: the expiry wall and its bars, three-quarters on from the left and a little above, so the bars keep their depth, all of them in frame. */
export function endPose(aspect: number): Pose {
  const key = Math.round(aspect * 1000) / 1000
  let p = endCache.get(key)
  if (!p) {
    p = fit(-0.45, 0.22, [(X1 + HX0 + HLEN) / 2, wy((AXIS.lo + AXIS.hi) / 2), 0], key, WALL, 0.84, FOV_REST)
    if (endCache.size > 64) endCache.clear()
    endCache.set(key, p)
  }
  return p
}

/**
 * Fly through, at progress p (0…1) from `start`: down behind today, looking
 * along the time axis with the futures opening ahead; alongside the fan; out
 * to the wall. A cubic Hermite through the keys, with Catmull–Rom tangents
 * inside and none at the ends, so the camera eases out of rest and settles
 * into the wall's view instead of arriving at speed. From 0.8 on it holds
 * that view, where the histogram becomes the payoff.
 */
export function flightPose(p: number, aspect: number, start: Pose): Pose {
  if (p <= 0) return start
  const end = endPose(aspect)
  if (p >= 0.8) return end
  // Alongside the fan, a phone's narrow stage stands further off, so the futures do not fill it from edge to edge.
  const back = 1 + 0.7 * (1 - smooth(0.6, 1.2, aspect))
  const t2: V3 = [X1 - 0.35, 0.1, 0]
  const e2: V3 = [t2[0] + (-0.2 - t2[0]) * back, t2[1] + (0.6 - t2[1]) * back, t2[2] + 1.6 * back]
  const k: { at: number; pose: Pose }[] = [
    { at: 0, pose: start },
    { at: 0.28, pose: { eye: [X0 - 1.25, 0.32, 0.55], target: [X0 + 2.0, -0.02, -0.25], stretch: 1, fov: FOV_REST } },
    { at: 0.56, pose: { eye: e2, target: t2, stretch: 1, fov: FOV_REST } },
    { at: 0.8, pose: end },
  ]
  let i = 0
  while (p > k[i + 1]!.at) i++
  const a = k[i]!, b = k[i + 1]!
  const h = b.at - a.at
  const u = (p - a.at) / h
  const u2 = u * u, u3 = u2 * u
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2
  // The slope at key j, per unit of p: none at the first and last keys; at the first inner key, toward the next key
  // only, so wherever the rest was, the flight from behind today on is the same path.
  const slope = (j: number, sel: 'eye' | 'target', c: number) =>
    j === 0 || j === k.length - 1
      ? 0
      : j === 1
        ? (k[2]!.pose[sel][c]! - k[1]!.pose[sel][c]!) / (k[2]!.at - k[1]!.at)
        : (k[j + 1]!.pose[sel][c]! - k[j - 1]!.pose[sel][c]!) / (k[j + 1]!.at - k[j - 1]!.at)
  const at = (sel: 'eye' | 'target') =>
    [0, 1, 2].map((c) => h00 * a.pose[sel][c]! + h10 * h * slope(i, sel, c) + h01 * b.pose[sel][c]! + h11 * h * slope(i + 1, sel, c)) as V3
  return { eye: at('eye'), target: at('target'), stretch: lerp(a.pose.stretch, b.pose.stretch, u), fov: lerp(a.pose.fov, b.pose.fov, u) }
}

/** The inverse of a column-major 4×4, by cofactors; null if it has none. */
function invert(m: M4): number[] | null {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m as unknown as number[]
  const b00 = a00! * a11! - a01! * a10!, b01 = a00! * a12! - a02! * a10!, b02 = a00! * a13! - a03! * a10!
  const b03 = a01! * a12! - a02! * a11!, b04 = a01! * a13! - a03! * a11!, b05 = a02! * a13! - a03! * a12!
  const b06 = a20! * a31! - a21! * a30!, b07 = a20! * a32! - a22! * a30!, b08 = a20! * a33! - a23! * a30!
  const b09 = a21! * a32! - a22! * a31!, b10 = a21! * a33! - a23! * a31!, b11 = a22! * a33! - a23! * a32!
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
  if (!det) return null
  const k = 1 / det
  return [
    (a11! * b11 - a12! * b10 + a13! * b09) * k, (a02! * b10 - a01! * b11 - a03! * b09) * k, (a31! * b05 - a32! * b04 + a33! * b03) * k, (a22! * b04 - a21! * b05 - a23! * b03) * k,
    (a12! * b08 - a10! * b11 - a13! * b07) * k, (a00! * b11 - a02! * b08 + a03! * b07) * k, (a32! * b02 - a30! * b05 - a33! * b01) * k, (a20! * b05 - a22! * b02 + a23! * b01) * k,
    (a10! * b10 - a11! * b08 + a13! * b06) * k, (a01! * b08 - a00! * b10 - a03! * b06) * k, (a30! * b04 - a31! * b02 + a33! * b00) * k, (a21! * b02 - a20! * b04 - a23! * b00) * k,
    (a11! * b07 - a10! * b09 - a12! * b06) * k, (a00! * b09 - a01! * b07 + a02! * b06) * k, (a31! * b01 - a30! * b03 - a32! * b00) * k, (a20! * b03 - a21! * b01 + a22! * b00) * k,
  ]
}

/**
 * The price under a point of the screen (clip-space x and y) for a reader
 * picking a strike. At rest the expiry wall faces the camera, and everything
 * drawn on it — the price scale at its front edge, the strike's line across
 * it, the bars' base — sits on the plane x = X1, where height is price at any
 * depth: so the pick is where the ray through the pointer meets that plane.
 * In the composed frame the wall is seen edge-on and has no face to hit; there
 * the price is read off the height of the scale, at depth `zFront`, where the
 * scale is drawn. Between the two (the swing into depth) the picks blend, and
 * both agree on the scale itself.
 */
export function wallPrice(pose: Pose, aspect: number, nx: number, ny: number, zFront: number): number | null {
  const vp = viewProjection(pose, aspect)
  // Along the scale: screen height rises with price.
  let alongScale: number | null = null
  const on = (s: number) => project(vp, X1, wy(s), zFront)
  let lo = 1, hi = 400
  if (on(lo)[2] > 0.05 && on(hi)[2] > 0.05 && ny >= on(lo)[1] && ny <= on(hi)[1]) {
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2
      if (on(m)[1] < ny) lo = m
      else hi = m
    }
    alongScale = (lo + hi) / 2
  }
  // On the wall's face.
  let onFace: number | null = null
  const inv = invert(vp)
  if (inv) {
    const un = (z: number) => {
      const x = inv[0]! * nx + inv[4]! * ny + inv[8]! * z + inv[12]!
      const y = inv[1]! * nx + inv[5]! * ny + inv[9]! * z + inv[13]!
      const zz = inv[2]! * nx + inv[6]! * ny + inv[10]! * z + inv[14]!
      const w = inv[3]! * nx + inv[7]! * ny + inv[11]! * z + inv[15]!
      return [x / w, y / w, zz / w] as const
    }
    const n = un(-1), f = un(1)
    const dx = f[0] - n[0]
    const t = Math.abs(dx) > 1e-9 ? (X1 - n[0]) / dx : -1
    if (t >= 0 && t <= 1) {
      const s = priceOfY(n[1] + t * (f[1] - n[1]))
      if (s >= 1 && s <= 400) onFace = s
    }
  }
  // How squarely the camera faces the wall: 0 edge-on, 1 head-on.
  const fx = pose.target[0] - pose.eye[0]
  const facing = Math.abs(fx) / Math.hypot(fx, pose.target[1] - pose.eye[1], pose.target[2] - pose.eye[2])
  const w = smooth(0.05, 0.2, facing)
  if (onFace == null || w <= 0) return alongScale
  if (alongScale == null || w >= 1) return onFace
  return alongScale + (onFace - alongScale) * w
}
