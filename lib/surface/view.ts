import { clipSegment } from '../m4'
import { DOMAIN, iv, type Params } from './ssvi'

/**
 * Where the surface sits and where it is seen from — shared by the server
 * poster and the live renderer, so the first live frame lands on the poster
 * exactly and the crossfade between them is a change of medium, not of
 * picture.
 *
 * World axes: x across strike (low strikes left), z across expiry with the
 * shortest at the back (z < 0), y up in implied volatility, linear. Expiry is
 * laid out on √T, which gives the first six months — where a shock lands —
 * two fifths of the depth instead of a fifth; every tick is placed where its
 * expiry actually falls.
 */

export const XW = 1.35
export const ZW = 0.85
export const H = 1.4
/** Volatility at the floor and at height H. */
export const V0 = 0.1
export const V1 = 1.1

const sT0 = Math.sqrt(DOMAIN.tMin)
const sT1 = Math.sqrt(DOMAIN.tMax)

export const fu = (k: number) => (k - DOMAIN.kMin) / (DOMAIN.kMax - DOMAIN.kMin)
export const fv = (T: number) => (Math.sqrt(T) - sT0) / (sT1 - sT0)
export const kOfU = (u: number) => DOMAIN.kMin + u * (DOMAIN.kMax - DOMAIN.kMin)
export const tOfV = (v: number) => {
  const s = sT0 + v * (sT1 - sT0)
  return s * s
}
export const wx = (k: number) => (fu(k) * 2 - 1) * XW
export const wz = (T: number) => (fv(T) * 2 - 1) * ZW
export const wy = (vol: number) => ((vol - V0) / (V1 - V0)) * H
export const volOfY = (y: number) => V0 + (y / H) * (V1 - V0)
export const uOfX = (x: number) => (x / XW + 1) / 2
export const vOfZ = (z: number) => (z / ZW + 1) / 2

// ── camera ───────────────────────────────────────────────────────────────────

/**
 * Two framings: `wide` from 40rem up, and `tall` below it, a phone's, with
 * fewer and shorter labels. Each has its own camera and its own poster.
 */
export type FrameKind = 'wide' | 'tall'

/**
 * The frame the surface is fitted to, and the camera's resting pose, for each framing. The stage has the frame's own
 * aspect and letterboxes it (like SVG's xMidYMid meet) at any other, so poster and canvas agree at any size. A phone's
 * frame is taller, looks down a little more and sways less: on a 390px phone the calm surface spans 297 × 211px, where
 * the wide frame letterboxed into it gave 245 × 145px. Each frame is fitted to its own labels only.
 */
export const FRAMES = {
  wide: { aspect: 1.62, yaw: 0.5, pitch: 0.44, sway: 0.2 },
  tall: { aspect: 1.1, yaw: 0.5, pitch: 0.6, sway: 0.12 },
} as const satisfies Record<FrameKind, { aspect: number; yaw: number; pitch: number; sway: number }>

/** The media query that picks the wide frame: Tailwind's `sm`. */
export const WIDE_QUERY = '(min-width: 40rem)'

/** The sway: a slow orbit about the vertical axis, ±`sway` radians. */
export const SWAY_PERIOD = 48

export interface Camera {
  yaw: number
  pitch: number
  dist: number
  ty: number
}

const FOV = (26 * Math.PI) / 180
export type M4 = Float32Array

export function perspective(aspect: number): M4 {
  const f = 1 / Math.tan(FOV / 2)
  const near = 0.1, far = 60
  const m = new Float32Array(16)
  m[0] = f / aspect
  m[5] = f
  m[10] = (far + near) / (near - far)
  m[11] = -1
  m[14] = (2 * far * near) / (near - far)
  return m
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

/** View = translate(0,0,−dist) · rotX(pitch) · rotY(−yaw) · translate(0,−ty,0). */
export function view(c: Camera): M4 {
  const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch)
  const cy = Math.cos(-c.yaw), sy = Math.sin(-c.yaw)
  const r = new Float32Array([cy, sp * sy, -cp * sy, 0, 0, cp, sp, 0, sy, -sp * cy, cp * cy, 0, 0, 0, 0, 1])
  const t = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -c.ty, 0, 1])
  const back = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -c.dist, 1])
  return mul(back, mul(r, t))
}

