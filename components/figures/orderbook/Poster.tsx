import type { Flow } from '@/lib/market/flow'
import { LABEL_FS, posterGeometry, type PosterLabel } from '@/lib/orderbook/poster'

/**
 * A real frame of the simulation, drawn on the server: the book's history as
 * ridgelines through the live camera, the price river through the valley and
 * the recent trades as dots. It is the figure until the canvas has drawn, and
 * the whole figure for a reader who asked for reduced motion. On a first visit
 * the pre-paint mark hides everything drawn on the page (`data-fill`), so the
 * terrain can rise out of it.
 */
export function Poster({ sim, variant, label }: { sim: Flow; variant: 'wide' | 'narrow'; label: string }) {
  const wide = variant === 'wide'
  // The paper's stage: its column at lg (646×576 at 1440×900), and a phone's full-bleed frame (390×591).
  const g = posterGeometry(sim, wide ? 646 : 390, wide ? 576 : 591, wide ? { every: 6, step: 2 } : { every: 7, step: 2 })
  return (
    <svg viewBox={`0 0 ${g.w} ${g.h}`} preserveAspectRatio="xMidYMid meet" className="block h-full w-full" role="img">
      <title>Twenty seconds of a synthetic order book</title>
      <desc>{label}</desc>
      <g data-fill="" strokeLinejoin="round" strokeWidth={1}>
        {g.rows.map((r, i) => (
          <g key={i} strokeOpacity={(0.2 + 0.8 * r.near).toFixed(2)}>
            <path d={r.bid.d} strokeDasharray={r.bid.dash} fill="var(--color-paper)" stroke="var(--color-indigo)" />
            <path d={r.ask.d} strokeDasharray={r.ask.dash} fill="var(--color-paper)" stroke="var(--color-graphite)" />
          </g>
        ))}
      </g>
      <g data-fill="">
        <path d={g.river} fill="none" stroke="var(--color-indigo-wash)" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
        <path d={g.river} fill="none" stroke="var(--color-indigo)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g data-fill="" fill="var(--color-indigo)">
        {g.dots.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} />
        ))}
      </g>
      <g data-fill="" className="font-mono" fontSize={LABEL_FS} textAnchor="middle" dominantBaseline="central">
        {g.labels.map((l) => (
          <Label key={l.text} l={l} />
        ))}
      </g>
    </svg>
  )
}

/** The live overlay's colours for each kind of label (components/figures/orderbook/renderer.ts): the price in indigo. */
const LOOK: Record<PosterLabel['kind'], { back: string; opacity: number; text: string }> = {
  tag: { back: 'var(--color-indigo)', opacity: 1, text: 'var(--color-paper)' },
  wall: { back: 'var(--color-paper)', opacity: 0.85, text: 'var(--color-ink)' },
  time: { back: 'var(--color-paper)', opacity: 0.8, text: 'var(--color-graphite)' },
  tick: { back: 'var(--color-paper)', opacity: 0.8, text: 'var(--color-graphite)' },
}

function Label({ l }: { l: PosterLabel }) {
  const k = LOOK[l.kind]
  return (
    <>
      <rect x={l.x0} y={l.y0} width={Math.round((l.x1 - l.x0) * 10) / 10} height={Math.round((l.y1 - l.y0) * 10) / 10} rx={4} fill={k.back} fillOpacity={k.opacity} />
      <text x={Math.round(((l.x0 + l.x1) / 2) * 10) / 10} y={Math.round(((l.y0 + l.y1) / 2) * 10) / 10} fill={k.text}>
        {l.text}
      </text>
    </>
  )
}
