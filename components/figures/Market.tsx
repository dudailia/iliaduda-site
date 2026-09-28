import { syntheticValue as value } from '@/content/synthetic'
import { POSTER_T, SEED } from '@/lib/market/flow'
import { shockedHash } from '@/lib/market/host'
import { bookFrame, fanFrame, marketFrame, SHOCK_FRAME_S, type Moment } from '@/lib/market/poster'
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
        surface: (
          <SurfacePoster
            at={surface}
            mesh={moment === 'shock' ? { wide: '/market/surface-shock.svg', tall: '/market/surface-tall-shock.svg' } : { wide: '/market/surface.svg', tall: '/market/surface-tall.svg' }}
            notes={false}
            lazy={moment === 'shock'}
          />
        ),
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
      <script dangerouslySetInnerHTML={{ __html: prepaint('market') }} />
      <style>{STAGE_CSS}</style>
      <MarketLive
        seed={SEED}
        t0={POSTER_T}
        initial={{ calm: calm.initial, shock: shock.initial }}
        posters={{ calm: calm.posters, shock: shock.posters }}
        stillAfter={SHOCK_FRAME_S}
        hashes={{ start: m.hash(), shocked: shockedHash(SEED, POSTER_T) }}
        title="One simulated market, three views of it in the same frame: its vol surface, its order book and a year of its futures."
        subtitle={`Simulated · one seed · Hawkes order flow · realised volatility · SSVI · tick ${usd(1)} · not market data`}
        caption={
          <>
            Above, the vol surface the market&rsquo;s stress sets; below, the last twenty seconds of its order book, price up the side
            and time across, each price in the tone of the shares waiting between it and the touch, with the price through the middle
            and every trade a dot, and the book&rsquo;s depth now beside it; and a year of futures from its price now, at its own
            realised volatility. A liquidity shock sweeps the bids and sets off a burst of selling: every view takes it in the frame it
            lands.
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
