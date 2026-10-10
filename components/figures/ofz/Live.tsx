'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { FigureFrame, Readouts } from '@/components/FigureFrame'
import { Items } from '@/components/Layout'
import { zcy, type GParams } from '@/lib/gcurve'
import { rangeFill } from '@/components/stage/range'

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
const SAMPLES = 40

// Square-root maturity axis: a quarter of the width for the first year, where
// a rate decision lands, without squeezing twenty years off the edge.
const sx = (t: number) => ((Math.sqrt(t) - Math.sqrt(T_MIN)) / (Math.sqrt(T_MAX) - Math.sqrt(T_MIN))) * W
const sy = (y: number) => ((Y_MAX - y) / (Y_MAX - Y_MIN)) * H
const TS = Array.from({ length: SAMPLES }, (_, i) => {
  const r = Math.sqrt(T_MIN) + ((Math.sqrt(T_MAX) - Math.sqrt(T_MIN)) * i) / (SAMPLES - 1)
  return r * r
})
// Whole units of a 1000-unit box: a tenth of a pixel at most on screen, and
// forty-four of these ship in the HTML.
/**
 * Where a phone's key-rate label stands: at the right or left end of its line, over or under it, the first of those
 * (in that order) where neither the curve nor a bond runs through it. The label takes about 45% of a phone's plot and
 * 8% of its height. On a laptop it keeps the right end, over the line, where it never meets them.
 */
function keyPlace(p: GParams, bonds: readonly (readonly [number, number])[], rate: number): { left: boolean; below: boolean } {
  const ly = sy(rate)
  const hits = (left: boolean, below: boolean) => {
    const [x0, x1] = left ? [0, 0.45 * W] : [0.55 * W, W]
    const [y0, y1] = below ? [ly, ly + 0.08 * H] : [ly - 0.08 * H, ly]
    if (y0 < 0 || y1 > H) return Infinity
    const inside = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1
    return TS.filter((t) => inside(sx(t), sy(zcy(p, t)))).length + 4 * bonds.filter(([t, y]) => inside(sx(t), sy(y))).length
  }
  const places = [{ left: false, below: false }, { left: false, below: true }, { left: true, below: false }, { left: true, below: true }]
  return places.reduce((best, c) => (hits(c.left, c.below) < hits(best.left, best.below) ? c : best))
}
const path = (p: GParams) => TS.map((t, i) => `${i ? 'L' : 'M'}${Math.round(sx(t))} ${Math.round(sy(zcy(p, t)))}`).join('')

