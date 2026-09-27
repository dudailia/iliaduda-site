import { EASE_OUT } from '../ease'

/**
 * A figure's signature moment, as a clock its renderer reads: named phases,
 * each opening on its own window of the sequence and moving 0 → 1 linearly
 * within it (the renderer eases). The rules are the hero's (lib/futures/
 * sequence.ts), for every page: the clock moves only when frames are drawn, so
 * a figure off screen waits where it was; a reader's click or key finishes
 * what is left in a quarter of a second on the strong ease-out rather than
 * cutting it — once a frame of it has been drawn, so an early click spends
 * nothing; using the figure itself ends it at once; Replay starts it over.
 */

/** What is left of a sequence after the reader skips, played in this long. */
export const SKIP_MS = 240

export class Sequence<P extends string> {
  started = false
  private ms = 0
  private seen = false
  private skipFrom = -1
  private skipT = 0

  constructor(
    readonly total: number,
    private readonly windows: Readonly<Record<P, readonly [number, number]>>,
  ) {
    for (const [name, [a, b]] of Object.entries(windows) as [string, readonly [number, number]][])
      if (!(a >= 0 && b <= 1 && a < b)) throw new Error(`phase ${name}: window [${a}, ${b}] is not inside the sequence`)
  }

  start(): void {
    this.started = true
  }

  /** Advance by the time a drawn frame took. Frames not drawn are time not passed. */
  advance(dtMs: number): void {
    if (!(dtMs > 0) || !this.started || this.done) return
    this.seen = true
    if (this.skipFrom >= 0) {
      this.skipT = Math.min(SKIP_MS, this.skipT + dtMs)
      this.ms = this.skipT >= SKIP_MS ? this.total : this.skipFrom + (this.total - this.skipFrom) * EASE_OUT(this.skipT / SKIP_MS)
      return
    }
    this.ms = Math.min(this.total, this.ms + dtMs)
  }

  /** The reader asked to get on with it: finish quickly — only after a frame of it has been seen, and only once. */
  skip(): void {
    if (!this.started || !this.seen || this.done || this.skipFrom >= 0) return
    this.skipFrom = this.ms
    this.skipT = 0
  }

  /** The reader is using the figure itself: the story ends now. */
  finish(): void {
    this.started = true
    this.seen = true
    this.ms = this.total
    this.skipFrom = -1
  }

  replay(): void {
    this.started = true
    this.seen = false
    this.ms = 0
    this.skipFrom = -1
    this.skipT = 0
  }

  phases(): Record<P, number> {
    return this.at(this.ms)
  }

  /**
   * While a skip plays: how far through it (0…1), and the phases where it
   * began, for a figure whose story is not a reveal (a shock that rises and
   * falls) and must not replay what the reader skipped. Null otherwise.
   */
  skipping(): { u: number; from: Record<P, number> } | null {
    if (this.skipFrom < 0 || this.done) return null
    return { u: this.skipT / SKIP_MS, from: this.at(this.skipFrom) }
  }

  private at(ms: number): Record<P, number> {
    const f = ms / this.total
    const out = {} as Record<P, number>
    for (const [name, [a, b]] of Object.entries(this.windows) as [P, readonly [number, number]][])
      out[name] = Math.min(1, Math.max(0, (f - a) / (b - a)))
    return out
  }

  get done(): boolean {
    return this.ms >= this.total
  }
}

/** Keys that are not a request: modifiers on their own, and the keys that scroll the page. */
const NOT_A_REQUEST = new Set(['Shift', 'Meta', 'Control', 'Alt', ' ', 'Spacebar', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End'])

/**
 * Whether an event is the reader asking to get on with it: a click or tap, a
 * key, a mouse or pen press. Not scrolling — by wheel, finger or key — and not
 * a finger landing on the glass, which on a phone is usually the start of a
 * scroll towards the figure. Nor anything on a Replay control (`data-replay`):
 * that starts the story over, and finishing it first would rush the figure
 * forward in the moment between the press and the click.
 */
export function isSkipInput(e: { type: string; pointerType?: string; key?: string; target?: EventTarget | { closest?(sel: string): unknown } | null }): boolean {
  const t = e.target as { closest?(sel: string): unknown } | null | undefined
  if (typeof t?.closest === 'function' && t.closest('[data-replay]')) return false
  switch (e.type) {
    case 'click':
      return true
    case 'keydown':
      return !NOT_A_REQUEST.has(e.key ?? '')
    case 'pointerdown':
      return e.pointerType === 'mouse' || e.pointerType === 'pen'
    default:
      return false
  }
}
