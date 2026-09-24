import { CaseStudyTitle, Meta, Section } from '@/components/CaseStudy'
import { Figure } from '@/components/Figure'
import { Annotated, Shell } from '@/components/Layout'
import { schemaReconciliation } from '@/components/figures/SchemaReconciliation'
import { fact } from '@/content/facts'
import { otherWork } from '@/content/papers'
import { pageMeta } from '@/lib/meta'

export const metadata = pageMeta(
  '/adconfirm',
  'AdConfirm',
  'Advertising placement inside invoices and receipts: eight accounting and point-of-sale integrations mapped onto one internal type, with metered billing in sub-penny units and Stripe Connect payouts.',
)

export default function AdConfirm() {
  return (
    <Shell>
      <article>
        <CaseStudyTitle
          byline={otherWork.find((o) => o.slug === 'adconfirm')!.status}
          level="h1"
          title="Eight vendors who disagree about what money is"
          standfirst={
            <p>
              AdConfirm places advertising inside invoices and receipts, bills the advertiser per
              delivered impression, and pays the business its share. I co-founded it and built the
              platform. I no longer maintain it.
            </p>
          }
        />

        <Section heading="What problem, and for whom">
          <p>
            A small business sends invoices and receipts that are opened and read carefully,
            because they are about money the recipient owes or has just spent. That attention is
            worth something to an advertiser, and worth more than the same impression on a web
            page. To sell it you have to sit inside the business&rsquo;s existing invoicing
            software rather than ask them to change it — which means integrating with whatever
            accounting or till system they already use.
          </p>
          <p>
            So the product is an advertising network whose inventory lives in other
            people&rsquo;s software, and whose revenue has to be split with the business that owns
            the document.
          </p>
        </Section>

        <Section heading="What I built">
          <p>
            A pnpm monorepo: a marketing site, a dashboard for advertisers and businesses, and an
            Express backend that holds the integrations, the ad engine, the billing ledger and the
            payout worker. Eight integrations across accounting and point-of-sale systems, metered
            subscription billing through Stripe, and Stripe Connect for paying businesses out.
          </p>
        </Section>

        <Figure
          id="fig-schema-reconciliation"
          number="Fig 5"
          title="Eight schemas, one target type"
          subtitle="AdConfirm · adapters and what the shared type cannot carry"
          description={schemaReconciliation.description}
          arrangements={schemaReconciliation.arrangements}
          caption={
            <>
              There is no central reconciler. The seam is the target interface, and each adapter
              owns a private mapper that lands on it — which is why the shared type is a lowest
              common denominator rather than a union.
            </>
          }
        />

        <Section heading="The hard part">
          <p>
            Every one of the eight vendors disagrees with the others somewhere, and never in the
            same place twice. One sends field names in Pascal case and carries an explicit tenant
            identifier. One pins an API minor version in the URL and returns a second, separate
            expiry for the refresh token itself. One sends money as strings, under two different
            field names for the same concept. One sends a money object in minor units and exposes
            no line items at all. One authenticates with a static token header rather than an
            OAuth refresh, and uses the shop domain as its tenant id. One supplies a currency{' '}
            <em>symbol</em> where every other adapter supplies an ISO code. One&rsquo;s webhook
            signature header still carries the company&rsquo;s previous brand name. And one is the
            only integration with no webhook at all, so it is polled, with its payload keys read
            defensively in four capitalisations because it uses them inconsistently.
          </p>
          <p>
            Six different signature headers, all HMAC over the raw body, which is why the router
            takes the body as bytes rather than parsed JSON — a detail that carries the whole
            verification step and is commented as such, because the first person to add a JSON
            body parser above it would break every webhook silently.
          </p>
          <Annotated
            note={
              <>
                {fact('acAdaptersWithoutLineItems').value} of the{' '}
                {fact('acIntegrations').value} cannot populate line items, and the currency field
                accepts any string — which is how a display symbol can flow into the field another
                adapter fills with a currency code.
              </>
            }
          >
            <p>
              What I would not claim is that this is a reconciliation engine. There is no central
              reconciler: the shared type is the seam, and each adapter owns a private mapper that
              lands on it. That is a real design and it has a real cost, which is that the shared
              type is the intersection of what eight vendors can supply rather than the union.
              Type-driven normalisation with documented gaps is the accurate description.
            </p>
          </Annotated>
          <p>
            The best code in the project is the money. Billing at a two-pound cost per thousand
            impressions means one impression costs a fifth of a penny, and there is no way to hold
            that in integer pence. So the ledger&rsquo;s unit is a millicent — a thousandth of a
            penny — and one impression is exactly{' '}
            {fact('acMillicentsPerImpression').value} of them rather than a rounded fraction. The
            revenue split rounds the business&rsquo;s share and gives the platform the remainder,
            so the two always sum to the gross with no drift. Converting to pence returns both the
            pence and the leftover, so repeated roll-ups through invoices and payouts never quietly
            shed fractions.
          </p>
          <p>
            Charging is gated on delivery rather than on rendering: the ledger is only written when
            the message carrying the advertisement is confirmed delivered. Idempotency lives in the
            database as a conflict on the placement id, and the follow-through is the part worth
            copying — a duplicate insert returns no rows, so the delivery counters deliberately do
            not increment a second time either. The counters go through an atomic database
            function rather than a read and a write.
          </p>
        </Section>

        <Section heading="Outcome and current status">
          <Annotated
            note={
              <>
                The payout worker floors millicents to pence and discards the remainder that the
                money module exists to preserve — it never imports the conversion that returns it.
                The same file also updates a running total by reading it, adding, and writing back.
              </>
            }
          >
            <p>
              Co-founded and built; I no longer maintain it. Two defects I would fix first are in
              the payout path, and they are the same class of mistake: careful arithmetic upstream
              undone by a shortcut at the last step. It is a useful reminder that a correct unit
              only stays correct if every consumer respects it.
            </p>
          </Annotated>
          <p>
            The test suite is thin — four files — and the continuous integration chain installs,
            lints, type checks and builds without running them.
          </p>
        </Section>

        <Meta
          rows={[
            ['live', 'no longer maintained by me'],
            ['repo', 'private'],
            ['status', 'co-founded and built; I no longer maintain it'],
            ['stack', 'TypeScript · Express · Next.js · Turborepo · Stripe Connect'],
          ]}
        />
      </article>
    </Shell>
  )
}
