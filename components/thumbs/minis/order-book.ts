import { Flow, MARKET, POSTER_T, SEED } from '@/lib/market/flow'
import { orderBookShape } from '@/lib/minis/orderBook'
import { paint, type MakeMini } from '../paint'

/**
 * /order-book's miniature: the paper's own market (the same seed and flow), built on the page four milliseconds a frame
 * to the thumbnail's moment (so it never holds the page up), then trading at real time, its ridges sliding back
 * as the thumbnail draws them.
 */
export const make: MakeMini = () => {
  const f = new Flow(SEED, MARKET, false)
  let at = 0
  // Its own time from the first frame it shows, which is the thumbnail's moment.
  let live = 0
  return {
    ready: () => f.t >= POSTER_T - 1e-9,
    time: () => f.t,
    draw(g, w, h, _t, dt, pal) {
      if (f.t < POSTER_T - 1e-9) {
        // Four milliseconds of building a frame, half a simulated second at a time, so a slow phone never stalls.
        const t0 = performance.now()
        do {
          at = Math.min(POSTER_T, at + 0.5)
          f.advance(at)
        } while (at < POSTER_T && performance.now() - t0 < 4)
        // The slice that reaches the thumbnail's moment paints it, the frame it first shows.
        if (f.t < POSTER_T - 1e-9) return
      } else live += dt
      f.advance(POSTER_T + live)
      paint(g, orderBookShape(f), w, h, pal)
    },
  }
}
