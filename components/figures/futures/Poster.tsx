import type { ReactNode } from 'react'
import { MODEL } from '@/lib/futures/mc'
import { MARKS, type PayBar, type Strand } from '@/lib/futures/poster'
import { AXIS, LABELS, TICKS, TICK_CLEAR, VB, px, py, wy } from '@/lib/futures/world'

/**
 * The still frame, as SVG: the first strands of the ensemble, the terminal
 * distribution as a hairline outline, and what each price at expiry pays
 * (count × payoff) in indigo — the finished picture the live figure rests on.
 * It fills the same world rectangle the live camera opens on, so the
 * crossfade lands on the same picture. Strokes do not scale; labels are
 * HTML, placed in percent of the box, so they keep their type size.
 *
 * Everything marked data-fill is what the signature sequence draws in; while
 * a visit's sequence is waiting to play it is hidden (app/globals.css), so the
 * first paint is the composed frame the burst fills.
 */

export const LABEL = 'absolute whitespace-nowrap rounded-sm bg-paper/85 px-1 font-mono text-meta leading-snug'

function Label({ x, y, cls, fill = false, children }: { x: number; y: number; cls: string; fill?: boolean; children: ReactNode }) {
  return (
    <span
      data-fill={fill ? '' : undefined}
      className={`${LABEL} ${cls}`}
      style={{ left: `${((x / VB.w) * 100).toFixed(2)}%`, top: `${((y / VB.h) * 100).toFixed(2)}%` }}
    >
      {children}
    </span>
  )
}

export function Poster({
  strands,
  payBars,
  outline,
  strike,
  price,
}: {
  strands: Strand[]
  payBars: PayBar[]
  outline: string
  strike: number
  /** The price the payoff bars add up to. */
  price: number
}) {
  const ky = MARKS.strikeY(strike)
  const w = (a: readonly number[]) => [px(a[0]!), py(a[1]!)] as const
  return (
    <>
      <svg viewBox={`0 0 ${VB.w} ${VB.h}`} preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden="true">
        <g data-fill="" fill="none" strokeWidth={1}>
          <g className="stroke-graphite" strokeOpacity={0.24}>
            {strands.filter((s) => !s.pays).map((s, i) => (
              <path key={i} d={s.d} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
          <g className="stroke-indigo" strokeOpacity={0.34}>
            {strands.filter((s) => s.pays).map((s, i) => (
              <path key={i} d={s.d} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        </g>
        <line x1={MARKS.expiry.x} x2={MARKS.expiry.x} y1={Math.round(py(wy(AXIS.lo)))} y2={Math.round(py(wy(AXIS.hi)))} className="stroke-graphite" strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
        <path data-fill="" d={outline} fill="none" className="stroke-graphite" strokeOpacity={0.55} vectorEffect="non-scaling-stroke" />
        <g data-fill="">
          {payBars.map((b, i) => (
            <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} className="fill-indigo" fillOpacity={0.95} />
          ))}
        </g>
        <line x1={MARKS.strikeX0} x2={MARKS.strikeX1} y1={ky} y2={ky} className="stroke-ink" strokeWidth={1.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
      </svg>
      <div aria-hidden="true">
        <Label x={w(LABELS.today.at)[0]} y={w(LABELS.today.at)[1]} cls={LABELS.today.cls}>
          Today · ${MODEL.s0}
        </Label>
        <Label x={w(LABELS.expiry.at)[0]} y={w(LABELS.expiry.at)[1]} cls={LABELS.expiry.cls}>
          One year out
        </Label>
        {TICKS.filter((s) => Math.abs(s - strike) >= TICK_CLEAR).map((s) => (
          <Label key={s} x={px(LABELS.tick.x)} y={py(wy(s))} cls={LABELS.tick.cls}>
            ${s}
          </Label>
        ))}
        <Label x={px(LABELS.strike.x0)} y={ky} cls={LABELS.strike.cls}>
          Strike ${strike}
        </Label>
        <Label x={w(LABELS.hist.at)[0]} y={w(LABELS.hist.at)[1]} cls={`${LABELS.hist.cls} text-ink`} fill>
          Payoff × how often it happens
        </Label>
        <Label x={px(LABELS.value.x)} y={py(wy(strike - LABELS.value.below))} cls={`${LABELS.value.cls} text-indigo`} fill>
          <span className="sm:hidden">Call price: ${price.toFixed(2)}</span>
          <span className="hidden sm:inline">Call price, the average discounted payoff: ${price.toFixed(2)}</span>
        </Label>
      </div>
    </>
  )
}