/** Camera position in world space. */
export function eye(c: Camera): [number, number, number] {
  const d = c.dist
  return [d * Math.cos(c.pitch) * Math.sin(c.yaw), c.ty + d * Math.sin(c.pitch), d * Math.cos(c.pitch) * Math.cos(c.yaw)]
}

export function apply(m: M4, x: number, y: number, z: number): [number, number, number, number] {
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
    m[3]! * x + m[7]! * y + m[11]! * z + m[15]!,
  ]
}

/** Scale NDC so a frame of aspect `frame` sits whole and centred in a viewport of aspect `viewport`. */
export function letterbox(frame: number, viewport: number): M4 {
  const m = new Float32Array(16)
  m[0] = viewport > frame ? frame / viewport : 1
  m[5] = viewport > frame ? 1 : viewport / frame
  m[10] = 1
  m[15] = 1
  return m
}

/**
 * The solid's envelope, which must stay in the frame: the back can rise to the
 * top of the scale at the largest shock; the two-year front never passes 60%.
 */
const ENVELOPE = [-1, 1].flatMap((sx) => [
  [sx * XW, 0, -ZW] as const,
  [sx * XW, H, -ZW] as const,
  [sx * XW, 0, ZW] as const,
  [sx * XW, wy(0.6), ZW] as const,
])

/** An axis label's type (text-meta, in Source Code Pro): 13px, every character 0.6em wide. */
export const LABEL_PX = 13
const CHAR_PX = LABEL_PX * 0.6
/**
 * The narrowest stage each framing is shown on, in CSS pixels: a 360px phone, whose stage runs edge to edge, and at
 * `sm` the text column (640px less its two 24px gutters). A label that is whole there is whole on every wider stage.
 */
export const NARROWEST: Record<FrameKind, number> = { tall: 360, wide: 592 }
/**
 * How far in from the stage's side a label keeps, in CSS pixels: a phone's stage runs to the screen's edges and its
 * words keep the page's margin (1.5rem), as the flat views' do; the column's keeps a sliver.
 */
export const LABEL_INSET: Record<FrameKind, number> = { tall: 24, wide: 6 }

/**
 * A label's box in normalised device coordinates, from where its anchor projects, at the framing's narrowest stage:
 * [left, right, bottom, top].
 */
export function labelBox(kind: FrameKind, l: Label, x: number, y: number): [number, number, number, number] {
  const W = NARROWEST[kind], Hpx = W / FRAMES[kind].aspect
  const w = (l.text.length * CHAR_PX) / (W / 2), h = LABEL_PX / (Hpx / 2)
  const [x0, x1] = l.align === 'left' ? [x, x + w] : l.align === 'right' ? [x - w, x] : [x - w / 2, x + w / 2]
  const [y0, y1] = l.align === 'above' ? [y, y + h] : [y - h / 2, y + h / 2]
  return [x0, x1, y0, y1]
}

/** The height the camera looks at. */
const TY = H * 0.28

const fitted: Partial<Record<FrameKind, number>> = {}
/**
 * The camera distance for a frame: the smallest at which every fit point is
 * inside the frame at every angle the sway reaches, so the solid never has to
 * zoom as it turns and the rising surface is seen rising, not refitted.
 */
export function fitDistance(kind: FrameKind): number {
  const done = fitted[kind]
  if (done) return done
  const f = FRAMES[kind]
  const P = perspective(f.aspect)
  const labels = LABELS.filter((l) => !l.only || l.only === kind)
  let lo = 1, hi = 40
  for (let i = 0; i < 26; i++) {
    const d = (lo + hi) / 2
    const ok = [-1, -0.5, 0, 0.5, 1].every((s) => {
      const m = mul(P, view({ yaw: f.yaw + s * f.sway, pitch: f.pitch, dist: d, ty: TY }))
      const solid = ENVELOPE.every(([x, y, z]) => {
        const q = apply(m, x, y, z)
        return q[3] > 0 && Math.abs(q[0] / q[3]) <= 0.92 && Math.abs(q[1] / q[3]) <= 0.94
      })
      // Every label whole, its text and not only its anchor, clear of the stage's side by its inset.
      return solid && labels.every((l) => {
        const q = apply(m, l.at[0], l.at[1], l.at[2])
        if (q[3] <= 0) return false
        const [x0, x1, y0, y1] = labelBox(kind, l, q[0] / q[3], q[1] / q[3])
        const side = 1 - LABEL_INSET[kind] / (NARROWEST[kind] / 2)
        return x0 >= -side && x1 <= side && y0 >= -0.98 && y1 <= 0.98
      })
    })
    if (ok) hi = d
    else lo = d
  }
  fitted[kind] = hi
  return hi
}


