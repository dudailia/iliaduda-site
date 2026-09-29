import { Fan } from '@/lib/futures/fan'
import { MODEL } from '@/lib/futures/mc'
import { Market } from '@/lib/market/engine'
import { MARKET, POSTER_T, SEED } from '@/lib/market/flow'
import { surfaceOf } from '@/lib/market/surface'
import { fanAt } from '@/lib/market/views'
import { marketShape } from '@/lib/minis/market'
import { paint, type MakeMini } from '../paint'

/**
 * /market's miniature: the paper's own market, built on the page four milliseconds a frame to the thumbnail's
 * moment, and its year of futures drawn a slice a frame there, as the worker draws them; then trading at real time, the
 * price running into the futures, which breathe with its realised volatility (mapped exactly from the one fan, as the
 * paper's figure does between fans), and the surface at its stress.
 */
export const make: MakeMini = () => {
  const m = new Market(SEED, MARKET, false)
  const fan = new Fan()
  let at = 0
  // Its own time from the first frame it shows, which is the thumbnail's moment.
  let live = 0
  let base: Parameters<typeof fanAt>[0] | null = null
  const bands = new Float64Array(5 * 65)
  const strands = new Float64Array(48 * 65)
  return {
    ready: () => base !== null,
    time: () => m.t,
    draw(g, w, h, _t, dt, pal) {
      if (m.t < POSTER_T - 1e-9) {
        // Four milliseconds of building a frame, half a simulated second at a time, so a slow phone never stalls.
        const t0 = performance.now()
        do {
          at = Math.min(POSTER_T, at + 0.5)
          m.advance(at)
        } while (at < POSTER_T && performance.now() - t0 < 4)
        if (m.t >= POSTER_T - 1e-9) fan.begin(1, m.sigma)
        return
      }
      if (!base) {
        if (!fan.work(512)) return
        base = { sigma: m.sigma, r: MODEL.r, dt: MODEL.T / MODEL.steps, bands: fan.bandsData(), strands: fan.strands() }
      }
      live += dt
      m.advance(POSTER_T + live)
      fanAt(base, m.sigma, bands, strands)
      const f = m.flow
      paint(
        g,
        marketShape({
          mid: (age) => {
            const r = f.row(age)
            return r >= 0 ? f.mids[r]! : undefined
          },
          now: f.book.mid,
          band: (b, j) => bands[b * 65 + j]!,
          strand: (i, j) => strands[i * 65 + j]!,
          surface: surfaceOf(m.stress),
          // Turned as the paper's surface sways (48 s), from where the thumbnail has it.
          sway: Math.sin((2 * Math.PI * live) / 48),
        }),
        w,
        h,
        pal,
      )
    },
  }
}
