import type { Metadata } from 'next'
import { Hero } from '@/components/lab/a/Hero'
import { LabPage } from '@/components/lab/LabPage'
import { MODEL, bs } from '@/lib/lab/a/mc'
import { POSTER_PATHS, ensemble, summarize } from '@/lib/lab/a/poster'

export const metadata: Metadata = { title: 'Lab A — A million futures' }

/**
 * The poster's numbers are computed here, at build time, with the CPU mirror
 * of the GPU generator: the first 65,536 paths of the same ensemble the live
 * figure runs, their histogram, and the price they give. Only the summary is
 * sent; the strands are regenerated from their ids wherever they are drawn.
 */
export default function LabA() {
  const initial = summarize(ensemble(MODEL.sigma, POSTER_PATHS), MODEL.strike)
  const exact = bs(MODEL.sigma, MODEL.strike)
  return (
    <LabPage
      slug="a"
      hero={<Hero initial={initial} />}
      headline="A million futures for one stock, priced on your graphics card"
      caption={
        <>
          <p>
            Nobody knows where a stock will be in a year, but you can describe the odds and draw thousands of futures
            that follow them. An option that pays whatever the stock finishes above an agreed price, the strike, is worth
            the average of what it pays across those futures, discounted to today. Draw more futures and the average
            tightens around the true value.
          </p>
          <p>
            For this model there is a formula for that value, Black–Scholes, so the figure can show the simulation
            closing in on it: {exact.toFixed(2)} at the defaults, with the gap shrinking as the paths pile up. Drag
            sideways to make the stock more volatile and the futures fan out; point at a price to move the strike.
          </p>
        </>
      }
      method={
        <>
          <p>
            Every path is geometric Brownian motion under the risk-neutral measure, stepped exactly in log space over{' '}
            {MODEL.steps} steps: S<sub>0</sub> = ${MODEL.s0}, T = {MODEL.T} year, r = {Math.round(MODEL.r * 1000) / 10}%, no dividends. The random numbers come from a counter-based
            hash (PCG4D of path id, step, seed) with Box–Muller, so any path can be regenerated anywhere; a CPU mirror of
            the same arithmetic backs the unit tests, which hold the estimator to within four standard errors of
            Black–Scholes and check that its error falls like 1/√n.
          </p>
          <p>
            A fragment shader simulates up to 65,536 paths per draw (fewer on a lighter device) into a 32-bit float target, writing payoff, payoff², final
            price and a count. Four-by-four summing passes reduce each batch to one texel; terminal prices are scattered
            into the histogram with additive blending. Results return through a pixel-pack buffer behind a fence, so the
            page never waits on the GPU, and are summed in double precision. The number of batches per frame adapts to
            what this device finishes inside a frame, and the speed shown is paths actually simulated and read back per
            second. The drawn strands are members of the same ensemble, accumulated into a float density buffer, bloomed
            and tone-mapped. The indigo area of the payoff bars, discounted, is the price.
          </p>
        </>
      }
    />
  )
}
