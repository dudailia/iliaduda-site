import { CaseStudyTitle, Meta, Section } from '@/components/CaseStudy'
import { Shell } from '@/components/Layout'
import { fact } from '@/content/facts'
import { otherWork } from '@/content/papers'
import { pageMeta } from '@/lib/meta'

export const metadata = pageMeta(
  '/adconfirm',
  'AdConfirm',
  'AdConfirm places ads inside invoices and receipts, billed per delivered impression: a ledger in millicents, metered billing and Stripe Connect payouts.',
)

export default function AdConfirm() {
  return (
    <Shell>
      <article>
        <CaseStudyTitle
          figure={false}
          byline={otherWork.find((o) => o.slug === 'adconfirm')!.status}
          level="h1"
          title="Advertising inside invoices, billed to the millicent"
          standfirst={
            <p>
              AdConfirm places advertising inside invoices and receipts, bills the advertiser per
              delivered impression, and pays the business its share. I co-founded it and built the
              platform: metered billing, a sub-penny ledger and Stripe Connect payouts.
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
            Express backend that holds the ad engine, the billing ledger and the payout worker:
            metered subscription billing through Stripe, and Stripe Connect for paying businesses
            out.
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
