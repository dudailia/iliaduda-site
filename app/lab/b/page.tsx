import type { Metadata } from 'next'
import { LabPage } from '@/components/lab/LabPage'
import { BookHero } from '@/components/lab/b/BookHero'
import { Poster } from '@/components/lab/b/Poster'
import { HZ, ROWS, posterSim } from '@/lib/lab/b/sim'
import { fmt } from '@/lib/lab/b/read'

export const metadata: Metadata = { title: 'Lab B — The order book as terrain' }

export default function LabB() {
  // The seeded market, run on the server to the poster's frame. The browser
  // runs the same seed to the same moment and continues from there.
  const sim = posterSim()
  const s = sim.stats()
  const initial = { rate: s.rate, trades: s.trades, shares: s.shares, mid: s.mid, spread: s.spread, rho: sim.rho, expected: sim.expected }
  const seconds = Math.round(ROWS / HZ)
  const label = `Still frame of a synthetic order book over ${seconds} seconds: buyers' orders form the left wall, sellers' the right, and the price runs along the valley between them at ${fmt.usd(s.mid)}, with a spread of ${fmt.spread(s.spread)}. ${s.trades} trades in the last ten seconds are marked as dots.`

  return (
    <LabPage
      slug="b"
      hero={<BookHero posterWide={<Poster sim={sim} variant="wide" label={label} />} posterNarrow={<Poster sim={sim} variant="narrow" label={label} />} initial={initial} />}
      headline="Buyers wait on one side, sellers on the other, and the price runs between them."
      caption={
        <>
          <p>
            Every market keeps a list of people waiting to trade: buyers bidding a little below the price, sellers asking a little above it. Here that list is a landscape. The left wall is shares waiting to buy, the right wall shares waiting to sell, and the taller the wall, the more is waiting. The glowing line along the valley floor is the price. Each spark is a trade, the moment someone stops waiting and takes the other side. Time flows away from you; the front edge is now.
          </p>
          <p>
            The market is synthetic, simulated live in your browser at about {Math.round(sim.expected)} events a second (orders placed, taken and cancelled), slow enough to follow one at a time, and every number on the figure is computed from that simulation as it runs.
          </p>
        </>
      }
      method={
        <>
          <p>
            Six kinds of order arrive, limit and market buys and sells and a cancellation on each side, as a multivariate Hawkes process: each event briefly raises the rate of others, so trades cluster and eaten liquidity refills, as they do in real order flow. The kernels are exponential, so every intensity updates in closed form, and events are drawn exactly by Ogata thinning. The branching matrix has spectral radius {sim.rho.toFixed(2)}, the branching ratio, so the process is stationary, and its long-run rate (I − B)⁻¹μ = {sim.expected.toFixed(1)} events a second is what the live counter converges to; a test holds it to within 2% over 20,000 simulated seconds.
          </p>
          <p>
            Orders land in a price-level book. Limit orders join a queue at a power-law distance from the best price, market orders walk the book level by level, and cancellations shed part of a queue in proportion to its size. Tests hold the invariants over 200,000 events: the book never crosses, no queue goes negative, and each fill executes at the best price standing at that moment. Twelve times a simulated second, one row of cumulative depth streams into a float texture; the vertex shader lifts a grid of up to 129 × 256 vertices from it, and hovering casts a ray against the same stored rows, so the readout is the snapshot under the cursor. The still frame is the same seeded market, drawn on the server.
          </p>
        </>
      }
    />
  )
}
