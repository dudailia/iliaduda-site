import { CaseStudyTitle, Meta, Register, Section } from '@/components/CaseStudy'
import { Figure } from '@/components/Figure'
import { Annotated, Shell } from '@/components/Layout'
import { materialityArrangements, materialityBar } from '@/components/figures/MaterialityBar'
import { fact } from '@/content/facts'
import { papers } from '@/content/papers'
import { pageMeta } from '@/lib/meta'

const paper = papers.find((p) => p.slug === 'cricstate')!

export const metadata = pageMeta('/cricstate', 'Ball-by-ball cricket beyond the scoreboard', paper.abstract)

const n = (k: Parameters<typeof fact>[0]) => fact(k).value.toLocaleString('en-US')

function MaterialityTable() {
  const rows = [fact('crStateGain'), fact('crIdentityGain'), fact('crLatentGain')] as const
  return (
    <table>
      <caption>
        Relative improvement in negative log-likelihood over a marginal baseline, T1/T20,
        after calibration.
      </caption>
      <thead>
        <tr>
          <th scope="col">Predictor</th>
          <th scope="col">Improvement over baseline</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row">{r.label}</th>
            <td>{`+${r.value} percent`}</td>
          </tr>
        ))}
        <tr>
          <th scope="row">{fact('crJustifyBar').label}</th>
          <td>{`${fact('crJustifyBar').value.toFixed(1)} percent and above`}</td>
        </tr>
      </tbody>
    </table>
  )
}

