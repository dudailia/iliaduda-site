import { CAP_LOG2 } from '@/lib/futures/mc'

/**
 * The estimate closing in on Black–Scholes: the Monte Carlo price minus the
 * closed form, with its ±2 standard-error band, against paths on a log scale.
 * The band narrows like 1/√n; the dashed ink line is the exact answer. Every
 * point is a readback from the running estimate.
 */

export interface Point {
  n: number
  mean: number
  se: number
}

const W = 240
const H = 64
const N0 = 12 // log2 of the left edge: 4,096 paths

export function Convergence({ points, exact }: { points: Point[]; exact: number }) {
  const pts = points.filter((p) => p.n >= 2 ** N0 && Number.isFinite(p.se) && p.se > 0)
  const first = pts[0]
  // Scale so the band opens at nearly the full height at its first point.
  const Y = first ? 2.3 * first.se : 1
  const x = (n: number) => ((Math.log2(n) - N0) / (CAP_LOG2 - N0)) * W
  const y = (v: number) => H / 2 - (Math.max(-Y, Math.min(Y, v)) / Y) * (H / 2 - 2)
  const band = pts.length > 1
    ? `M${pts.map((p) => `${x(p.n).toFixed(1)} ${y(p.mean - exact + 2 * p.se).toFixed(1)}`).join('L')}L${pts
        .slice()
        .reverse()
        .map((p) => `${x(p.n).toFixed(1)} ${y(p.mean - exact - 2 * p.se).toFixed(1)}`)
        .join('L')}Z`
    : ''
  const line = pts.length > 1 ? `M${pts.map((p) => `${x(p.n).toFixed(1)} ${y(p.mean - exact).toFixed(1)}`).join('L')}` : ''
  return (
    <div className="text-meta font-mono text-graphite lg:text-right">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-16 w-full" aria-hidden="true">
        {band && <path d={band} className="fill-indigo-wash" />}
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="stroke-ink" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        {line && <path d={line} fill="none" className="stroke-indigo" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
      </svg>
      <p className="mt-1">The estimate and its ±2 SE band as paths pile up (log scale); dashed: the formula</p>
    </div>
  )
}
