import { CaseStudyTitle, Meta, Section } from '@/components/CaseStudy'
import { Figure } from '@/components/Figure'
import { Annotated, Shell } from '@/components/Layout'
import { dataLoss } from '@/components/figures/DataLoss'
import { fact } from '@/content/facts'
import { otherWork } from '@/content/papers'
import { pageMeta } from '@/lib/meta'

export const metadata = pageMeta(
  '/startup-investments',
  'Startup investment analysis',
  'Segment ranking over 40,000-plus startup funding records, originally a Yandex Practicum capstone. Descriptive, with no holdout and no uncertainty estimate.',
)

const n = (k: Parameters<typeof fact>[0]) => fact(k).value.toLocaleString('en-US')

export default function StartupInvestments() {
  return (
    <Shell>
      <article>
        <CaseStudyTitle
          byline={otherWork.find((o) => o.slug === 'startup-investments')!.status}
          level="h1"
          title="Ranking 395 market segments, and what the ranking leaves out"
          standfirst={
            <p>
              An analysis of {n('siRowsRaw')} startup funding records, originally a Yandex
              Practicum capstone. The notebook is in Russian with an English summary in the
              repository. It is descriptive: there is no holdout split and no interval on any
              score.
            </p>
          }
        />

        <Section heading="What problem, and for whom">
          <p>
            Given a large public dataset of startup funding rounds, which market segments look
            most attractive on the historical record? The exercise is a data-cleaning problem
            wearing an investment question&rsquo;s clothes: the interesting decisions are all
            about which records you keep and what you do with the ones you cannot use.
          </p>
        </Section>

        <Section heading="What the data actually supports">
          <p>
            {n('siSegments')} unique segments, split by company count into mass, mid and niche
            tiers. {n('siVenture')} companies with venture funding and {n('siSeed')} with seed
            funding, deploying about 129 and 9 billion dollars respectively. Fifty-nine per cent of
            companies received a single round and never another.
          </p>
          <p>
            Cleaning is where the work is. Records with no funding figure or no date are dropped.
            One column was a third null and was imputed rather than discarded, because dropping it
            would have taken a third of the dataset with it. Outliers were found with interquartile
            fences computed per segment rather than globally — a biotech round and a mobile app
            round are not the same distribution — and flagged rather than deleted, then excluded
            from the ranking. Years with too few rounds to say anything were dropped, which is what
            narrows the window to 2000 through 2014.
          </p>
        </Section>

        <Figure
          id="fig-data-loss"
          number="Fig 6"
          title="What happened to the records"
          subtitle="startup investment analysis · three stages of exclusion"
          description={dataLoss.description}
          arrangements={dataLoss.arrangements}
          caption={
            <>
              {fact('siLossPct').value}% of the supplied records are not in the ranking. That is
              the figure worth showing, because it decides what the ranking is a statement about.
            </>
          }
        />

        <Section heading="The hard part">
          <p>
            The composite score weights four normalised metrics: growth in the final year at the
            largest weight, then compound growth rate, then total funding, then company count. All
            four are min-max normalised to a nought-to-one-hundred scale, which is itself a choice
            worth naming — it makes every score relative to the extremes of this particular
            dataset rather than to anything external.
          </p>
          <Annotated
            note={
              <>
                The repository README describes the score as built from funding volume, company
                count and returned capital. That is wrong: returned capital is not in the score at
                all. Found while writing this page; the README is the thing to fix.
              </>
            }
          >
            <p>
              The genuinely instructive defect is in the growth lookup. It is guarded by a check
              that the segment exists in the growth table, and if it does not, the segment silently
              receives zero for both growth metrics — which is sixty-five per cent of the total
              weight. It does not error and it does not warn.
            </p>
          </Annotated>
          <p>
            You can see the consequence in the published output. Biotechnology, with roughly
            thirty-two billion dollars of funding across more than three thousand companies, and
            Software, with fifteen billion across four thousand, both display zero growth and rank
            sixth and ninth. Part of that ranking is an artifact of a missing join, not a finding
            about those markets. A silent default inside a scoring function is worse than a crash,
            because a crash gets fixed the same afternoon.
          </p>
        </Section>

        <Section heading="Outcome and current status">
          <Annotated
            note={
              <>
                No train/test split, no cross-validation, no interval on any score. The only
                statistical import in the notebook is a descriptive statistics module — there is
                no model in it.
              </>
            }
          >
            <p>
              Complete as a capstone and useful as a cleaning exercise. The composite score is a
              description of the historical record and not a forecast of returns, and it should
              not be read as one: a ranking with no holdout and no uncertainty attached tells you
              what happened in this dataset, which is a different question from what will happen
              next.
            </p>
          </Annotated>
        </Section>

        <Meta
          rows={[
            [
              'repo',
              <a key="r" href="https://github.com/dudailia/startup-investment-analysis">
                github.com/dudailia/startup-investment-analysis
              </a>,
            ],
            ['status', 'complete; Yandex Practicum capstone'],
            ['stack', 'Python · pandas · numpy · matplotlib · seaborn · scipy'],
          ]}
        />
      </article>
    </Shell>
  )
}
