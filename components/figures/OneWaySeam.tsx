import { value } from '@/content/facts'
import { ACCENT, DIAGRAM_W, GRAPHITE, INK, RULE, SMALL, WASH } from '../figureKit'

/**
  * Fig 3. The shape of the Glacier system, and nothing about what it decides.
 * No parameters, no thresholds, no instruments, no scoring logic — the client
 * work is confidential and the architecture is the part I can show.
 *
 * The two things worth drawing: the language seam is a one-way JSON handoff,
 * and the worker has no HTTP ingress at all, so the database is the entire
 * interface in both directions.
 */

const W = DIAGRAM_W
const H = 344
const CX = W / 2
const BW = 208

function Box({
  y,
  lines,
  solid,
  h = 32,
}: {
  y: number
  lines: string[]
  solid?: boolean
  h?: number
}) {
  return (
    <g>
      <rect
        x={CX - BW / 2}
        y={y}
        width={BW}
        height={h + (lines.length > 1 ? 14 : 0)}
        fill={solid ? WASH : 'none'}
        stroke={solid ? ACCENT : RULE}
      />
      {lines.map((l, i) => (
        <text
          key={l}
          x={CX}
          y={y + 20 + i * 14}
          textAnchor="middle"
          className="font-mono"
          fontSize={SMALL}
          fill={INK}
        >
          {l}
        </text>
      ))}
    </g>
  )
}

const Down = ({ from, to }: { from: number; to: number }) => (
  <line x1={CX} y1={from} x2={CX} y2={to} stroke={INK} strokeWidth="1" />
)

function Marks() {
  return (
    <>
      <Box y={6} lines={['Python', 'acquisition and quant primitives']} />
      <Down from={52} to={72} />

      {/* the seam */}
      <Box y={72} lines={['typed context + candidates', 'as JSON — one way']} solid />
      <text x={CX + BW / 2 + 4} y={94} className="font-mono" fontSize={SMALL} fill={GRAPHITE}>
        seam
      </text>
      <Down from={118} to={138} />

      <Box y={138} lines={['TypeScript', 'decision engine and product']} />
      <Down from={184} to={204} />

      <Box y={204} lines={['Supabase Postgres', 'the only interface, both ways']} solid />

      {/* worker and dashboard both attach to the database, never to each other */}
      <line x1={CX - 74} y1={250} x2={CX - 74} y2={280} stroke={INK} strokeWidth="1" />
      <line x1={CX + 74} y1={250} x2={CX + 74} y2={280} stroke={INK} strokeWidth="1" />
      <line x1={CX - 74} y1={250} x2={CX + 74} y2={250} stroke={RULE} strokeWidth="1" />

      <g className="font-mono" fontSize={SMALL} fill={INK}>
        <rect x="4" y="280" width="150" height="44" fill="none" stroke={RULE} />
        <text x="79" y="296" textAnchor="middle">
          worker on Fly
        </text>
        <text x="79" y="310" textAnchor="middle" fill={GRAPHITE}>
          no HTTP ingress
        </text>
        <text x="79" y="322" textAnchor="middle" fill={GRAPHITE} fontSize="9.5">
          {`refresh ${value('glQuoteRefresh')}s · rescan ${value('glRescan')}s`}
        </text>

        <rect x={W - 154} y="280" width="150" height="44" fill="none" stroke={RULE} />
        <text x={W - 79} y="296" textAnchor="middle">
          dashboard on Vercel
        </text>
        <text x={W - 79} y="310" textAnchor="middle" fill={GRAPHITE} fontSize="10">
          realtime row changes
        </text>
      </g>
    </>
  )
}

export const oneWaySeam = {
  arrangements: [
    { key: 'only', viewBox: `0 0 ${W} ${H}`, width: W, height: H, Marks, className: 'max-w-[336px]' },
  ],
  description:
    `Python performs data acquisition and the quantitative primitives and emits a typed context ` +
    `object and candidate array as JSON. That JSON is a one-way seam: TypeScript consumes it and ` +
    `owns the decision engine and the product. Supabase Postgres is the only interface between ` +
    `the worker and the dashboard in either direction. The worker runs on Fly with no HTTP ` +
    `ingress, refreshing quotes every ${value('glQuoteRefresh')} seconds and rescanning every ` +
    `${value('glRescan')} seconds; the dashboard reads row changes in real time.`,
}
