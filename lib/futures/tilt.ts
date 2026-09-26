/**
 * A phone's tilt as a lean of the view, the way the pointer leans it on a
 * laptop. The first reading is the reader's natural grip, not a tilt, so it
 * is taken as neutral; a new grip held for a few seconds becomes the new
 * neutral, so the figure never stays leaning; the axes turn with the screen;
 * and a phone lying flat, or tipped past upright, is ignored, since there its
 * angles swing wildly for a small movement.
 */

/** Degrees of tilt for a full lean. */
const RANGE = 22
/** How much of the way to the current grip the neutral moves per reading: a held grip is neutral within seconds. */
const SETTLE = 0.004

export class Lean {
  private b0: number | null = null
  private g0 = 0
  private last = { x: 0, y: 0 }

  /** A DeviceOrientationEvent's beta and gamma, and the screen's orientation angle; x and y in −1…1. */
  read(beta: number | null, gamma: number | null, angle: number): { x: number; y: number } {
    if (beta == null || gamma == null || Math.abs(beta) > 80) return this.last
    if (this.b0 == null) {
      this.b0 = beta
      this.g0 = gamma
      return (this.last = { x: 0, y: 0 })
    }
    const db = beta - this.b0, dg = gamma - this.g0
    let sx: number, sy: number
    switch (((Math.round(angle) % 360) + 360) % 360) {
      case 90:
        sx = db
        sy = -dg
        break
      case 180:
        sx = -dg
        sy = -db
        break
      case 270:
        sx = -db
        sy = dg
        break
      default:
        sx = dg
        sy = db
    }
    this.b0 += db * SETTLE
    this.g0 += dg * SETTLE
    const c = (v: number) => Math.max(-1, Math.min(1, v / RANGE))
    return (this.last = { x: c(sx), y: c(-sy) })
  }
}
