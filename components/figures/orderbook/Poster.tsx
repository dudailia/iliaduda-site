import type { Flow } from '@/lib/market/flow'
import { posterGeometry } from '@/lib/orderbook/poster'

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
  const fs = wide ? 13 : 12
  // Mono text is 0.6em a character: a label near an edge is moved in until all of it is inside the frame.
  const inside = (x: number, text: string, anchor: 'middle' | 'start' | 'end') => {
    const w = text.length * fs * 0.6
    const left = anchor === 'middle' ? x - w / 2 : anchor === 'start' ? x : x - w
    return x + Math.max(0, 3 - left) - Math.max(0, left + w - (g.w - 3))
  }
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
      <g data-fill="" className="font-mono" fontSize={fs} textAnchor="middle" dominantBaseline="central">
        {g.labels.price.map(([x, y, t]) => (
          <text key={t} x={inside(x, t, 'middle')} y={y} fill="var(--color-graphite)" stroke="var(--color-paper)" strokeWidth={4} paintOrder="stroke">
            {t}
          </text>
        ))}
        <text x={inside(g.labels.buyers[0], 'Buyers waiting', 'middle')} y={g.labels.buyers[1]} fill="var(--color-ink)" stroke="var(--color-paper)" strokeWidth={4} paintOrder="stroke">
          Buyers waiting
        </text>
        <text x={inside(g.labels.sellers[0], 'Sellers waiting', 'middle')} y={g.labels.sellers[1]} fill="var(--color-ink)" stroke="var(--color-paper)" strokeWidth={4} paintOrder="stroke">
          Sellers waiting
        </text>
        {g.labels.mid ? (
          <g transform={`translate(${g.labels.mid[0]} ${g.labels.mid[1] + 18})`}>
            <rect x={-g.labels.midText.length * fs * 0.3 - 5} y={-fs * 0.75} width={g.labels.midText.length * fs * 0.6 + 10} height={fs * 1.5} rx={3} fill="var(--color-indigo)" />
            <text fill="var(--color-paper)">{g.labels.midText}</text>
          </g>
        ) : null}
        {g.labels.now ? (
          <text x={inside(g.labels.now[0], 'now', wide ? 'start' : 'end')} y={g.labels.now[1]} textAnchor={wide ? 'start' : 'end'} fill="var(--color-graphite)" stroke="var(--color-paper)" strokeWidth={4} paintOrder="stroke">
            now
          </text>
        ) : null}
      </g>
    </svg>
  )
}
