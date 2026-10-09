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
 *
 * Both readings are medians, never one interval: Safari stamps a frame when its update starts, so a late frame and the
 * on-time one after it read 9–24ms apart on a 30 Hz clock, and one such reading (the shortest ever seen, as it was)
 * said the display ran faster for the rest of the visit: Low Power Mode then stepped every figure to its lightest
 * mid-story (42 of 45 stories on WebKit).
 *
 * And steadiness is judged four frames at a time: sideways in Low Power Mode Safari stamps every frame late by its own
 * 0–22ms, so its intervals run 12–56ms about a 33ms median, under half of them within 15% of it, and the clock was never
 * learned (the home figure fell to its lightest for the visit). Four in a row keep the clock (their lateness cancels but
 * for the first and last). A frame that took over 1.8 times the median is a missed one, which no clock explains.
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
  /** The level a run of steps down began at: where a clock found at the lightest level sends it back. */
  private chainFrom: number | null = null
  /** A level to go back to, once the figure stops holding the quality (a clock learned mid-story). */
  private restoreTo: number | null = null
  /**
   * The last intervals after a light frame (one that drew nothing, or nothing costly), ms: the clock's own pace, and
   * when each came (null: no time given). Ten seconds old, one says nothing of the clock now: a figure that draws every
   * frame shows light ones only before its first, and Low Power Mode turned on later met a 60 Hz reading from the load.
   */
  private readonly lights: { ms: number; at: number | null }[] = []
  private lastNow = 0
  /** The last drawn frames' intervals, ms. */
  private readonly recent: number[] = []

  /** How fast the display's clock runs, as its light frames show it: their median, once there are three. */
  get fastest(): number {
    const fresh = this.lights.filter((l) => l.at === null || this.lastNow - l.at < 10000).map((l) => l.ms)
    return fresh.length >= 3 ? median(fresh) : fresh.length && this.probe ? Math.min(...fresh) : Infinity
  }

  /** A step down is being tested, or one is about to be: the kit gives the clock one light frame to read it by. */
  get probing(): boolean {
    return this.probe !== null || this.wantLight
  }
  /** Asked for one light frame before a step down while held (the kit lets a frame go undrawn; observe clears it). */
  private wantLight = false

  /**
   * The clock as the last light frame read it, if that was within two seconds (or untimed): the freshest evidence.
   * The ten-second median held the load's 60 Hz readings on a figure that draws every frame, and Low Power Mode turned
   * on in its story stepped it to its lightest; the jitter at 30 Hz stepped the home figure mid-story on 2 visits in 8.
   */
  private freshLight(since: number): number | null {
    const l = this.lights.at(-1)
    // Read since `since` (the frames turned slow, or the step down under test), and within two seconds: what came
    // before says nothing of the clock now.
    return l && (l.at === null || (this.lastNow - l.at < 2000 && l.at >= since)) ? l.ms : null
  }
  /** When the frames last turned slow (ms). */
  private slowAt = 0

  /** The drawn frames' interval when they are steady (see steadyAt), else null. */
  private steady(): number | null {
    return this.recent.length < 10 ? null : steadyAt(this.recent)
  }

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
   * The interval after a light frame, in ms (the kit passes only those: what follows a heavy frame says how long the
   * work took, not how fast the clock runs). Two callbacks in one frame (under 4ms apart) say nothing.
   */
  observe(ms: number, now?: number): void {
    if (ms < 4) return
    this.wantLight = false
    this.lights.push({ ms, at: now ?? null })
    if (this.lights.length > 15) this.lights.shift()
  }

  /**
   * The clock as the figure's light frames showed it before its first drawn one (the renderer still loading): steady
   * and at a display's own rate, slower than any seen, it is the refresh from the start. An iPhone in Low Power Mode
   * then never steps its first story down to test the clock and back (on a visit with no story held, it did).
   */
  seed(intervals: readonly number[]): void {
    if (intervals.length < 6) return
    // Steady as the drawn frames are judged (Safari's stamps jitter).
    const mid = steadyAt(intervals)
    if (mid === null || !isDisplayRate(mid) || mid < this.refresh * 1.15) return
    this.refresh = this.ema = mid
  }

  /** One drawn frame of `dt` seconds, ending at `now` (ms); `held` keeps it from climbing. Returns whether q changed. */
  frame(dt: number, now: number, held = false): boolean {
    this.lastNow = now
    this.recent.push(dt * 1000)
    if (this.recent.length > 15) this.recent.shift()
    this.ema = this.ema * 0.9 + dt * 1000 * 0.1
    this.refresh = Math.min(this.refresh * 1.0005, this.ema)
    if (this.ema > Math.max(this.refresh * 1.35, 20)) {
      if (!this.slow) this.slowAt = now
      this.slow += dt
    } else this.slow = 0
    if (this.ema < this.refresh * 1.15) this.fast += dt
    else this.fast = 0
    // A clock learned while the figure held the quality: back to the level it left once the hold is let go.
    if (this.restoreTo !== null && !held) {
      this.q = Math.max(this.q, this.restoreTo)
      this.restoreTo = null
      this.slow = this.fast = 0
      return true
    }
    // A step down tested: frames no quicker than before it (within 10%), steady (four in five within 15% of their median),
    // at a display's own rate, means the clock set their pace, not the work. A 60 Hz display on a device missing frames
    // does not pass: its frames alternate, 17 and 33ms, which is not steady. Nor does
    // a display seen giving frames a quarter quicker than these: its clock is faster, and the work held them.
    if (this.probe && now - this.probe.at > 1500) {
      const p = this.probe
      // Read while the probe stands: the one light frame the kit gave it counts then, even alone, and before the rest.
      const fastest = this.freshLight(p.at) ?? this.fastest
      this.probe = null
      const st = this.steady()
      if (this.ema > p.ema * 0.9 && st !== null && isDisplayRate(st) && fastest > st * 0.75) {
        this.refresh = st
        this.failures[p.from] = Math.max(0, (this.failures[p.from] ?? 1) - 1)
        this.blockedUntil[p.from] = 0
        this.slow = this.fast = 0
        this.chainFrom = null
        if (held) {
          this.restoreTo = p.from
          return false
        }
        this.q = p.from
        return true
      }
      // Stepped all the way to its lightest and its frames still no quicker, steady, at a display's rate: no level drew
      // faster, so the clock set their pace after all, though the display was once seen faster (Low Power Mode turned on
      // mid-visit, under a figure that draws every frame and so never shows the clock a light one: /market and the order
      // book sat at their lightest for 45 seconds). A GPU that holds its heavy levels at 33ms draws its lightest quicker,
      // and stays there.
      if (this.q <= this.minQ && this.ema > p.ema * 0.9 && st !== null && isDisplayRate(st) && this.chainFrom !== null) {
        const to = this.chainFrom
        this.chainFrom = null
        this.refresh = st
        this.lights.length = 0
        for (let l = this.minQ; l <= to; l++) {
          this.failures[l] = 0
          this.blockedUntil[l] = 0
        }
        this.slow = this.fast = 0
        if (held) {
          this.restoreTo = to
          return false
        }
        this.q = to
        return true
      }
    }
    // Mid-story (held), frames steady at a display's own rate on a display never seen faster are a clock's: learned at
    // once, with no step down to test it, so the signature's effects never change mid-moment (Low Power Mode stepped
    // every figure down 0.3–1.3s into its story, and back up after it).
    // Before a step down mid-story, the clock is read afresh: one light frame, asked of the kit, says it (with no light
    // frame ever seen, nothing says the display ran faster). Frames steady at a display's rate, or (Low Power Mode's
    // jitter can keep them from reading steady) at the pace the fresh light names, are the clock's: learned at once, so
    // the signature's effects never change mid-moment.
    if (this.slow > 1 && held && !this.probe) {
      const fresh = this.freshLight(this.slowAt) ?? (this.lights.length ? null : Infinity)
      if (fresh === null) {
        this.wantLight = true
        return false
      }
      const st = this.steady()
      const clock = st !== null && isDisplayRate(st) ? st : fresh
      if (isDisplayRate(clock) && fresh > clock * 0.75 && this.ema < clock * 1.35) {
        this.refresh = clock
        this.slow = this.fast = 0
        return false
      }
    }
    // Hysteresis: a level the device has just failed to hold is off limits for 30s, doubling each time it fails
    // again, so a marginal phone does not climb and fall every four seconds.
    if (this.slow > 1 && this.q > this.minQ && !this.probe) {
      const q = this.q
      this.failures[q] = (this.failures[q] ?? 0) + 1
      this.blockedUntil[q] = now + 30000 * 2 ** (this.failures[q]! - 1)
      this.probe = { from: q, ema: this.ema, at: now }
      this.chainFrom ??= q
      this.q--
      this.slow = 0
      return true
    }
    if (this.fast > 3 && this.q < this.maxQ && now >= (this.blockedUntil[this.q + 1] ?? 0) && !held) {
      this.chainFrom = null
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

/**
 * The interval steady frames come at, else null: the means of four in a row, four in five within 15% of their median
 * (the raw intervals' own median wandered as far as 28ms on a 33ms clock), and no frame over 1.8 times it (a missed
 * frame). A 60 Hz display missing every other frame (17, 33, 17, 33ms) is steady at 25ms, which is no display's rate,
 * so it reads as work.
 */
function steadyAt(v: readonly number[]): number | null {
  const means: number[] = []
  for (let i = 0; i + 4 <= v.length; i++) means.push((v[i]! + v[i + 1]! + v[i + 2]! + v[i + 3]!) / 4)
  if (!means.length) return null
  const m = median(means)
  if (v.some((x) => x > 1.8 * m)) return null
  return means.filter((x) => Math.abs(x - m) <= 0.15 * m).length >= 0.8 * means.length ? m : null
}

const median = (v: readonly number[]) => {
  const s = [...v].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]!
}
