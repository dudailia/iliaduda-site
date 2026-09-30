import { CaseStudyTitle, Meta, Section } from '@/components/CaseStudy'
import { Annotated, Shell } from '@/components/Layout'
import { OrderBookFigure } from '@/components/figures/OrderBook'
import { OrderFlowFigure } from '@/components/figures/OrderFlow'
import { papers } from '@/content/papers'
import { syntheticValue } from '@/content/synthetic'
import { Flow } from '@/lib/market/flow'
import { TRADING_SECONDS } from '@/lib/market/realised'
import { pageMeta } from '@/lib/meta'
import { fmt } from '@/lib/orderbook/read'
import { SOURCE } from '@/lib/site'

const paper = papers.find((p) => p.slug === 'order-book')!

export const metadata = pageMeta('/order-book', paper.title, paper.abstract)

const SRC = SOURCE

/** The calm market's own numbers, measured at build time on the seed the figure draws: ten simulated minutes. */
function measured() {
  const f = new Flow()
  const t0 = f.t
  const n0 = f.hawkes.counts.reduce((a, b) => a + b, 0)
  let prev = f.book.mid, ss = 0, narrow = 0
  const secs = 600
  for (let s = 1; s <= secs; s++) {
    f.advance(t0 + s)
    const m = f.book.mid
    ss += Math.log(m / prev) ** 2
    prev = m
    if (f.book.spread <= 2) narrow++
  }
  return {
    rho: f.rho,
    expected: f.expected,
    rate: (f.hawkes.counts.reduce((a, b) => a + b, 0) - n0) / secs,
    vol: Math.sqrt((ss / secs) * TRADING_SECONDS),
    narrow: narrow / secs,
  }
}

