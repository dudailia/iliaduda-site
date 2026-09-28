import { CaseStudyTitle, Meta, Section } from '@/components/CaseStudy'
import { Annotated, Shell } from '@/components/Layout'
import { MarketFigure } from '@/components/figures/Market'
import { MarketPipelineFigure } from '@/components/figures/MarketPipeline'
import { papers } from '@/content/papers'
import { FAN } from '@/lib/futures/fan'
import { HOST } from '@/lib/market/host'
import { SHOCK } from '@/lib/market/shock'
import { STRESS } from '@/lib/market/stress'
import { pageMeta } from '@/lib/meta'

const paper = papers.find((p) => p.slug === 'market')!

export const metadata = pageMeta('/market', paper.title, paper.abstract)

const SRC = 'https://github.com/dudailia/iliaduda-site/blob/redesign'
const link = (path: string) => (
  <a key={path} className="inline-block py-0.5" href={`${SRC}/${path}`}>
    {path}
  </a>
)

export default function Market() {
  const delivered = SHOCK.cap * (1 + 60 * (1 - 2 ** (-1 / (SHOCK.halfLife * 60))))
  return (
    <Shell>
      <article>
        <CaseStudyTitle byline={paper.byline} level="h1" title={paper.title} standfirst={<p>{paper.standfirst ?? paper.abstract}</p>} />

        <MarketFigure />

        <Section heading="What it shows">
          <p>
            The three views are one market, not three pictures of similar ones. The surface, the order book and the futures
            (simulated paths of the price, a year of them) are drawn from one copy of the market in one animation frame, so
            they are never out of step: read the book at a moment, and the futures and the surface show the market as it was
            then. Press Liquidity shock and the sweep lands in all three in the frame it arrives, the book drained at the touch,
            the futures lit and widening, the surface lifting at its short end. Everything after that is the model&rsquo;s own,
            and the numbers below are measured over twenty seeds, not chosen for the picture.
          </p>
        </Section>

        <Section heading="The market">
          <Annotated note={<>Synthetic throughout: every parameter is set by hand, none fitted to any market.</>}>
            <p>
              It is <a href="/order-book">the order book paper&rsquo;s</a> market: the same seed and the same Hawkes order flow
              into the same limit order book, advanced in whole quanta of 1/60 of a simulated second. Three numbers are read from
              it for the other two views, each on the market&rsquo;s own clock.
            </p>
          </Annotated>
          <p>
            Realised volatility is an exponentially weighted mean of one-second log-returns of the mid, with a sixty-second
            half-life, annualised over 252 trading days of 6.5 hours. The futures are drawn at it.
          </p>
          <p>
            Stress runs from 0 to 1 and combines four signals a trader watches, each 0 across the calm market&rsquo;s range and
            1 at its extreme: the intensity of market sells against its stationary rate (0 at {STRESS.pressureFrom} times it, 1
            at {STRESS.pressureTo}); realised volatility against a calm {Math.round(STRESS.sigma0 * 100)}% (0 at{' '}
            {STRESS.volFrom} times, 1 at {STRESS.volTo}); the spread (0 at {STRESS.spreadFrom} ticks, 1 at {STRESS.spreadTo});
            and the shares within three ticks of the touch on the book&rsquo;s thinner side (0 at {STRESS.touchFloor}, 1 at
            none). They combine as an &ldquo;or&rdquo;,
            <span className="my-3 block text-center whitespace-nowrap">s = 1 − (1 − p)(1 − a)(1 − b)(1 − c),</span>
            so any one alone can carry the market to full stress, and the result follows on a {STRESS.halfLife}-second
            half-life. Over ten calm seeds of ten simulated minutes, it averages under 0.05.
          </p>
          <p>
            The surface is <a href="/iv-surface">the IV paper&rsquo;s</a> own family of shocks, with the stress as the
            shock&rsquo;s size: at calm it is exactly that paper&rsquo;s calm surface, at a stress of one its full shock, and at
            every stress between it is free of static arbitrage.
          </p>
        </Section>

        <Section heading="A liquidity shock">
          <p>
            Pressing Liquidity shock does two things at the start of the next quantum. A market sell takes every bid within{' '}
            {SHOCK.ticks} ticks of the best at once, level by level, each fill a trade on the tape. And the Hawkes state takes an
            exogenous lift: market sells arrive {SHOCK.sells} a second faster and bid cancellations {SHOCK.cancels} a second
            faster, both fading as a market sell&rsquo;s own excitation does, with a third of a second&rsquo;s half-life. Nothing
            after that is scripted.
          </p>
          <p>
            Over twenty seeds, within a second the spread opens to at least four ticks, the touch loses four fifths of its
            shares and the stress passes 0.8; realised volatility is up by a quarter within two seconds and 1.4 to 5.6 times
            within ten; the spread is back within two ticks inside two seconds, and the stress below 0.05 inside five minutes.
            Shocks stack only up to one: what is still in the market is absorbed on a {SHOCK.halfLife}-second half-life, and a
            press tops it up to one whole shock, so fifty presses in a second deliver at most {delivered.toFixed(2)} shocks.
          </p>
        </Section>

        <MarketPipelineFigure />

        <Section heading="Where it runs, and what is the same everywhere">
          <p>
            The market runs in a worker, a thread of its own, so the page&rsquo;s thread only draws. Each animation frame the page
            asks for the market at its own clock; the worker moves it on by the time since the last frame, never more than{' '}
            {HOST.cap} of a second, so a tab left in the background finds the market where it left it, and answers in one buffer
            the page lends it and gets back. It also draws the futures, {FAN.paths.toLocaleString('en-US')} paths each simulated
            second, {HOST.pathsPerFrame} a frame, for a price of one, which the page scales by the price now, exact for geometric
            Brownian motion, so the fan moves with the price in the frame the price moves.
          </p>
          <p>
            The market itself, its events, its book, its realised volatility, its stress and the shock still in it, comes out the
            same to the bit on every engine, from the same seed and the same log of shocks, each stamped with the quantum it took
            effect at: the clock moves in whole quanta, the market computes its own exponentials and logarithms, and a shock is an
            action taken at a quantum&rsquo;s start, not a moment of the wall clock. The futures are the one part drawn with the
            platform&rsquo;s own exponential: they keep the home figure&rsquo;s arithmetic, path for path, and feed nothing back.
          </p>
        </Section>

        <Section heading="How it is tested">
          <ul className="grid list-disc gap-y-1.5 pl-5 marker:text-graphite">
            <li>Over twenty seeds, the shock&rsquo;s claims above: the spread, the touch and the stress within a second, realised volatility within two and ten, the spread back inside two seconds and the stress inside five minutes.</li>
            <li>The same seed and the same log of shocks are the same market however it is stepped; without the shock, another market.</li>
            <li>Fifty presses in a second deliver no more than one shock and the second&rsquo;s absorption, and leave the market&rsquo;s selling pressure, spread, fall and volatility within stated bounds.</li>
            <li>The stress rises with each of its four signals, is nothing across the calm market&rsquo;s range, stays between 0 and 1 whatever it is given, and averages under 0.05 over ten calm seeds.</li>
            <li>The surface is the IV paper&rsquo;s calm surface at calm, its at-the-money volatility rises with the stress, and at every stress in steps of 0.05 it passes the butterfly, calendar and Gatheral–Jacquier checks.</li>
            <li>The futures&rsquo; paths are the home figure&rsquo;s bit for bit; their percentiles are the lognormal&rsquo;s within Monte Carlo error, their mean a year out is the price grown at the rate within four standard errors, the at-the-money call is within its error of Black–Scholes, and a fan drawn at one volatility maps exactly onto the fan drawn at another.</li>
            <li>The worker&rsquo;s own core, in Node: the same market at 60 and at 120 frames a second, never more than a tenth of a second caught up, held while paused, a shock taken at the next frame&rsquo;s first quantum.</li>
            <li>Each frame carries the market as it is, the book now laid out as a row is, and the rows and trades since the last frame, and says what it had to leave out.</li>
          </ul>
        </Section>

        <Meta
          rows={[
            ['engine', link('lib/market/engine.ts')],
            ['shock', link('lib/market/shock.ts')],
            ['stress', link('lib/market/stress.ts')],
            ['futures', link('lib/futures/fan.ts')],
            ['worker', <span key="w">{link('lib/market/host.ts')} · {link('lib/market/protocol.ts')}</span>],
            ['views', link('components/figures/market/draw.ts')],
            [
              'tests',
              <span key="t">
                {link('tests/market-shock.test.ts')} · {link('tests/market-stress.test.ts')} · {link('tests/market-host.test.ts')} · {link('tests/futures-fan.test.ts')}
              </span>,
            ],
            ['data', 'synthetic; parameters set by hand'],
            ['references', 'Hawkes, Spectra of some self-exciting and mutually exciting point processes, Biometrika 58(1), 1971 · Gatheral and Jacquier, Arbitrage-free SVI volatility surfaces, Quantitative Finance 14(1), 2014 · Glasserman, Monte Carlo Methods in Financial Engineering, Springer, 2003'],
          ]}
        />
      </article>
    </Shell>
  )
}
