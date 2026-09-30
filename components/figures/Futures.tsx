import { syntheticValue as value } from '@/content/synthetic'
import { Market } from '@/lib/market/engine'
import { POSTER_T, SEED } from '@/lib/market/flow'
import { POSTER_PATHS, ensemble, summarize } from '@/lib/futures/poster'
import { FuturesLive } from './futures/Live'

/**
 * Fig. 1 of the issue: a million futures for one simulated stock, priced on
 * the reader's graphics card.
 *
 * The poster's numbers are computed here, at build time, with the CPU mirror
 * of the GPU generator: the first 65,536 paths of the same ensemble the live
 * figure runs, their histogram, what each bin pays and the price they give.
 * Only the summary is sent; the strands are regenerated from their ids
 * wherever they are drawn.
 *
 * The inline script runs before first paint. When this visit will play the
 * signature sequence — not seen this session, motion allowed, WebGL2 present,
 * data not being saved — it marks the page, and the poster paints as the
 * composed frame without its futures, which the burst then fills. If the live
 * figure never takes over (its bundle failed), the mark is dropped after 8s
 * and the finished picture fades in. A visit that can never go live (reduced
 * motion, no WebGL2, data saved) is marked too, and the room kept for the live
 * controls collapses before it is ever seen.
 */
const PREPAINT = `try{var d=document.documentElement;var still=matchMedia('(prefers-reduced-motion: reduce)').matches||!('WebGL2RenderingContext' in window)||!!(navigator.connection&&navigator.connection.saveData);if(still)d.dataset.futuresStill='1';else if(!sessionStorage.getItem('futures-seq')){d.dataset.futuresSeq='1';setTimeout(function(){if(!d.dataset.futuresLive)delete d.dataset.futuresSeq},8000)}}catch(e){}`

export function FuturesFigure() {
  const { stats, counts, payoff, payBars, outline } = summarize(ensemble(value('fuSigma'), POSTER_PATHS), value('fuStrike'))
  // One market: the stock's volatility starts at the simulated market's own, where /market's figure opens
  // (tests/futures.test.ts holds the fact to it); the browser works it out again where the figure runs live.
  const m = new Market(SEED)
  m.advance(POSTER_T)
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: PREPAINT }} />
      <FuturesLive initial={{ stats, counts, payoff, payBars, outline }} market={{ seed: SEED, t: POSTER_T, sigma: m.sigma }} />
    </>
  )
}
