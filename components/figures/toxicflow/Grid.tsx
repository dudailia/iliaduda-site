'use client'

import { startTransition, useRef, useState, type KeyboardEvent } from 'react'
import { FigureFrame } from '@/components/FigureFrame'

/**
 * The 8-cell view: every comparison by queue model (rows) and latency (columns), the primary cell outlined. A cell the
 * study did not run says so; the reader is never shown an empty square without the reason. The pre-registration asks
 * the test result to hold in all 8 cells, so this is where a result that holds only under a kind queue model shows.
 *
 * Each cell is a button: pointing at it, tapping it or reaching it with the arrow keys reads it in full under the grid
 * (mean, interval and days above 0, as far as the comparison has them). Choosing another comparison swaps the cells'
 * numbers in (200ms on the ease-out, 30ms apart) and slides each cell's bar, its value's size against the largest in
 * the view and its side of 0, to its new length (240ms); an arrow key's step is never animated, and reduced motion
 * swaps at once.
 */

export interface GridCell {
  readonly mean: string
  readonly ci?: string
  readonly days?: string
  /** The value's sign, for the reader who scans the grid for one that differs. */
  readonly sign: -1 | 0 | 1
  /** The value itself, for the cell's bar. */
  readonly value: number
}

export interface GridView {
  readonly id: string
  readonly label: string
  readonly split: string
  readonly kind: string
  readonly cells: Readonly<Record<string, GridCell | null>>
  readonly empty: string
}

