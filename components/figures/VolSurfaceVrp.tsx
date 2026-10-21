import { Figure } from '@/components/Figure'
import { ACCENT, DIAGRAM_W, GRAPHITE, INK, RULE, SMALL } from '@/components/figureKit'
import { fact } from '@/content/facts'
import data from '@/lib/volsurface/vrp.json'

/**
 * Fig. 3 of /vol-surface: bitcoin's DVOL against the realized vol of its index, and DVOL minus the realized vol of the
 * following 30 days, daily for a year. From vol-surface-live paper/data/vrp-2026-10-20T0223Z.json (Deribit public API).
 */

const W = DIAGRAM_W
// The key above the top panel, the top panel, and the forward gap under it.
const KEY = 20
const H1 = 170
const H2 = 90
const FOOT = 18
const H = KEY + H1 + H2 + FOOT
const PAD = { l: 26, r: 4 }
const n = data.days.length
const x = (i: number) => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r)
const known = (vs: readonly (number | null)[]) => vs.filter((v): v is number => v != null)
const dvol = known(data.dvol)
const lv = [...dvol, ...known(data.realized)]
// Steps of 20 points on the top panel, 10 on the gap's.
const lo = Math.floor(Math.min(...lv) / 10) * 10
const hi = Math.ceil(Math.max(...lv) / 10) * 10
const y = (v: number) => KEY + 6 + (1 - (v - lo) / (hi - lo)) * (H1 - 18)
const gv = known(data.gap)
const glo = Math.floor(Math.min(0, ...gv) / 10) * 10
const ghi = Math.ceil(Math.max(0, ...gv) / 10) * 10
const y2 = (v: number) => KEY + H1 + 4 + (1 - (v - glo) / (ghi - glo)) * (H2 - 8)
const path = (vals: readonly (number | null)[]) => {
  let d = ''
  let pen = false
  vals.forEach((v, i) => {
    if (v == null) {
      pen = false
      return
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`
    pen = true
  })
  return d
}
const ticks = Array.from({ length: Math.floor((hi - lo) / 20) + 1 }, (_, i) => lo + 20 * i)
const bw = Math.max(0.6, (W - PAD.l - PAD.r) / n - 0.2)
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const date = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`))

function Marks() {
  return (
    <g>
      <line x1={PAD.l} x2={PAD.l + 14} y1={KEY - 8} y2={KEY - 8} stroke={ACCENT} strokeWidth={1.5} />
      <text x={PAD.l + 20} y={KEY - 4} fontSize={SMALL} fill={INK}>
        DVOL
      </text>
      <line x1={PAD.l + 70} x2={PAD.l + 84} y1={KEY - 8} y2={KEY - 8} stroke={INK} strokeWidth={1.25} strokeOpacity={0.8} />
      <text x={PAD.l + 90} y={KEY - 4} fontSize={SMALL} fill={INK}>
        realized, past 30 days
      </text>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={RULE} />
          <text x={PAD.l - 5} y={y(t)} dy="0.32em" textAnchor="end" className="font-mono" fontSize={SMALL} fill={GRAPHITE}>
            {t}
          </text>
        </g>
      ))}
      <path d={path(data.realized)} fill="none" stroke={INK} strokeWidth={1.25} strokeOpacity={0.8} />
      <path d={path(data.dvol)} fill="none" stroke={ACCENT} strokeWidth={1.5} />
      {data.gap.map((g, i) =>
        g == null ? null : (
          <rect key={i} x={x(i) - bw / 2} width={bw} y={Math.min(y2(g), y2(0))} height={Math.abs(y2(g) - y2(0))} fill={g >= 0 ? ACCENT : INK} fillOpacity={0.6} />
        ),
      )}
      <line x1={PAD.l} x2={W - PAD.r} y1={y2(0)} y2={y2(0)} stroke={INK} strokeOpacity={0.6} />
      <text x={PAD.l} y={H - 4} className="font-mono" fontSize={SMALL} fill={GRAPHITE}>
        {date(data.days[0]!)}
      </text>
      <text x={W - PAD.r} y={H - 4} textAnchor="end" className="font-mono" fontSize={SMALL} fill={GRAPHITE}>
        {date(data.days[n - 1]!)}
      </text>
    </g>
  )
}

export function VolSurfaceVrp() {
  return (
    <Figure
      id="fig-3"
      number="3"
      title="Bitcoin: implied against realized volatility, a year to 20 October 2026"
      description={`Daily, ${date(data.days[0]!)} to ${date(data.days[n - 1]!)}: DVOL, Deribit's 30-day implied volatility index, between ${Math.min(...dvol).toFixed(0)} and ${Math.max(...dvol).toFixed(0)}; the index's realized volatility over the previous 30 days; and below, DVOL minus the realized volatility of the following 30 days, between ${glo} and ${ghi} points, above zero on ${fact('vsVrpBtcShare').value}% of the ${fact('vsVrpBtcDays').value} days that have one.`}
      caption={
        <>
          Top: DVOL and the realized volatility of Deribit&rsquo;s index over the previous 30 days, in vol points. Bottom: DVOL minus
          the realized volatility of the following 30 days, above the line on {fact('vsVrpBtcShare').value}% of the{' '}
          {fact('vsVrpBtcDays').value} days that have one: options charged more than the price then moved.
        </>
      }
      arrangements={[{ viewBox: `0 0 ${W} ${H}`, width: W, height: H, Marks, className: 'max-w-[336px]', key: 'only' }]}
    />
  )
}
