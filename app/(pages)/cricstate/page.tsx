import { CaseStudyTitle, Meta, Register, Section } from '@/components/CaseStudy'
import { Figure } from '@/components/Figure'
import { Annotated, Shell } from '@/components/Layout'
import { CricketReplay } from '@/components/figures/CricketReplay'
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
        Relative improvement in negative log-likelihood over a marginal baseline, T1/T20, after
        calibration.
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

        <CricketReplay />

        <Section heading="The question">
          <p>
            Given the state of a T20 match — score, wickets, balls left, the target, who is at the
            crease and how long they have been there — how well can you price the next ball and
            the result, and how much more do you gain by modelling the players themselves? The
            second half is the expensive decision: a hierarchical model with a parameter per
            batter and bowler is easy to propose and costly to maintain, so the study measured its
            value before building it.
          </p>
          <p>
            It is a measurement problem more than a modelling one, and measurement problems fail
            quietly: a leak or an optimistic interval produces a number that looks like a
            discovery. So most of the engineering went into making the measurement trustworthy.
          </p>
        </Section>

        <Section heading="The model">
          <p>
            A four-rung ladder, each rung scored against the one below it: a marginal baseline,
            then models of increasing capacity, up to gradient boosting on{' '}
            {fact('crFeatures').value} whitelisted features of the match state. Every rung is fit
            on the training period only, tuned and calibrated on a later validation period —
            isotonic regression for win probability, temperature scaling for the next ball — and
            scored once on a held-out test period that no fitting decision ever saw.
          </p>
          <p>
            On win probability the top rung reaches a test log-loss of {fact('crT2Nll').value.toFixed(3)}{' '}
            against {fact('crT2Base').value.toFixed(3)} for the base rate, {fact('crT2Skill').value}%
            skill over {n('crT2TestMatches')} held-out matches. On the far harder next-ball task,
            eleven outcome classes, it is {fact('crStateGain').value}% better than the baseline.
            Fig. 1 is that model, unchanged, scoring a match from the test period.
          </p>
        </Section>

        <Section heading="How it was validated">
          <p>
            Leakage discipline in a research repository is usually a convention, and conventions
            decay under deadline. Here it is a property of the code. The feature builder&rsquo;s
            first statement is a select against a frozen whitelist, so an outcome column is
            unreachable by construction, and a test proves it by asserting byte-equality between
            a clean frame and one with label-bearing columns injected. The data loader raises on
            any read of the test split unless the leaderboard runner passes an explicit flag, so
            the single test touch is enforced rather than remembered.
          </p>
          <p>
            The leakage canaries have to prove their own power before they are believed. The
            shuffled-identity test first requires that a <em>planted</em> identity signal on a
            synthetic split is detected, and only then that shuffling destroys it — a canary that
            cannot detect anything passes every leak. A poisoned-column canary and a temporal-split
            check run in continuous integration alongside it.
          </p>
          <Annotated
            note={
              <>
                A paired bootstrap over {n('crBootstrapResamples')} resamples, with draws shared
                between the two models being compared so that between-match variance cancels.
              </>
            }
          >
            <p>
              The confidence intervals resample matches, not balls. Balls inside a match are not
              independent, so resampling them manufactures precision; the match is the unit, and
              the resampling is written as a multinomial count matrix, which turns it into linear
              algebra rather than a loop. A test plants a between-match spread and requires the
              paired interval to come out more than ten times tighter than the unpaired one.
            </p>
          </Annotated>
          <p>
            The corpus is an exact replay of {n('crFilesSeen')} Cricsheet files through a pure
            transition function, pinned by hash and rebuilt byte-identically. A file that cannot
            be replayed is quarantined with a coded reason, never dropped — {n('crQuarantined')}{' '}
            of them, mostly formats outside the study&rsquo;s scope — and {n('crGoldens')} golden
            fixtures pin one real pathology each: a super over, a revised target, penalty runs, a
            concussion replacement.
          </p>
        </Section>

        <Figure
          id="fig-materiality"
          number="Fig. 2"
          title="What each enrichment adds beyond match state"
          subtitle="relative NLL improvement over a marginal baseline · next ball, T20 · calibrated"
          description={materialityBar.description}
          arrangements={materialityArrangements}
          table={<MaterialityTable />}
          caption={
            <>
              Match state carries the signal. Player identity adds a real, reproducible{' '}
              {fact('crIdentityGain').value}% — its interval excludes zero — but under the{' '}
              {fact('crJustifyBar').value.toFixed(0)}% bar for further work.
            </>
          }
        />

        <Section heading="What the measurement decided">
          <p>
            The per-player model was not built. Identity is worth {fact('crIdentityGain').value}%
            in log-likelihood and a per-match latent for pitch and conditions{' '}
            {fact('crLatentGain').value}%, both below the materiality bar, so the study spent its
            effort on the result it could defend rather than the model it had planned. Knowing
            what not to build, and being able to show why, is the output.
          </p>
          <p>
            The evaluation protocol was fixed before the test split was read; the verdict bands
            were entered with the evaluation itself. The register below draws that line exactly.
          </p>
          <Register
            columns={[
              {
                heading: 'Fixed before any test split was read',
                items: [
                  'the four-rung ladder and validation-only tuning',
                  'the metric contract and the calibration policy',
                  'the leakage canaries, including the ladder-inversion stop rule',
                  'the corpus and label hash pins',
                  'the single-test-touch discipline',
                ],
              },
              {
                heading: 'Entered with the evaluation',
                items: [
                  'the materiality bands that classify the result',
                  'the challenger gate thresholds',
                ],
              },
            ]}
          />
        </Section>

        <Meta
          rows={[
            ['repo', <a key="r" href="https://github.com/dudailia/cricstate">github.com/dudailia/cricstate</a>],
            ['data', 'Cricsheet ball-by-ball, snapshot of 2 July 2026, pinned by hash'],
            ['stack', 'Python · polars · scikit-learn · scipy · uv · GitHub Actions'],
          ]}
        />
      </article>
    </Shell>
  )
}
