import type { ReactNode } from 'react'
import { FigureFrame } from '@/components/FigureFrame'
import { bp, ci, num, type Ci } from '@/lib/toxicflow/data'

/**
 * The page's quiet figures: rows of estimates with their intervals on one axis, drawn in HTML so they keep the text's
 * size at any width. Each row reads label and value on one line and the interval under it; the axis always holds 0,
 * the line a difference is judged against, in ink. A row's mean is the measured value, so it is indigo; its interval is
 * the context it is read in.
 */

export interface IntervalRow {
  readonly label: string
  readonly mean: number | null
  readonly ci: Ci
  /** Days with the difference above 0, of the days compared. */
  readonly days?: readonly [number, number]
  readonly note?: string
}

export interface Reference {
  readonly at: number
  readonly label: string
}

function domain(rows: readonly IntervalRow[], refs: readonly Reference[]): [number, number] {
  const xs = [0, ...refs.map((r) => r.at), ...rows.flatMap((r) => [r.ci[0], r.ci[1], r.mean])].filter((v): v is number => v != null)
  const lo = Math.min(...xs)
  const hi = Math.max(...xs)
  const pad = (hi - lo) * 0.06
  return [lo - pad, hi + pad]
}

export function IntervalRows({
  rows,
  refs = [],
  digits = 4,
  unit = 'bp',
}: {
  rows: readonly IntervalRow[]
  refs?: readonly Reference[]
  digits?: number
  unit?: string
}) {
  const [lo, hi] = domain(rows, refs)
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`
  return (
    <div aria-hidden="true" className="relative">
      <ol className="relative grid gap-y-3.5">
        {rows.map((r) => (
          <li key={r.label} className="relative">
            <div className="text-note flex flex-wrap items-baseline justify-between gap-x-4">
              <span className="text-ink">{r.label}</span>
              <span className="text-meta font-mono tabular text-graphite">
                <span className="text-ink">{bp(r.mean, digits)}</span> {ci(r.ci, digits)}
                {r.days ? ` · ${r.days[0]} of ${r.days[1]} days above 0` : ''}
              </span>
            </div>
            <div className="relative mt-1.5 h-3">
              {/* The lines each row is read against, through its track only, never its words. */}
              <span className="absolute -inset-y-1 w-px bg-ink" style={{ left: x(0) }} />
              {refs.map((f) => (
                <span key={f.label} className="absolute -inset-y-1 border-l border-dashed border-ink" style={{ left: x(f.at) }} />
              ))}
              {r.ci[0] != null && r.ci[1] != null ? (
                <span className="absolute top-1/2 h-[3px] -translate-y-1/2 bg-graphite/45" style={{ left: x(r.ci[0]), width: `calc(${x(r.ci[1])} - ${x(r.ci[0])})` }} />
              ) : null}
              {r.mean != null ? (
                <span className="absolute top-1/2 size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo" style={{ left: x(r.mean) }} />
              ) : null}
            </div>
            {r.note ? <p className="text-meta mt-1 font-mono text-graphite">{r.note}</p> : null}
          </li>
        ))}
      </ol>
      <div className="text-meta relative mt-2 h-4 font-mono text-graphite">
        <span className="absolute -translate-x-1/2" style={{ left: x(0) }}>
          0
        </span>
        {refs.map((r) => (
          <span key={r.label} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: x(r.at) }}>
            {r.label}
          </span>
        ))}
        <span className="absolute right-0">{unit}</span>
      </div>
    </div>
  )
}

/** The rows as a table, for a screen reader: every figure here has one. */
export function IntervalTable({ caption, rows, digits = 4 }: { caption: string; rows: readonly IntervalRow[]; digits?: number }) {
  return (
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Comparison</th>
          <th scope="col">Mean, bp</th>
          <th scope="col">Bootstrap interval, bp</th>
          <th scope="col">Days above 0</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row">{r.label}</th>
            <td>{bp(r.mean, digits)}</td>
            <td>{ci(r.ci, digits)}</td>
            <td>{r.days ? `${r.days[0]} of ${r.days[1]}` : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** One sentence per row, the figure's prose description. */
export const describe = (rows: readonly IntervalRow[], digits = 4) =>
  rows
    .map((r) => `${r.label}: ${bp(r.mean, digits)} bp, interval ${ci(r.ci, digits)}${r.days ? `, above 0 on ${r.days[0]} of ${r.days[1]} days` : ''}.`)
    .join(' ')

export function IntervalFigure({
  id,
  number,
  title,
  subtitle,
  rows,
  refs,
  caption,
  digits = 4,
}: {
  id: string
  number: string
  title: string
  subtitle: string
  rows: readonly IntervalRow[]
  refs?: readonly Reference[]
  caption: ReactNode
  digits?: number
}) {
  return (
    <FigureFrame
      id={id}
      number={number}
      title={title}
      subtitle={subtitle}
      caption={caption}
      table={<IntervalTable caption={title} rows={rows} digits={digits} />}
    >
      <p className="sr-only">{describe(rows, digits)}</p>
      <IntervalRows rows={rows} {...(refs ? { refs } : {})} digits={digits} />
    </FigureFrame>
  )
}

/** Plain dots on one axis, without intervals: a level for each row (GLFT by risk aversion). */
export function DotRows({
  rows,
  digits,
  unit,
}: {
  rows: readonly { readonly label: string; readonly value: number; readonly aside: string }[]
  digits: number
  unit: string
}) {
  const xs = [0, ...rows.map((r) => r.value)]
  const lo = Math.min(...xs)
  const hi = Math.max(...xs)
  const pad = (hi - lo) * 0.06
  const x = (v: number) => `${((v - lo + pad) / (hi - lo + 2 * pad)) * 100}%`
  return (
    <div aria-hidden="true" className="relative">
      <ol className="grid gap-y-3">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="text-meta flex flex-wrap justify-between gap-x-4 font-mono tabular">
              <span className="text-ink">{r.label}</span>
              <span className="text-graphite">
                <span className="text-ink">{num(r.value, digits, true)}</span> {unit} · {r.aside}
              </span>
            </div>
            <div className="relative mt-1 h-3 border-b border-rule">
              <span className="absolute -inset-y-1 w-px bg-ink" style={{ left: x(0) }} />
              <span className="absolute top-1/2 size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo" style={{ left: x(r.value) }} />
            </div>
          </li>
        ))}
      </ol>
      <div className="text-meta relative mt-2 h-4 font-mono text-graphite">
        <span className="absolute -translate-x-1/2" style={{ left: x(0) }}>
          0
        </span>
        <span className="absolute right-0">{unit}</span>
      </div>
    </div>
  )
}
