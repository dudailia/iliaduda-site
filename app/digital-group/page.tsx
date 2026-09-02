import type { Metadata } from 'next'
import { CaseStudyTitle, Meta, Register, Section } from '@/components/CaseStudy'
import { Figure } from '@/components/Figure'
import { Annotated, Shell } from '@/components/Layout'
import { contactBudget } from '@/components/figures/ContactBudget'
import { fact } from '@/content/facts'

export const metadata: Metadata = {
  title: 'Debt-settlement portal',
  description:
    'A self-service debt settlement portal whose architecture was decided by statute: data-localisation rules removed the easy hosting choices, and a statutory cap on contact frequency meant the login code itself spends a legal allowance.',
}

const n = (k: Parameters<typeof fact>[0]) => fact(k).value.toLocaleString('en-US')

export default function DigitalGroup() {
  return (
    <Shell>
      <article>
        <CaseStudyTitle
          slug="debt portal"
          level="h1"
          title="When the law decides your architecture"
          standfirst={
            <p>
              Sole developer on a {n('dgRoutes')}-route self-service debt settlement portal for a
              licensed professional collection organisation operating under Russian federal law.
              Two statutes shaped the build more than any product decision did — one removed the
              easy infrastructure choices, and the other made the login code itself spend a legal
              allowance.
            </p>
          }
        />

        <Section heading="What problem, and for whom">
          <p>
            Every competitor in this market runs a template site with a phone number as the
            primary call to action. The audience&rsquo;s dominant emotion is avoidance of exactly
            that phone call. So the product is the opposite of a phone number: find your balance,
            see the discount and the schedule you qualify for, pay, and receive a closure
            certificate, without speaking to anyone.
          </p>
          <p>
            That is a product thesis you can state in a sentence. The reason it took real
            engineering is that a debt settlement portal in this jurisdiction is not free to be
            built the obvious way.
          </p>
        </Section>

        <Section heading="What the law removed">
          <p>
            Data-localisation rules meant personal data had to stay in country, which ruled out
            foreign hosting — and with it foreign font CDNs, foreign analytics and even
            foreign-hosted policy documents. So the stack runs on a Russian cloud in a Russian
            region, with self-hosted variable Cyrillic typography, because the law removed the
            easy options rather than because I preferred the hard ones. The registry target is a
            build argument, so the whole thing can be re-pointed if billing or sanctions close
            that door too.
          </p>
          <p>
            Next.js 16 and React 19 on Turbopack, Tailwind 4, {n('dgRoutes')} public routes. Three
            runtime dependencies: the framework and the two React packages. Everything else is a
            development dependency, which is the structural reason there are no third-party bytes
            to leak rather than a policy about it.
          </p>
        </Section>

        <Section heading="The hard part">
          <p>
            The statute that caps creditor-initiated contact treats a phone call and an electronic
            message as separate things with separate ceilings. Calls are capped at{' '}
            {fact('dgCallsDay').value} a day, {fact('dgCallsWeek').value} a week and{' '}
            {fact('dgCallsMonth').value} a month; messages at {fact('dgMessagesDay').value},{' '}
            {fact('dgMessagesWeek').value} and {fact('dgMessagesMonth').value}. An SMS login code
            is an electronic message. So the authentication flow is not a UX surface with a rate
            limit bolted on — it is a withdrawal from a legal allowance, and a person who mistypes
            a digit twice can exhaust a week of it.
          </p>
        </Section>

        <Figure
          id="fig-contact-budget"
          number="Fig 4"
          title="One login code, three ceilings"
          subtitle="statutory contact allowance · calls and messages capped separately"
          description={contactBudget.description}
          arrangements={contactBudget.arrangements}
          caption={
            <>
              Sending one code spends a unit from the daily, weekly and monthly message allowances
              at the same time. This is why the authentication design starts from the statute and
              not from the sign-in screen.
            </>
          }
        />

        <Section heading="Encoding an unsettled question">
          <p>
            Whether a login code the user asked for counts as regulated contact at all is not
            settled. It is arguably a technical service message outside the article&rsquo;s scope,
            since the article governs contact initiated by the creditor for the purpose of
            recovering a debt. It is also arguably one contact per verification episode, or one
            per message sent.
          </p>
          <Annotated
            note={
              <>
                Written as a compile-time constant with one value in every environment, and
                explicitly not a feature flag: two live behaviours would mean a flow whose
                usability depends on a variable.
              </>
            }
          >
            <p>
              Rather than pick and move on, the code names the question, documents all three
              readings, and ships the most conservative one — and it records the reason as an
              asymmetry rather than a belief. If counsel later says it does not count, a constant
              flips and a number changes. If it had shipped permissive and counsel says it does
              count, the state machine gets rewritten. The classification is written onto each
              message at send time rather than derived later, so the historical records keep
              saying what we believed when we sent them.
            </p>
          </Annotated>
        </Section>

        <Section heading="A gate exactly as wide as its subject">
          <p>
            Because the two ceilings are different numbers, importing the wrong set at a send site
            is a compliance bug that no test of the happy path would catch. So the file holding
            the telephone caps opens by saying it must not be imported by the login path, and a
            static check enforces it — matching static imports, dynamic imports and require calls,
            because an earlier rule of the same kind matched only one syntax and a dynamic import
            walked straight past it.
          </p>
          <p>
            The part I am proudest of is the second scope. A component on the public rights page
            has to publish both ceilings — that is its whole job — and it lives outside the
            guarded directory so that page can render it. But a display component holding the
            telephone numbers puts them one import away from a send site, so the ban on the raw
            caps covers the whole authenticated area while the ban on the component covers only
            the route that actually sends and counts. Two bans, two scopes, each as wide as its
            subject. The reason is written next to it: a gate wider than its subject gets
            exempted, and an exemption is where the next defect lives.
          </p>
        </Section>

        <Section heading="Gates, and the ones that were measuring nothing">
          <p>
            Engineering standards here are build gates rather than intentions: type check, lint,
            format, contrast computed from the design tokens, origin compliance against the
            data-localisation rules, a check that every custom property a stylesheet references is
            actually defined, a JavaScript size ratchet, a check that no fixture adapter reaches a
            production build, an idle paint ceiling, and a check that no prose asserts a condition
            it does not own. Accessibility 100 is a hard failure below 100, not a target. The
            layout-shift gate is {fact('dgClsGate').value} and the measured value is{' '}
            {fact('dgClsMeasured').value} on every audited route. Third-party requests are capped
            at {fact('dgThirdParty').value} across audited routes. {n('dgUnitTests')} unit tests
            and about {n('dgE2eCases')} executed end-to-end cases.
          </p>
          <p>
            None of that is the interesting part. The interesting part is that several of those
            gates ran, reported green, and were measuring nothing.
          </p>
          <Register
            columns={[
              {
                heading: 'Guards that ran and measured nothing',
                items: [
                  'a pass/fail audit aggregated by median across five runs: failing two of five medians to a pass, so the gate announced success while the thing it guarded was broken forty per cent of the time',
                  'a readiness check that matched a log line instead of making a request — it declared the server ready under a second after launch, then scored a browser error page, and passed on every developer machine because they boot faster than the browser does',
                ],
              },
              {
                heading: 'And two more of the same kind',
                items: [
                  'three geometric assertions that agreed with each other while the elements they described shipped clipped',
                  'a test that failed readily, but toward the wrong answer, because its expected value encoded a misreading of the statute',
                ],
              },
            ]}
          />
          <p className="mt-6">
            The aggregation bug is the one I would want a reviewer to look at, because the fix is
            one word and the diagnosis is not. Taking the median of five runs is correct for a
            numeric budget and wrong for a boolean: a boolean gate needs the worst run, so that
            one failure in five fails the assertion, which is what asserting &ldquo;never
            fails&rdquo; meant in the first place. It is proven on synthetic reports rather than
            asserted, because a gate is exactly the kind of code that has no other test.
          </p>
          <p>
            The rule I wrote afterwards is the transferable part, and it is the same idea as a
            leakage canary that has to prove it can detect a planted signal before it is trusted
            to say there is none:{' '}
            <em>
              an assertion measured against a transport, origin or environment no real visitor
              uses is not a guard.
            </em>
          </p>
        </Section>

        <Section heading="Outcome and current status">
          <Annotated
            note={
              <>
                The third-party and layout-shift gates are asserted against the audited public and
                lookup routes. The authenticated area sits behind an SMS one-time code and is
                excluded from crawling, so it is not covered by the same automated run.
              </>
            }
          >
            <p>
              In active development, sole developer. It is my best pure engineering work and the
              least visible, because the client is not named here and there is no link: the
              product is a debt settlement portal for a licensed collection organisation under
              Russian law, and I would rather describe the engineering accurately than trade on
              the brand.
            </p>
          </Annotated>
        </Section>

        <Meta
          rows={[
            ['live', 'client unnamed; no public link'],
            ['repo', 'private'],
            ['status', 'in active development; sole developer'],
            ['stack', 'Next.js 16 · React 19 · Turbopack · Tailwind 4 · Russian cloud region'],
          ]}
        />
      </article>
    </Shell>
  )
}
