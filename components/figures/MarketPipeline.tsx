import { syntheticValue as value } from '@/content/synthetic'
import { PipelineLive } from './market/Pipeline'

/**
 * Fig. 2 of /market: where the market runs. The worker holds the market and draws its futures; the page asks it for
 * a frame at its own clock and draws the three views from the answer; one buffer crosses between them, lent and
 * given back. The rates are this browser's own, measured as it runs (components/figures/market/Live.tsx).
 */
export function MarketPipelineFigure() {
  const tick = value('mkTick')
  return (
    <PipelineLive
      title="Where it runs: the market in a worker, the three views on the page, and one buffer between them."
      subtitle={`Simulated market · measured in your browser · tick $${tick.toFixed(2)}`}
      caption={
        <>
          The page never runs the market: each animation frame it asks the worker for the market at the page&rsquo;s own clock, and
          the worker answers with one buffer the page lent it, moved between the threads rather than copied, carrying the
          market as it is and what changed since the last frame. The rates in the margin are this browser&rsquo;s, as it
          runs; headroom is how many times faster than real time the worker could run the market, and the time held is how
          long the market waited while the page was away.
        </>
      }
      table={
        <table>
          <caption>What crosses between the worker and the page, each frame.</caption>
          <tbody>
            <tr>
              <th scope="row">To the worker</th>
              <td>a request for the market at the page&rsquo;s clock, with an empty buffer; a reader&rsquo;s shock, pause or reset</td>
            </tr>
            <tr>
              <th scope="row">To the page</th>
              <td>the buffer, filled: the market&rsquo;s state, the book at now, the rows and trades since the last frame; and each new fan of futures</td>
            </tr>
          </tbody>
        </table>
      }
    />
  )
}
