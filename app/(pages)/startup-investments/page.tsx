import { CaseStudyTitle, Meta, Section } from '@/components/CaseStudy'
import { Figure } from '@/components/Figure'
import { Annotated, Shell } from '@/components/Layout'
import { dataLoss } from '@/components/figures/DataLoss'
import { SegmentRanking } from '@/components/figures/SegmentRanking'
import ranking from '@/content/data/startup-ranking.json'
import { fact } from '@/content/facts'
import { papers } from '@/content/papers'
import { pageMeta } from '@/lib/meta'

const paper = papers.find((p) => p.slug === 'startup-investments')!

export const metadata = pageMeta('/startup-investments', 'Startup segment ranking under uncertainty', paper.abstract)

const n = (k: Parameters<typeof fact>[0]) => fact(k).value.toLocaleString('en-US')

/** Segments in the top N under all three treatments: the robust answer. */
function robust(top: number): string[] {
  return ranking.segments
    .filter((s) => s.a.rank <= top && s.b.rank <= top && s.c.rank <= top)
    .sort((x, y) => x.a.rank + x.b.rank + x.c.rank - (y.a.rank + y.b.rank + y.c.rank))
    .map((s) => s.name)
}

const REPO = 'https://github.com/dudailia/startup-investment-analysis'
const SRC = 'https://github.com/dudailia/iliaduda-site/blob/redesign'

export default function StartupInvestments() {
  const top10 = robust(10)
  const top15 = robust(15)
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0] ?? '')
  return (
    <Shell>
      <article>
        <CaseStudyTitle byline={paper.byline} level="h1" title={paper.title} standfirst={<p>{paper.abstract}</p>} />

        <SegmentRanking />

        <Section heading="The question">
          <p>
            Which startup market segments should an investor favour for the coming year? The
            analysis starts from {n('siRowsRaw')} funding records spanning 2000 to 2014 and ends at
            a recommendation, and every step in between is a decision about data: what counts as a
            duplicate, what to do with a missing date, which extreme rounds to trust, how to
            measure growth, and how to weigh it against sheer size.
          </p>
        </Section>

        <Figure
          id="fig-data-loss"
          number="Fig. 2"
          title="From supplied records to scored records"
          subtitle="startup-investment-analysis · each stage of cleaning, and what it removed"
          description={dataLoss.description}
          arrangements={dataLoss.arrangements}
          caption={
            <>
              Duplicates and rounds without funding go first; then {n('siOutliersRemoved')} outliers
              by per-segment interquartile fences, so a segment of seed rounds is not judged by the
              fences of a segment of growth rounds; then years with too few rounds to measure.
            </>
          }
        />

        <Section heading="The model">
          <p>
            Segments are sized by company count into mass, mid-size and niche; the ranking covers
            the {n('siMassSegments')} mass segments of {n('siSegments')}. Each is scored on four
            components — funding growth into 2014, compound annual growth, total funding and
            company count — each min-max scaled to 0–100 across the segments and combined with
            weights of {fact('siWeightGrowth').value}, {fact('siWeightCagr').value},{' '}
            {fact('siWeightFunding').value} and {fact('siWeightCompanies').value}. As written, the
            model recommends Technology, Apps and Medical.
          </p>
        </Section>


        <Section heading="Stress-testing it">
          <Annotated
            note={
              <>
                Re-executed, not reimplemented: a script runs the notebook&rsquo;s own cells and
                asserts that its scores come out identical before changing anything.
              </>
            }
          >
            <p>
              A recommendation is only as good as its sensitivity to the choices underneath it,
              so I re-ran the analysis exactly and then changed one data-handling decision at a
              time. The growth lookup, as written, only knows the {n('siGrowingSegments')} segments
              whose funding rose in 2014, so the other {n('siZeroedSegments')} score zero on{' '}
              {fact('siWeightZeroed').value}% of the weight — including Biotechnology and Software,
              the two largest segments by funding. Giving every segment its real growth, negative
              where funding fell, reorders the ranking almost completely.
            </p>
          </Annotated>
          <p>
            The compound growth has a second sensitivity: measured from 2000, a segment with no
            funding that year starts from a dollar, which inflates its growth rate into the
            hundreds of per cent. Measuring from each segment&rsquo;s first funded year moves the
            top pick again, to Software. And 2014 itself is incomplete in the source data — its
            last two months are a fraction of a normal month — so part of every &ldquo;decline&rdquo;
            is under-reporting rather than a market signal.
          </p>
        </Section>

        <Section heading="What survives">
          <p>
            No segment is in the top ten under all three treatments.{' '}
            {top15.length
              ? `Only ${list(top15)} are in the top fifteen under every one of them, which makes them the defensible recommendation: the answer that does not depend on which of three reasonable data decisions you believe.`
              : 'None is in the top fifteen under all three either.'}
            {top10.length ? ` ${list(top10)} hold the top ten throughout.` : ''} The general point
            is the one a risk desk would make: a model&rsquo;s data pipeline is part of the model,
            and a ranking should be reported with the decisions it is sensitive to.
          </p>
        </Section>

        <Meta
          rows={[
            ['repo', <a key="r" href={REPO}>github.com/dudailia/startup-investment-analysis</a>],
            ['re-run', <a key="s" href={`${SRC}/scripts/startup_ranking.py`}>scripts/startup_ranking.py</a>],
            ['data', `the course’s startup investment dataset, ${n('siRowsRaw')} records, hash-pinned in the re-run`],
            ['stack', 'Python · pandas · NumPy · matplotlib · Jupyter'],
          ]}
        />
      </article>
    </Shell>
  )
}
