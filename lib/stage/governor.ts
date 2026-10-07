/**
 * The stage kit's quality governor (components/stage/useStage.ts), frame by frame, against this display's own
 * refresh: `refresh` tracks the shortest smoothed frame interval seen (8.3ms at 120Hz, 16.7ms at 60Hz). A second
 * below ~50fps steps down; three seconds at the refresh rate step back up, never past the device tier.
 *
 * A clock slower than any seen yet (an iPhone in Low Power Mode, a laptop saving energy: 30 frames a second, however
 * light the frame) reads as slow frames at first. So a step down is a test: if a second and a half later the frames
 * are no quicker, steady, and at a rate a page's frames come at, the work was not what held them, the clock was. The governor takes that interval as the refresh
 * and goes back to the quality it left, forgiven, rather than falling level by level to its lightest. Unless the
 * display has been seen running faster: a 60 Hz phone whose GPU holds every heavy frame at 33ms looks like a 30 Hz
 * clock, but its light frames (a paused or settled figure, the frames before the story) came every 16.7ms, so the
 * work held them and the step down stands.
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
  /** How far frames stray from their smoothed interval, smoothed, in ms: a clock's are steady. */
  private jitter = 0
  /** A level to go back to, once the figure stops holding the quality (a clock learned mid-story). */
  private restoreTo: number | null = null
  /** The shortest interval between two of the page's animation frames seen, light or heavy, in ms: the clock's own. */
  fastest = Infinity

  constructor(
    public q: number,
    readonly maxQ: number,
    /**
     * The lowest level it may fall to: 0, the lightest effects, for every device but a low-tier one, which has a
     * level below (useStage.ts: its last resort, fewer pixels). Never below 0 on a laptop or a phone with Apple's GPU.
     */
    readonly minQ = 0,
  ) {}

  /**
   * Any animation frame's interval, in ms, a drawn one or not (an idle frame, a skipped one): the display's clock is at
   * least this fast. Two callbacks in one frame (under 4ms apart) say nothing about it.
   */
  observe(ms: number): void {
    if (ms >= 4) this.fastest = Math.min(this.fastest, ms)
  }

  /** One drawn frame of `dt` seconds, ending at `now` (ms); `held` keeps it from climbing. Returns whether q changed. */
  frame(dt: number, now: number, held = false): boolean {
    this.jitter = this.jitter * 0.9 + Math.abs(dt * 1000 - this.ema) * 0.1
    this.ema = this.ema * 0.9 + dt * 1000 * 0.1
    this.refresh = Math.min(this.refresh * 1.0005, this.ema)
    if (this.ema > Math.max(this.refresh * 1.35, 20)) this.slow += dt
    else this.slow = 0
    if (this.ema < this.refresh * 1.15) this.fast += dt
    else this.fast = 0
    // A clock learned while the figure held the quality: back to the level it left once the hold is let go.
    if (this.restoreTo !== null && !held) {
      this.q = Math.max(this.q, this.restoreTo)
      this.restoreTo = null
      this.slow = this.fast = 0
      return true
    }
    // A step down tested: frames no quicker than before it (within 10%), steady (their spread within a fifth of their
    // interval), at a display's own rate, means the clock set their pace, not the work. A 60 Hz display on a device
    // missing frames does not pass: its frames alternate, 17 and 33ms, about 25ms, which is no display's rate. Nor does
    // a display seen giving frames a quarter quicker than these: its clock is faster, and the work held them.
    if (this.probe && now - this.probe.at > 1500) {
      const p = this.probe
      this.probe = null
      if (this.ema > p.ema * 0.9 && this.jitter < this.ema * 0.2 && isDisplayRate(this.ema) && this.fastest > this.ema * 0.75) {
        this.refresh = this.ema
        this.failures[p.from] = Math.max(0, (this.failures[p.from] ?? 1) - 1)
        this.blockedUntil[p.from] = 0
        this.slow = this.fast = 0
        if (held) {
          this.restoreTo = p.from
          return false
        }
        this.q = p.from
        return true
      }
    }
    // Mid-story (held), frames steady at a display's own rate on a display never seen faster are a clock's: learned at
    // once, with no step down to test it, so the signature's effects never change mid-moment (Low Power Mode stepped
    // every figure down 0.3–1.3s into its story, and back up after it).
    if (this.slow > 1 && held && !this.probe && this.jitter < this.ema * 0.2 && isDisplayRate(this.ema) && this.fastest > this.ema * 0.75) {
      this.refresh = this.ema
      this.slow = this.fast = 0
      return false
    }
    // Hysteresis: a level the device has just failed to hold is off limits for 30s, doubling each time it fails
    // again, so a marginal phone does not climb and fall every four seconds.
    if (this.slow > 1 && this.q > this.minQ && !this.probe) {
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

/**
 * The rates a page's frames come at (Hz): a display's own, and the 30 a phone in Low Power Mode or a laptop saving
 * energy holds pages to. A steady frame interval within 5% of one can be a clock's.
 */
const RATES = [30, 60, 90, 120, 144, 165, 240]
export const isDisplayRate = (ms: number) => RATES.some((hz) => Math.abs(ms - 1000 / hz) <= 0.05 * (1000 / hz))
