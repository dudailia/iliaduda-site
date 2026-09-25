import { contour } from '@/lib/contours'
import { CONTOUR_STEP, diffuse, LINE_FLIP, rampT } from './look'
import { DOMAIN, iv, type Params } from './ssvi'
import {
  apply, camera, EXPIRY_TICKS, FRAME, H, kOfU, LABELS, mvp, NOTES, POST, STRIKE_TICKS, tOfV, VOL_TICKS,
  wx, wy, wz, XW, ZW, type FrameKind,
} from './view'

/**
 * The poster, computed on the server: the same surface at the same moment
 * from the same camera as the first live frame, flat-shaded as a projected
 * quad mesh. It is the first paint, the reduced-motion figure and the
 * no-WebGL figure, so it carries the whole reading on its own: colour by
 * volatility, the lights, iso-volatility contours, the axes and the notes.
 *
 * Weight matters because the markup ships twice (HTML and the RSC payload):
 * quads that share a colour in a row merge into one polygon, coordinates are
 * whole units of a 1000-high frame and written as deltas, and a colour is a
 * class holding a CSS color-mix() of the site's tokens, so the poster follows
 * the reader's theme without a second copy.
 */

export const FRAME_H = 1000

/** Quads across strike × expiry, per frame. */
const GRID = [38, 24] as const
/** Ramp and light quantisation. */
export const RAMP_STEPS = 20
const LIGHT_STEP = 0.02

export interface PosterData {
  readonly aspect: number
  readonly width: number
  /** CSS rules: `.<cls>{color:…}`. */
  readonly css: string
  readonly runs: readonly { cls: string; d: string }[]
  readonly walls: readonly { id: string; d: string; x1: number; y1: number; x2: number; y2: number; stops: readonly { o: number; c: string }[] }[]
  readonly lines: readonly { d: string; c: string; w: number }[]
  readonly shadow: readonly string[]
  readonly ticks: string
  readonly labels: readonly { id: string; text: string; x: number; y: number; align: string; kind: string; only: FrameKind | undefined }[]
  readonly notes: readonly { id: string; lead: string; text: string; x: number; y: number; dx: number; dy: number; align: string; kind: FrameKind }[]
}

// ── colour, as CSS ───────────────────────────────────────────────────────────

const p1 = (x: number) => `${Math.round(x * 1000) / 10}%`
/** The ramp at t, as a color-mix of the stage's --c-lo / --c-mid / --c-top (tokens, both themes). */
export function rampCss(t: number): string {
  if (t <= 0.001) return 'var(--c-lo)'
  if (t < 0.5) return `color-mix(in oklab,var(--c-mid) ${p1(t / 0.5)},var(--c-lo))`
  if (t < 0.999) return `color-mix(in oklab,var(--c-top) ${p1((t - 0.5) / 0.5)},var(--c-mid))`
  return 'var(--c-top)'
}
/** The quantised ramp levels as custom properties, shared by both framings: `--r0` … `--r14`. */
export const RAMP_CSS = `.lab-c{${Array.from({ length: RAMP_STEPS + 1 }, (_, i) => `--r${i}:${rampCss(i / RAMP_STEPS)}`).join(';')}}`

/**
 * Light `L` applied to a colour. Mixing with black in oklab by 1 − ∛L scales
 * L, a and b by ∛L — which is exactly multiplying linear RGB by L, the
 * shader's arithmetic. Above 1 it mixes toward white, an approximation.
 */
export function litCss(base: string, L: number): string {
  const c = Math.cbrt(L)
  if (Math.abs(c - 1) < 0.004) return base
  return c < 1 ? `color-mix(in oklab,${base},#000 ${p1(1 - c)})` : `color-mix(in oklab,${base},#fff ${p1(Math.min(0.5, c - 1))})`
}
/** Contour ink for a level: toward ink on the light end of the ramp, toward paper on the dark end — in both themes. */
export function lineCss(t: number, major: boolean): string {
  const to = t < LINE_FLIP ? 'var(--color-ink)' : 'var(--color-paper)'
  return `color-mix(in oklab,${rampCss(t)},${to} ${major ? '42%' : '22%'})`
}

// ── geometry ─────────────────────────────────────────────────────────────────

type V3 = readonly [number, number, number]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2])
  return [a[0] / l, a[1] / l, a[2] / l]
}

