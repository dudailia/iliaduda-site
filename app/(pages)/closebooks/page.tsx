import { CaseStudyTitle, Meta, Section } from '@/components/CaseStudy'
import { Figure } from '@/components/Figure'
import { Annotated, Shell } from '@/components/Layout'
import { CategorisationPipeline } from '@/components/figures/CategorisationPipeline'
import { tenantIsolation } from '@/components/figures/TenantIsolation'
import { fact } from '@/content/facts'
import { papers } from '@/content/papers'
import { pageMeta } from '@/lib/meta'

const paper = papers.find((p) => p.slug === 'closebooks')!

export const metadata = pageMeta('/closebooks', 'CloseBooks', paper.abstract)

const n = (k: Parameters<typeof fact>[0]) => fact(k).value.toLocaleString('en-US')

export default function CloseBooks() {
  return (
    <Shell>
      <article>
        <CaseStudyTitle byline={paper.byline} level="h1" title={paper.title} standfirst={<p>{paper.abstract}</p>} />

        <Section heading="What it does">
          <p>
            A small accounting firm closes every client&rsquo;s books every month: pull the bank
            statements, decide which account each transaction belongs to, review, and post. The
            categorisation is the step that eats the week, and it is pattern recognition against a
            chart of accounts that is different for every client.
          </p>
          <p>
            CloseBooks takes bank statements in as CSV or PDF, categorises every line against
            that client&rsquo;s own chart with a model in the loop, puts what it is unsure of in
            front of a reviewer, and exports the result or pushes journal entries to QuickBooks
            Online. Around it: firms, clients and roles in a multi-tenant Postgres database, a
            client portal, and Stripe subscriptions across three tiers. I designed, built and
            deployed all of it — {n('cbApiRoutes')} API routes, {n('cbDashboardPages')} dashboard
            pages and {n('cbMigrations')} SQL migrations.
          </p>
        </Section>

        <CategorisationPipeline />

        <Section heading="The AI pipeline">
          <p>
            Transactions go to the Claude API in batches of {fact('cbBatchSize').value}, numbered
            by position inside the batch rather than by database id, because a model echoes small
            integers reliably and mangles long identifiers. Results are matched back by that index,
            so a response that drops or garbles one row flags that row and leaves the other
            nineteen intact. Transient failures retry with exponential backoff; a malformed
            response fails fast instead of being retried into the same malformation; a batch that
            fails outright flags only its own rows and the run moves on.
          </p>
          <p>
            What comes back is treated as evidence, not an answer. The rules in Fig. 1 are the
            product&rsquo;s: confidence comes down for small amounts and uninformative
            descriptions; the suggested account is resolved against the client&rsquo;s chart by
            code and then by name, and the category written is always the chart&rsquo;s own, never
            the model&rsquo;s free text; a posting in the wrong direction goes to review whatever
            the model said. A reviewer&rsquo;s most recent corrections are fed into the next
            run&rsquo;s prompt, so the pipeline picks up each firm&rsquo;s habits.
          </p>
          <p>
            Statements arrive in whatever shape a bank exports. The CSV parser finds the real
            header row beneath a bank&rsquo;s preamble lines, reads parenthesised negatives, and
            handles both signed-amount and split debit-and-credit layouts; a PDF&rsquo;s text layer
            is extracted and structured by the model into dated, signed lines.
          </p>
        </Section>

        <Section heading="Tenant isolation">
          <p>
            Isolation is enforced in the database, not the interface. Row-level security policies
            scope every query to firm membership, and a five-level role hierarchy — owner, admin,
            senior accountant, staff, read-only — is expressed as security-definer functions, so
            reading, writing, approving and managing billing are separate privileges checked in
            SQL. Deleting a compliance record needs a senior role; editing one does not.
          </p>
        </Section>

        <Figure
          id="fig-tenant-isolation"
          number="Fig. 2"
          title="Two enforcement paths to one firm’s rows"
          subtitle="CloseBooks · isolation by policy and by owner check"
          description={tenantIsolation.description}
          arrangements={tenantIsolation.arrangements}
          caption={
            <>
              The {n('cbServiceRoleRoutes')} routes that need the service-role key — billing and the
              QuickBooks integration among them — bypass row-level security by design, so each
              carries its own owner check. Both paths end at the same rows.
            </>
          }
        />

        <Section heading="Engineering discipline">
          <Annotated
            note={
              <>
                Turning type checking on in the build surfaced {n('cbTypeErrors')} type errors and
                two live runtime faults; the codebase is now type-clean.
              </>
            }
          >
            <p>
              Before showing the product to anyone I read it as a sceptic would, and took every
              screen that claimed an external action had happened at its word. Where a flow was not
              yet wired to the outside world — a filing, a verification, a sent document — the
              screen now says exactly what happened rather than what was intended. A product
              aimed at accountants has to be as exact about its own state as it is about the
              books.
            </p>
          </Annotated>
          <p>
            Repository history was rewritten to drop a vendored dependency tree, taking it from
            about {fact('cbHistoryBefore').value}&nbsp;MB to {fact('cbHistoryAfter').value}&nbsp;MB.
          </p>
        </Section>

        <Meta
          rows={[
            ['live', <a key="l" href="https://closebooks-app.vercel.app">closebooks-app.vercel.app</a>],
            ['repo', <a key="r" href="https://github.com/dudailia/closebooks-app">github.com/dudailia/closebooks-app</a>],
            ['stack', 'Next.js 14 · React 18 · TypeScript · Supabase Postgres · Claude API · Stripe · QuickBooks Online'],
          ]}
        />
      </article>
    </Shell>
  )
}