/**
 * The pitch a drag or its release may reach, eased into rather than stopped at: the identity inside [0.2, 1.1], and
 * beyond it an exponential approach to 0.12 below and 1.2 above, matched in slope, so a flick lands softly.
 */
const softPitch = (p: number) => (p < 0.2 ? 0.12 + 0.08 * Math.exp((p - 0.2) / 0.08) : p > 1.1 ? 1.2 - 0.1 * Math.exp(-(p - 1.1) / 0.1) : p)

/** A frame's camera at sway angle `s` ∈ [−1, 1] of its range, plus any offset the reader's drag adds. */
export function camera(kind: FrameKind, s = 0, dYaw = 0, dPitch = 0): Camera {
  const f = FRAMES[kind]
  return {
    yaw: f.yaw + s * f.sway + dYaw,
    pitch: softPitch(f.pitch + dPitch),
    dist: fitDistance(kind),
    ty: TY,
  }
}

/** Model-view-projection through a frame, for a viewport of aspect `viewport` (the frame's own aspect when omitted). */
export function mvp(kind: FrameKind, cam: Camera, viewport?: number): M4 {
  const a = FRAMES[kind].aspect
  return mul(letterbox(a, viewport ?? a), mul(perspective(a), view(cam)))
}

/**
 * The point of surface `p` under a spot of the stage, given in normalised device coordinates of the projection whose
 * inverse is `inv`: where the eye's ray through it first meets the surface, or null where it meets none (the sky, the
 * floor beside it). The live figure reads the pointer with it, and the still frame, through its poster's camera.
 */
export function pickSurface(inv: M4, nx: number, ny: number, p: Params): { k: number; T: number } | null {
  const a = apply(inv, nx, ny, -1), b = apply(inv, nx, ny, 1)
  const P0 = [a[0] / a[3], a[1] / a[3], a[2] / a[3]] as const
  const P1 = [b[0] / b[3], b[1] / b[3], b[2] / b[3]] as const
  // Only the stretch of the ray inside the box the surface stands in is marched, finely.
  const span = clipSegment(P0, P1, [-XW, 0, -ZW], [XW, H, ZW])
  if (!span) return null
  const at = (t: number) => [P0[0] + (P1[0] - P0[0]) * t, P0[1] + (P1[1] - P0[1]) * t, P0[2] + (P1[2] - P0[2]) * t] as const
  const above = (t: number) => {
    const q = at(t)
    return q[1] - wy(iv(p, kOfU(uOfX(Math.max(-XW, Math.min(XW, q[0])))), tOfV(vOfZ(Math.max(-ZW, Math.min(ZW, q[2]))))))
  }
  const [t0, t1] = span
  const steps = 200
  let prevT = t0, prev = above(t0)
  // Entering the box already under the sheet is entering through a wall: the point read is where it came in.
  if (prev <= 0) {
    const q = at(t0)
    return { k: kOfU(uOfX(Math.max(-XW, Math.min(XW, q[0])))), T: tOfV(vOfZ(Math.max(-ZW, Math.min(ZW, q[2])))) }
  }
  for (let s = 1; s <= steps; s++) {
    const t = t0 + ((t1 - t0) * s) / steps
    const d = above(t)
    if (d <= 0) {
      let lo = prevT, hi = t
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2
        if (above(mid) > 0) lo = mid
        else hi = mid
      }
      const m = at((lo + hi) / 2)
      return { k: kOfU(uOfX(m[0])), T: tOfV(vOfZ(m[2])) }
    }
    prev = d
    prevT = t
  }
  return null
}

// ── ticks and labels ─────────────────────────────────────────────────────────

export const STRIKE_TICKS = [0.7, 0.85, 1, 1.15, 1.3] as const
export const EXPIRY_TICKS = [
  [1 / 12, '1M'],
  [0.25, '3M'],
  [0.5, '6M'],
  [1, '1Y'],
  [2, '2Y'],
] as const
export const VOL_TICKS = [0.2, 0.4, 0.6, 0.8, 1.0] as const

/** The corner post that carries the volatility scale: back right. */
export const POST: readonly [number, number] = [XW, -ZW]

