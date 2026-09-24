import { CaseStudyTitle, Meta, Section } from '@/components/CaseStudy'
import { Figure } from '@/components/Figure'
import { Annotated, Shell } from '@/components/Layout'
import { constantsDerivation } from '@/components/figures/ConstantsDerivation'
import { fact } from '@/content/facts'
import { otherWork } from '@/content/papers'
import { pageMeta } from '@/lib/meta'

export const metadata = pageMeta(
  '/nucarbon',
  'nucarbon',
  'A modelling and visualisation prototype estimating the carbon cost of campus AI use, built in a week for Northeastern’s Sustainability Incubator. It models rather than measures.',
)

export default function Nucarbon() {
  return (
    <Shell>
      <article>
        <CaseStudyTitle
          byline={otherWork.find((o) => o.slug === 'nucarbon')!.status}
          level="h1"
          title="A dashboard that measures nothing"
          standfirst={
            <p>
              A modelling and visualisation prototype for Northeastern&rsquo;s Sustainability
              Incubator, built in a week, estimating the carbon cost of campus AI use. It takes no
              readings from anything.
            </p>
          }
        />

        <Section heading="What it is, and what it is not">
          <p>
            Nine pages of charts, a per-tool simulator, and a counter on the landing page that
            ticks upward. The counter is extrapolating the model forward on the visitor&rsquo;s own
            clock — it derives a rate per second from the daily total and adds to it every second.
            It is not a live reading of anything, and the repository says so.
          </p>
          <p>
            Every number on every page derives from {fact('ncConstants').value} constants and a
            list of {fact('ncTools').value} tools with assumed adoption percentages. Of those
            constants, exactly one has a traceable source: the carbon intensity per kilowatt hour,
            from a published regional grid figure. The student and staff populations and the
            assumed queries per person per day have no cited source anywhere.
          </p>
        </Section>

        <Figure
          id="fig-constants"
          number="Fig 7"
          title="Where every figure comes from"
          subtitle="nucarbon · six constants, one of them sourced"
          description={constantsDerivation.description}
          arrangements={constantsDerivation.arrangements}
          caption={
            <>
              The constants file itself carries no citations — sources live only in the components
              that display them, so a coefficient and its provenance are never in the same place.
              That is the thing I would change first.
            </>
          }
        />

        <Section heading="The hard part">
          <Annotated
            note={
              <>
                A real bug: the counter&rsquo;s interval cleanup is returned from an animation
                callback that discards return values, so the interval leaks on unmount and the
                comment claiming it is cleaned up is false.
              </>
            }
          >
            <p>
              Most of it was not hard, and this write-up should not pretend otherwise. The one
              piece of engineering I would still defend is the map: a state-level choropleth
              drawn without a mapping library, projecting TopoJSON features to path strings and
              rendering them as raw SVG paths, with the topology client imported dynamically in
              parallel with the data fetch. It has a cancellation guard, and if the map request
              fails it still renders the data circles rather than an empty box.
            </p>
          </Annotated>
          <p>
            The three model-backed routes check for an API key before constructing a client, so all
            nine pages render fully without one. That is a small thing that matters for a handover:
            a prototype nobody can run is a prototype nobody will look at.
          </p>
        </Section>

        <Section heading="Outcome and current status">
          <p>
            Deployed and complete as a prototype. An earlier description of it on my own
            portfolio claimed a great deal more than this, in wording that was not only
            unsupportable but constructed so that nothing could have disproved it. I am not going
            to restate it here. What it actually is: a model with a user interface, reporting plus
            or minus {fact('ncSelfReportedError').value} per cent on its own output, whose value
            is in making a set of assumptions legible and adjustable rather than in the numbers it
            produces.
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
            ['status', 'deployed; a model, not a measurement system'],
            ['stack', 'Next.js 14 · React 18 · d3 · TopoJSON · Anthropic API'],
          ]}
        />
      </article>
    </Shell>
  )
}
