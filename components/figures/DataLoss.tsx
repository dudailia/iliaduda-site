import { value } from '@/content/facts'
import { ACCENT, DIAGRAM_W, GRAPHITE, INK, RULE, SMALL, WASH } from '../figureKit'

/**
 * Fig 6. What happened to the rows, rather than what the composite score said.
 *
 * The score is the part a reader would expect to see and the part that means
 * least: it is descriptive, has no holdout and carries no interval. The
 * reduction is the part that decides what the ranking is even about, so this is
 * the figure.
 *
 * Label lengths here are deliberately short of the frame. An earlier version
 * filled 330 of the 336 available units, which fitted on macOS and overflowed
 * by 25 on Linux CI, where the fallback mono is wider — a figure authored to
 * the edge is authored to one machine's font metrics.
 */

const RAW = value('siRowsRaw')
const CLEANED = value('siRowsCleaned')
const FINAL = value('siRowsFinal')

const STAGES = [
  { label: 'records as supplied', n: RAW, role: 'context' as const },
  { label: 'with funding and dates', n: CLEANED, role: 'context' as const },
  { label: 'scored', n: FINAL, role: 'measured' as const },
]

const W = DIAGRAM_W
const X0 = 0
const BAR_W = 300
const TOP = 22
const PITCH = 64
const BAR_H = 18
const H = TOP + STAGES.length * PITCH + 24

const scale = (n: number) => (n / RAW) * BAR_W
const fmt = (n: number) => n.toLocaleString('en-US')

function Marks() {
  return (
    <>
      {STAGES.map((s, i) => {
        const y = TOP + i * PITCH
        return (
          <g key={s.label} className="font-mono">
            <text x={X0} y={y - 6} fontSize={SMALL} fill={INK}>
              {`${s.label}  ${fmt(s.n)}`}
            </text>
            <rect
              x={X0}
              y={y}
              width={scale(s.n)}
              height={BAR_H}
              fill={s.role === 'measured' ? ACCENT : WASH}
              stroke={ACCENT}
              strokeWidth={s.role === 'measured' ? 0 : 1}
            />
            {i < STAGES.length - 1 ? (
              <text x={X0} y={y + BAR_H + 20} fontSize="12" fill={GRAPHITE}>
                {i === 0
                  ? `− ${fmt(RAW - CLEANED)} lacking a funding record or a date`
                  : `− ${fmt(CLEANED - FINAL)} outliers, and years too thin to use`}
              </text>
            ) : null}
          </g>
        )
      })}
      <line x1={X0} y1={H - 22} x2={W} y2={H - 22} stroke={RULE} strokeWidth="1" />
      <text x={X0} y={H - 8} className="font-mono" fontSize="12" fill={GRAPHITE}>
        {`${value('siLossPct')}% of supplied records are not ranked`}
      </text>
    </>
  )
}

export const dataLoss = {
  arrangements: [
    { key: 'only', viewBox: `0 0 ${W} ${H}`, width: W, height: H, Marks, className: 'max-w-[336px]' },
  ],
  description:
    `Of ${fmt(RAW)} supplied records, ${fmt(CLEANED)} carry both a funding record and a date. ` +
    `Removing outliers by per-segment interquartile fences and dropping years with too few ` +
    `funding rounds leaves ${fmt(FINAL)} records in the ranking — ${value('siLossPct')} percent ` +
    `of the original set is excluded.`,
}
