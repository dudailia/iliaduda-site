import { syntheticValue as value } from '@/content/synthetic'
import { posterFlow } from '@/lib/market/flow'
import { fmt } from '@/lib/orderbook/read'
import { handoffMark } from '@/lib/minis/handoff'
import { prepaint } from '@/lib/stage/prepaint'
import { OrderBookLive } from './orderbook/Live'
import { Poster } from './orderbook/Poster'

/**
 * Fig. 1 of /order-book: the recent history of a synthetic limit order book
 * as terrain, simulated in the reader's browser.
 *
 * The seeded market runs here, at build time, to the poster's moment; the
 * browser runs the same seed to the same moment and continues from there
 * (lib/market/flow.ts: fixed quanta and its own exp and log, so both are one
 * market). Only the poster and the summary numbers are sent.
 */
export function OrderBookFigure() {
  const sim = posterFlow()
  const s = sim.stats()
  const initial = { rate: s.rate, trades: s.trades, shares: s.shares, mid: s.mid, spread: s.spread, rho: sim.rho, expected: sim.expected }
  const label = `A frame of a synthetic order book, its recent history receding from the front: shares waiting to buy form the left wall, shares waiting to sell the right, and the price runs along the valley between them at ${fmt.usd(s.mid)}, with a spread of ${fmt.spread(s.spread)}. ${s.trades} trades in the last ten seconds are marked as dots.`
  const r = sim.row(0)
  const levels = Array.from({ length: 5 }, (_, i) => ({
    bid: sim.bids[r]! - i,
    ask: sim.asks[r]! + i,
  }))
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: prepaint('orderbook') + handoffMark('orderbook', 'order-book') }} />
      <OrderBookLive
        poster={<Poster sim={sim} label={label} />}
        initial={initial}
        title={`A simulated order book for a ${fmt.usd(Math.round(value('mkOpen') / value('mkTick')))} stock, second by second: each ridge is the shares waiting at a price.`}
        subtitle={`Simulated · Hawkes order flow · six kinds of order · tick ${fmt.usd(1)} · not market data`}
        caption={
          <>
            The left wall is shares waiting to buy and the right wall shares waiting to sell; the taller the wall, the more
            is waiting. The line along the valley floor is the price, and each spark is a trade. Time recedes into the page
            from now, at the front edge.
          </>
        }
        table={
          <table>
            <caption>{`The best five price levels on each side at the frame shown, and the shares waiting at each. Mid ${fmt.mid(s.mid)}, spread ${fmt.spread(s.spread)}.`}</caption>
            <thead>
              <tr>
                <th scope="col">Bid</th>
                <th scope="col">Shares waiting to buy</th>
                <th scope="col">Ask</th>
                <th scope="col">Shares waiting to sell</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((l) => (
                <tr key={l.bid}>
                  <td>{fmt.usd(l.bid)}</td>
                  <td>{fmt.shares(sim.book.bidAt(l.bid))}</td>
                  <td>{fmt.usd(l.ask)}</td>
                  <td>{fmt.shares(sim.book.askAt(l.ask))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      />
    </>
  )
}
