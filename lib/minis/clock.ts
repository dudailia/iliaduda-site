/**
 * One clock for the Contents miniatures (components/thumbs/): at most MINI_FPS frames a second, drawn only for the
 * minis on screen, none while the page is hidden. Each mini keeps its own time, which moves only while it is drawn, a
 * frame at most a tenth of a second, so a mini scrolled away and back carries on from where it was. Pure: the page
 * calls `tick` from its animation frame.
 */
export const MINI_FPS = 30
const STEP = 1000 / MINI_FPS
const MAX_DT = 0.1

export interface MiniFrame {
  id: string
  /** The mini's own time, seconds, and the time since its last frame. */
  t: number
  dt: number
}

interface Entry {
  shown: boolean
  t: number
  last: number | null
}

export class MiniClock {
  private readonly minis = new Map<string, Entry>()
  private hidden = false
  private next = -Infinity

  add(id: string): void {
    if (!this.minis.has(id)) this.minis.set(id, { shown: false, t: 0, last: null })
  }

  /** On screen or not. A mini that comes back starts its next frame afresh, so off-screen time never counts. */
  show(id: string, on: boolean): void {
    const m = this.minis.get(id)
    if (!m || m.shown === on) return
    m.shown = on
    m.last = null
  }

  /** The page's visibility. */
  hide(hidden: boolean): void {
    if (this.hidden === hidden) return
    this.hidden = hidden
    for (const m of this.minis.values()) m.last = null
  }

  /** A mini's own time, seconds (0 for one the clock has not met). */
  timeOf(id: string): number {
    return this.minis.get(id)?.t ?? 0
  }

  /** True when there is nothing to draw: the page may stop asking for frames. */
  get idle(): boolean {
    if (this.hidden) return true
    for (const m of this.minis.values()) if (m.shown) return false
    return true
  }

  /** The frames to draw at `now` (ms): none between two of the clock's steps. */
  tick(now: number): MiniFrame[] {
    if (this.idle || now < this.next) return []
    // Half a millisecond early, so a display whose frames land a hair before the step still draws on it.
    this.next = now + STEP - 0.5
    const out: MiniFrame[] = []
    for (const [id, m] of this.minis) {
      if (!m.shown) continue
      const dt = m.last === null ? 0 : Math.min(MAX_DT, (now - m.last) / 1000)
      m.last = now
      m.t += dt
      out.push({ id, t: m.t, dt })
    }
    return out
  }
}
