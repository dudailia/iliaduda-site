import { CaseStudyTitle, Meta, Section } from '@/components/CaseStudy'
import { Figure } from '@/components/Figure'
import { Annotated, Shell } from '@/components/Layout'
import { tenantIsolation } from '@/components/figures/TenantIsolation'
import { fact } from '@/content/facts'
import { papers } from '@/content/papers'
import { pageMeta } from '@/lib/meta'

export const metadata = pageMeta(
  '/closebooks',
  'CloseBooks',
  'An AI-assisted month-end close tool for CPA firms, built solo. Around a hundred API routes, multi-tenant isolation, a Claude categorization pipeline, Stripe billing and a QuickBooks journal push.',
)

const n = (k: Parameters<typeof fact>[0]) => fact(k).value.toLocaleString('en-US')

export default function CloseBooks() {
  return (
    <Shell>
      <article>
        <CaseStudyTitle
          byline={papers.find((p) => p.slug === 'closebooks')!.byline}
          level="h1"
          title="I audited my own deployed app and found it lying to users"
          standfirst={
            <p>
              CloseBooks is an AI-assisted month-end close tool for CPA firms that I designed and
              built solo. Before showing it to anyone, I read it as a sceptic would — and found
              four screens reporting that an external action had completed when nothing had left
              the server.
            </p>
          }
        />

        <Section heading="What problem, and for whom">
          <p>
            A small accounting firm closes each client&rsquo;s books every month: pull the bank
            statements, decide which account each transaction belongs to, reconcile, post the
            journal entries, and do it again next month. The categorisation step is the one that
            eats the week, and it is mostly pattern recognition against a chart of accounts that
            differs for every client.
          </p>
          <p>
            CloseBooks does that step with a model in the loop, and then the surrounding work
            around it: multi-tenant client data, subscription billing, a client portal, and a push
            of finished journal entries into QuickBooks Online. It is deployed and publicly
            reachable. Billing is in Stripe&rsquo;s test mode, so there are no paying customers.
          </p>
        </Section>

        <Section heading="What I built">
          <p>
            Next.js 14 and React 18 on Vercel, with Supabase Postgres behind it —{' '}
            {n('cbApiRoutes')} API routes, {n('cbDashboardPages')} dashboard pages and{' '}
            {n('cbMigrations')} SQL migrations. Anthropic&rsquo;s API does transaction
            categorisation, Stripe handles subscriptions and the billing portal, and an OAuth
            integration pushes journal entries to QuickBooks Online. Sole engineer throughout.
          </p>
          <Annotated
            note={
              <>
                No automated test coverage: there is no test runner configured at all. The
                correctness gate is the build plus manual verification in a browser.
              </>
            }
          >
            <p>
              Tenant isolation is the structural decision worth describing, and it is not one
              mechanism but two. Most routes reach client data through the Supabase client, where
              row-level security policies constrain every query by firm membership and role rank —
              a genuine privilege gradient, so deleting a compliance record requires a senior role
              while editing one does not. The remaining routes use the service-role key, which
              bypasses row-level security entirely, and are constrained by an owner check written
              by hand in each route instead.
            </p>
          </Annotated>
        </Section>

        <Figure
          id="fig-tenant-isolation"
          number="Fig 2"
          title="Two paths to one firm's rows"
          subtitle="CloseBooks · isolation by policy and by hand"
          description={tenantIsolation.description}
          arrangements={tenantIsolation.arrangements}
          caption={
            <>
              A sixth of the routes go around the policy layer and are isolated by hand. Drawing
              only the policy layer would have been the flattering version of this diagram.
            </>
          }
        />

        <Section heading="The hard part">
          <p>
            The hard part was not a feature. It was reading my own product as a stranger would and
            taking seriously what the screens claimed.
          </p>
          <p>
            Four surfaces told a user that an external action had completed when nothing had left
            the server. A 1099 filing endpoint generated a confirmation number, returned a status
            of accepted, and rendered the words &ldquo;successfully submitted to the IRS.&rdquo;
            There is no IRS e-file integration in the product and it is not an authorised e-file
            provider, so the confirmation number was locally invented. A bulk action on the same
            page never called an API at all: it added ids to a set in the browser and flipped a
            badge to &ldquo;filed,&rdquo; behind a dialog that read &ldquo;this is a legal
            filing.&rdquo; A taxpayer-ID check displayed &ldquo;TIN verified&rdquo; after
            confirming the string had nine digits. And a document-request endpoint returned success
            when the mail provider was unconfigured — which it was in production — while the client
            code ignored the response and rendered &ldquo;sent&rdquo; unconditionally.
          </p>
          <Annotated
            note={
              <>
                The taxpayer-ID check ran a {n('cbFakeDelay')}ms timer before showing its result.
                It called nothing. The delay existed only to feel like a network round trip.
              </>
            }
          >
            <p>
              The detail that told me what kind of mistake this was is the timer. A nine-digit
              length check is instant; the code waited before answering. That is the difference
              between a feature that is unfinished and a feature that is pretending — nobody adds
              latency to a local string comparison unless they are dressing it as something else.
            </p>
          </Annotated>
          <p>
            Fixing them needed a rule, because the four were not the same kind of wrong. Reporting
            a completed action that never happened is a behavioural defect: the endpoint now
            returns a not-implemented status and keeps its validation, the mail route returns a
            failure the client surfaces instead of swallowing, the badge says
            &ldquo;prepared&rdquo; rather than &ldquo;filed,&rdquo; the dialog says plainly that
            nothing is transmitted, and the fake delay is gone. Presenting illustrative data as
            measured is a disclosure defect, and the fix is a label rather than a rewrite: the peer
            benchmarks are a fixed reference dataset, not an aggregation across firms, and every
            page carrying them now says so in a standing notice. A sample export got a filename
            prefix and two response headers so an automated caller cannot mistake it for the
            client&rsquo;s real data either.
          </p>
          <p>
            One route was deleted rather than fixed: a dead endpoint with no callers that
            synthesised network contribution statistics. The distinction I ended up writing down
            is that lying about an action is a bug, and illustrative data is acceptable if it is
            labelled — and that a claim about the outside world has to be earned by a request that
            actually left the building.
          </p>
        </Section>

        <Section heading="What turning the compiler back on found">
          <p>
            The build had type checking and lint disabled. Both flags are now off, and the reason
            is in a comment above them: every type-detectable bug that reached the deployed app got
            there through that switch. Turning it on surfaced {n('cbTypeErrors')} type errors, four
            invalid route exports, and two live runtime faults.
          </p>
          <p>
            One of those was a call to a function that does not exist anywhere in the codebase — a
            reference error on both handlers of the agent page, in production, silent until
            someone clicked. The other was an exception store exported from a route module, which
            the framework forbids; it had no importers, so the store its own comment described as
            populated by a background route was never populated by anything. The build is now
            clean and the codebase is type-clean. It is not lint-clean: a little over a hundred
            findings remain as warnings.
          </p>
          <Annotated
            note={
              <>
                Repository history was rewritten to drop a vendored dependency tree, taking it from
                about {fact('cbHistoryBefore').value}&nbsp;MB to {fact('cbHistoryAfter').value}
                &nbsp;MB. The pre-rewrite mirror is kept.
              </>
            }
          >
            <p>
              The model pipeline has one decision in it I would defend anywhere. Transactions are
              sent to the model in batches and numbered zero to nineteen within each batch rather
              than by their database ids, because a model reliably echoes small integers and often
              reformats or truncates long identifier strings. Any index that does not come back
              simply has no match, so that one row is flagged and the other nineteen are unharmed
              — a partial response degrades per row instead of corrupting the batch.
            </p>
          </Annotated>
          <p>
            Confidence is treated as an input to be corrected rather than an answer to be trusted.
            The model&rsquo;s stated confidence is adjusted downward for small amounts and for
            descriptions too short to carry information, then the proposed account is resolved
            against the client&rsquo;s actual chart of accounts. If it does not exist there, the
            row is flagged and the confidence is capped below the auto-approve threshold, so a
            hallucinated account cannot be approved automatically no matter how certain the model
            claimed to be. The category that gets written is always the one from the real chart,
            never the model&rsquo;s free text.
          </p>
        </Section>

        <Section heading="Outcome and current status">
          <Annotated
            note={
              <>
                The QuickBooks push has no idempotency: one request per line, no request id and no
                duplicate pre-flight, so a double-click duplicates entries in a
                customer&rsquo;s books. A backlog item, not a surprise.
              </>
            }
          >
            <p>
              Deployed and reachable. Billing is wired end to end and verified in Stripe test mode,
              which means no live keys, no live webhook secret and no paying customers. Two gaps in
              the QuickBooks integration are worth naming because they are the kind a reader will
              find anyway.
            </p>
          </Annotated>
          <Annotated
            note={
              <>
                Writes are owner-only: the firm is resolved through an ownership column, so a
                non-owner team member&rsquo;s edits do not persist even though the database gained
                multi-user roles in a later migration.
              </>
            }
          >
            <p>
              The second is more instructive than the missing idempotency. The push resolves one
              bank account and one expense account per company and posts every transaction to that
              same pair. So the categorisation — the part of the product with the most thought in
              it, which decides an account per transaction against each client&rsquo;s own chart —
              never reaches QuickBooks at all. Two components that work, with a gap between them:
              the smartest part of the pipeline is currently disconnected from its output. That is
              the next thing I would build, and it is a larger job than the entry pushing that
              already works.
            </p>
          </Annotated>
        </Section>

        <Meta
          rows={[
            [
              'live',
              <a key="l" href="https://closebooks-app.vercel.app">
                closebooks-app.vercel.app
              </a>,
            ],
            [
              'repo',
              <a key="r" href="https://github.com/dudailia/closebooks-app">
                github.com/dudailia/closebooks-app
              </a>,
            ],
            ['status', 'deployed; Stripe test mode; no paying customers'],
            ['stack', 'Next.js 14 · React 18 · Supabase · Anthropic API · Stripe · QuickBooks'],
          ]}
        />
      </article>
    </Shell>
  )
}
