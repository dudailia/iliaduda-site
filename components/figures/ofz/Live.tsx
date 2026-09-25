'use client'

import { useState, type ReactNode } from 'react'
import { FigureFrame, Readouts } from '@/components/FigureFrame'
import { zcy, type GParams } from '@/lib/gcurve'

/**
 * The OFZ zero-coupon curve, one trading day at a time. Every day of the two
 * months sits behind the chosen one as context; the day before is a ghost, so
 * a single session's move is visible without subtracting anything in your
 * head. No motion: moving the scrubber is the reader's own action and the
 * curve follows it exactly.
 */

export interface Day {
  date: string
  params: GParams
  /** [duration in years, yield %] for each OFZ issue the curve was fitted to. */
  bonds: readonly (readonly [number, number])[]
}

export interface Mark {
  index: number
  label: string
  /** A second line: what happened that day. */
  sub?: string
}

const T_MIN = 0.25
const T_MAX = 20
const Y_MIN = 6.5
const Y_MAX = 12.5
const W = 1000
const H = 1000
const TICKS_T = [0.25, 1, 2, 5, 10, 20] as const
const TICKS_Y = [7, 8, 9, 10, 11, 12] as const
const SAMPLES = 64

// Square-root maturity axis: a quarter of the width for the first year, where
// a rate decision lands, without squeezing twenty years off the edge.
const sx = (t: number) => ((Math.sqrt(t) - Math.sqrt(T_MIN)) / (Math.sqrt(T_MAX) - Math.sqrt(T_MIN))) * W
const sy = (y: number) => ((Y_MAX - y) / (Y_MAX - Y_MIN)) * H
const TS = Array.from({ length: SAMPLES }, (_, i) => {
  const r = Math.sqrt(T_MIN) + ((Math.sqrt(T_MAX) - Math.sqrt(T_MIN)) * i) / (SAMPLES - 1)
  return r * r
})
const path = (p: GParams) => TS.map((t, i) => `${i ? 'L' : 'M'}${sx(t).toFixed(1)} ${sy(zcy(p, t)).toFixed(1)}`).join('')

