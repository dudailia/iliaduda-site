import { posterFlow, type Flow } from '@/lib/market/flow'

/**
 * The one market /order-book's two figures draw: made once, when the first of
 * them needs it, from the seed and the moment of the server's still frame, and
 * advanced once a frame by whichever figure draws first in it, by the time
 * that frame owes (in whole quanta, lib/market/flow.ts). So Fig. 1's terrain
 * and Fig. 2's strips are always the same market at the same moment. Paused,
 * it holds; while neither figure draws, it waits, and picks up where it was.
 */

const PAUSED = 'orderbook-paused'
/** The most one frame may advance the market, in seconds: after a gap it resumes, it does not catch up. */
const MAX_DT = 0.1

class PageMarket {
  private f: Flow | null = null
  private owed = 0
  private at = -1
  private held: boolean | null = null
  private readonly subs = new Set<() => void>()
  /** The event selected in Fig. 2, which Fig. 1 marks on its terrain: its price, in ticks, and its time. */
  highlight: { price: number; t: number } | null = null

  /** The market, made on first use. */
  get flow(): Flow {
    if (!this.f) {
      this.f = posterFlow()
      this.owed = this.f.t
    }
    return this.f
  }

  /** Whether the reader has paused it; kept for the visit. */
  get paused(): boolean {
    if (this.held === null) {
      try {
        this.held = sessionStorage.getItem(PAUSED) === '1'
      } catch {
        this.held = false
      }
    }
    return this.held
  }

  setPaused(p: boolean) {
    this.held = p
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
    if (this.paused) return 0
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
}

export const market = new PageMarket()
