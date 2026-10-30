import { reached, type ConclusionRow } from '@/lib/toxicflow/conclusions'
import type { TestBlock } from '@/lib/toxicflow/data'
import { TestResult } from './TestResult'

const testRunUnmatched = (t: TestBlock, h1: string | null) => h1 == null && typeof t.keys.h1_statement === 'string'

/**
 * The sentences fixed in advance, one for each outcome on the test days, as sealed cards: flat, a dashed hairline, the
 * outcome over the sentence the paper will print. Before the run every card is sealed and `after` says one of them
 * will open. Once the run has filled in the test keys, the card whose template its sentence fits opens: a solid indigo
 * rule, the run's own sentence in place of the template and its numbers under it; the others stay sealed, quieter.
 */
export function Conclusions({ rows, t, after }: { rows: readonly ConclusionRow[]; t: TestBlock; after: string }) {
  const { h1, canary } = reached(rows, t.keys)
  const ran = h1 != null || canary != null
  return (
    <>
      <ol className="mt-5 grid gap-3 sm:grid-cols-2">
        {rows.map((r) => {
          const opened = r.key === h1 || r.key === canary
          return (
            <li
              key={r.key}
              data-conclusion={r.key}
              data-state={opened ? 'open' : 'sealed'}
              className={`rounded-sm border p-4 ${opened ? 'border-indigo sm:col-span-2' : `border-dashed border-graphite/60 ${ran ? 'opacity-60' : ''}`}`}
            >
              <p className="text-meta flex items-baseline justify-between gap-3 font-mono text-graphite">
                <span>{r.outcome}</span>
                <span className={`shrink-0 ${opened ? 'text-indigo' : ''}`}>{opened ? 'opened by the test run' : 'sealed'}</span>
              </p>
              {r.key === h1 ? (
                <div className="mt-3">
                  <TestResult t={t} canary={false} />
                </div>
              ) : opened ? (
                <p className="text-note mt-2 text-ink">{String(t.keys.canary_statement)}</p>
              ) : (
                <p className="text-note mt-2 text-ink">{r.statement}</p>
              )}
            </li>
          )
        })}
      </ol>
      {ran ? null : <p className="mt-5 text-ink">{after}</p>}
      {/* A run whose sentence fits no template still prints it: the page never hides what the run said. */}
      {testRunUnmatched(t, h1) ? (
        <div className="mt-5">
          <TestResult t={t} />
        </div>
      ) : null}
    </>
  )
}