/** A polygon or polyline as an SVG path: absolute move, then whole-unit deltas. */
function pathOf(pts: readonly (readonly [number, number])[], close: boolean, minStep = 0): string {
  if (!pts.length) return ''
  let x = Math.round(pts[0]![0]), y = Math.round(pts[0]![1])
  let d = `M${x} ${y}`
  let first = true
  for (let i = 1; i < pts.length; i++) {
    const nx = Math.round(pts[i]![0]), ny = Math.round(pts[i]![1])
    if (nx === x && ny === y) continue
    // Polylines drop points closer than minStep to the last one kept (never the last point).
    if (minStep && i < pts.length - 1 && Math.hypot(nx - x, ny - y) < minStep) continue
    d += `${first ? 'l' : ' '}${nx - x} ${ny - y}`.replace(/ -/g, '-')
    first = false
    x = nx
    y = ny
  }
  return close ? `${d}z` : d
}

export function poster(p: Params): PosterData {
  const f = FRAME
  const width = Math.round(f.aspect * FRAME_H)
  const m = mvp(camera(0))
  const proj = (x: number, y: number, z: number): [number, number] => {
    const q = apply(m, x, y, z)
    return [((q[0] / q[3]) * 0.5 + 0.5) * width, (1 - ((q[1] / q[3]) * 0.5 + 0.5)) * FRAME_H]
  }
  const frac = (x: number, y: number, z: number) => {
    const [sx, sy] = proj(x, y, z)
    return { x: sx / width, y: sy / FRAME_H }
  }

  const [nu, nv] = GRID
  const world: V3[] = []
  const screen: [number, number][] = []
  const vol: number[] = []
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const k = kOfU(i / nu), T = tOfV(j / nv)
      const v = iv(p, k, T)
      const P: V3 = [wx(k), wy(v), wz(T)]
      world.push(P)
      screen.push(proj(P[0], P[1], P[2]))
      vol.push(v)
    }
  const at = (i: number, j: number) => j * (nu + 1) + i

  const classes = new Map<string, string>()
  const cls = (css: string) => {
    let c = classes.get(css)
    if (!c) {
      c = `q${classes.size.toString(36)}`
      classes.set(css, c)
    }
    return c
  }

  // Back row first; within a row, left to right (the camera is on the right).
  const runs: { cls: string; d: string }[] = []
  for (let j = 0; j < nv; j++) {
    let start = 0
    let current = ''
    const flush = (end: number) => {
      if (!current) return
      const top = [] as [number, number][]
      for (let i = start; i <= end + 1; i++) top.push(screen[at(i, j)]!)
      for (let i = end + 1; i >= start; i--) top.push(screen[at(i, j + 1)]!)
      runs.push({ cls: current, d: pathOf(top, true) })
    }
    for (let i = 0; i < nu; i++) {
      const a = world[at(i, j)]!, b = world[at(i + 1, j)]!, c = world[at(i + 1, j + 1)]!, d = world[at(i, j + 1)]!
      const n = unit(cross(sub(c, a), sub(b, d)))
      const up: V3 = n[1] < 0 ? [-n[0], -n[1], -n[2]] : n
      const L = Math.round(diffuse(up) / LIGHT_STEP) * LIGHT_STEP
      const vMid = (vol[at(i, j)]! + vol[at(i + 1, j)]! + vol[at(i + 1, j + 1)]! + vol[at(i, j + 1)]!) / 4
      const c2 = cls(litCss(`var(--r${Math.round(rampT(vMid) * RAMP_STEPS)})`, L))
      if (c2 !== current) {
        flush(i - 1)
        start = i
        current = c2
      }
    }
    flush(nu - 1)
  }

  // The two walls the camera sees: the 2-year smile in front, the 135% term structure on the right.
  const walls: PosterData['walls'][number][] = []
  const lines: { d: string; c: string; w: number }[] = []
  const wallDefs = [
    { id: 'front', n: [0, 0, 1] as V3, pts: Array.from({ length: nu + 1 }, (_, i) => world[at(i, nv)]!) },
    { id: 'right', n: [1, 0, 0] as V3, pts: Array.from({ length: nv + 1 }, (_, j) => world[at(nu, j)]!) },
  ]
  for (const w of wallDefs) {
    const L = diffuse(w.n)
    const top = w.pts.map((q) => proj(q[0], q[1], q[2]))
    const floor = w.pts.map((q) => proj(q[0], 0, q[2])).reverse()
    const mid = w.pts[Math.floor(w.pts.length / 2)]!
    const [x1, y1] = proj(mid[0], 0, mid[2])
    const [x2, y2] = proj(mid[0], H, mid[2])
    const stops = [0, 0.1, 0.2, 0.3, 0.4, 0.55, 0.7, 0.85, 1].map((o) => ({ o, c: litCss(rampCss(rampT(0.1 + o)), L) }))
    walls.push({ id: w.id, d: pathOf([...top, ...floor], true), x1: Math.round(x1), y1: Math.round(y1), x2: Math.round(x2), y2: Math.round(y2), stops })
  }

  // Iso-volatility contours on the surface, from a finer field.
  const FK = 64, FT = 44
  const field = new Float64Array(FK * FT)
  for (let j = 0; j < FT; j++) for (let i = 0; i < FK; i++) field[j * FK + i] = iv(p, kOfU(i / (FK - 1)), tOfV(j / (FT - 1)))
  const levels: number[] = []
  for (let v = 0.2; v <= 1.05; v += CONTOUR_STEP) levels.push(Math.round(v * 100) / 100)
  for (const level of levels) {
    const major = Math.round(level * 100) % 10 === 0
    const t = rampT(level)
    const polys = contour(field, FK, FT, level)
    const d = polys
      .map((poly) => pathOf(poly.map(([i, j]) => {
        const k = kOfU(i / (FK - 1)), T = tOfV(j / (FT - 1))
        return proj(wx(k), wy(level), wz(T))
      }), false, 7))
      .join('')
    if (d) lines.push({ d, c: lineCss(t, major), w: major ? 1.1 : 0.7 })
    // The same level on the walls: a horizontal line wherever the wall stands taller than it.
    const y = wy(level)
    for (const w of wallDefs) {
      let seg: [number, number][] = []
      const segs: string[] = []
      for (let s = 0; s < w.pts.length; s++) {
        const q = w.pts[s]!
        if (q[1] > y) seg.push(proj(q[0], y, q[2]))
        else if (seg.length) {
          segs.push(pathOf(seg, false))
          seg = []
        }
      }
      if (seg.length > 1) segs.push(pathOf(seg, false))
      if (segs.length) lines.push({ d: segs.join(''), c: lineCss(t, major), w: major ? 1 : 0.6 })
    }
  }

  // A soft contact shadow: the footprint, a little wider, offset away from the key light, blurred by the Poster.
  const shadow = [0.08].map((e) => {
    const o = [0.05, -0.04] as const
    const c = [[-XW - e, ZW + e], [XW + e, ZW + e], [XW + e, -ZW - e], [-XW - e, -ZW - e]] as const
    return pathOf(c.map(([x, z]) => proj(x + o[0], 0, z + o[1])), true)
  })

  // Ticks: strikes along the front, expiries along the right, the volatility post at the back right.
  const tickPaths: string[] = []
  for (const K of STRIKE_TICKS) tickPaths.push(pathOf([proj(wx(Math.log(K)), 0, ZW), proj(wx(Math.log(K)), 0, ZW + 0.05)], false))
  for (const [T] of EXPIRY_TICKS) tickPaths.push(pathOf([proj(XW, 0, wz(T)), proj(XW + 0.05, 0, wz(T))], false))
  tickPaths.push(pathOf([proj(POST[0], 0, POST[1]), proj(POST[0], wy(1), POST[1])], false))
  for (const v of VOL_TICKS) tickPaths.push(pathOf([proj(POST[0], wy(v), POST[1]), proj(POST[0] + 0.04, wy(v), POST[1])], false))

  const labels = LABELS.map((l) => ({ id: l.id, text: l.text, ...frac(l.at[0], l.at[1], l.at[2]), align: l.align, kind: l.kind, only: l.only }))
  const notes = NOTES.flatMap((n) => {
    const y = wy(iv(p, n.k, n.T))
    const at = frac(wx(n.k), y, wz(n.T))
    return (['wide', 'tall'] as const).flatMap((kind) => {
      const o = n.offset[kind]
      return o ? [{ id: `${n.id}-${kind}`, lead: n.lead, text: n.text, ...at, dx: o[0], dy: o[1], align: o[2], kind }] : []
    })
  })
  const css = [...classes].map(([c, k]) => `.${k}{color:${c}}`).join('')
  return { aspect: f.aspect, width, css, runs, walls, lines, shadow, ticks: tickPaths.join(''), labels, notes }
}

/** For the sr-only description: the numbers a reader would otherwise see in the picture. */
export function describe(p: Params): string {
  const at = (K: number, T: number) => `${Math.round(iv(p, Math.log(K), T) * 100)}%`
  return (
    `Implied volatility for strikes from ${Math.round(Math.exp(DOMAIN.kMin) * 100)}% to ${Math.round(Math.exp(DOMAIN.kMax) * 100)}% ` +
    `of today’s price and expiries from one month to two years, drawn as a lit solid whose height and colour are the volatility. ` +
    `At the moment shown, the peak of a simulated shock, one-month volatility is ${at(0.7, 1 / 12)} at a 70% strike, ${at(1, 1 / 12)} at the money ` +
    `and ${at(1.3, 1 / 12)} at 130%; at two years the same strikes read ${at(0.7, 2)}, ${at(1, 2)} and ${at(1.3, 2)}.`
  )
}
