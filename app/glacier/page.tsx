import type { Metadata } from 'next'
import { CaseStudyTitle, Meta, Section } from '@/components/CaseStudy'
import { Figure } from '@/components/Figure'
import { Annotated, Shell } from '@/components/Layout'
import { oneWaySeam } from '@/components/figures/OneWaySeam'
import { fact } from '@/content/facts'

export const metadata: Metadata = {
  title: 'Glacier Capital Systems',
  description:
    'Sole engineer on a Python research stack and a real-time alert dashboard for an options trading firm. Engineering shape only — the strategy is the client’s.',
}

const n = (k: Parameters<typeof fact>[0]) => fact(k).value.toLocaleString('en-US')

export default function Glacier() {
  return (
    <Shell>
      <article>
        <CaseStudyTitle
          slug="glacier"
          level="h1"
          title="A one-way seam between two languages, and a worker with no front door"
          standfirst={
            <p>
              I am the sole engineer for a proprietary options trading firm: a Python research
              stack and a real-time alert dashboard. What the system decides is the
              client&rsquo;s, so this describes how it is built and nothing about what it
              concludes — no parameters, no thresholds, no instruments, no scoring logic.
            </p>
          }
        />

        <Section heading="What problem, and for whom">
          <p>
            A small trading firm needs the same loop every session: pull market data, derive the
            quantities a decision depends on, evaluate candidates, and put the survivors in front
            of a human quickly enough to act on. The research work belongs in Python, because that
            is where the data and numerical libraries are. The product — the thing someone
            actually looks at during the day — belongs in a browser.
          </p>
          <p>
            Most of the difficulty is not in either half. It is in the join, and in the fact that
            the join is asynchronous.
          </p>
        </Section>

        <Section heading="What I built">
          <p>
            Python owns market data acquisition, the indicator and volatility work, and the
            construction of candidate structures. It emits a typed context object and a candidate
            array as JSON. TypeScript consumes that JSON and owns the decision engine, the
            validators and the product surface: a Next.js dashboard on Vercel, with a long-running
            Python worker on Fly and Postgres, auth and realtime from Supabase. Scheduling is
            GitHub Actions cron, which is unglamorous and exactly sufficient.
          </p>
          <Annotated
            note={
              <>
                {n('glPytestFiles')} pytest files and {n('glVitestFiles')} vitest files, and
                nothing runs them on commit — the only two workflows are scheduled production
                jobs. A comprehensive suite with no gate in front of it.
              </>
            }
          >
            <p>
              The organising idea is a one-way seam: each language does what it is better at, and
              the boundary between them is a serialised document rather than a function call. That
              buys clean testing on both sides and a decision engine that is deterministic given
              its input. It costs the thing described below.
            </p>
          </Annotated>
        </Section>

        <Figure
          id="fig-one-way-seam"
          number="Fig 3"
          title="How the halves reach each other"
          subtitle="Glacier · engineering shape, no decision logic"
          description={oneWaySeam.description}
          arrangements={oneWaySeam.arrangements}
          caption={
            <>
              The worker exposes no HTTP endpoint, so the database is the whole interface in both
              directions. Real-time updates then fall out of the topology instead of needing a
              transport.
            </>
          }
        />

        <Section heading="The hard part">
          <p>
            If the seam were a function call, the freshness of an input would be a non-question:
            you asked for it, you got it. Because the seam is a document produced at one time and
            consumed at another, every consumer has to be able to answer &ldquo;is this still
            true?&rdquo; and none of them can assume it. That single consequence produced most of
            the interesting code in the repository.
          </p>
          <p>
            So staleness is a first-class concept rather than a check someone remembered to write.
            The bridge has its own modules for the envelope, for staleness and for the build
            stamp; the validator has modules for canonical serialisation and for whether enough
            history exists to compute what is about to be computed; the Python side has a freshness
            module of its own. Every output carries the time its inputs were as of, in market
            time. Determinism across the boundary is enforced by canonicalising the JSON and
            stamping the build, so a given input provably maps to a given output version — which
            is what makes a disagreement between two runs a bug rather than a mystery.
          </p>
          <p>
            The second decision was to give the worker no front door at all. It runs as a single
            always-on virtual machine with no HTTP ingress, which means there is no API surface to
            secure, no request authentication to get wrong, and no way for the dashboard to reach
            it directly. Postgres is the entire interface. The worker writes rows; the dashboard
            reads them. When a user asks for something, that is not an API call either — it is a
            row in a queue table that the worker drains on its next pass. Real-time then costs
            nothing to build: the dashboard subscribes to row changes, and because the
            worker&rsquo;s only output is a write, propagation is automatic.
          </p>
          <Annotated
            note={
              <>
                Outside market hours it sleeps in one-second slices rather than one long sleep, so
                a termination signal on a restartable VM is honoured promptly instead of an hour
                later.
              </>
            }
          >
            <p>
              The generation before this one did the obvious thing: a websocket server with a
              connection manager, a broadcast fan-out, dead-connection reaping, a three-second
              reconnect in the client, and polling fallbacks behind it because the socket could
              not be trusted. All of that is code I no longer maintain. Deleting it in favour of
              the database as the interface is the change I would point to first.
            </p>
          </Annotated>
          <p>
            The last piece is running two cadences off one clock in one process. A fast pass
            refreshes quotes every {fact('glQuoteRefresh').value} seconds and a slow pass rescans
            fully every {fact('glRescan').value} seconds, each tracking its own last-run timestamp
            and each wrapped so that a failure in one cannot stall the other. That separation
            matters more than it looks: a fast loop and a slow loop sharing a try block means one
            bad quote fetch silently stops the rescan, and you find out when a stale candidate is
            still on screen an hour later.
          </p>
        </Section>

        <Section heading="Outcome and current status">
          <p>
            Running, in daily use, sole engineer. The parts I would change are internal: the test
            suite is thorough and entirely locally executed, which means the repository has strong
            tests and no gate — a state I criticise elsewhere on this site and have not yet fixed
            here.
          </p>
          <p>
            One idea from it I have reused since: an append-only register of historical cases where
            the system and a human disagreed, asserted as regressions. It turns each real
            disagreement into a permanent test rather than a conversation someone remembers.
          </p>
        </Section>

        <Meta
          rows={[
            ['live', 'under client confidentiality'],
            ['repo', 'under client confidentiality'],
            ['status', 'in daily use; sole engineer'],
            ['stack', 'Python · TypeScript · Next.js · Supabase · Fly.io · Vercel'],
          ]}
        />
      </article>
    </Shell>
  )
}
