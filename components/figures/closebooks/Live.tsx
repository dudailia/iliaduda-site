'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { FigureFrame, Readouts } from '@/components/FigureFrame'
import { categorise, exportable, type Account, type Line, type Result, type Status } from '@/lib/closebooks'
import { arrivedByMorph } from '@/lib/arrival'
import { useOnceSeen, useReducedMotion } from '@/components/stage/env'
import { CONTROL } from '@/components/stage/controls'

/**
 * One batch through the pipeline. Rows arrive in batch order — indexed from 0,
 * the way CloseBooks numbers them for the model — and each settles from the
 * confidence the model stated to the confidence the rules allow, then to a
 * status. A reviewer can approve what is waiting and remap what the chart does
 * not have; the export gate counts what may leave.
 *
 * Motion, once a visit, when the figure is first seen: a 45ms stagger as the
 * feed arrives and a 240ms ease-out as each confidence settles. On that first
 * look the rows are still to come from first paint (the pre-paint mark), so
 * the batch never plays backwards out of its finished state. A click changes
 * only the row it touches, and the count it moved lights for a moment. Reduced
 * motion, a visit that has seen it, or an arrival through the contents morph:
 * settled at once.
 */

const HINT = 'Approve a row waiting for review, or remap a blocked one, and watch the export gate'

type Human = 'approved-by-reviewer' | 'remapped'

const STAGGER = 45
const SETTLE = 240
/** The site's ease-out (app/globals.css, --ease-out). */
const EASE_OUT = 'var(--ease-out)'

