/**
 * The stage kit's quality governor (components/stage/useStage.ts), frame by frame, against this display's own
 * refresh: `refresh` tracks the shortest smoothed frame interval seen (8.3ms at 120Hz, 16.7ms at 60Hz). A second
 * below ~50fps steps down; three seconds at the refresh rate step back up, never past the device tier.
 *
 * A clock slower than any seen yet (an iPhone in Low Power Mode, a laptop saving energy: 30 frames a second, however
 * light the frame) reads as slow frames at first. So a step down is a test: if a second and a half later the frames
 * are no quicker, the work was not what held them, the clock was. The governor takes that interval as the refresh
 * and goes back to the quality it left, forgiven, rather than falling level by level to its lightest.
 */
export class Governor {
  /** The smoothed frame interval, and the display's refresh interval as learned, in ms. */
  ema = 16.7
  refresh = 16.7
  private slow = 0
  private fast = 0
  private readonly failures: number[] = []
  private readonly blockedUntil: number[] = []
  /** A step down being tested: the level it left, the frame interval then, and when. */
  private probe: { from: number; ema: number; at: number } | null = null

  constructor(
    public q: number,
    readonly maxQ: number,
  ) {}

  /** One drawn frame of `dt` seconds, ending at `now` (ms); `held` keeps it from climbing. Returns whether q changed. */
  frame(dt: number, now: number, held = false): boolean {
    this.ema = this.ema * 0.9 + dt * 1000 * 0.1
    this.refresh = Math.min(this.refresh * 1.0005, this.ema)
    if (this.ema > Math.max(this.refresh * 1.35, 20)) this.slow += dt
    else this.slow = 0
    if (this.ema < this.refresh * 1.15) this.fast += dt
    else this.fast = 0
    // A step down tested: frames no quicker than before it means the clock, not the work, set their pace.
    if (this.probe && now - this.probe.at > 1500) {
      const p = this.probe
      this.probe = null
      if (this.ema > p.ema * 0.85) {
        this.refresh = this.ema
        this.failures[p.from] = Math.max(0, (this.failures[p.from] ?? 1) - 1)
        this.blockedUntil[p.from] = 0
        this.q = p.from
        this.slow = this.fast = 0
        return true
      }
    }
    // Hysteresis: a level the device has just failed to hold is off limits for 30s, doubling each time it fails
    // again, so a marginal phone does not climb and fall every four seconds.
    if (this.slow > 1 && this.q > 0 && !this.probe) {
      const q = this.q
      this.failures[q] = (this.failures[q] ?? 0) + 1
      this.blockedUntil[q] = now + 30000 * 2 ** (this.failures[q]! - 1)
      this.probe = { from: q, ema: this.ema, at: now }
      this.q--
      this.slow = 0
      return true
    }
    if (this.fast > 3 && this.q < this.maxQ && now >= (this.blockedUntil[this.q + 1] ?? 0) && !held) {
      this.q++
      this.fast = 0
      return true
    }
    return false
  }
}
