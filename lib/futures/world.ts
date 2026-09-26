import { HIST, MODEL } from './mc'

/**
 * Where things sit, shared by the server poster and the live renderer so the
 * crossfade from one to the other lands on the same picture. World units:
 * x is time (today at X0, expiry at X1), y is price, z is depth only — it
 * spreads the paths into a cone so the camera can fly through them, and
 * carries no data.
 */

export const X0 = -1.5
export const X1 = 1.5
/** The terminal histogram hangs off the expiry plane, bars growing in +x. */
export const HX0 = X1 + 0.1
export const HLEN = 0.82
/** Half-depth of the cone at expiry. */
export const ZW = 0.62

export const PY = 0.012
export const wx = (t: number) => X0 + (X1 - X0) * (t / MODEL.T)
export const wy = (s: number) => (s - MODEL.s0) * PY
export const priceOfY = (y: number) => MODEL.s0 + y / PY

/**
 * The rectangle the first frame fills, in world units on z = 0. The first
 * frame fills it exactly — stretching time or price to the box, never
 * letterboxing — and so does the poster (preserveAspectRatio="none"), so
 * the two register at every aspect ratio.
 */
export const FRAME = { x0: -1.72, x1: HX0 + HLEN + 0.1, y0: wy(4), y1: wy(248) } as const

/** The expiry line's extent in price. */
export const AXIS = { lo: HIST.lo + 2, hi: HIST.hi - 4 } as const
export const TICKS = [50, 100, 150, 200] as const
/** A price tick this close to the strike gives way to the strike's label. */
export const TICK_CLEAR = 14

/**
 * Where each label hangs, and how it sits against its point — shared so the
 * poster's labels and the live ones are the same labels.
 */
export const LABELS = {
  today: { at: [X0, wy(MODEL.s0)], cls: '-ml-1 -mt-2.5 -translate-y-full text-ink' },
  expiry: { at: [X1, wy(AXIS.lo)], cls: 'mt-1.5 -translate-x-1/2 text-graphite' },
  tick: { x: X1 - 0.02, cls: '-ml-1.5 -translate-x-full -translate-y-1/2 text-graphite' },
  strike: { x: HX0 + HLEN + 0.04, x0: X1 - 0.32, cls: '-ml-1.5 -translate-x-full -translate-y-1/2 text-ink' },
  hist: { at: [HX0 + HLEN, wy(AXIS.hi - 2)], cls: '-translate-x-full' },
  /** The price, under the strike, where the payoff bars are empty. */
  value: { x: HX0 + HLEN, below: 16, cls: '-translate-x-full -translate-y-1/2' },
} as const

/** Poster units per world unit. The viewBox is FRAME at this scale. */
export const PS = 250
export const VB = { w: Math.round((FRAME.x1 - FRAME.x0) * PS), h: Math.round((FRAME.y1 - FRAME.y0) * PS) } as const
export const px = (x: number) => (x - FRAME.x0) * PS
export const py = (y: number) => (FRAME.y1 - y) * PS
