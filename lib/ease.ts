/**
 * The site's easing curves, for motion that is drawn rather than transitioned:
 * WebGL and canvas figures read these, CSS reads the same numbers. One curve
 * per purpose, as in DESIGN.md: a strong ease-out for things arriving, a
 * strong ease-in-out for things changing shape on screen, and easeInOutQuad
 * for the one long camera move, where a stronger curve would lurch.
 */

/** CSS cubic-bezier(x1, y1, x2, y2) as a function of progress, by bisection on x. */
export function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const b = (u: number, p1: number, p2: number) => 3 * u * (1 - u) * (1 - u) * p1 + 3 * u * u * (1 - u) * p2 + u * u * u
  return (t: number) => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    let lo = 0
    let hi = 1
    for (let i = 0; i < 24; i++) {
      const m = (lo + hi) / 2
      if (b(m, x1, x2) < t) lo = m
      else hi = m
    }
    return b((lo + hi) / 2, y1, y2)
  }
}

/** Arriving: the value is mostly there almost at once. `cubic-bezier(0.23, 1, 0.32, 1)`. */
export const EASE_OUT = bezier(0.23, 1, 0.32, 1)
/** Changing shape on screen. `cubic-bezier(0.77, 0, 0.175, 1)`. */
export const EASE_IN_OUT = bezier(0.77, 0, 0.175, 1)
/** A long camera move (easings.net easeInOutQuad). `cubic-bezier(0.45, 0, 0.55, 1)`. */
export const EASE_IN_OUT_QUAD = bezier(0.45, 0, 0.55, 1)
