import { Figure } from '@/components/Figure'
import { ACCENT, DIAGRAM_W, GRAPHITE, INK, RULE, SMALL } from '@/components/figureKit'
import { fact } from '@/content/facts'
import data from '@/lib/volsurface/holdout.json'

/**
 * Fig. 2 of /vol-surface: error on held-out quotes for every bitcoin snapshot archived on 19 October 2026, SSVI against
 * eSSVI. Each snapshot is fitted twice more with every fifth quote held out. From vol-surface-live
 * paper/data/model-comparison-2026-10-19.json.
 */

const W = DIAGRAM_W
const H = 200
const PAD = { l: 36, r: 4, t: 8, b: 24 }
const rows = data.BTC
const t0 = Date.parse(rows[0]!.ts)
const t1 = Date.parse(rows.at(-1)!.ts)
const vals = rows.flatMap((r) => [r.ssvi, r.essvi])
// Quarter-point steps around every value.
const STEP = 0.25
const lo = Math.floor(Math.min(...vals) / STEP) * STEP
const hi = Math.ceil(Math.max(...vals) / STEP) * STEP
const ticks = Array.from({ length: Math.round((hi - lo) / STEP) + 1 }, (_, i) => lo + STEP * i)
const x = (ts: string) => PAD.l + ((Date.parse(ts) - t0) / (t1 - t0)) * (W - PAD.l - PAD.r)
const y = (v: number) => H - PAD.b - ((v - lo) / (hi - lo)) * (H - PAD.t - PAD.b)
// The line lifts over a stretch with no snapshots rather than drawing one across it: more than three five-minute
// intervals apart.
const BREAK = 15 * 60 * 1000
const line = (key: 'ssvi' | 'essvi') =>
  rows.map((r, i) => `${i && Date.parse(r.ts) - Date.parse(rows[i - 1]!.ts) <= BREAK ? 'L' : 'M'}${x(r.ts).toFixed(1)} ${y(r[key]).toFixed(1)}`).join('')
const hhmm = (ts: string) => `${ts.slice(11, 16)} UTC`
const gap = rows.slice(1).reduce((g, r, i) => (Date.parse(r.ts) - Date.parse(rows[i]!.ts) > g.ms ? { ms: Date.parse(r.ts) - Date.parse(rows[i]!.ts), from: rows[i]!.ts, to: r.ts } : g), { ms: 0, from: '', to: '' })
const lower = rows.filter((r) => r.essvi < r.ssvi).length
const last = rows.at(-1)!
// The models are named in the stretch with no snapshots, where no line runs, each at its level either side of it.
const gx = (x(gap.from) + x(gap.to)) / 2
const across = rows.filter((r) => r.ts === gap.from || r.ts === gap.to)
const level = (key: 'ssvi' | 'essvi') => y(across.reduce((s, r) => s + r[key], 0) / across.length)

function Marks() {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={RULE} />
          <text x={PAD.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="font-mono" fontSize={SMALL} fill={GRAPHITE}>
            {t.toFixed(2)}
          </text>
        </g>
      ))}
      <path d={line('ssvi')} fill="none" stroke={INK} strokeWidth={1.25} strokeDasharray="5 4" strokeOpacity={0.7} />
      <path d={line('essvi')} fill="none" stroke={ACCENT} strokeWidth={1.75} />
      <text x={gx} y={level('ssvi')} dy="0.32em" textAnchor="middle" fontSize={SMALL} fill={INK}>
        SSVI
      </text>
      <text x={gx} y={level('essvi')} dy="0.32em" textAnchor="middle" fontSize={SMALL} fill={INK}>
        eSSVI
      </text>
      <text x={PAD.l} y={H - 6} className="font-mono" fontSize={SMALL} fill={GRAPHITE}>
        {hhmm(rows[0]!.ts)}
      </text>
      <text x={W - PAD.r} y={H - 6} textAnchor="end" className="font-mono" fontSize={SMALL} fill={GRAPHITE}>
        {hhmm(last.ts)}
      </text>
    </g>
  )
}

export function VolSurfaceHoldout() {
  const n = fact('vsCmpBtcSnapshots').value
  return (
    <Figure
      id="fig-2"
      number="2"
      title="Error on held-out bitcoin quotes, 19 October 2026"
      description={`For each of ${n} snapshots, the root-mean-square error in vol points on every fifth quote, which neither fit saw: eSSVI between ${Math.min(...rows.map((r) => r.essvi)).toFixed(2)} and ${Math.max(...rows.map((r) => r.essvi)).toFixed(2)}, SSVI between ${Math.min(...rows.map((r) => r.ssvi)).toFixed(2)} and ${Math.max(...rows.map((r) => r.ssvi)).toFixed(2)}; eSSVI lower in ${lower} of ${n}.`}
      caption={
        <>
          Root-mean-square error in vol points on the quotes held out of each fit, one point per five-minute snapshot:
          eSSVI (solid) lower than SSVI (dashed) in {lower} of {n}. No snapshots were archived from {hhmm(gap.from)} to{' '}
          {hhmm(gap.to)}.
        </>
      }
      arrangements={[{ viewBox: `0 0 ${W} ${H}`, width: W, height: H, Marks, className: 'max-w-[336px]', key: 'only' }]}
    />
  )
}
