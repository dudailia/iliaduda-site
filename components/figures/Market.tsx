import { syntheticValue as value } from '@/content/synthetic'
import { FAN } from '@/lib/futures/fan'
import { POSTER_T, SEED } from '@/lib/market/flow'
import { shockedHash } from '@/lib/market/host'
import { bookFrame, fanFrame, marketFrame, SHOCK_FRAME_S, type Moment } from '@/lib/market/poster'
import { handoffMark } from '@/lib/minis/handoff'
import { prepaint } from '@/lib/stage/prepaint'
import { STAGE_CSS } from '@/lib/surface/poster'
import { pct } from '@/lib/surface/readouts'
import { iv } from '@/lib/surface/ssvi'
import { MarketLive } from './market/Live'
import { BookPoster, FanPoster } from './market/Poster'
import { Poster as SurfacePoster } from './surface/Poster'

/**
 * Fig. 1 of /market: one simulated market, drawn three ways in the same frame. The seeded market runs here, at
 * build time, to the moment the live figure starts from, and its still frames are drawn from it
 * (lib/market/poster.ts); the browser runs the same seed in a worker from the same moment on (lib/market/host.ts),
 * so the page opens on the market it then runs. Only the frames and the summary numbers are sent.
 */
export function MarketFigure() {
  const tick = value('mkTick')
  const usd = (ticks: number) => `$${(ticks * tick).toFixed(2)}`
  const frame = (moment: Moment) => {
    const { m, surface } = marketFrame(moment)
    const book = bookFrame(moment)
    const fan = fanFrame(moment)
    const s = m.flow.stats()
    return {
      m,
      surface,
      fan,
      initial: { t: m.t, mid: m.flow.book.mid, spread: m.flow.book.spread, sigma: m.sigma, stress: m.stress, rate: s.rate, expected: m.flow.expected, lo: fan.lo, hi: fan.hi },
      posters: {
        book: <BookPoster ticks={book.ticks} usd={usd} moment={moment} />,
        fan: <FanPoster ticks={fan.ticks} moment={moment} />,
      },
    }
  }
  const calm = frame('calm')
  const shock = frame('shock')
  const { m, surface, fan } = calm
  const initial = calm.initial
  const s = m.flow.stats()
  const atm = iv(surface, 0, 1 / 12)
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: prepaint('market') + handoffMark('market', 'market') }} />
      <style>{STAGE_CSS}</style>
      <MarketLive
        seed={SEED}
        t0={POSTER_T}
        initial={{ calm: calm.initial, shock: shock.initial }}
        posters={{
          // The surface's picture is the calm one; a shocked surface is drawn on the page, smooth, at its stress then.
          calm: { ...calm.posters, surface: <SurfacePoster at={calm.surface} mesh={{ wide: '/market/surface.svg', tall: '/market/surface-tall.svg' }} notes={false} /> },
          shock: shock.posters,
        }}
        stillAfter={SHOCK_FRAME_S}
        hashes={{ start: m.hash(), shocked: shockedHash(SEED, POSTER_T) }}
        stillSurface={{ calm: calm.surface, shock: shock.surface }}
        title="Its vol surface, the last twenty seconds of its order book and a year of its futures, each drawn from the same copy of the market in the same frame."
        subtitle={`Simulated · one seed · Hawkes order flow · realised volatility · SSVI · tick ${usd(1)} · not market data`}
        caption={
          <>
            First the vol surface, its shock set by the market&rsquo;s stress. Then the order book: price up the side and time
            across, each price in the tone of the shares waiting there, the price through the middle in ink and each trade a
            dot, and at its right edge the book&rsquo;s depth now, every share between a price and the best one. Then a year of its futures, simulated paths of its
            price from now at its own realised volatility: the 5th to 95th and 25th to 75th percentiles as washes, and {FAN.strands} of the
            paths.
          </>
        }
        table={
          <table>
            <caption>{`The market at the still frame: price ${usd(initial.mid)}, spread ${initial.spread} ${initial.spread === 1 ? 'tick' : 'ticks'}, realised volatility ${pct(initial.sigma)}, stress ${initial.stress.toFixed(2)}, one-month at-the-money volatility ${pct(atm)}, and a year out the 5th to 95th percentile of its futures from $${fan.lo.toFixed(2)} to $${fan.hi.toFixed(2)}. A second after a liquidity shock: price ${usd(shock.initial.mid)}, realised volatility ${pct(shock.initial.sigma)}, stress ${shock.initial.stress.toFixed(2)}.`}</caption>
            <tbody>
              <tr>
                <th scope="row">Events a second, over the last ten simulated seconds</th>
                <td>{s.rate.toFixed(1)}</td>
              </tr>
              <tr>
                <th scope="row">The model&rsquo;s stationary rate</th>
                <td>{m.flow.expected.toFixed(1)}</td>
              </tr>
            </tbody>
          </table>
        }
      />
    </>
  )
}
