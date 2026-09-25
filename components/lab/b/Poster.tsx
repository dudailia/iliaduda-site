import type { Sim } from '@/lib/lab/b/sim'
import { posterGeometry } from '@/lib/lab/b/poster'

/**
 * A real frame of the simulation, drawn on the server: the book's history as
 * ridgelines through the live camera, the price river through the valley and
 * the recent trades as dots. It is the hero until the canvas has drawn, and
 * the whole hero for a reader who asked for reduced motion.
 */
export function Poster({ sim, variant, label }: { sim: Sim; variant: 'wide' | 'narrow'; label: string }) {
  const wide = variant === 'wide'
  const g = posterGeometry(sim, wide ? 1440 : 390, wide ? 792 : 743, wide ? { every: 6, step: 2 } : { every: 7, step: 2 })
  const fs = wide ? 13 : 12
  return (
    <svg viewBox={`0 0 ${g.w} ${g.h}`} preserveAspectRatio="xMidYMid meet" className="block h-full w-full" role="img" aria-label={label}>
      <g strokeLinejoin="round" strokeWidth={1}>
        {g.rows.map((r, i) => (
          <g key={i} strokeOpacity={(0.2 + 0.8 * r.near).toFixed(2)}>
            <path d={r.bid.d} strokeDasharray={r.bid.dash} fill="var(--color-paper)" stroke="var(--color-indigo)" />
            <path d={r.ask.d} strokeDasharray={r.ask.dash} fill="var(--color-paper)" stroke="var(--color-graphite)" />
          </g>
        ))}
      </g>
      <path d={g.river} fill="none" stroke="var(--color-indigo-wash)" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
      <path d={g.river} fill="none" stroke="var(--color-indigo)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <g fill="var(--color-indigo)">
        {g.dots.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} />
        ))}
      </g>
      <g className="font-mono" fontSize={fs} textAnchor="middle" dominantBaseline="central">
        {g.labels.price.map(([x, y, t]) => (
          <text key={t} x={x} y={y} fill="var(--color-graphite)" stroke="var(--color-paper)" strokeWidth={4} paintOrder="stroke">
            {t}
          </text>
        ))}
        <text x={g.labels.buyers[0]} y={g.labels.buyers[1]} fill="var(--color-ink)" stroke="var(--color-paper)" strokeWidth={4} paintOrder="stroke">
          Buyers waiting
        </text>
        <text x={g.labels.sellers[0]} y={g.labels.sellers[1]} fill="var(--color-ink)" stroke="var(--color-paper)" strokeWidth={4} paintOrder="stroke">
          Sellers waiting
        </text>
        {g.labels.mid ? (
          <g transform={`translate(${g.labels.mid[0]} ${g.labels.mid[1] + 18})`}>
            <rect x={-g.labels.midText.length * fs * 0.3 - 5} y={-fs * 0.75} width={g.labels.midText.length * fs * 0.6 + 10} height={fs * 1.5} rx={3} fill="var(--color-indigo)" />
            <text fill="var(--color-paper)">{g.labels.midText}</text>
          </g>
        ) : null}
        {g.labels.now ? (
          <text x={g.labels.now[0]} y={g.labels.now[1]} textAnchor={wide ? 'start' : 'end'} fill="var(--color-graphite)" stroke="var(--color-paper)" strokeWidth={4} paintOrder="stroke">
            now
          </text>
        ) : null}
      </g>
    </svg>
  )
}
