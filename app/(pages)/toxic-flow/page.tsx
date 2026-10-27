import { CaseStudyTitle, Meta, Section } from '@/components/CaseStudy'
import { Annotated, Shell } from '@/components/Layout'
import { GridFigure, type GridCell, type GridView } from '@/components/figures/toxicflow/Grid'
import { DotRows, IntervalFigure, type IntervalRow } from '@/components/figures/toxicflow/Intervals'
import { ReplayFigure } from '@/components/figures/toxicflow/Replay'
import { TestResult } from '@/components/figures/toxicflow/TestResult'
import { SignalsFigure, signalName } from '@/components/figures/toxicflow/Signals'
import { Frozen, TagLink } from '@/components/figures/toxicflow/Protocol'
import { FigureFrame } from '@/components/FigureFrame'
import {
  LATENCIES,
  QUEUES,
  QUEUE_NAME,
  REPO,
  TAG,
  at,
  bp,
  bundle,
  ci,
  comparison,
  commitUrl,
  day,
  holdsZero,
  int,
  num,
  pct,
  source,
  testRun,
  type Comparison,
  type TestBlock,
} from '@/lib/toxicflow/data'
import { prereg } from '@/lib/toxicflow/prereg'
import { replayData, replayHead } from '@/lib/toxicflow/replay'
import { pageMeta } from '@/lib/meta'
import { papers } from '@/content/papers'

const paper = papers.find((p) => p.slug === 'toxic-flow')!
// The study's title, without its "pre-registered" until the bundle records the tag (lib/toxicflow/prereg.ts).
const TITLE = paper.title
const PROTOCOL = prereg(bundle.title)

export const metadata = pageMeta('/toxic-flow', TITLE, paper.description)

const link = 'inline-block max-w-full py-0.5 [overflow-wrap:anywhere]'

/** A comparison as a figure row: its two sides, its mean, its interval and its days. */
const row = (c: Comparison, label = `${c.a} − ${c.b}`): IntervalRow => ({
  label,
  mean: c.mean_bp,
  ci: c.bootstrap_ci_bp,
  days: [c.days_positive, c.n_days],
})

const signOf = (x: number | null): -1 | 0 | 1 => (x == null || x === 0 ? 0 : x > 0 ? 1 : -1)

/** The grid's views: every comparison the bundle holds, in every cell it holds it for. */
function gridViews(t: TestBlock): GridView[] {
  const cells = bundle.cells
  const nVal = bundle.splits.val.length
  const nTrain = bundle.splits.train.length
  const one = (c: Comparison): Record<string, GridCell | null> =>
    Object.fromEntries(
      cells.map((cell) => [
        cell,
        cell === c.cell ? { mean: bp(c.mean_bp), ci: ci(c.bootstrap_ci_bp), days: `${c.days_positive} of ${c.n_days} days > 0`, sign: signOf(c.mean_bp) } : null,
      ]),
    )
  const level = (m: Readonly<Record<string, number>>): Record<string, GridCell | null> =>
    Object.fromEntries(cells.map((cell) => [cell, m[cell] == null ? null : { mean: num(m[cell]!, 3), sign: signOf(m[cell]!) }]))
  const g = bundle.training.grids
  const b1b0 = Object.fromEntries(
    cells.map((cell) => {
      const c = g.B1_minus_B0[cell]
      return [cell, c && typeof c !== 'string' ? { mean: bp(c.mean_bp), ci: ci(c.bootstrap_ci_bp), days: `${c.days_positive} of ${c.n_days} days > 0`, sign: signOf(c.mean_bp) } : null]
    }),
  )
  return [
    ...bundle.validation.comparisons.map((c, n) => ({
      id: `val-${n}`,
      label: `${c.a} − ${c.b}, ${c.label}`,
      split: `${nVal} validation days`,
      kind: 'difference in break-even fee, bp',
      cells: one(c),
      empty: 'not run in this cell',
    })),
    ...bundle.matched_p.rows.map((c, n) => ({
      id: `p-${n}`,
      label: `${c.a} − ${c.b}, both pulling on ${pct(c.p, 0)} of steps`,
      split: `${nVal} validation days`,
      kind: 'difference in break-even fee, bp',
      cells: one(c),
      empty: 'not run in this cell',
    })),
    ...bundle.training.comparisons.map((c, n) => ({
      id: `train-${n}`,
      label: `${c.a} − ${c.b}, ${c.label}`,
      split: `${nTrain} training days`,
      kind: 'difference in break-even fee, bp',
      cells: one(c),
      empty: 'not run in this cell',
    })),
    { id: 'b1-b0', label: 'B1 − B0, inventory skew against none', split: `${nTrain} training days`, kind: 'difference in break-even fee, bp', cells: b1b0, empty: 'not run in this cell' },
    { id: 'b1', label: 'B1, break-even fee', split: `${nTrain} training days`, kind: 'mean daily break-even fee, bp', cells: level(g.B0_B1_mean_bef_bp.B1), empty: 'not run in this cell' },
    { id: 'b0', label: 'B0, break-even fee', split: `${nTrain} training days`, kind: 'mean daily break-even fee, bp', cells: level(g.B0_B1_mean_bef_bp.B0), empty: 'not run in this cell' },
    {
      id: 'h1-test',
      label: `H1 on the ${t.keys.n_test_days ?? bundle.splits.test.length} test days: B3 − B2b`,
      split: 'test days',
      kind: 'difference in break-even fee, bp',
      cells: Object.fromEntries(cells.map((cell) => [cell, t.h1_cell_means_bp[cell] == null ? null : { mean: bp(t.h1_cell_means_bp[cell]!), sign: signOf(t.h1_cell_means_bp[cell]!) }])),
      empty: 'after the test run',
    },
    { id: 'glft', label: 'GLFT (the first design’s base), break-even fee', split: `${nTrain} training days`, kind: 'mean daily break-even fee, bp', cells: level(g.glft_v1_mean_bef_bp.B1), empty: 'not run in this cell' },
  ]
}