export default function Cricstate() {
  return (
    <Shell>
      <article>
        <CaseStudyTitle
          byline={paper.byline}
          level="h1"
          title={paper.title}
          standfirst={<p>{paper.abstract}</p>}
        />

        <Figure
          id="fig-materiality"
          number="Fig 1"
          title="Predictive signal in ball-by-ball cricket beyond match state"
          subtitle="relative NLL vs a marginal baseline · T1/T20 · calibrated"
          description={materialityBar.description}
          arrangements={materialityArrangements}
          table={<MaterialityTable />}
          caption={
            <>
              Match state is a saturating predictor of the next ball. The verdict rests on one
              documented test touch, the shuffled-identity canary and byte-identical replay — not
              on the thresholds having been in git first.
            </>
          }
        />


        <Section heading="What problem, and for whom">
          <p>
            Ball-by-ball cricket data is free, large and unusually clean, which makes it a good
            place to test a habit rather than a hypothesis. The habit is this: you fit a model on
            match state — score, wickets, balls remaining, run rate, phase — and then you reach
            for the two enrichments everyone reaches for next. Give every batter and bowler their
            own parameters. Add a per-match latent for pitch and conditions. Both are easy to
            justify in a proposal, and both are expensive to maintain once they exist.
          </p>
          <p>
            I wanted to know whether either was worth building at all. That is a measurement
            question, not a modelling one, and the two have different failure modes. A modelling
            question fails loudly when the model is bad. A measurement question fails quietly,
            because a leak or an optimistic confidence interval produces a number that looks like
            a discovery. So the work went into the measurement, and the model was allowed to lose.
          </p>
        </Section>

        <Section heading="What I built">
          <p>
            Python with polars, scikit-learn and scipy, dependency-locked under uv. A four-rung
            ladder from a marginal baseline to gradient boosting on match state, and then the two
            enrichments measured against the top rung rather than against the baseline — because
            beating a marginal baseline is not the claim anyone would act on.
          </p>
          <p>
            {n('crFilesSeen')} match files from a Cricsheet snapshot go through an exact replay
            with a pure transition function; {n('crMatches')} of them produce{' '}
            {n('crDeliveries')} deliveries of state. Negative log-likelihood is the primary
            metric, with multiclass Brier as a proper-scoring cross-check and expected calibration
            error over twenty equal-mass bins per class. Calibration maps are fit on the
            validation split only. Continuous integration runs ruff, ruff format, mypy in strict
            mode and pytest, over {n('crTestFiles')} test files and {n('crTestLines')} lines of
            tests.
          </p>
        </Section>

        <Section heading="The hard part">
          <p>
            The first thing I had to accept is that a leakage test which always passes is
            indistinguishable from a leakage test that does nothing. The standard check is a
            shuffle: permute the feature you are testing, refit, and confirm the model gets no
            better. Almost every shuffle test in the wild asserts only the second half of that
            sentence, which means a broken harness — one that silently drops the feature, or fits
            on the wrong frame — passes it perfectly.
          </p>
          <p>
            So the canary asserts its own power first. On a synthetic split with a{' '}
            <em>planted</em> identity signal, the test requires that true identities be detected —
            the fitted loss must beat the baseline by a margin — and only then requires that
            shuffling destroys the detection. A second test asserts the shuffle is a genuine
            permutation with the same multiset of player ids, so it cannot pass by degenerately
            dropping players. A third pins the three-way verdict: shuffled behaves like state is a
            pass, shuffled worse than state is a failure, and shuffled <em>better</em> than state
            voids the result rather than warning about it. A leak does not get to be a footnote.
          </p>
          <p>
            The second decision was to stop relying on my own attention. Leakage discipline in a
            research repository is usually a convention, and conventions decay under deadline. So
            it is a property of the code in four places instead. The feature builder&rsquo;s first
            statement is a select against a frozen whitelist, which makes an outcome column
            unreachable by construction rather than merely unused — and the test proves it by
            asserting byte-equality between a clean frame and one with label-bearing columns
            deliberately injected.
          </p>
          <p>
            Every calibration function&rsquo;s data parameters are named with a validation prefix,
            and a test reflects over the function signatures and rejects any that are not, because
            a convention a linter can check is a different kind of object from a convention. The
            dataset loader raises on any attempt to read the test split unless the leaderboard
            runner passes an explicit flag, so single-test-touch lives in the loader rather than
            in my memory of having agreed to it. And ruff is configured so that swallowing an
            exception fails the build — a swallowed parse failure is exactly how a corpus quietly
            loses rows — with the two legitimate quarantine boundaries individually exempted and
            each carrying its reason in the exemption.
          </p>
          <Annotated
            note={
              <>
                A paired bootstrap over {n('crBootstrapResamples')} resamples, with draws shared
                between the two models being compared so between-match variance cancels.
              </>
            }
          >
            <p>
              Third, the confidence intervals. The obvious move is to bootstrap over deliveries,
              and it is wrong: there are roughly two hundred balls inside a match and they are not
              independent, so resampling balls produces intervals that are far too tight and a
              null result that looks like a finding. The unit of independence is the match, so the
              resampling is over matches — expressed as a multinomial count matrix, which makes it
              linear algebra rather than a loop. The pairing is not asserted in a comment either:
              a test plants a between-match spread and requires the paired interval to come out
              more than ten times tighter than the unpaired one.
            </p>
          </Annotated>
          <p>
            Last, the corpus boundary. A match that cannot be replayed is quarantined with a coded
            reason, never dropped — {n('crQuarantined')} of {n('crFilesSeen')} files, mostly
            formats outside the study&rsquo;s scope. The subtle case is over accounting: an over
            with the wrong number of legal balls is a warning if the source data declares the
            umpire miscounted, and a hard quarantine if it does not, because those two things look
            identical in a row count and mean completely different things.{' '}
            {n('crGoldens')} golden fixtures pin one real pathology each — a super over, a
            Duckworth-Lewis revised target, penalty runs, a concussion replacement, a stumping off
            a wide — including one negative golden built by deleting a delivery from a real match
            and asserting the accounting catches it.
          </p>
        </Section>

        <Section heading="What the measurement said">
          <p>
            Match state saturates. Player identity adds {fact('crIdentityGain').value}% in relative
            negative log-likelihood, which is real, reproducible, and below the bar at which I
            would have started building — it lands inside the ambiguous band rather than clearing
            it. The per-match latent adds {fact('crLatentGain').value}% and was frozen before its
            test evaluation. The hierarchical model I intended to write was declined on its own
            evidence.
          </p>
          <p>
            Part of the design was fixed before any test split was read and part was not. The
            register below draws that line exactly, because a result is only as strong as the
            weakest thing that was decided after looking.
          </p>
          <Register
            columns={[
              {
                heading: 'Frozen before any test split was read',
                items: [
                  'the four-rung ladder and validation-only tuning',
                  'the metric contract and the calibration policy',
                  'the leakage canaries, including the ladder-inversion stop rule',
                  'the corpus and label hash pins',
                  'the single-test-touch discipline itself',
                ],
              },
              {
                heading: 'Not frozen before the test was read',
                items: [
                  'the materiality bands that classify the result',
                  'the challenger gate thresholds',
                  'both entered in the same commit as the evaluation, not before it',
                ],
              },
            ]}
          />
          <p className="mt-6">
            So the verdict does not rest on the thresholds having been committed first. It rests on
            the single documented test touch, on the shuffled-identity canary, and on the corpus
            hash reproducing byte-identically across independent builds.
          </p>
          <Annotated
            note={
              <>
                Not a null result about the whole exercise: on T20 win probability the same ladder
                cleared every clause of the gate, at {fact('crT2Skill').value}% skill over the
                baseline.
              </>
            }
          >
            <p>
              The published leakage ledger also records a canary that was never run — a
              match-level shuffle, frozen by decision along with the branch it belonged to. It
              sits in the results file marked as not run, next to the ones that passed, because a
              test suite that reports only the tests you executed is telling you about your
              diligence rather than about your evidence.
            </p>
          </Annotated>
        </Section>

        <Meta
          rows={[
            ['repo', <a key="r" href="https://github.com/dudailia/cricstate">github.com/dudailia/cricstate</a>],
            ['status', 'published; no model shipped'],
            ['stack', 'Python · polars · scikit-learn · scipy · uv · GitHub Actions'],
          ]}
        />
      </article>
    </Shell>
  )
}
