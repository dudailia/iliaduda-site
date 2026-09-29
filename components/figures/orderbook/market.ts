import { Flow, POSTER_T, posterFlow } from '@/lib/market/flow'
import { handedTo, spend } from '@/lib/minis/handoff'
import { advanceInSlices } from '@/lib/market/slices'

/**
 * The one market /order-book's two figures draw: made once, when the first of
 * them needs it, from the seed and the moment of the server's still frame (in
 * slices of a few milliseconds, lib/market/slices.ts, so a phone's page is
 * never held for the two minutes of burn-in it runs first), and
 * advanced once a frame by whichever figure draws first in it, by the time
 * that frame owes (in whole quanta, lib/market/flow.ts). So Fig. 1's terrain
 * and Fig. 2's strips are always the same market at the same moment. Paused,
 * it holds; while neither figure draws, it waits, and picks up where it was.
 */

const PAUSED = 'orderbook-paused'
/** The most one frame may advance the market, in seconds: after a gap it resumes, it does not catch up. */
const MAX_DT = 0.1
/** Work per slice of the build, in milliseconds: under a frame, so the page keeps drawing and answering. */
const SLICE_MS = 6

export class PageMarket {
  private f: Flow | null = null
  private building: Promise<Flow> | null = null
  private owed = 0
  private at = -1
  private stopped: boolean | null = null
  private readonly subs = new Set<() => void>()
  private stillFig = false
  private holds = new Set<string>()
  /** The event selected in Fig. 2, which Fig. 1 marks on its terrain: its price, in ticks, and its time. */
  highlight: { price: number; t: number } | null = null

  /**
   * Held while the reader is reading Fig. 2 (a mouse over its strips, or its keyboard focus): a soft pause, so the
   * order pointed at stays where it was pointed at; the market carries on from there afterwards, never jumping ahead.
   * Unlike Pause, it is not kept for the visit.
   */
  get held(): boolean {
    return this.holds.size > 0
  }

  hold(by: string, on: boolean) {
    const was = this.held
    if (on) this.holds.add(by)
    else this.holds.delete(by)
    if (this.held !== was) for (const s of this.subs) s()
  }

  /**
   * Fig. 1 shows its still frame here (it will not go live): Fig. 2 then draws that same moment, still, rather than a
   * market running on ahead of the picture above it.
   */
  get still(): boolean {
    return this.stillFig
  }

  setStill(v: boolean) {
    if (v === this.stillFig) return
    this.stillFig = v
    for (const s of this.subs) s()
  }

  /** Whether the market is built: until then the figures show their still frames. */
  get ready(): boolean {
    return this.f !== null
  }

  /** The market, built by prepare(). Asked for before that, it is built here in one go, which nothing should need. */
  get flow(): Flow {
    if (!this.f) this.settle(posterFlow())
    return this.f!
  }

  /** Build the market in slices, handing the page back between them; resolves with it, at once if it is built. */
  prepare(): Promise<Flow> {
    if (this.f) return Promise.resolve(this.f)
    // From the moment its Contents miniature was at, if the reader came from it (lib/minis/handoff.ts): the same market.
    const from = this.claim()
    this.building ??= advanceInSlices(new Flow(undefined, undefined, false), from, SLICE_MS, () => performance.now(), (next) => setTimeout(next, 0)).then((f) => {
      if (!this.f) this.settle(f)
      return this.f!
    })
    return this.building
  }

  private handed: number | null = null
  /**
   * The hand-off from the Contents, taken once, as the page opens (the figure calls this on mounting), so it is spent
   * whether or not the market is ever built here; its moment is kept for prepare().
   */
  claim(): number {
    if (this.handed === null) {
      this.handed = handedTo('order-book', POSTER_T) ?? POSTER_T
      spend()
    }
    return this.handed
  }

  private settle(f: Flow) {
    this.f = f
    this.owed = f.t
    for (const s of this.subs) s()
  }

  /** Whether the reader has paused it; kept for the visit. */
  get paused(): boolean {
    if (this.stopped === null) {
      try {
        this.stopped = sessionStorage.getItem(PAUSED) === '1'
      } catch {
        this.stopped = false
      }
    }
    return this.stopped
  }

  setPaused(p: boolean) {
    this.stopped = p
    try {
      sessionStorage.setItem(PAUSED, p ? '1' : '0')
    } catch {}
    for (const s of this.subs) s()
  }

  /**
   * Advance by the frame being drawn. Every figure calls this from its own frame loop; the frame's own timestamp
   * (the same for every animation-frame callback in it) makes the second call a no-op. Returns the rows written.
   */
  tick(): number {
    const now = (document.timeline?.currentTime as number | null) ?? performance.now()
    if (now === this.at) return 0
    const dt = this.at < 0 ? 0 : Math.min(MAX_DT, Math.max(0, (now - this.at) / 1000))
    this.at = now
    if (this.paused || this.held) return 0
    this.owed += dt
    return this.flow.advance(this.owed)
  }

  subscribe = (fn: () => void) => {
    this.subs.add(fn)
    return () => {
      this.subs.delete(fn)
    }
  }
  getPaused = () => this.paused
  getReady = () => this.ready
  getStill = () => this.still
  getHeld = () => this.held
}

export const market = new PageMarket()
