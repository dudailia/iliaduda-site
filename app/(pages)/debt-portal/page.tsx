import { CaseStudyTitle, Meta, Section } from '@/components/CaseStudy'
import { Annotated, Shell } from '@/components/Layout'
import { SettlementInstrument } from '@/components/figures/SettlementInstrument'
import { fact } from '@/content/facts'
import { papers } from '@/content/papers'
import { pageMeta } from '@/lib/meta'

const paper = papers.find((p) => p.slug === 'debt-portal')!

export const metadata = pageMeta('/debt-portal', 'Debt-settlement portal', paper.abstract)

const n = (k: Parameters<typeof fact>[0]) => fact(k).value.toLocaleString('en-US')

export default function DebtPortal() {
  return (
    <Shell>
      <article>
        <CaseStudyTitle byline={paper.byline} level="h1" title={paper.title} standfirst={<p>{paper.abstract}</p>} />

        <SettlementInstrument />

        <Section heading="The product">
          <p>
            People in debt avoid the phone call, so the product is the opposite of one: look the
            debt up, see what a settlement would cost and over what schedule, pay, and get a
            closure certificate — without speaking to anyone. I am the only developer, building it
            end to end for a licensed collection organisation: the debtor flow, the arithmetic, the
            statutory limits, the disclosures, and the build gates that keep them true.
          </p>
        </Section>

        <Section heading="What the law set">
          <p>
            Two federal laws decided the architecture before any product decision did. 152-FZ
            keeps personal data in the country, which ruled out foreign hosting, foreign font CDNs
            and foreign analytics: the portal runs in a Russian cloud region with self-hosted
            Cyrillic typography, and zero third-party origins is a build gate rather than a policy.
          </p>
          <Annotated
            note={
              <>
                A compile-time constant, deliberately not a feature flag: two live behaviours
                would mean a login whose legality depends on a variable.
              </>
            }
          >
            <p>
              230-FZ caps creditor-initiated contact, and a login code is an electronic message.
              Whether a code the debtor asked for counts is not settled, so the code names the
              question, documents all three readings, and ships the conservative one — one
              contact per verification episode — with the reason written as an asymmetry: if
              counsel says it does not count, a constant flips; had it shipped permissive, the state
              machine would need rewriting. The abuse throttle runs before the statutory counter,
              so an attacker cannot spend a real debtor&rsquo;s allowance for them.
            </p>
          </Annotated>
        </Section>

        <Section heading="Money you can audit">
          <p>
            Every amount is integer kopecks and every discount integer basis points; a float
            never touches money. The discount is floored, recurring payments round up to a whole
            rouble and the final payment absorbs the remainder, a single payment is exact to the
            kopeck, and the offered terms are pruned so that no longer term ever costs more a
            month than a shorter one. The payment step recomputes the amount on the server from
            the chosen term and the debtor&rsquo;s own obligation; it never accepts an amount from
            the browser, and no debt data ever travels in a URL.
          </p>
        </Section>

        <Section heading="Compliance enforced at build time">
          <p>
            Because calls and messages have different ceilings, importing the wrong set at a send
            site is a compliance bug no happy-path test would catch. The telephone caps live in
            their own module, and a static check forbids the login path from importing them —
            matching static imports, dynamic imports and require calls alike. A display component
            that publishes both caps on the rights page is banned only from the route that
            actually sends and counts.
          </p>
          <p>
            Standards are build gates rather than intentions: types, lint, contrast computed from
            the design tokens, origin compliance, a JavaScript size ratchet, and accessibility 100
            as a hard failure. The layout-shift gate is {fact('dgClsGate').value} and the measured
            value is {fact('dgClsMeasured').value} on every audited route, over {n('dgUnitTests')}{' '}
            unit tests and {n('dgE2eCases')} end-to-end cases.
          </p>
          <p>
            The gates are held to the same standard as the product: a boolean audit takes the
            worst of its runs, never the median, and a server is ready when it answers a request,
            not when it prints a log line —{' '}
            <em>an assertion measured against an environment no real visitor uses is not a guard.</em>
          </p>
        </Section>

        <Meta
          rows={[
            ['role', 'sole developer and project lead'],
            ['status', 'in active development'],
            ['client', 'a licensed collection organisation; not named here'],
            ['stack', 'Next.js 16 · React 19 · Turbopack · Tailwind 4 · Yandex Cloud'],
          ]}
        />
      </article>
    </Shell>
  )
}
