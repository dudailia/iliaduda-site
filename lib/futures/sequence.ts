import { EASE_OUT } from '../ease'

/**
 * The home figure's one orchestrated moment, as a clock the renderer reads.
 *
 * Once per visit, the first time the figure is half on screen: the futures
 * burst out of today and fan to expiry, land in the terminal histogram, the
 * histogram becomes payoff × how often it happens, and the price settles on
 * the formula. Only the reveal is choreographed. The histogram and the price
 * are the GPU's own numbers throughout, and they converge as fast as the
 * device prices.
 *
 * The clock only moves when frames are drawn, so a figure scrolled off screen
 * (no frames) waits where it was. A reader's input does not cut it: what is
 * left plays in a quarter of a second on the strong ease-out, because a cut
 * in the middle of the morph is exactly the jarring change the motion exists
 * to prevent.
 */

export const SEQ_MS = 3600
/** What is left of the sequence after the reader skips, played in this long. */
export const SKIP_MS = 240

export interface Phases {
  /** Paths leaving today and fanning to expiry. */
  burst: number
  /** The terminal histogram rising off the expiry axis. */
  landing: number
  /** Counts becoming payoff × probability. */
  morph: number
  /** The price label, and the estimate the rail is converging. */
  price: number
}

/** Each phase's window, as fractions of the sequence. The renderer eases within them. */
const WINDOWS: Readonly<Record<keyof Phases, readonly [number, number]>> = {
  burst: [0, 0.34],
  landing: [0.18, 0.56],
  morph: [0.52, 0.78],
  price: [0.72, 1],
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** Linear progress of each phase `ms` into the sequence. */
export function phaseAt(ms: number): Phases {
  const f = ms / SEQ_MS
  const at = ([a, b]: readonly [number, number]) => clamp01((f - a) / (b - a))
  return { burst: at(WINDOWS.burst), landing: at(WINDOWS.landing), morph: at(WINDOWS.morph), price: at(WINDOWS.price) }
}

export class Timeline {
  started = false
  private ms = 0
  /** Where a skip began, or -1. */
  private skipFrom = -1
  private skipT = 0

  start(): void {
    this.started = true
  }

  /** Advance by the time a drawn frame took. Frames not drawn are time not passed. */
  advance(dtMs: number): void {
    if (!(dtMs > 0) || !this.started || this.done) return
    if (this.skipFrom >= 0) {
      this.skipT = Math.min(SKIP_MS, this.skipT + dtMs)
      this.ms = this.skipT >= SKIP_MS ? SEQ_MS : this.skipFrom + (SEQ_MS - this.skipFrom) * EASE_OUT(this.skipT / SKIP_MS)
      return
    }
    this.ms = Math.min(SEQ_MS, this.ms + dtMs)
  }

  /** The reader asked to skip: finish quickly. Only while it plays; a second skip changes nothing. */
  skip(): void {
    if (!this.started || this.done || this.skipFrom >= 0) return
    this.skipFrom = this.ms
    this.skipT = 0
  }

  replay(): void {
    this.started = true
    this.ms = 0
    this.skipFrom = -1
    this.skipT = 0
  }

  phases(): Phases {
    return phaseAt(this.ms)
  }

  get done(): boolean {
    return this.ms >= SEQ_MS
  }
}

const MODIFIERS = new Set(['Shift', 'Meta', 'Control', 'Alt'])

/**
 * Whether an event is the reader asking to get on with it: a click or tap, a
 * key, a mouse or pen press. Not scrolling, and not a finger landing on the
 * glass, which on a phone is usually the start of a scroll towards the figure.
 */
export function isSkipInput(e: { type: string; pointerType?: string; key?: string }): boolean {
  switch (e.type) {
    case 'click':
      return true
    case 'keydown':
      return !MODIFIERS.has(e.key ?? '')
    case 'pointerdown':
      return e.pointerType === 'mouse' || e.pointerType === 'pen'
    default:
      return false
  }
}
