import { DOMAIN } from './ssvi'

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
 * Where labels differ by screen: `wide` from 40rem up, `tall` below it (the
 * phone keeps fewer, shorter labels). The camera and the picture are the same
 * for both, so a single poster serves every screen.
 */
export type FrameKind = 'wide' | 'tall'

/**
 * The frame the surface is fitted to, and the camera's resting pose. The stage
 * letterboxes the frame (like SVG's xMidYMid meet), so poster and canvas agree
 * at any size.
 */
export const FRAME = { aspect: 1.62, yaw: 0.5, pitch: 0.44, sway: 0.2 } as const

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
 * Points that must stay in the frame: the solid's envelope (the back can rise
 * to the top of the scale at the largest shock; the two-year front never
 * passes 60%), and the anchors of the axis labels drawn in that frame.
 */
function fitPoints(): (readonly [number, number, number])[] {
  const box = [-1, 1].flatMap((sx) => [
    [sx * XW, 0, -ZW] as const,
    [sx * XW, H, -ZW] as const,
    [sx * XW, 0, ZW] as const,
    [sx * XW, wy(0.6), ZW] as const,
  ])
  const labels = LABELS.map((l) => l.at)
  return [...box, ...labels]
}

/** The height the camera looks at. */
const TY = H * 0.28

let fitted = 0
/**
 * The camera distance for a frame: the smallest at which every FIT point is
 * inside the frame at every angle the sway reaches, so the solid never has to
 * zoom as it turns and the rising surface is seen rising, not refitted.
 */
export function fitDistance(): number {
  if (fitted) return fitted
  const f = FRAME
  const P = perspective(f.aspect)
  const FIT = fitPoints()
  let lo = 1, hi = 40
  for (let i = 0; i < 26; i++) {
    const d = (lo + hi) / 2
    const ok = [-1, -0.5, 0, 0.5, 1].every((s) => {
      const m = mul(P, view({ yaw: f.yaw + s * f.sway, pitch: f.pitch, dist: d, ty: TY }))
      return FIT.every(([x, y, z]) => {
        const q = apply(m, x, y, z)
        return q[3] > 0 && Math.abs(q[0] / q[3]) <= 0.92 && Math.abs(q[1] / q[3]) <= 0.94
      })
    })
    if (ok) hi = d
    else lo = d
  }
  fitted = hi
  return hi
}


/** The camera at sway angle `s` ∈ [−1, 1] of the frame's range, plus any offset the reader's drag adds. */
export function camera(s = 0, dYaw = 0, dPitch = 0): Camera {
  const f = FRAME
  return {
    yaw: f.yaw + s * f.sway + dYaw,
    pitch: Math.min(1.2, Math.max(0.12, f.pitch + dPitch)),
    dist: fitDistance(),
    ty: TY,
  }
}

/** Model-view-projection for a viewport of aspect `viewport` (the frame's own aspect when omitted). */
export function mvp(cam: Camera, viewport?: number): M4 {
  const a = FRAME.aspect
  return mul(letterbox(a, viewport ?? a), mul(perspective(a), view(cam)))
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

const TALL_STRIKES = new Set<number>([0.7, 1, 1.3])
const TALL_EXPIRIES = new Set<string>(['1M', '6M', '2Y'])
const TALL_VOLS = new Set<number>([0.2, 0.6, 1.0])

export const LABELS: readonly Label[] = [
  ...STRIKE_TICKS.map((K): Label => ({
    id: `k${K}`, text: `${Math.round(K * 100)}%`, at: [wx(Math.log(K)), 0, ZW + 0.12], align: 'center', kind: 'tick',
    ...(TALL_STRIKES.has(K) ? {} : { only: 'wide' as const }),
  })),
  { id: 'kt', text: 'strike, % of today’s price', at: [wx(Math.log(0.76)), 0, ZW + 0.55], align: 'center', kind: 'title', only: 'wide' },
  { id: 'kts', text: 'strike, % of price', at: [wx(0), 0, ZW + 0.6], align: 'center', kind: 'title', only: 'tall' },
  ...EXPIRY_TICKS.map(([T, s]): Label => ({
    id: `t${s}`, text: s, at: [XW + 0.1, 0, wz(T)], align: 'left', kind: 'tick',
    ...(TALL_EXPIRIES.has(s) ? {} : { only: 'wide' as const }),
  })),
  { id: 'tt', text: 'time to expiry', at: [XW + 0.3, 0, ZW * 0.1], align: 'left', kind: 'title', only: 'wide' },
  { id: 'tts', text: 'expiry', at: [XW + 0.12, 0, ZW + 0.3], align: 'left', kind: 'title', only: 'tall' },
  ...VOL_TICKS.map((v): Label => ({
    id: `v${v}`, text: `${Math.round(v * 100)}%`, at: [POST[0] + 0.06, wy(v), POST[1]], align: 'left', kind: 'tick',
    ...(TALL_VOLS.has(v) ? {} : { only: 'wide' as const }),
  })),
  { id: 'vt', text: 'implied volatility', at: [POST[0] - 0.04, wy(1) + 0.08, POST[1]], align: 'right', kind: 'title', only: 'wide' },
  { id: 'vts', text: 'implied vol', at: [POST[0] + 0.02, wy(1) + 0.1, POST[1]], align: 'above', kind: 'title', only: 'tall' },
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
    offset: { wide: [-26, -34, 'right'], tall: [-4, -22, 'center'] },
  },
  {
    id: 'calm',
    lead: 'Calm',
    text: 'long-dated options barely move',
    k: 0.12,
    T: 1.3,
    offset: { wide: [-28, -56, 'right'], tall: null },
  },
]