export function GridFigure({
  number,
  views,
  queues,
  latencies,
  queueNames,
  primary,
}: {
  number: string
  views: readonly GridView[]
  queues: readonly string[]
  latencies: readonly string[]
  queueNames: Readonly<Record<string, string>>
  primary: string
}) {
  const [id, setId] = useState(views[0]!.id)
  const v = views.find((x) => x.id === id) ?? views[0]!
  const ran = Object.values(v.cells).filter(Boolean).length
  const order = queues.flatMap((q) => latencies.map((l) => `${q}/${l}`))
  const [picked, setPicked] = useState(primary)
  const btns = useRef(new Map<string, HTMLButtonElement | null>())
  const values = order.map((c) => v.cells[c]?.value).filter((x): x is number => x != null)
  const top = Math.max(1e-12, ...values.map(Math.abs))
  const name = (cell: string) => {
    const [q, l] = cell.split('/') as [string, string]
    return `${queueNames[q] ?? q}, ${l} latency`
  }
  const read = (cell: string) => {
    const c = v.cells[cell]
    return c ? `${name(cell)}: ${c.mean} bp${c.ci ? `, interval ${c.ci}` : ''}${c.days ? `, ${c.days}` : ''}` : `${name(cell)}: ${v.empty}`
  }
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, cell: string) => {
    const i = order.indexOf(cell)
    const cols = latencies.length
    const to =
      e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'ArrowDown' ? i + cols : e.key === 'ArrowUp' ? i - cols : e.key === 'Home' ? 0 : e.key === 'End' ? order.length - 1 : null
    if (to == null || to < 0 || to >= order.length) return
    e.preventDefault()
    setPicked(order[to]!)
    btns.current.get(order[to]!)?.focus()
  }
  return (
    <FigureFrame
      id="grid"
      number={number}
      title={`Each comparison in all ${queues.length * latencies.length} queue and latency cells`}
      subtitle={`${v.split} · ${v.kind} · ${ran} of ${queues.length * latencies.length} cells run`}
      subtitleRoom={`validation days · difference in break-even fee, bp · ${queues.length * latencies.length} of ${queues.length * latencies.length} cells run`}
      hint="Choose a comparison · the outlined cell is the primary one"
      caption={
        <>
          Queue models from the most pessimistic (risk-averse: our order moves up its queue only when trades eat the
          queue ahead of it) to the most generous (log), each at low latency (the day’s observed feed latency) and high
          latency (a slower participant, without co-location). H1 on the test days needs the same sign in every cell. Most exploratory
          comparisons were run in the primary cell only, and their other cells say so.
        </>
      }
      table={
        <table>
          <caption>{v.label}</caption>
          <thead>
            <tr>
              <th scope="col">Queue model</th>
              {latencies.map((l) => (
                <th key={l} scope="col">{`${l} latency`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {queues.map((q) => (
              <tr key={q}>
                <th scope="row">{queueNames[q]}</th>
                {latencies.map((l) => {
                  const c = v.cells[`${q}/${l}`]
                  return <td key={l}>{c ? `${c.mean} bp${c.ci ? `, interval ${c.ci}` : ''}${c.days ? `, ${c.days}` : ''}` : v.empty}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <label className="block">
        <span className="text-meta font-mono text-graphite">Comparison</span>
        <select
          value={id}
          onChange={(e) => {
            const next = e.currentTarget.value
            // A transition: the grid, its table and its caption re-render in slices a phone's frame can hold.
            startTransition(() => setId(next))
          }}
          className="text-note mt-1 block h-11 w-full rounded-sm border border-graphite bg-paper px-2 text-ink transition-[border-color] duration-150 ease-out hover:border-ink focus-visible:border-ink"
        >
          {views.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      <div role="group" aria-label="Cells, by queue model and latency" className="mt-5 grid grid-cols-[minmax(0,7.5rem)_repeat(2,minmax(0,1fr))] gap-px border border-rule bg-rule sm:grid-cols-[9rem_repeat(2,minmax(0,1fr))]">
        <span aria-hidden="true" className="text-meta bg-paper p-2 font-mono text-graphite">queue model</span>
        {latencies.map((l) => (
          <span key={l} aria-hidden="true" className="text-meta bg-paper p-2 font-mono text-graphite">
            {l} latency
          </span>
        ))}
        {queues.map((q) => (
          <div key={q} className="contents">
            <span aria-hidden="true" className="text-meta bg-paper p-2 font-mono text-ink">{queueNames[q]}</span>
            {latencies.map((l) => {
              const cell = `${q}/${l}`
              const c = v.cells[cell]
              const k = order.indexOf(cell)
              const share = c ? c.value / top : 0
              return (
                <button
                  key={l}
                  ref={(el) => {
                    btns.current.set(cell, el)
                  }}
                  type="button"
                  tabIndex={cell === picked ? 0 : -1}
                  aria-pressed={cell === picked}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && setPicked(cell)}
                  onFocus={() => setPicked(cell)}
                  onClick={() => setPicked(cell)}
                  onKeyDown={(e) => onKey(e, cell)}
                  className={`text-meta relative min-h-[4.75rem] p-2 text-left font-mono tabular transition-[background-color] duration-150 ease-out focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                    cell === primary ? 'outline-2 -outline-offset-2 outline-ink' : ''
                  } ${cell === picked ? 'bg-indigo-wash' : 'bg-paper'}`}
                >
                  {/* The cell's name for a screen reader; its numbers are its visible text, read after it. */}
                  <span className="sr-only">{`${name(cell)}: `}</span>
                  <span
                    key={v.id}
                    className="block transition-[opacity,translate] duration-200 ease-out motion-reduce:transition-none starting:translate-y-[3px] starting:opacity-0"
                    style={{ transitionDelay: `${k * 30}ms` }}
                  >
                    {c ? (
                      <>
                        <span className={`block ${c.sign === 0 ? 'text-graphite' : 'text-indigo'}`}>{c.mean}</span>
                        {c.ci ? <span className="block text-graphite">{c.ci}</span> : null}
                        {c.days ? <span className="block text-graphite">{c.days}</span> : null}
                      </>
                    ) : (
                      <span className="block text-graphite">{v.empty}</span>
                    )}
                  </span>
                  {/* The value's size and side against the view's largest: 0 is the cell's middle. */}
                  <span aria-hidden="true" className={`absolute inset-x-2 bottom-1.5 h-[3px] ${c ? '' : 'invisible'}`}>
                    <span className="absolute inset-y-[-2px] left-1/2 w-px bg-rule" />
                    <span
                      className="absolute inset-y-0 left-1/2 w-1/2 origin-left bg-indigo transition-transform duration-[240ms] ease-out motion-reduce:transition-none"
                      style={{ transform: `scaleX(${share})` }}
                    />
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <p className="text-meta mt-3 min-h-[2.9em] font-mono tabular text-ink" aria-hidden="true">
        {read(picked)}
      </p>
    </FigureFrame>
  )
}