export default function ToxicFlow() {
  const sp = bundle.splits
  const d = replayData()
  const mde = bundle.mde
  const val = bundle.validation
  const fit = bundle.hawkes_fit
  const ran = testRun()

  // Canaries.
  const c2 = comparison('C2', 'B1')
  const c1r1 = comparison('C1', 'R1')
  const c1b1 = comparison('C1', 'B1')
  const c4slow = comparison('C4_x0.1', 'B3')
  const c4fast = comparison('C4_x10', 'B3')
  const c3 = val.c3_mean_bef_bp.risk_averse
  const c2Passes = (c2.mean_bp ?? -Infinity) > mde.c2_threshold_bp
  const c1Passes = holdsZero(c1r1.bootstrap_ci_bp)

  // Hypotheses on validation and training days.
  const h1v = comparison('B3', 'B2b', "H1's statistic")
  const h1t = bundle.training.comparisons.find((c) => c.a === 'B3' && c.b === 'B2b')!
  const h3 = comparison('B3', 'B1')
  const h4 = comparison('B2b', 'B1')
  const b1Val = val.strategies.v2_canaries_val!.B1!.mean

  // Controls.
  const rB3 = comparison('B3', 'R_B3')
  const rlB3 = comparison('B3', 'RL_B3')
  const rB2b = comparison('B2b', 'R_B2b')
  const rlB2b = comparison('B2b', 'RL_B2b')
  const b3F = comparison('B3', 'F')
  const fRl = comparison('F', 'RL_B3')
  const ps = bundle.matched_p.rows
  const fh = bundle.fill_hold
  const g = bundle.glft
  const g0 = g.by_gamma[0]!
  const gChosen = g.by_gamma.find((x) => x.gamma === g.chosen_gamma)!
  const b1Train = bundle.training.strategies.v2_train!.B1!.mean
  const gMids = g.mid_vs_distance.map((m) => m.mid)
  const gDist = g.mid_vs_distance.map((m) => m.median_bid_dist_ticks)

  const step = d.stepMs
  const c2Times = Math.round(mde.c2_threshold_bp / mde.mde_bp)
  const c4Factor = (key: string) => key.split('_x')[1]!
  const c4SlowBetter = (c4slow.mean_bp ?? 0) > 0 && !holdsZero(c4slow.bootstrap_ci_bp)
  const overlaysUnclear = holdsZero(h3.bootstrap_ci_bp) && holdsZero(h4.bootstrap_ci_bp)
  const allHoldZero = [h1v, h1t, h3, h4].every((c) => holdsZero(c.bootstrap_ci_bp))
  const everyDay = (c: Comparison) => c.days_positive === c.n_days
  const neverBetter = ps.every((c) => (c.mean_bp ?? 0) <= 0)
  const worseFrom = ps.find((c) => (c.mean_bp ?? 0) < 0 && !holdsZero(c.bootstrap_ci_bp))
  const fShare = (fRl.mean_bp ?? 0) / (rlB3.mean_bp ?? 1)
  const glftPositive = g.by_gamma.filter((r) => r.best_mean_bef_bp > 0)
  // Signal information, from its table: the best direction signal at the shortest horizon, and the slow C4 against B3.
  const sig = bundle.signal_information.splits
  const keys = Object.keys(sig.train.table)
  const h0 = Math.min(...keys.map((k2) => Number(k2.split('|')[1])))
  const atH0 = keys.filter((k2) => k2.endsWith(`|${h0}`))
  const best = (split: typeof sig.train) => atH0.reduce((a, b) => (split.table[a]!.u.mean >= split.table[b]!.u.mean ? a : b)).split('|')[0]!
  const uMeans = atH0.map((k2) => sig.train.table[k2]!.u.mean)
  const slowBeatsFitted = keys
    .filter((k2) => k2.startsWith('B3_hawkes|'))
    .every((k2) => (['train', 'val'] as const).every((sp2) => sig[sp2].table[k2.replace('B3_hawkes', 'C4_x0.1')]!.u.mean > sig[sp2].table[k2]!.u.mean))
  const allAbove = (['train', 'val'] as const).every((sp2) => Object.values(sig[sp2].table).every((v) => v.u.ci[0] > 0))
  const b3 = d.strategies.find((s) => s.name === 'B3')!
  const f = d.strategies.find((s) => s.name === 'F')!

  const replayDescription = `The book over ${d.span / 1000} seconds on ${d.day} from ${d.from} UTC: the best bid moved between ${Math.min(...d.bids.map((b) => b[0]![0]))} and ${Math.max(...d.bids.map((b) => b[0]![0]))} ticks above ${d.base.toFixed(1)}, with ${d.trades.length} prints. ${d.strategies
    .map((s) => `${s.name} was filled ${s.fills.length} times in the minute and pulled a side ${s.pulls.length} times`)
    .join('; ')}. B3's buy intensity peaked at ${Math.max(...d.lamB).toFixed(1)} and its sell intensity at ${Math.max(...d.lamS).toFixed(1)} market orders a second.`

  return (
    <Shell>
      <article>
        <CaseStudyTitle
          byline={paper.byline}
          level="h1"
          title={TITLE}
          standfirst={
            <>
              <p className="text-meta mb-3 font-mono text-ink">{paper.statusLine}</p>
              <p>
                A market maker that quotes at the best bid and ask loses to the traders who know where the price goes next,
                so it wants to step back from a side just before their orders arrive. Does a fitted Hawkes model of buy and
                sell market orders tell it when, better than a plain decay-weighted count of the same orders?
              </p>
              <p className="text-note mt-3 text-graphite">
                Every result on this page comes from simulation on historical Binance data, with simulated fills: no order
                was sent to an exchange.
              </p>
            </>
          }
        />

        <ReplayFigure
          head={replayHead(d)}
          description={replayDescription}
          table={
            <table>
              <caption>Simulated fills in the minute, by strategy</caption>
              <thead>
                <tr>
                  <th scope="col">Strategy</th>
                  <th scope="col">Fills, exchange time and side</th>
                  <th scope="col">Pulls</th>
                  <th scope="col">Whole day</th>
                </tr>
              </thead>
              <tbody>
                {d.strategies.map((s) => (
                  <tr key={s.name}>
                    <th scope="row">{s.name}</th>
                    <td>{s.fills.map(([t, p, side]) => `${(t / 1000).toFixed(3)} s, ${side > 0 ? 'bought' : 'sold'} at ${(d.base + p * d.tick).toFixed(1)}`).join('; ')}</td>
                    <td>{s.pulls.map(([a, , side]) => `${(a / 1000).toFixed(1)} s, ${side > 0 ? 'bid' : 'ask'}`).join('; ') || 'none'}</td>
                    <td>{`break-even fee ${num(s.dayBef, 3)} bp on ${int(s.dayFills)} fills`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        />

        <Section heading="The study">
          <p>
            Every strategy joins the touch: it bids at the best bid and asks at the best ask, one minimum-size order a side,
            each {step}{' '}ms. B1 skews both quotes a tick against each order size of inventory it holds. B2b and B3 are
            B1 with one change: when their signal says one side is toxic, they pull that side. B2b’s signal is a signed count
            of recent buy and sell market orders, each weighted by how long ago it came. B3’s is a bivariate Hawkes process
            fitted by maximum likelihood to {int(fit.n_events)} market orders on the training days, in which each order raises
            the rate of the next ones of both sides and the lift decays with a memory of about {Math.round(fit.memory_ms)}{' '}ms.
            B3 against B2b is the question: the same events and the same idea of decaying memory, but only one is fitted.
          </p>
          <Annotated
            note={
              <>
                The fit’s branching ratio is {num(fit.branching_ratio, 2)}. Its baseline rate is constant through the day,
                which ignores intraday seasonality and tends to inflate that ratio.
              </>
            }
          >
            <p>
              The simulation replays the exchange’s recorded trades and book updates through hftbacktest. Our orders are the
              smallest the venue allows and are assumed not to move the market. An order at the front of its queue fills in
              full on any trade at its price, and also when the book moves through it with no trade there; funding payments
              are left out. Each of these is a choice a real venue does not have to agree with, and the last section says
              what better data would replace them with.
            </p>
          </Annotated>
          <Annotated
            note={
              <>
                A negative break-even fee is the expected state of a quote at the touch, not a finding: with a one-tick spread
                the spread earns far less than the adverse selection it pays.
              </>
            }
          >
            <p>
              The measure is the break-even maker fee: the day’s gross result divided by the notional traded, in basis
              points, which is the fee at which that day would have broken even. Fill for fill, every strategy here loses:
              B1’s mean on the validation days is {num(b1Val.bef_bp, 3)}{' '}bp, and one second after a fill the mid has moved{' '}
              {num(-b1Val.markout_1s_bp, 2)}{' '}bp against it on average. What the signals are asked is
              whether they lose less.
            </p>
          </Annotated>
          <p>
            The days are the first of each month, the days Tardis.dev publishes free, one full UTC day each: {sp.train.length} training days from {day(sp.train[0]!)}{' '}
            to {day(sp.train[sp.train.length - 1]!)} for fitting, {sp.val.length} validation days from {day(sp.val[0]!)} to{' '}
            {day(sp.val[sp.val.length - 1]!)} for tuning and checks, and {sp.test.length} test days from {day(sp.test[0]!)} to{' '}
            {day(sp.test[sp.test.length - 1]!)}, run once. H1, the one confirmatory hypothesis, is that the mean over test
            days of B3’s break-even fee minus B2b’s is not zero, in the primary cell (the most pessimistic queue model at high
            latency), with the same sign in all {bundle.cells.length} queue and latency cells.
          </p>
        </Section>

        <Section heading="How the study is protected">
          <p>
            A study that tunes on its data and then reports the tuned result has measured its own search. This one is set up
            so that the test result cannot be shaped after it is seen.
          </p>
          <Frozen tag={PROTOCOL.tag} />
          <Annotated
            note={
              <>
                The design was chosen after seeing training and validation results, which is a researcher’s degree of freedom;
                the pre-registration says so. The test days are what it cannot touch.
              </>
            }
          >
            <p>
              <span className="text-ink">The test-day lock.</span> Every download goes through{' '}
              <a href={at('src/toxic_flow/data/split_lock.py')}>split_lock.py</a>, which refuses a test date unless {TAG} is an
              annotated tag locally and the public remote lists the same tag object. Any failure to ask git counts as not
              published, so the lock fails closed, and <a href={at('tests/leakage/test_split_lock.py')}>its tests</a> run on
              every commit. A reader can check the tag’s push time on GitHub against the download times the data manifest
              records.
            </p>
          </Annotated>
          <p>
            <span className="text-ink">The minimum detectable effect.</span> From the day-to-day spread of B3 − B2b on the
            training and validation days, taking the larger ({num(mde.s_train_bp, 4)} and {num(mde.s_val_bp, 4)}{' '}bp), the
            study can detect a mean difference of {num(mde.mde_bp, 4)}{' '}bp on {mde.n_test} test days. A smaller effect is
            described as one the study could not detect, never as absent.
          </p>
          <p>
            <span className="text-ink">The canaries.</span> Canaries run beside the strategies, with pass rules set in
            advance, to show the harness can see what it is meant to see and nothing it should not. C2 is an oracle: B1 that
            pulls the side the mid will move against over the next few seconds, the only strategy allowed to see the future.
            If it cannot beat B1 by {c2Times} times the MDE, knowing more cannot show up as a better break-even fee in this harness, and the study stops.
            On the validation days it beat B1 by {bp(c2.mean_bp)}{' '}bp {ci(c2.bootstrap_ci_bp)}, on {c2.days_positive} of{' '}
            {c2.n_days} days, against a bar of {num(mde.c2_threshold_bp, 4)}{' '}bp: {c2Passes ? 'it passes' : 'it fails'}. C3
            runs B3 at zero latency as an upper bound; at high latency B3’s mean was {num(c3.high, 4)}{' '}bp against{' '}
            {num(c3.zero, 4)}{' '}bp at zero, {c3.high > c3.zero ? 'better, which would flag a leak' : 'no better, as it should be'}.
          </p>
        </Section>

        <IntervalFigure
          id="canaries"
          number="Fig. 2"
          title="The canaries C1 and C4 on the validation days"
          subtitle={`difference in mean daily break-even fee · ${val.days.length} validation days · primary cell · bootstrap interval`}
          rows={[
            row(c1r1, 'C1 − R1, shuffled signs against random pulls (the pass rule)'),
            row(c1b1, 'C1 − B1, the pass rule first written'),
            row(comparison('R1', 'B1'), 'R1 − B1, what random pulls cost'),
            row(c4slow, `C4, B3 with β × ${c4Factor(c4slow.a)}, − B3`),
            row(c4fast, `C4, B3 with β × ${c4Factor(c4fast.a)}, − B3`),
          ]}
          caption={
            <>
              C1 is B3 fed market orders whose buy and sell labels were shuffled within the day, so its pulls carry no order-flow
              information. Its rule as first written compared it with B1 and failed: pulling at all costs queue position, since
              a pulled quote rejoins at the back. The rule was revised, before any test day was downloaded, to compare C1 with
              R1, B1 pulling at random at C1’s own rate, and C1 {c1Passes ? 'passes it' : 'fails it'}. Both rules are reported.
              C4 runs B3 with its decay rate {c4Factor(c4fast.a)} times faster and {c4Factor(c4fast.a)} times slower
              {c4SlowBetter ? ': the slower one did better than the fitted decay, so the fitted decay is not the best setting for this use.' : '.'}
            </>
          }
        />

        <Section heading="Design history">
          <Annotated
            note={<>Each step links the commit that made it. Nothing on this list was decided after a test day was seen.</>}
          >
            <p>
              The first design failed, and the study says so. v1 used the GLFT quoting model as its base, which at its
              chosen setting quoted {int(Math.min(...gDist))} to {int(Math.max(...gDist))} ticks from the mid, and moved the quote centre with the signal. On the validation days its oracle
              lost to its own base: a harness in which knowing the future does not help cannot test whether a signal helps.
              The diagnosis found no bug, and found the cause in the base, which traded {int(g.chosen_mean_fills)} times a day on
              the training days, far from the touch. v2 quotes at the touch and turns a signal into pulling a side, and it was chosen before any test-day data
              was downloaded.
            </p>
          </Annotated>
          <ol className="text-note mt-6 grid gap-y-3 border-t border-rule pt-4">
            {bundle.design_history.map((h) => (
              <li key={h.event} className="grid gap-x-4 sm:grid-cols-[6.5rem_minmax(0,1fr)]">
                <span className="text-meta font-mono tabular text-graphite">{h.date ?? 'not yet'}</span>
                <span>
                  {h.event}
                  {h.commit ? (
                    <>
                      {' '}
                      <a className="text-meta font-mono" href={commitUrl(h.commit)}>
                        {h.commit}
                      </a>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </Section>

        <Section heading="Exploratory results">
          <p>
            Everything in this section is on the training and validation days, mostly in the primary cell only, and is
            labelled exploratory: these days were used to choose the design, so none of it is evidence the way the test will
            be. It is what the study knew before the test, stated with its limits.
          </p>
          <Annotated
            note={
              <>
                {val.days.length} days give wide intervals: the validation result is a preview of the test’s noise, not of its
                answer.
              </>
            }
          >
            <p>
              On the validation days B3 − B2b, H1’s own statistic, was {bp(h1v.mean_bp)}{' '}bp {ci(h1v.bootstrap_ci_bp)},
              above 0 on {h1v.days_positive} of {h1v.n_days} days; on the training days it was {bp(h1t.mean_bp)}{' '}bp{' '}
              {ci(h1t.bootstrap_ci_bp)}.{overlaysUnclear ? ' Neither overlay clearly beat B1 either: both intervals hold 0.' : ''}
            </p>
          </Annotated>
        </Section>

        <IntervalFigure
          id="hypotheses"
          number="Fig. 3"
          title="The hypotheses’ statistics before the test"
          subtitle="difference in mean daily break-even fee · primary cell · bootstrap interval · dashed: ± the MDE"
          rows={[
            row(h1v, 'H1, B3 − B2b, validation days'),
            row(h1t, 'H1, B3 − B2b, training days'),
            row(h3, 'H3, B3 − B1, validation days'),
            row(h4, 'H4, B2b − B1, validation days'),
          ]}
          refs={[
            { at: -mde.mde_bp, label: '−MDE' },
            { at: mde.mde_bp, label: 'MDE' },
          ]}
          caption={
            <>
              Exploratory. The training-day row is where the spread behind the MDE came from, so it is not an independent
              check either.{allHoldZero ? ' Every interval holds 0.' : ''}
            </>
          }
        />

        <Section heading="Signal information">
          <Annotated
            note={
              <>
                Correlation with the next move measures information, not profit: a signal can call a one-tick move well and
                still not pay for the adverse selection at the touch.
              </>
            }
          >
            <p>
              Before any quoting, each signal’s direction is correlated with the mid’s change over the next few seconds, one
              correlation a day.{allAbove ? ' Every signal carries information on both sets of days: every interval is above 0.' : ''}{' '}
              {signalName(best(sig.train))} calls direction best on the training days, and{' '}
              {best(sig.val) === best(sig.train) ? 'on the validation days too' : `${signalName(best(sig.val))} on the validation days`}.
              {slowBeatsFitted ? ' B3’s fitted decay is not the most informative Hawkes setting: the slower decay of canary C4 beats it at every horizon on both sets of days.' : ''}{' '}
              The question the study tests is the step after this one: whether information this size, a correlation of{' '}
              {num(Math.min(...uMeans), 2)} to {num(Math.max(...uMeans), 2)} with the move {h0} s ahead, becomes a better quote.
            </p>
          </Annotated>
        </Section>

        <SignalsFigure number="Fig. 4" />

        <Section heading="Matched controls">
          <Annotated
            note={
              <>
                Random pulls start more separate pulled runs than the signals do, so R overstates what the signal adds; RL
                matches the runs too, but not when they start.
              </>
            }
          >
            <p>
              Pulling a side changes a strategy whatever chose the moment, so each overlay is compared with B1 pulling at
              random at the overlay’s own rate on each day (R), and with random pulls matched on rate and on the number of
              pulled runs (RL). On the validation days B3 beat R_B3 by {bp(rB3.mean_bp)}{' '}bp {ci(rB3.bootstrap_ci_bp)} and RL_B3 by{' '}
              {bp(rlB3.mean_bp)}{' '}bp {ci(rlB3.bootstrap_ci_bp)}{everyDay(rB3) && everyDay(rlB3) ? ', on every day' : ''}. B2b beat
              R_B2b by {bp(rB2b.mean_bp)}{' '}bp {ci(rB2b.bootstrap_ci_bp)}, and RL_B2b by {bp(rlB2b.mean_bp)}{' '}bp{' '}
              {ci(rlB2b.bootstrap_ci_bp)}{holdsZero(rlB2b.bootstrap_ci_bp) ? ', an interval that holds 0' : ''}.
            </p>
          </Annotated>
          <p>
            Matching the two signals on the same pull rate answers whether B3’s timing is better than B2b’s at equal cost. It
            is not{neverBetter ? ': at every rate tried, B3’s mean was no better than B2b’s' : ''}
            {worseFrom ? `, and from ${pct(worseFrom.p, 0)} of steps up it was worse, with an interval below 0` : ''}.
          </p>
        </Section>

        <IntervalFigure
          id="controls"
          number="Fig. 5"
          title="Each signal against random pulls, and the two signals at the same pull rate"
          subtitle={`difference in mean daily break-even fee · ${val.days.length} validation days · primary cell · bootstrap interval`}
          rows={[
            row(rB3, 'B3 − R_B3, random pulls at B3’s rate'),
            row(rlB3, 'B3 − RL_B3, matched on rate and runs'),
            row(rB2b, 'B2b − R_B2b, random pulls at B2b’s rate'),
            row(rlB2b, 'B2b − RL_B2b, matched on rate and runs'),
            ...ps.map((c) => row(c, `B3 − B2b, both pulling on ${pct(c.p, 0)} of steps`)),
          ]}
          caption={
            <>
              Exploratory. R and RL read no market data and run with several seeds, the day’s value being their mean. The
              study’s B3 is set to pull on {pct(b3.p ?? 0, 0)} of steps, the rate of the first matched row.
            </>
          }
        />

        <Section heading="Control F">
          <Annotated
            note={
              <>
                F’s hold was chosen on the training days to pull as often as B3 did there ({pct(fh.pull_share.train.F, 1)} of
                steps against {pct(fh.pull_share.train.B3, 1)}); on the validation days it pulled less ({pct(fh.pull_share.val.F, 1)}{' '}
                against {pct(fh.pull_share.val.B3, 1)}).
              </>
            }
          >
            <p>
              Many of B3’s pulls start just after our own fill on that side, when pulling costs no queue place because the
              order is already gone. F tests whether that is all B3 does: B1 that, after each fill, does not quote that side
              for {fh.hold_s}{' '}s, and reads no signal at all. F beat the run-matched random pulls by {bp(fRl.mean_bp)}
              {' '}bp {ci(fRl.bootstrap_ci_bp)} on {fRl.days_positive} of {fRl.n_days} days, {pct(fShare, 0)} of B3’s lead over
              them, and B3 − F was {bp(b3F.mean_bp)}{' '}bp {ci(b3F.bootstrap_ci_bp)}, above 0 on {b3F.days_positive} of{' '}
              {b3F.n_days} days. On these days, a rule that never reads the Hawkes intensity gains most of what B3 gains
              over random pulls. Fig.{' '}1 shows it in the minute: B3 pulled {b3.pulls.length} times, F{' '}
              {f.pulls.length} times, each F pull right after one of its fills.
            </p>
          </Annotated>
        </Section>

        <IntervalFigure
          id="fill-hold"
          number="Fig. 6"
          title="B3 against a rule that only skips the side it was just filled on"
          subtitle={`difference in mean daily break-even fee · ${val.days.length} validation days · primary cell · bootstrap interval`}
          rows={[row(fRl, 'F − RL_B3'), row(b3F, 'B3 − F'), row(rlB3, 'B3 − RL_B3, for scale')]}
          caption={<>Exploratory. F was added, and its hold rule committed, before it ran on any day.</>}
        />

        <Section heading="GLFT">
          <Annotated
            note={
              <>
                Few fills make a noisy mean: the mean of daily break-even fees weights a day of a handful of fills like a day
                of thousands{glftPositive.length ? `, and the only positive setting, γ = ${glftPositive.map((r) => r.gamma).join(', ')}, rests on a median of ${glftPositive.map((r) => int(r.median_fills)).join(', ')} fills a day` : ''}.
              </>
            }
          >
            <p>
              GLFT, the optimal-quoting model with inventory risk aversion that hftbacktest’s tutorial builds, was the first
              design’s base, and it is reported as an exploratory result. Raising its risk aversion γ moves its quotes away from the mid: from γ = {g0.gamma} to{' '}
              {gChosen.gamma}, taking the best window at each, the median day falls from {int(g0.median_fills)} fills to{' '}
              {int(gChosen.median_fills)} and the break-even fee rises from {num(g0.best_mean_bef_bp, 3)} to{' '}
              {num(gChosen.best_mean_bef_bp, 3)}{' '}bp. At the setting the first design chose it averaged{' '}
              {num(g.chosen_mean_bef_bp, 3)}{' '}bp on {int(g.chosen_mean_fills)} fills a day, against B1’s{' '}
              {num(b1Train.bef_bp, 3)}{' '}bp on {int(b1Train.fills)} at the touch on the same days: it loses less per unit
              of notional because it trades far less, and each fill is still adversely selected. It
              works in ticks, so its distance from the mid grows with the price: across {g.mid_vs_distance.length} days the
              correlation between the mid and that distance is {num(g.mid_distance_corr, 2)}, from {int(Math.min(...gDist))} ticks
              at a mid of {int(gMids[gDist.indexOf(Math.min(...gDist))]!)} to {int(Math.max(...gDist))} at{' '}
              {int(gMids[gDist.indexOf(Math.max(...gDist))]!)}.
            </p>
          </Annotated>
        </Section>

        <FigureFrame
          id="glft"
          number="Fig. 7"
          title="GLFT’s break-even fee by risk aversion"
          subtitle={`${sp.train.length} training days · primary cell · best window for each risk aversion`}
          caption={<>Exploratory, from the first design’s runs. Each row is the best of the windows tried at that γ, with its median fills a day.</>}
          table={
            <table>
              <caption>GLFT by risk aversion</caption>
              <thead>
                <tr>
                  <th scope="col">γ</th>
                  <th scope="col">Mean daily break-even fee, bp</th>
                  <th scope="col">Median fills a day</th>
                </tr>
              </thead>
              <tbody>
                {g.by_gamma.map((r) => (
                  <tr key={r.gamma}>
                    <th scope="row">{r.gamma}</th>
                    <td>{num(r.best_mean_bef_bp, 3)}</td>
                    <td>{int(r.median_fills)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <p className="sr-only">
            {g.by_gamma.map((r) => `γ ${r.gamma}: ${num(r.best_mean_bef_bp, 3)} bp on a median of ${int(r.median_fills)} fills a day.`).join(' ')}
          </p>
          <DotRows rows={g.by_gamma.map((r) => ({ label: `risk aversion ${r.gamma}`, value: r.best_mean_bef_bp, aside: `${int(r.median_fills)} fills a day` }))} digits={3} unit="bp" />
        </FigureFrame>

        <Section heading="Every cell">
          <p>
            The simulator has to guess where our order stands in each queue and how long our messages take, and the answers
            move fills. The study reports every result under {QUEUES.length} queue models and {LATENCIES.length} latencies, and
            a result that holds only under the generous queue models counts as not holding.
          </p>
        </Section>

        <GridFigure number="Fig. 8" views={gridViews(bundle.test)} queues={QUEUES} latencies={LATENCIES} queueNames={QUEUE_NAME} primary={bundle.primary_cell} />

        <Section heading="Test results">
          {ran ? (
            <TestResult t={bundle.test} />
          ) : (
            <>
              <p>
                The test has not been run. These are the sentences fixed in advance, one for each outcome on the{' '}
                {sp.test.length} test days.
              </p>
              <table className="text-note mt-5 w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-rule">
                    <th scope="col" className="text-meta py-2 pr-4 align-bottom font-mono font-normal text-graphite">
                      Outcome on test days
                    </th>
                    <th scope="col" className="text-meta py-2 align-bottom font-mono font-normal text-graphite">
                      Sentence in the paper
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bundle.preregistered_conclusions.rows.map((r) => (
                    <tr key={r.key} className="border-b border-rule align-top">
                      <td className="py-2.5 pr-4 text-graphite sm:w-[38%]">{r.outcome}</td>
                      <td className="py-2.5 text-ink">{r.statement}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-5 text-ink">{PROTOCOL.afterRun}</p>
            </>
          )}
        </Section>

        <Section heading="With L3 data and real fills">
          <p>
            The largest assumption here is the queue. With only the price levels, the simulator cannot know how many orders
            are ahead of ours, so it brackets the answer with {QUEUES.length} queue models. Order-by-order (L3) data would put
            our order at its true place in the queue and remove that bracket, and it would show cancellations ahead of us,
            which the queue models only guess at.
          </p>
          <p>
            The second is the fill itself. The engine fills our whole order on any trade at our price and on a book that
            moves through it with no trade, and it cannot move the market. Real fills, from a small live allocation or a
            venue’s own fill records for orders like ours, would measure how often those fills really happen, what they mark
            out to, and how long our messages really take. The first thing I would check with them is the finding of control
            F: whether the edge of pulling a side right after a fill survives contact with a real queue.
          </p>
        </Section>

        <Meta
          rows={[
            ['repository', <a key="r" href={REPO}>github.com/dudailia/toxic-flow</a>],
            ['data', <a key="d" className={link} href={commitUrl(source.commit)}>{`site/toxic-flow.json and site/replay_window.json at ${source.commit.slice(0, 7)}`}</a>],
            ['protocol', <a key="p" href={at('PREREGISTRATION.md')}>PREREGISTRATION.md</a>],
            ['tag', <TagLink key="t" tag={PROTOCOL.tag} />],
            ['replay', <a key="w" className={link} href={at('scripts/site_replay.py')}>scripts/site_replay.py</a>],
            ['simulation', 'hftbacktest, replay of Binance USDT-M BTCUSDT trades and book updates from Tardis.dev'],
            ['signals', `${Object.keys(bundle.signal_information.splits.train.table).length / 3} settings, from ${signalName('B2_ofi_1s')} to ${signalName('B3_hawkes')}`],
          ]}
        />
      </article>
    </Shell>
  )
}
