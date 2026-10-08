import { CaseStudyTitle, Meta, Section } from '@/components/CaseStudy'
import { Figure } from '@/components/Figure'
import { Shell } from '@/components/Layout'
import { constantsDerivation } from '@/components/figures/ConstantsDerivation'
import { fact } from '@/content/facts'
import { otherWork } from '@/content/papers'
import { pageMeta } from '@/lib/meta'

/** Small counts in words, as the figure and the rest of the site set them ("six constants", "eight integrations"). */
const words = (n: number | string) => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][Number(n)] ?? String(n)

export const metadata = pageMeta(
  '/nucarbon',
  'nucarbon',
  'A carbon model for AI use across Northeastern’s campus: every chart derives from six constants you can change, and the uncertainty is reported.',
)

export default function Nucarbon() {
  return (
    <Shell>
      <article>
        <CaseStudyTitle
          figure={false}
          byline={otherWork.find((o) => o.slug === 'nucarbon')!.status}
          level="h1"
          title={'A carbon model for campus AI\u00a0use, built to be argued with'}
          standfirst={
            <p>
              A modeling and visualization tool for Northeastern&rsquo;s Sustainability
              Incubator that estimates the carbon cost of AI use across a campus. Every figure in
              the application derives from {words(fact('ncConstants').value)} constants and{' '}
              {words(fact('ncTools').value)} tools with adoption rates, so changing one assumption moves
              every chart consistently.
            </p>
          }
        />

        <Section heading="What it models">
          <p>
            The model runs from people to prompts to energy to carbon: population, queries per
            person per day and adoption per tool give a daily query volume; energy per query turns
            that into kilowatt hours, and the grid&rsquo;s carbon intensity turns those into
            kilograms of CO₂. The grid figure, {fact('ncCo2PerKwh').value}&nbsp;kg of CO₂ per kilowatt hour, is the US average in the EPA&rsquo;s eGRID2021 (852.3&nbsp;lb of CO₂e per megawatt hour);
            energy per query sits in the published range from Samsi et al. (2023), cited on the
            page where it is used.
          </p>
          <p>
            Because every number flows from the same small set of inputs, the tool is a way of
            making a set of assumptions legible and adjustable, and it reports its own
            uncertainty, plus or minus {fact('ncSelfReportedError').value} percent, rather than
            presenting estimates as measurements.
          </p>
        </Section>

        <Figure
          id="fig-constants"
          number="Fig. 1"
          title="Where every figure comes from"
          subtitle="nucarbon · six constants feed every chart"
          description={constantsDerivation.description}
          arrangements={constantsDerivation.arrangements}
          caption={
            <>
              One derivation for the whole application: change a constant and every chart moves
              with it, which is what makes the model auditable.
            </>
          }
        />

        <Section heading="How it is built">
          <p>
            The state-level choropleth is drawn without a mapping library: TopoJSON features are
            projected to path strings and rendered as raw SVG, with the topology client imported
            dynamically in parallel with the data fetch. It carries a cancellation guard, and if
            the map request fails it still renders the data rather than an empty box.
          </p>
          <p>
            The three model-backed routes check for an API key before constructing a client, so
            every page renders fully without one — a prototype anyone can run on handover.
          </p>
        </Section>

        <Meta
          rows={[
            [
              'live',
              <a key="l" href="https://nucarbon.vercel.app">
                nucarbon.vercel.app
              </a>,
            ],
            [
              'repo',
              <a key="r" href="https://github.com/dudailia/nucarbon">
                github.com/dudailia/nucarbon
              </a>,
            ],
            ['status', 'deployed'],
            ['stack', 'Next.js 14 · React 18 · d3 · TopoJSON · Anthropic API'],
          ]}
        />
      </article>
    </Shell>
  )
}