export interface Label {
  readonly id: string
  readonly text: string
  readonly at: readonly [number, number, number]
  /** Which way the text hangs from its anchor. */
  readonly align: 'center' | 'left' | 'right' | 'above'
  readonly kind: 'tick' | 'title'
  /** Drawn in one framing only; the phone frame keeps fewer, shorter labels. */
  readonly only?: FrameKind
}

// On a phone the strike and expiry ticks would meet at the front-right corner, so its last strike tick stops at 115%;
// and the axis title stands between its two labelled ticks, where a 100% label would crowd it.
const TALL_STRIKES = new Set<number>([0.7, 1.15])
const TALL_EXPIRIES = new Set<string>(['1M', '6M', '2Y'])
// On a phone the axis title stands at the top of the post, and one tick gives the scale: a 100% tick would crowd the
// title, and a 20% one sits on the surface's own back edge.
const TALL_VOLS = new Set<number>([0.6])

export const LABELS: readonly Label[] = [
  // Every strike tick is drawn; the 85% one goes unlabelled, where the axis title needs the room.
  ...STRIKE_TICKS.filter((K) => K !== 0.85).map((K): Label => ({
    id: `k${K}`, text: `${Math.round(K * 100)}%`, at: [wx(Math.log(K)), 0, ZW + 0.12], align: 'center', kind: 'tick',
    ...(TALL_STRIKES.has(K) ? {} : { only: 'wide' as const }),
  })),
  { id: 'kt', text: 'strike, % of forward', at: [wx(Math.log(0.76)), 0, ZW + 0.55], align: 'center', kind: 'title', only: 'wide' },
  { id: 'kts', text: 'strike, % of forward', at: [-XW + 0.35, 0, ZW + 0.7], align: 'left', kind: 'title', only: 'tall' },
  ...EXPIRY_TICKS.map(([T, s]): Label => ({
    id: `t${s}`, text: s, at: [XW + 0.1, 0, wz(T)], align: 'left', kind: 'tick',
    ...(TALL_EXPIRIES.has(s) ? {} : { only: 'wide' as const }),
  })),
  { id: 'tt', text: 'expiry', at: [XW + 0.3, 0, ZW * 0.1], align: 'left', kind: 'title', only: 'wide' },
  { id: 'tts', text: 'expiry', at: [XW + 0.12, 0, ZW + 0.3], align: 'left', kind: 'title', only: 'tall' },
  ...VOL_TICKS.map((v): Label => ({
    id: `v${v}`, text: `${Math.round(v * 100)}%`, at: [POST[0] + 0.06, wy(v), POST[1]], align: 'left', kind: 'tick', only: 'wide',
  })),
  // A phone's frame ends at the post: its ticks read inward from it, so none runs past the right edge.
  ...VOL_TICKS.filter((v) => TALL_VOLS.has(v)).map((v): Label => ({
    id: `vs${v}`, text: `${Math.round(v * 100)}%`, at: [POST[0] - 0.05, wy(v), POST[1]], align: 'right', kind: 'tick', only: 'tall',
  })),
  { id: 'vt', text: 'implied volatility', at: [POST[0] - 0.04, wy(1) + 0.08, POST[1]], align: 'right', kind: 'title', only: 'wide' },
  // Ending at the post, so on a phone's narrow frame it never runs past the right edge.
  { id: 'vts', text: 'implied vol', at: [POST[0] - 0.04, wy(1) + 0.08, POST[1]], align: 'right', kind: 'title', only: 'tall' },
]

/** On-surface annotations: plain words, pinned to the region they describe, riding its height. */
export interface Note {
  readonly id: string
  readonly lead: string
  readonly text: string
  readonly k: number
  readonly T: number
  /** Screen offset of the text from the anchor in CSS px, and which way the text hangs from there, per frame. */
  readonly offset: Record<FrameKind, readonly [number, number, NoteAlign] | null>
}
export type NoteAlign = 'left' | 'right' | 'center'

export const NOTES: readonly Note[] = [
  {
    id: 'fear',
    lead: 'Fear',
    text: 'crash insurance costs more',
    k: -0.34,
    T: 1 / 12,
    // On a wide frame it stands in the open sky above the peak it names, centred on it: clear of the stage's left
    // edge, and of the volatility axis's title to the right.
    offset: { wide: [-6, -62, 'center'], tall: [-4, -22, 'center'] },
  },

]