const pc = (y: number) => `${y.toFixed(2)}%`
// Rounded first, then signed: the sign of an unrounded −0.3 printed "−0 bp".
const bp = (d: number) => {
  const r = Math.round(d)
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r)} bp`
}
/** A yield as printed, to the basis point: every gap the readout states is the difference of the yields it shows. */
const shownY = (y: number) => Math.round(y * 100) / 100
const tLabel = (t: number) => (t < 1 ? `${Math.round(t * 12)}m` : `${t}y`)
const fmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const day = (iso: string) => fmt.format(new Date(`${iso}T00:00:00Z`))
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
/** How soon after a decision its rate can come into force and still be read as that decision's. */
const IN_FORCE_DAYS = 7

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
  // Only a jump from a mark button is announced: moving the slider itself is
  // already spoken through its valuetext, and saying it twice is noise.
  const [announce, setAnnounce] = useState('')
  // The summer's curves never change; only the chosen day does.
  const context = useMemo(() => days.map((x) => <path key={x.date} d={path(x.params)} vectorEffect="non-scaling-stroke" />), [days])
  const d = days[at]!
  const prev = days[Math.max(0, at - 1)]!
  const rate = [...keyRate].reverse().find((k) => k.from <= d.date)!.rate
  // On a decision's day whose rate comes into force later (21 July's, from the 24th), the readout says both: showing the
  // old rate alone under "+100 bp" read as the figure's mistake.
  const comes = marks.some((m) => m.index === at && m.sub) ? keyRate.find((k) => k.from > d.date) : undefined
  const pending =
    comes && Date.parse(`${comes.from}T00:00:00Z`) - Date.parse(`${d.date}T00:00:00Z`) <= IN_FORCE_DAYS * 86_400_000
      ? `, ${comes.rate.toFixed(2)}% from ${dayMonth.format(new Date(`${comes.from}T00:00:00Z`))}`
      : ''
  const phoneKey = keyPlace(d.params, d.bonds, rate)
  const short = shownY(zcy(d.params, T_MIN))
  const long = shownY(zcy(d.params, 10))
  const move = at > 0 ? (short - shownY(zcy(prev.params, T_MIN))) * 100 : 0

  const rows = [
    // A date is one item: at a large font size it split as "Tue, 15 / Aug 2023".
    // Its row-mate's two lines held here too: the cells meet at their foot, and the labels stood a line apart.
    { label: 'Trading day', value: <span className="block whitespace-nowrap max-sm:min-h-[2lh]">{day(d.date)}</span> },
    // A phone sets 21 July's "7.50%, 8.50% from 24 Jul" on two lines: they are held on every day, so stepping onto it
    // and off it moves nothing under the readouts.
    { label: 'Key rate', value: <span className="block max-sm:min-h-[2lh]">{`${rate.toFixed(2)}%${pending}`}</span> },
    { label: '3-month', value: pc(short) },
    { label: '10-year', value: pc(long) },
    { label: 'Slope, 10y − 3m', value: bp((long - short) * 100) },
    { label: '3-month, on the day', value: at > 0 ? bp(move) : '—' },
  ]
  const valueText = `${day(d.date)}: 3-month ${pc(short)}, 10-year ${pc(long)}, key rate ${rate.toFixed(2)}%${pending}`

  return (
    <FigureFrame
      {...frame}
      rail={<Readouts rows={rows} across={frame.inline ?? false} />}
      // Under a finger the hint says what a finger does (the keys it taught are not there).
      hint={
        <>
          <span className="pointer-coarse:hidden">
            <Items items="Drag the slider, choose a rate decision, or use the arrow keys to move a trading day at a time · the dashed curve is the session before · dots are the bonds the curve was fitted to" />
          </span>
          <span className="hidden pointer-coarse:inline">
            <Items items="Drag the slider or tap a rate decision · the dashed curve is the session before · dots are the bonds the curve was fitted to" />
          </span>
        </>
      }
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
          {/* Sideways on a phone 7:2: at 3:1 the curve, its slider and its days ran past an iPhone SE's 326px. */}
          <div className="relative aspect-[4/3] min-w-0 flex-1 sm:aspect-[16/10] short:aspect-[7/2]">
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
                {context}
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
              // On paper, as a label over a plot is: at a phone's width the line's label falls among the bonds, and in a
              // sideways phone's flat plot (7:2) under the line it covered the curve from 10 to 20 years.
              className={`text-meta pointer-events-none absolute right-1.5 rounded-sm bg-paper/85 px-1 font-mono text-ink max-sm:hidden short:hidden ${
                sy(rate) / H < 0.12 ? 'pt-0.5' : '-translate-y-full pb-0.5'
              }`}
              style={{ top: `${(sy(rate) / H) * 100}%` }}
            >
              {`key rate ${rate.toFixed(2)}%`}
            </span>
            {/* On a phone the label takes half the plot, and at the right end over the line it covered the long bonds and
                the curve (four dots under it on 15 August): there it takes the first end and side clear of both. */}
            <span
              aria-hidden
              className={`text-meta pointer-events-none absolute rounded-sm bg-paper/85 px-1 font-mono text-ink sm:hidden short:block ${
                phoneKey.left ? 'left-1.5' : 'right-1.5'
              } ${phoneKey.below ? 'pt-0.5' : '-translate-y-full pb-0.5'}`}
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
              // Under 20.5rem (a large font size) the 1-year label gives way: on the square-root axis it touched "3m".
              className={`absolute ${i === 0 ? '' : i === TICKS_T.length - 1 ? '-translate-x-full' : '-translate-x-1/2'} ${t === 1 ? 'max-[20.5rem]:hidden' : ''}`}
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
            onChange={(e) => {
              setAt(Number(e.currentTarget.value))
              setAnnounce('')
            }}
            className="h-6 w-full pointer-coarse:-mt-2.5 pointer-coarse:mb-[-2px] pointer-coarse:h-11 pointer-coarse:align-top"
            style={rangeFill(at, 0, days.length - 1)}
          />
          {/* Positions follow the thumb's centre, which travels the track
              inset by half its own width. */}
          <div className="text-meta relative mt-1 h-12 font-mono print:hidden">
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
                  onClick={() => {
                    setAt(m.index)
                    const x = days[m.index]!
                    setAnnounce(`${day(x.date)}: 3-month ${pc(zcy(x.params, T_MIN))}, 10-year ${pc(zcy(x.params, 10))}`)
                  }}
                  aria-pressed={at === m.index}
                  // A hairline box: without it the decision days read as axis labels, not as something to press. Under a
                  // finger its ::before reaches 44px, 10px more below than above: the slider's own 44px box is just above,
                  // and reaching up the days took its band (a one-line day measured 42.5, the slider 40).
                  className={`absolute ${align} rounded-sm border px-1.5 py-1.5 pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-top-[3px] pointer-coarse:before:-bottom-[13px] pointer-coarse:before:content-[''] touch-manipulation text-center leading-4 whitespace-nowrap transition-colors duration-150 ease-out focus-visible:transition-none ${
                    // Chosen as every other option on the site is: ink fill, paper text.
                    at === m.index ? 'border-ink bg-ink text-paper forced-colors:[outline:2px_solid_Highlight]' : 'border-graphite text-graphite hover:border-ink hover:text-ink active:border-ink active:text-ink active:transition-none'
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
          {announce}
        </p>
      </div>
    </FigureFrame>
  )
}