export default function OrderBook() {
  const m = measured()
  const open = fmt.usd(Math.round(syntheticValue('mkOpen') / syntheticValue('mkTick')))
  return (
    <Shell>
      <article>
        <CaseStudyTitle byline={paper.byline} level="h1" title={paper.title} standfirst={<p>{paper.standfirst ?? paper.abstract}</p>} />

        <OrderBookFigure />

        <Section heading="What you are looking at">
          <p>
            A limit order book is a market’s list of people waiting to trade. At every price there is a queue: buyers
            bidding below the last trade, sellers asking above it. The two best prices, the highest bid and the lowest ask,
            are the touch, and the gap between them is the spread.
          </p>
          <p>
            In Fig. 1 that list is a landscape. Across the valley runs price, bids to the left and asks to the right; the
            height of a wall at a price is every share waiting between the touch and that price, so the walls rise away from
            the spread. Twelve times a simulated second the book is photographed into one ridge, and the ridges recede into
            the page, the newest at the front, as far back as twenty-one seconds where the device draws them all. The line along the valley floor is the mid-price; each spark is a
            trade, a market order taking a queue at the touch.
          </p>
        </Section>

        <Section heading="The model">
          <Annotated
            note={
              <>
                Synthetic throughout: the parameters are set by hand to give a busy stock’s order flow, not fitted to any
                market.
              </>
            }
          >
            <p>
              Six kinds of order arrive: limit buys and sells, market buys and sells, and a cancellation on each side.
              Each arrives as one component of a multivariate Hawkes process, whose intensity is its baseline plus a
              decaying lift from every earlier event:
              <span className="my-3 block text-center whitespace-nowrap">
                λ<sub>i</sub>(t) = μ<sub>i</sub> + Σ<sub>j</sub> Σ<sub>t
                  <sub>k</sub> &lt; t
                </sub>{' '}
                a<sub>ij</sub> e<sup>−β<sub>j</sub>(t − t<sub>k</sub>)</sup>.
              </span>
              That is how real order flow behaves: a market
              buy makes another likelier, liquidity that was taken refills, and a new limit order is often soon cancelled.
            </p>
          </Annotated>
          <p>
            The branching matrix B<sub>ij</sub> = a<sub>ij</sub>/β<sub>j</sub> counts the events of kind i one event of
            kind j sets off directly. Its spectral radius, the branching ratio, is {m.rho.toFixed(2)}: below one, so the
            process is stationary, and its long-run rates are <span className="whitespace-nowrap">(I − B)<sup>−1</sup>μ</span>, {m.expected.toFixed(1)} events a
            second in all. Events are drawn exactly, by Ogata’s thinning: between events every intensity only decays, so
            the intensity now bounds it until the next event, and a candidate drawn at that bound is kept with probability
            λ(t)/λ*.
          </p>
          <p>
            Which earlier order set off a given one is never observed, only probable. Just before an order, its intensity
            is its baseline plus one decaying term for each earlier order; each term’s share of the total is the
            probability that that order was its parent, and the baseline’s share is the chance it came on its own. Fig. 2
            draws the flow the terrain is built from, and reads what set off any order you choose, by the kind of earlier order.
          </p>
        </Section>

        <OrderFlowFigure />

        <Section heading="The book">
          <p>
            Orders land in a price-level book. A limit order joins a queue at a power-law distance from the touch, or
            improves the price when the spread is wide; a market order walks the other side level by level, trading at each;
            a cancellation takes part of one queue, chosen in proportion to its size, which is what keeps the book’s depth
            stationary instead of growing without bound.
          </p>
          <p>
            It is calibrated to look like a busy stock opened at {open}. Measured over ten simulated minutes on the seed
            Fig. 1 draws: {m.rate.toFixed(1)} events a second, a realised volatility of {(m.vol * 100).toFixed(1)}% a
            year (one-second returns of the mid, over 252 trading days of 6.5 hours), and a spread of one or two ticks{' '}
            {(m.narrow * 100).toFixed(1)}% of the time.
          </p>
        </Section>

        <Section heading="One market, in every browser">
          <p>
            The server runs the seeded market to the moment the still frame shows; your browser runs the same seed to the
            same moment and carries on from there. For those to be one market, two things that browsers usually leave to
            chance are fixed. The clock moves in whole quanta of 1/60 of a simulated second, so a 60 Hz screen and a 144 Hz
            one draw the same order flow. And the market computes its own exponentials and logarithms, from IEEE arithmetic
            alone, because engines may round Math.exp differently in the last bit, and one bit in a decay grows into a
            different market within seconds. A fingerprint of the market twenty seconds after the still frame is pinned in
            the tests, and Chromium, WebKit and Firefox each reach it exactly; with ?debug=1 the figure shows whether your
            browser does.
          </p>
        </Section>

        <Section heading="How it is tested">
          <ul className="grid list-disc gap-y-1.5 pl-5 marker:text-graphite">
            <li>
              Time rescaling: if the simulation is exact, each kind’s intensity integrated between its events is
              exponential with mean one. A Kolmogorov–Smirnov test holds that for every kind and for all of them together,
              over five seeds, each family (per kind, and pooled) at a 1% family-wise level; the intensity it integrates is rebuilt from the event times and
              the model alone, so a simulation that drifted from the model would fail it.
            </li>
            <li>Over ten seeds: the event rate, the realised volatility and the spread stay in the calm market’s range.</li>
            <li>The share of events that arrive on their own, not set off by another, matches Σμ over the stationary total.</li>
            <li>The book never crosses, no queue goes negative, and every market order fills at the touch of its moment, over a million events.</li>
            <li>Six hundred single steps are the same market as ten one-second ones, and the still frame followed by the live run is one straight run.</li>
            <li>The market’s exponential and logarithm agree with the platform’s to within two units in the last place.</li>
            <li>Chromium, WebKit and Firefox each run the seeded market to the fingerprint Node pins.</li>
            <li>
              Fig. 2 draws each market order’s intensity exactly: just before every one, it equals the model’s intensity
              rebuilt from the event times alone, to a billionth. What set an order off, by kind, and the chance it came on
              its own add up to one.
            </li>
          </ul>
        </Section>

        <Meta
          rows={[
            ['model', <a key="h" href={`${SRC}/lib/market/hawkes.ts`}>lib/market/hawkes.ts</a>],
            ['book', <a key="b" href={`${SRC}/lib/market/book.ts`}>lib/market/book.ts</a>],
            ['market', <a key="f" href={`${SRC}/lib/market/flow.ts`}>lib/market/flow.ts</a>],
            ['order flow', <a key="v" href={`${SRC}/lib/orderbook/flowview.ts`}>lib/orderbook/flowview.ts</a>],
            [
              'tests',
              <span key="t">
                <a className="inline-block max-w-full py-0.5 [overflow-wrap:anywhere]" href={`${SRC}/tests/market-flow.test.ts`}>tests/market-flow.test.ts</a> ·{' '}
                <a className="inline-block max-w-full py-0.5 [overflow-wrap:anywhere]" href={`${SRC}/tests/orderbook-flowview.test.ts`}>tests/orderbook-flowview.test.ts</a>
              </span>,
            ],
            ['renderer', <a key="r" href={`${SRC}/components/figures/orderbook/renderer.ts`}>components/figures/orderbook/renderer.ts</a>],
            ['data', 'synthetic; parameters set by hand'],
            ['references', 'Hawkes, Spectra of some self-exciting and mutually exciting point processes, Biometrika 58(1), 1971 · Ogata, On Lewis’ simulation method for point processes, IEEE Transactions on Information Theory 27(1), 1981 · Bacry, Mastromatteo and Muzy, Hawkes processes in finance, Market Microstructure and Liquidity 1(1), 2015'],
          ]}
        />
      </article>
    </Shell>
  )
}
