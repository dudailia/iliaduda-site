import { syntheticValue as value } from '@/content/synthetic'
import { HAWKES, MARKET_BUY, MARKET_SELL, posterFlow } from '@/lib/market/flow'
import { stationaryRates } from '@/lib/market/hawkes'
import { HEIGHT } from '@/lib/orderbook/flowLayout'
import { LANE_NAMES, LANE_OF, NAMES, SECONDS, causes, flowFrame, recent } from '@/lib/orderbook/flowview'
import { fmt } from '@/lib/orderbook/read'
import { OrderFlowLive } from './orderflow/Live'

/**
 * Fig. 2 of /order-book: the order flow behind Fig. 1's terrain, on the same
 * seeded market at the same moment. The still frame is built here, at build
 * time (the image is app/(pages)/order-book/flow.svg), with its readouts and
 * the table of the last twenty orders; the browser draws the same market live.
 */
export function OrderFlowFigure() {
  const sim = posterFlow()
  const cols = 250
  const fr = flowFrame(sim, { t0: sim.t - SECONDS, t1: sim.t, cols }, HAWKES)
  const count = (type: number) => {
    let n = 0
    for (let c = 0; c < cols; c++) n += fr.counts[LANE_OF[type]! * cols + c]!
    return n
  }
  const sum = (a: readonly number[]) => a.reduce((x, y) => x + y, 0)
  const rates = stationaryRates(HAWKES)
  const initial = { buys: count(MARKET_BUY), sells: count(MARKET_SELL), own: fr.own, theory: sum(HAWKES.mu) / sum(rates), emptied: fr.emptied.length }
  // Market buys alone: the share the model expects to arrive on their own, μ over the stationary rate.
  const buysOwn = HAWKES.mu[MARKET_BUY]! / rates[MARKET_BUY]!
  const open = fmt.usd(Math.round(value('mkOpen') / value('mkTick')))
  const alt = `The order flow in the ${SECONDS} seconds to Fig. 1's still frame: ${initial.buys} market buys and ${initial.sells} market sells, in bursts, among the limit orders and cancellations; market orders arriving at well above the rate they would on their own; and the queues at the best bid and ask, which ran out ${initial.emptied} times.`
  const last = recent(sim, HAWKES, 20)
  return (
    <OrderFlowLive
      // eslint-disable-next-line @next/next/no-img-element -- drawn at build time and served as it is; next/image would only add a client runtime
      poster={<img src="/order-book/flow.svg" width={1000} height={HEIGHT} alt={alt} loading="lazy" fetchPriority="low" decoding="async" className="block size-full" />}
      initial={initial}
      title={`Ten seconds of the order flow behind Fig. 1: most market orders are set off by earlier ones.`}
      subtitle={`Simulated · the market of Fig. 1, a ${open} stock, at the same moment · six kinds of order · not market data`}
      caption={
        <>
          Each mark in the six lanes at the top is one order, the newest at the right. Limit orders and cancellations are
          the grey texture; market orders, the ones that trade, are the dark ticks, and they come in bursts. The middle
          strip is how fast market buys (above) and market sells (below) are arriving, the intensity λ(t) of the model: the
          grey band is the rate at which they would arrive on their own, μ, and the wash beyond it is the part set off by
          earlier orders, {`${fmt.pct(1 - buysOwn)}`} of all market buys in the long run. The bottom strip is
          the shares waiting at the best bid and the best ask; each indigo mark is a moment one ran out and the price
          stepped. Choose any order to see what set it off, by the kind of earlier order, and the chance it came on its
          own. Simulated, not market data.
        </>
      }
      table={
        <table>
          <caption>The last twenty orders before the still frame, newest first, with what set each one off</caption>
          <thead>
            <tr>
              <th scope="col">Seconds before the still frame</th>
              <th scope="col">Order</th>
              <th scope="col">Price</th>
              <th scope="col">Shares</th>
              <th scope="col">Set off by, by kind of earlier order</th>
              <th scope="col">On its own</th>
            </tr>
          </thead>
          <tbody>
            {last.map((r) => {
              const c = causes(sim, HAWKES, r.age)
              const cause = c.byKind.map((k) => `${LANE_NAMES[LANE_OF[k.type]!]!.toLowerCase()} ${fmt.pct(k.p)}`).join(', ')
              return (
                <tr key={r.age}>
                  <td>{r.ago.toFixed(3)}</td>
                  <td>{NAMES[r.type]}</td>
                  <td>{fmt.usd(r.price)}</td>
                  <td>{fmt.shares(r.size)}</td>
                  <td>{cause}</td>
                  <td>{fmt.pct(c.own)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      }
    />
  )
}
