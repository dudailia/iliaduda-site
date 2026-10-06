import { CaseStudyTitle, Meta, Section } from '@/components/CaseStudy'
import { Figure } from '@/components/Figure'
import { Shell } from '@/components/Layout'
import { schemaReconciliation } from '@/components/figures/SchemaReconciliation'
import { fact } from '@/content/facts'
import { otherWork } from '@/content/papers'
import { pageMeta } from '@/lib/meta'

export const metadata = pageMeta(
  '/adconfirm',
  'AdConfirm',
  'AdConfirm places ads inside invoices and receipts: eight accounting and point-of-sale integrations, a sub-penny billing ledger and Stripe Connect payouts.',
)

export default function AdConfirm() {
  return (
    <Shell>
      <article>
        <CaseStudyTitle
          figure={false}
          byline={otherWork.find((o) => o.slug === 'adconfirm')!.status}
          level="h1"
          title="Eight vendors who disagree about what money is"
          standfirst={
            <p>
              AdConfirm places advertising inside invoices and receipts, bills the advertiser per
              delivered impression, and pays the business its share. I co-founded it and built the
              platform: eight accounting and point-of-sale integrations, a sub-penny billing
              ledger, and Stripe Connect payouts.
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
          number="Fig. 1"
          title="Eight schemas, one target type"
          subtitle="AdConfirm · adapters and what the shared type cannot carry"
          description={schemaReconciliation.description}
          arrangements={schemaReconciliation.arrangements}
          caption={
            <>
              Each vendor&rsquo;s adapter maps its payload onto the one shared invoice type. The
              marks in indigo are the vendors that cannot supply line items, so the shared type
              leaves line items out.
            </>
          }
        />

        <Section heading="The hard part">
          <p>
            Every one of the eight vendors disagrees with the others somewhere, and never in the
            same place twice:
          </p>
          <ul className="mt-2 grid list-disc gap-y-1 pl-5 marker:text-graphite">
            <li>field names in Pascal case, with an explicit tenant identifier;</li>
            <li>an API minor version pinned in the URL, and a second, separate expiry for the refresh token itself;</li>
            <li>money as strings, under two different field names for the same concept;</li>
            <li>a money object in minor units, and no line items at all;</li>
            <li>a static token header rather than an OAuth refresh, with the shop domain as the tenant id;</li>
            <li>
              a currency <em>symbol</em> where every other adapter supplies an ISO code;
            </li>
            <li>a webhook signature header that still carries the company&rsquo;s previous brand name;</li>
            <li>
              no webhook at all, so it is polled, with its payload keys read defensively in four capitalizations because it
              uses them inconsistently.
            </li>
          </ul>
          <p className="mt-[1.1em]">
            Six different signature headers, all HMAC over the raw body, which is why the router
            takes the body as bytes rather than parsed JSON — a detail that carries the whole
            verification step and is commented as such, because the first person to add a JSON
            body parser above it would break every webhook silently.
          </p>
          <p>
            The architecture is type-driven normalization. There is no central reconciler to
            drift out of date: the shared invoice type is the seam, and each adapter owns a private
            mapper that lands on it. The type is deliberately the intersection of what eight
            vendors can supply — {fact('acAdaptersWithoutLineItems').value} of the{' '}
            {fact('acIntegrations').value} cannot supply line items — so downstream code never
            depends on a field one vendor quietly omits.
          </p>
        </Section>

        <Section heading="The money">
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

        <Meta
          rows={[
            ['role', 'co-founder; built the platform'],
            ['repo', 'private'],
            ['stack', 'TypeScript · Express · Next.js · Turborepo · Stripe Connect'],
          ]}
        />
      </article>
    </Shell>
  )
}