const noop = () => () => {}

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
  const hydrated = useSyncExternalStore(noop, () => true, () => false)
  const [run, setRun] = useState(0)
  const [arrived, setArrived] = useState(feed.length)
  const [settled, setSettled] = useState(true)
  const [human, setHuman] = useState<Record<number, Human>>({})
  const [before, setBefore] = useState<{ auto: number; reviewed: number; review: number; blocked: number; out: number } | null>(null)
  /** The batch leaving before it runs again, so a new run does not cut the list to nothing in one frame. */
  const [leaving, setLeaving] = useState(false)
  /** This visit's batch is still to come: the pre-paint mark hides the rows until it starts. */
  const armed = useRef(false)
  const statusRefs = useRef<(HTMLSpanElement | null)[]>([])
  // After a reviewer acts, focus lands on the row's new status rather than
  // falling to the page, and the gate's new count is announced.
  const act = (i: number, what: Human) => {
    // The gate as it stood before this click: only the counts the click moves light up.
    setBefore(counts)
    setHuman((h) => ({ ...h, [i]: what }))
    requestAnimationFrame(() => statusRefs.current[i]?.focus())
  }

  const results: Result[] = feed.map((l) => categorise(l, chart))
  const accountWords = (code: string) => {
    const a = chart.find((x) => x.code === code)
    return a ? `${a.code} ${a.name}` : code
  }

  // A press while the rows are leaving does nothing more, as the cricket replay's does.
  const letting = useRef(false)
  const letTimer = useRef(0)
  useEffect(() => () => clearTimeout(letTimer.current), [])
  const stream = () => {
    setBefore(null)
    if (reduced) {
      setHuman({})
      setRun((r) => r + 1)
      return
    }
    if (letting.current) return
    letting.current = true
    // The rows leave together (150ms), then the batch arrives again from the first line.
    setLeaving(true)
    letTimer.current = window.setTimeout(() => {
      letting.current = false
      setHuman({})
      setRun((r) => r + 1)
      setArrived(0)
      setSettled(false)
      setLeaving(false)
    }, 150)
  }

  /** This visit's batch is spent: it arrives now, or it will not (the reader was in first, or it is not to play). */
  const release = (show = true) => {
    armed.current = false
    if (show) delete document.documentElement.dataset.closebooksSeq
    try {
      sessionStorage.setItem('closebooks-seq', '1')
    } catch {}
  }
  useEffect(() => {
    const d = document.documentElement
    d.dataset.closebooksLive = '1'
    armed.current = d.dataset.closebooksSeq === '1'
  }, [])
  // Once the batch is on its way, its rows' own styles hide what has not arrived: the mark can go.
  useEffect(() => {
    if (!settled) delete document.documentElement.dataset.closebooksSeq
  }, [settled])

  // Printed before this visit's batch has come, or while it arrives: the whole batch goes on the paper, settled.
  const toPrint = useRef<() => void>(() => {})
  useEffect(() => {
    toPrint.current = () => {
      if (!armed.current && settled && !leaving) return
      clearTimeout(letTimer.current)
      letting.current = false
      flushSync(() => {
        setArrived(feed.length)
        setSettled(true)
        setLeaving(false)
      })
      release()
    }
  })
  useEffect(() => {
    const onPrint = () => toPrint.current()
    addEventListener('beforeprint', onPrint)
    return () => removeEventListener('beforeprint', onPrint)
  }, [])

  // The batch arrives once a visit, when the figure is first properly on screen, but never under a reader who is
  // already inside it: replaying would unmount the very button they have focused.
  useOnceSeen(
    box,
    0.3,
    () => {
    // The browser's own answer (hydration reads reduced motion as on: the server cannot know).
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!armed.current || still || arrivedByMorph() || box.current?.contains(document.activeElement)) return release()
    release(false)
    setArrived(0)
    setSettled(false)
    },
    // Or a sixth of it held for 1.2s: on a 13-inch laptop the list's top is on the first screen, and it arrives there.
    0.16,
  )

  // The batch's clock: rows arrive 45ms apart by elapsed time, read each frame, so a busy main thread cannot stretch
  // the stagger (a chain of timeouts drifted by each one's delay); then the last row settles.
  useEffect(() => {
    if (settled) return
    const t0 = performance.now() - arrived * STAGGER
    let raf = 0
    const tick = (now: number) => {
      const due = Math.min(feed.length, Math.floor((now - t0) / STAGGER))
      if (due > arrived) return setArrived(due)
      if (arrived >= feed.length && now - t0 >= feed.length * STAGGER + SETTLE + 80) return setSettled(true)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [arrived, settled, feed.length, run])

  const status = (i: number): Status | 'edited' => (human[i] ? 'edited' : results[i]!.status)
  const accountOf = (i: number): Account | null =>
    human[i] === 'remapped'
      ? (chart.find((a) => a.code === remap[feed[i]!.suggested.code]) ?? null)
      : results[i]!.account

  // Counted from the rows that have settled, so the gate visibly fills as the
  // batch lands instead of printing its final totals before a row arrives.
  const done = (i: number) => settled || i < arrived - 3
  const counts = {
    auto: results.filter((r, i) => done(i) && r.status === 'approved' && !human[i]).length,
    // Cleared by a reviewer (approved, or remapped to an account in the chart), so the counts add up to the batch.
    reviewed: feed.filter((_, i) => done(i) && human[i]).length,
    review: feed.filter((_, i) => done(i) && status(i) === 'pending').length,
    blocked: feed.filter((_, i) => done(i) && status(i) === 'flagged').length,
    out: feed.filter((_, i) => done(i) && exportable(status(i), accountOf(i))).length,
  }

  // Announced only once a reviewer has acted: the gate's new state.
  const said = Object.keys(human).length
    ? `Exportable ${counts.out} of ${feed.length}; ${counts.review} waiting, ${counts.blocked} blocked.`
    : ''

  // A count a reviewer's click moved lights for a moment (the export gate the hint asks the reader to watch); counts
  // filling as the batch arrives do not.
  const acted = Object.keys(human).length
  const lit = (value: string, key: keyof typeof counts) =>
    acted && before && before[key] !== counts[key] ? (
      <span key={`${key}-${acted}`} data-lit="" className="-mx-0.5 rounded-sm px-0.5 transition-[background-color] duration-700 ease-[ease] starting:bg-indigo-wash">
        {value}
      </span>
    ) : (
      value
    )
  const rows = [
    { label: 'Batch', value: `${feed.length} lines, indexed 0–${feed.length - 1}` },
    { label: 'Approval threshold', value: threshold.toFixed(2) },
    { label: 'Approved by the rules', value: String(counts.auto) },
    { label: 'Cleared by a reviewer', value: lit(String(counts.reviewed), 'reviewed') },
    { label: 'Waiting for a reviewer', value: lit(String(counts.review), 'review') },
    { label: 'Blocked: account not in chart', value: lit(String(counts.blocked), 'blocked') },
    { label: 'Exportable', value: lit(`${counts.out} of ${feed.length}`, 'out') },
  ]

  const money = (a: number) => a.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

  return (
    <FigureFrame
      id="fig-pipeline"
      breakable
      number="Fig. 1"
      vt="closebooks"
      title="A bank feed through the categorisation pipeline"
      subtitle="synthetic feed and model outputs · the rules applied to them are the product’s own, from the shipped code"
      rail={
        <div data-batch-rail="">
          <Readouts rows={rows} />
        </div>
      }
      railBelow={false}
      // Below lg the instruction sits above the rows (under the gate it asks the reader to watch), not two screens down.
      hint={<span className="hidden lg:inline">{HINT}</span>}
      caption={caption}
      table={table}
    >
      <div ref={box}>
        {/* The gate, where a phone reader can see it change: above the rows,
            pinned while they scroll past. The rail carries it on wide screens. */}
        <p data-batch-gate="" className="text-meta sticky top-0 z-10 -mx-1 mb-2 border-b border-rule bg-paper px-1 py-1.5 font-mono text-ink lg:hidden" aria-hidden>
          {/* Each count kept whole, its dot held to it, so a wrapped line never starts with the separator. */}
          <span className="whitespace-nowrap">by the rules {counts.auto}{'\u00a0·'}</span>{' '}
          <span className="whitespace-nowrap">by a reviewer {lit(String(counts.reviewed), 'reviewed')}{'\u00a0·'}</span>{' '}
          <span className="whitespace-nowrap">waiting {lit(String(counts.review), 'review')}{'\u00a0·'}</span>{' '}
          <span className="whitespace-nowrap">blocked {lit(String(counts.blocked), 'blocked')}{'\u00a0·'}</span>{' '}
          <span className="whitespace-nowrap">exportable {lit(`${counts.out} of ${feed.length}`, 'out')}</span>
        </p>
        <p className="text-meta mb-2 font-mono text-graphite lg:hidden print:hidden">{HINT}</p>
        {/* The title's rule is the top rule on a laptop; below lg the gate and hint come between, and the rows have their own. */}
        <ol role="list" className="grid list-none border-t border-rule lg:border-t-0" aria-label="Categorised bank lines">
          {feed.map((l, i) => {
            const r = results[i]!
            const st = status(i)
            const acct = accountOf(i)
            const shown = settled || i < arrived
            // A row settles three arrivals after it lands, so settling ripples
            // down the batch behind the feed rather than all at once.
            const final = settled || i < arrived - 3
            // A reviewer changes the status, not the model's confidence.
            const conf = final ? r.confidence : l.stated
            // The arrow and its value are held to the word before them: a line never ends on "→" or starts with it.
            const finalNote = r.steps.length
              ? r.steps.map((s) => `${s.why}\u00a0→\u00a0${s.to.toFixed(2)}`).join(' · ')
              : r.status === 'pending'
                ? `below the ${threshold.toFixed(2)} threshold`
                : ''
            const note = human[i]
              ? human[i] === 'remapped'
                ? 'remapped by a reviewer'
                : 'approved by a reviewer'
              : final && r.steps.length
                ? r.steps.map((s) => `${s.why}\u00a0→\u00a0${s.to.toFixed(2)}`).join(' · ')
                : final && r.status === 'pending'
                  ? `below the ${threshold.toFixed(2)} threshold`
                  : ''
            return (
              <li
                key={`${run}-${i}`}
                className="min-w-0 border-b border-rule py-2.5"
                style={{
                  opacity: shown && !leaving ? 1 : 0,
                  transform: shown ? 'none' : 'translateY(6px)',
                  transition: reduced ? 'none' : leaving ? `opacity 150ms ${EASE_OUT}` : `opacity 200ms ${EASE_OUT}, transform 200ms ${EASE_OUT}`,
                }}
              >
                <div className="flex items-baseline gap-x-3">
                  <span className="text-meta tabular w-5 shrink-0 text-graphite">{i}</span>
                  <span className="text-note min-w-0 flex-1">{l.description}</span>
                  <span className="text-meta tabular shrink-0 text-ink">
                    {l.type === 'credit' ? '+' : '−'}
                    {money(l.amount)}
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[1.25rem_minmax(0,1fr)_7.5rem_9.5rem] sm:items-center">
                  <span />
                  <span className="text-meta min-w-0 font-mono text-graphite">
                    → {acct ? `${acct.code} ${acct.name}` : `${l.suggested.code} ${l.suggested.name}`}
                    {/* The line is reserved before the row settles, and the rules' note and a reviewer's share one
                        cell, the one not shown kept invisible, so neither settling nor a click changes the row's height. */}
                    {finalNote || note ? (
                      <span className="grid text-ink">
                        <span className="invisible [grid-area:1/1]">{finalNote}</span>
                        {note ? (
                          // A note arrives through the blur as its row settles in a run, or a reviewer's replaces the
                          // rules' (its own key, so it arrives too); on a page that opens settled it is simply there.
                          <span
                            key={human[i] ?? 'rules'}
                            className={`[grid-area:1/1] ${!settled || human[i] ? 'transition-[filter] duration-[120ms] ease-out starting:blur-[3px] motion-reduce:transition-none' : ''}`}
                          >
                            {note}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
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
                    {/* The settled score arrives through the row's blur, in the frame its bar starts to settle. */}
                    <span
                      key={final ? 'settled' : 'waiting'}
                      className={`text-meta tabular text-ink ${!settled && final ? 'transition-[filter] duration-[120ms] ease-out starting:blur-[3px] motion-reduce:transition-none' : ''}`}
                    >
                      <span className="sr-only">confidence </span>
                      {conf.toFixed(2)}
                    </span>
                  </span>
                  {/* A button's height kept from the start, so a row's "…" becoming Approve or Map does not grow it. */}
                  <span className="col-start-2 mt-1.5 flex min-h-8 items-center gap-2 sm:col-start-auto sm:mt-0 sm:justify-end">
                    {/* What the settled row asks for (Approve, Map, or its status) arrives through the same blur as its
                        note, in the same frame, rather than appearing crisp beside it. */}
                    <span
                      key={final ? 'settled' : 'waiting'}
                      className={`inline-flex items-center ${!settled && final ? 'transition-[filter] duration-[120ms] ease-out starting:blur-[3px] motion-reduce:transition-none' : ''}`}
                    >
                    {/* On paper, where the actions do not print, a row waiting for one says where it stands. */}
                    {st === 'pending' && final ? (
                      <>
                        <button
                          type="button"
                          onClick={() => act(i, 'approved-by-reviewer')}
                          aria-label={`Approve line ${i}, ${l.description}`}
                          className={CONTROL}
                        >
                          Approve
                        </button>
                        <span className="text-meta hidden font-mono text-graphite print:inline">waiting</span>
                      </>
                    ) : st === 'flagged' && final && remap[l.suggested.code] ? (
                      <>
                        {/* It names the account it maps to, not only its code: the reviewer approves what they can read. */}
                        <button
                          type="button"
                          onClick={() => act(i, 'remapped')}
                          aria-label={`Map to ${accountWords(remap[l.suggested.code]!)}: line ${i}, ${l.description}`}
                          className={CONTROL}
                        >
                          Map to {accountWords(remap[l.suggested.code]!)}
                        </button>
                        <span className="text-meta hidden font-mono text-graphite print:inline">blocked</span>
                      </>
                    ) : (
                      <span
                        ref={(el) => {
                          statusRefs.current[i] = el
                        }}
                        tabIndex={-1}
                        key={human[i] ? `acted-${human[i]}` : 'status'}
                        // A reviewer's click: the new status arrives through the site's 3px blur (120ms) where the
                        // pressed button was, rather than replacing it in the same frame.
                        className={`text-meta font-mono text-graphite ${human[i] ? 'transition-[filter] duration-[120ms] ease-out starting:blur-[3px] motion-reduce:transition-none' : ''}`}
                      >
                        {!final ? '…' : human[i] ? 'approved · reviewer' : st}
                      </span>
                    )}
                    </span>
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
        <p className="sr-only" aria-live="polite">
          {said}
        </p>
        {/* The export gate as a state, at the foot of the batch: held while any line waits or is blocked, open once every
            line has cleared (its word swaps through the site's blur). */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p data-export-gate="" aria-hidden className="text-meta font-mono text-graphite">
            Export:{' '}
            <span
              key={settled && counts.out === feed.length ? 'open' : 'held'}
              // Through the blur only once the page is running: the server's word is simply there when it loads.
              className={`text-ink ${hydrated ? 'transition-[filter] duration-[120ms] ease-out starting:blur-[3px] motion-reduce:transition-none' : ''}`}
            >
              {settled && counts.out === feed.length ? `open, all ${feed.length} lines` : `held, ${counts.out} of ${feed.length} lines ready`}
            </span>
          </p>
          <button
            type="button"
            onClick={() => {
              if (armed.current) release()
              stream()
            }}
            className={CONTROL}
          >
            Run the batch again
          </button>
        </div>
      </div>
    </FigureFrame>
  )
}
