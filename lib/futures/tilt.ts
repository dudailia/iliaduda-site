/**
 * A phone's tilt as a lean of the view, the way the pointer leans it on a
 * laptop. The first reading is the reader's natural grip, not a tilt, so it
 * is taken as neutral; a new grip held for a few seconds becomes the new
 * neutral, so the figure never stays leaning; the axes turn with the screen;
 * and a phone lying flat, or tipped past upright, is ignored, since there its
 * angles swing wildly for a small movement.
 */

/** Degrees of tilt for most of a full lean: the lean is soft past it (tanh), friction rather than a wall. */
const RANGE = 22
/** How long the neutral takes to follow a new grip (s, a time constant): a held grip is neutral within seconds. */
const SETTLE_S = 4.2
/** Without a reading's time, the share of the way it moves per reading (60 a second: the same 4.2s). */
const SETTLE = 0.004

export class Lean {
  private b0: number | null = null
  private g0 = 0
  private last = { x: 0, y: 0 }
  private at: number | null = null

  /**
   * A DeviceOrientationEvent's beta and gamma, the screen's orientation angle, and the reading's time (its timeStamp,
   * ms: the neutral settles by time, however often the sensor reports); x and y in −1…1.
   */
  read(beta: number | null, gamma: number | null, angle: number, time?: number): { x: number; y: number } {
    // Tipped past upright (beta near ±90), or, turned sideways, rolled toward upright about the long side (gamma near
    // ±90: gimbal lock, where beta swings wildly for a small turn): the reading says nothing reliable; hold the last.
    const a = ((Math.round(angle) % 360) + 360) % 360
    if (beta == null || gamma == null || Math.abs(beta) > 80 || ((a === 90 || a === 270) && Math.abs(gamma) > 70)) return this.last
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
    const dt = time !== undefined && this.at !== null ? Math.min(0.25, Math.max(0, (time - this.at) / 1000)) : null
    if (time !== undefined) this.at = time
    const k = dt === null ? SETTLE : 1 - Math.exp(-dt / SETTLE_S)
    this.b0 += db * k
    this.g0 += dg * k
    const c = (v: number) => Math.tanh(v / RANGE)
    return (this.last = { x: c(sx), y: c(-sy) })
  }
}