const pc = (y: number) => `${y.toFixed(2)}%`
const bp = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(Math.round(d))} bp`
const tLabel = (t: number) => (t < 1 ? `${Math.round(t * 12)}m` : `${t}y`)
const fmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const day = (iso: string) => fmt.format(new Date(`${iso}T00:00:00Z`))

export function OfzLive({
  days,
  keyRate,
  marks,
  start,
  description,
  frame,
}: {
  days: readonly Day[]
  keyRate: readonly { from: string; rate: number }[]
  marks: readonly Mark[]
  start: number
  description: string
  frame: { id: string; number: string; title: string; subtitle: string; caption: ReactNode; table: ReactNode; inline?: boolean }
}) {
  const [at, setAt] = useState(start)
  const d = days[at]!
  const prev = days[Math.max(0, at - 1)]!
  const rate = [...keyRate].reverse().find((k) => k.from <= d.date)!.rate
  const short = zcy(d.params, T_MIN)
  const long = zcy(d.params, 10)
  const move = at > 0 ? (short - zcy(prev.params, T_MIN)) * 100 : 0

  const rows = [
    { label: 'Trading day', value: day(d.date) },
    { label: 'Key rate', value: `${rate.toFixed(2)}%` },
    { label: '3-month', value: pc(short) },
    { label: '10-year', value: pc(long) },
    { label: 'Slope, 10y − 3m', value: bp((long - short) * 100) },
    { label: '3-month, on the day', value: at > 0 ? bp(move) : '—' },
  ]
  const valueText = `${day(d.date)}: 3-month ${pc(short)}, 10-year ${pc(long)}, key rate ${rate.toFixed(2)}%`

  return (
    <FigureFrame
      {...frame}
      rail={<Readouts rows={rows} across={frame.inline ?? false} />}
      hint="Drag or use the arrow keys to move a trading day at a time · the dashed curve is the session before · dots are the bonds the curve was fitted to"
    >
      <div className="relative">
        <div className="flex">
          <div aria-hidden className="text-meta relative w-9 shrink-0 font-mono text-graphite">
            {TICKS_Y.map((y) => (
              <span key={y} className="absolute right-2 -translate-y-1/2" style={{ top: `${(sy(y) / H) * 100}%` }}>
                {`${y}%`}
              </span>
            ))}
          </div>
          <div className="relative aspect-[4/3] min-w-0 flex-1 sm:aspect-[16/10]">
            <svg
              role="img"
              aria-labelledby={`${frame.id}-svg-title`}
              aria-describedby={`${frame.id}-desc`}
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full overflow-visible"
            >
              <title id={`${frame.id}-svg-title`}>{frame.title}</title>
              <desc id={`${frame.id}-desc`}>{description}</desc>
              <g stroke="var(--color-rule)" strokeWidth={1} fill="none">
                {TICKS_Y.map((y) => (
                  <line key={y} x1={0} x2={W} y1={sy(y)} y2={sy(y)} vectorEffect="non-scaling-stroke" />
                ))}
                {TICKS_T.map((t) => (
                  <line key={t} x1={sx(t)} x2={sx(t)} y1={0} y2={H} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
              {/* The summer, every session, as context. */}
              <g fill="none" stroke="var(--color-rule)" strokeWidth={1}>
                {days.map((x) => (
                  <path key={x.date} d={path(x.params)} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
              <line
                x1={0}
                x2={W}
                y1={sy(rate)}
                y2={sy(rate)}
                stroke="var(--color-ink)"
                strokeWidth={1}
                strokeDasharray="5 4"
                vectorEffect="non-scaling-stroke"
              />
              {at > 0 ? (
                <path
                  d={path(prev.params)}
                  fill="none"
                  stroke="var(--color-indigo)"
                  strokeOpacity={0.45}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              <path d={path(d.params)} fill="none" stroke="var(--color-indigo)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <rect x={0} y={0} width={W} height={H} fill="none" stroke="var(--color-graphite)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            </svg>
            {/* Dots and labels in HTML, so they stay round and at text size
                however the plot is stretched. */}
            {d.bonds
              .filter(([t, y]) => t >= T_MIN && y >= Y_MIN && y <= Y_MAX)
              .map(([t, y]) => (
                <span
                  key={`${t}-${y}`}
                  aria-hidden
                  className="pointer-events-none absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-ink bg-paper"
                  style={{ left: `${(sx(t) / W) * 100}%`, top: `${(sy(y) / H) * 100}%` }}
                />
              ))}
            <span
              aria-hidden
              className="text-meta pointer-events-none absolute right-1.5 -translate-y-full pb-0.5 font-mono text-ink"
              style={{ top: `${(sy(rate) / H) * 100}%` }}
            >
              {`key rate ${rate.toFixed(2)}%`}
            </span>
          </div>
        </div>

        <div aria-hidden className="text-meta relative mt-1.5 ml-9 h-5 font-mono text-graphite">
          {TICKS_T.map((t, i) => (
            <span
              key={t}
              className={`absolute ${i === 0 ? '' : i === TICKS_T.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
              style={{ left: `${(sx(t) / W) * 100}%` }}
            >
              {tLabel(t)}
            </span>
          ))}
        </div>
        <p aria-hidden className="text-meta ml-9 font-mono text-graphite">
          maturity, square-root scale
        </p>

        <div className="mt-4 pl-9">
          <input
            type="range"
            min={0}
            max={days.length - 1}
            step={1}
            value={at}
            aria-label="Trading day"
            aria-valuetext={valueText}
            onChange={(e) => setAt(Number(e.currentTarget.value))}
            className="h-6 w-full accent-[var(--color-indigo)]"
          />
          {/* Positions follow the thumb's centre, which travels the track
              inset by half its own width. */}
          <div className="text-meta relative mt-1 h-12 font-mono">
            {marks.map((m) => {
              const f = m.index / (days.length - 1)
              const end = m.index === 0 || m.index === days.length - 1
              // On a phone the endpoints crowd the decisions; the readout
              // still names the day.
              const align = m.index === 0 ? 'hidden sm:block' : end ? 'hidden -translate-x-full sm:block' : '-translate-x-1/2'
              return (
                <button
                  key={m.index}
                  type="button"
                  onClick={() => setAt(m.index)}
                  aria-pressed={at === m.index}
                  className={`absolute ${align} rounded-sm px-1 py-1 text-center leading-4 whitespace-nowrap transition-colors duration-150 ease-out ${
                    at === m.index ? 'text-ink' : 'text-graphite hover:text-ink'
                  }`}
                  style={{ left: end ? `${f * 100}%` : `calc(8px + (100% - 16px) * ${f})` }}
                >
                  <span>{m.label}</span>
                  {m.sub ? <span className="block">{m.sub}</span> : null}
                </button>
              )
            })}
          </div>
        </div>
        <p className="sr-only" aria-live="polite">
          {valueText}
        </p>
      </div>
    </FigureFrame>
  )
}
