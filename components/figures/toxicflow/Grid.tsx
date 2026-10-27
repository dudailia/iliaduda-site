'use client'

import { useState } from 'react'
import { FigureFrame } from '@/components/FigureFrame'

/**
 * The 8-cell view: every comparison by queue model (rows) and latency (columns), the primary cell outlined. A cell the
 * study did not run says so; the reader is never shown an empty square without the reason. The pre-registration asks
 * the test result to hold in all 8 cells, so this is where a result that holds only under a kind queue model shows.
 */

export interface GridCell {
  readonly mean: string
  readonly ci?: string
  readonly days?: string
  /** The value's sign, for the reader who scans the grid for one that differs. */
  readonly sign: -1 | 0 | 1
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
          onChange={(e) => setId(e.currentTarget.value)}
          className="text-note mt-1 block h-11 w-full rounded-sm border border-graphite bg-paper px-2 text-ink transition-[border-color] duration-150 ease-out hover:border-ink focus-visible:border-ink"
        >
          {views.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      <div aria-hidden="true" className="mt-5 grid grid-cols-[minmax(0,7.5rem)_repeat(2,minmax(0,1fr))] gap-px border border-rule bg-rule sm:grid-cols-[9rem_repeat(2,minmax(0,1fr))]">
        <span className="text-meta bg-paper p-2 font-mono text-graphite">queue model</span>
        {latencies.map((l) => (
          <span key={l} className="text-meta bg-paper p-2 font-mono text-graphite">
            {l} latency
          </span>
        ))}
        {queues.map((q) => (
          <div key={q} className="contents">
            <span className="text-meta bg-paper p-2 font-mono text-ink">{queueNames[q]}</span>
            {latencies.map((l) => {
              const cell = `${q}/${l}`
              const c = v.cells[cell]
              return (
                <span key={l} className={`text-meta min-h-[4.25rem] bg-paper p-2 font-mono tabular ${cell === primary ? 'outline-2 -outline-offset-2 outline-ink' : ''}`}>
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
              )
            })}
          </div>
        ))}
      </div>
    </FigureFrame>
  )
}
