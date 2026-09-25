'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FigureFrame, Readouts } from '@/components/FigureFrame'
import { categorise, exportable, type Account, type Line, type Result, type Status } from '@/lib/closebooks'
import { useOnceSeen, useReducedMotion } from '../surface/env'

/**
 * One batch through the pipeline. Rows arrive in batch order — indexed from 0,
 * the way CloseBooks numbers them for the model — and each settles from the
 * confidence the model stated to the confidence the rules allow, then to a
 * status. A reviewer can approve what is waiting and remap what the chart does
 * not have; the export gate counts what may leave.
 *
 * Motion, once, when the figure is first seen: a 45ms stagger as the feed
 * arrives and a 240ms ease-out as each confidence settles. A click changes only
 * the row it touches. Reduced motion: settled at once.
 */

type Human = 'approved-by-reviewer' | 'remapped'

const STAGGER = 45
const SETTLE = 240
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'

export function CategorisationLive({
  chart,
  feed,
  remap,
  threshold,
  caption,
  table,
}: {
  chart: readonly Account[]
  feed: readonly Line[]
  remap: Readonly<Record<string, string>>
  threshold: number
  caption: ReactNode
  table: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [run, setRun] = useState(0)
  const [arrived, setArrived] = useState(feed.length)
  const [settled, setSettled] = useState(true)
  const [human, setHuman] = useState<Record<number, Human>>({})

  const results: Result[] = feed.map((l) => categorise(l, chart))

  const stream = () => {
    setHuman({})
    setRun((r) => r + 1)
    if (reduced) return
    setArrived(0)
    setSettled(false)
  }

  // The batch arrives once, when the figure is first properly on screen — but
  // never under a reader who is already inside it: replaying would unmount the
  // very button they have focused.
  useOnceSeen(box, 0.3, () => {
    if (reduced || box.current?.contains(document.activeElement)) return
    setArrived(0)
    setSettled(false)
  })

  useEffect(() => {
    if (settled) return
    if (arrived < feed.length) {
      const t = setTimeout(() => setArrived((a) => a + 1), STAGGER)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setSettled(true), SETTLE + 80)
    return () => clearTimeout(t)
  }, [arrived, settled, feed.length, run])

  const status = (i: number): Status | 'edited' => (human[i] ? 'edited' : results[i]!.status)
  const accountOf = (i: number): Account | null =>
    human[i] === 'remapped'
      ? (chart.find((a) => a.code === remap[feed[i]!.suggested.code]) ?? null)
      : results[i]!.account

  const counts = {
    auto: results.filter((r, i) => r.status === 'approved' && !human[i]).length,
    review: feed.filter((_, i) => status(i) === 'pending').length,
    blocked: feed.filter((_, i) => status(i) === 'flagged').length,
    out: feed.filter((_, i) => exportable(status(i), accountOf(i))).length,
  }

  const rows = [
    { label: 'Batch', value: `${feed.length} lines, indexed 0–${feed.length - 1}` },
    { label: 'Approval threshold', value: threshold.toFixed(2) },
    { label: 'Approved by the rules', value: String(counts.auto) },
    { label: 'Waiting for a reviewer', value: String(counts.review) },
    { label: 'Blocked: account not in chart', value: String(counts.blocked) },
    { label: 'Exportable', value: `${counts.out} of ${feed.length}` },
  ]

  const money = (a: number) => a.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

  return (
    <FigureFrame
      id="fig-pipeline"
      number="Fig. 1"
      vt="closebooks"
      title="A bank feed through the categorisation pipeline"
      subtitle="synthetic feed and model outputs · CloseBooks’ own rules applied to them · categorize.ts, coaValidation.ts"
      rail={<Readouts rows={rows} />}
      hint="Approve a row waiting for review, or remap a blocked one, and watch the export gate"
      caption={caption}
      table={table}
    >
      <div ref={box}>
        <ol className="grid list-none border-t border-rule" aria-label="Categorised bank lines">
          {feed.map((l, i) => {
            const r = results[i]!
            const st = status(i)
            const acct = accountOf(i)
            const shown = settled || i < arrived
            // A row settles three arrivals after it lands, so settling ripples
            // down the batch behind the feed rather than all at once.
            const final = settled || i < arrived - 3
            const conf = human[i] ? Math.max(r.confidence, threshold) : final ? r.confidence : l.stated
            const note = human[i]
              ? human[i] === 'remapped'
                ? 'remapped by a reviewer'
                : 'approved by a reviewer'
              : final && r.steps.length
                ? r.steps.map((s) => `${s.why} → ${s.to.toFixed(2)}`).join(' · ')
                : final && r.status === 'pending'
                  ? `below the ${threshold.toFixed(2)} threshold`
                  : ''
            return (
              <li
                key={`${run}-${i}`}
                className="min-w-0 border-b border-rule py-2.5"
                style={{
                  opacity: shown ? 1 : 0,
                  transform: shown ? 'none' : 'translateY(6px)',
                  transition: reduced ? 'none' : `opacity 200ms ${EASE_OUT}, transform 200ms ${EASE_OUT}`,
                }}
              >
                <div className="flex items-baseline gap-x-3">
                  <span className="text-meta tabular w-5 shrink-0 text-graphite">{i}</span>
                  <span className="text-note min-w-0 flex-1 truncate">{l.description}</span>
                  <span className="text-meta tabular shrink-0 text-ink">
                    {l.type === 'credit' ? '+' : '−'}
                    {money(l.amount)}
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[1.25rem_minmax(0,1fr)_7.5rem_6.5rem] sm:items-center">
                  <span />
                  <span className="text-meta min-w-0 font-mono text-graphite">
                    → {acct ? `${acct.code} ${acct.name}` : `${l.suggested.code} ${l.suggested.name}`}
                    {note ? <span className="block text-ink">{note}</span> : null}
                  </span>
                  <span className="col-start-2 mt-1.5 flex items-center gap-2 sm:col-start-auto sm:mt-0">
                    <span className="relative h-2 w-16 bg-indigo-wash" aria-hidden>
                      <span
                        className="absolute inset-y-0 left-0 w-full origin-left bg-indigo"
                        style={{
                          transform: `scaleX(${conf})`,
                          transition: reduced ? 'none' : `transform ${SETTLE}ms ${EASE_OUT}`,
                        }}
                      />
                      <span className="absolute -inset-y-[3px] w-px bg-ink" style={{ left: `${threshold * 100}%` }} />
                    </span>
                    <span className="text-meta tabular text-ink">
                      <span className="sr-only">confidence </span>
                      {conf.toFixed(2)}
                    </span>
                  </span>
                  <span className="col-start-2 mt-1.5 flex items-center gap-2 sm:col-start-auto sm:mt-0 sm:justify-end">
                    {st === 'pending' && final ? (
                      <button
                        type="button"
                        onClick={() => setHuman((h) => ({ ...h, [i]: 'approved-by-reviewer' }))}
                        aria-label={`Approve line ${i}, ${l.description}`}
                        className="text-meta rounded-sm border border-ink px-2 py-1 font-mono transition-transform duration-150 ease-out active:scale-[0.97]"
                      >
                        Approve
                      </button>
                    ) : st === 'flagged' && final && remap[l.suggested.code] ? (
                      <button
                        type="button"
                        onClick={() => setHuman((h) => ({ ...h, [i]: 'remapped' }))}
                        aria-label={`Map line ${i}, ${l.description}, to account ${remap[l.suggested.code]}`}
                        className="text-meta rounded-sm border border-ink px-2 py-1 font-mono transition-transform duration-150 ease-out active:scale-[0.97]"
                      >
                        Map to {remap[l.suggested.code]}
                      </button>
                    ) : (
                      <span className="text-meta font-mono text-graphite">{!final ? '…' : st}</span>
                    )}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={stream}
            className="text-meta rounded-sm border border-rule px-2 py-1 font-mono transition-colors duration-150 ease-out hover:border-graphite"
          >
            Run the batch again
          </button>
        </div>
      </div>
    </FigureFrame>
  )
}
