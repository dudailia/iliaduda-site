import { value } from '@/content/facts'
import { ACCENT, DIAGRAM_W, GRAPHITE, INK, RULE, SMALL, WASH } from '../figureKit'

/**
 * Fig 4. The statutory contact allowance under 230-ФЗ art. 7, and the fact that
 * shaped the whole authentication design: one SMS login code spends a unit from
 * the daily, weekly AND monthly message ceilings at the same time. The accent
 * marks that single unit in all three windows, because that is the claim — a
 * login is a withdrawal from a legal allowance, not a UX event.
 *
 * Laid out as three period groups with short row labels. The first version put
 * the period in the row label ("messages / month"), which needed more width
 * than a 336-unit figure has left over after sixteen ticks, and the labels
 * shipped clipped to "ssages / month".
 */

const GROUPS = [
  {
    period: 'per day',
    calls: value('dgCallsDay'),
    messages: value('dgMessagesDay'),
  },
  {
    period: 'per week',
    calls: value('dgCallsWeek'),
    messages: value('dgMessagesWeek'),
  },
  {
    period: 'per month',
    calls: value('dgCallsMonth'),
    messages: value('dgMessagesMonth'),
  },
] as const

const W = DIAGRAM_W
const TICK = 10
const PITCH = 15
const X0 = 78
const LABEL_X = 70
const GROUP_TOP = 14
const GROUP_H = 70
const H = GROUP_TOP + GROUPS.length * GROUP_H + 48

function Row({ y, label, n, spends }: { y: number; label: string; n: number; spends: boolean }) {
  return (
    <g>
      <text
        x={LABEL_X}
        y={y + TICK - 1}
        textAnchor="end"
        className="font-mono"
        fontSize={SMALL}
        fill={INK}
      >
        {label}
      </text>
      {Array.from({ length: n }, (_, k) => {
        const spent = spends && k === 0
        return (
          <rect
            key={k}
            x={X0 + k * PITCH}
            y={y}
            width={TICK}
            height={TICK}
            fill={spent ? ACCENT : spends ? WASH : 'none'}
            stroke={spends ? ACCENT : RULE}
            strokeWidth="1"
          />
        )
      })}
    </g>
  )
}

function Marks() {
  const legendY = GROUP_TOP + GROUPS.length * GROUP_H - 8
  return (
    <>
      {GROUPS.map((g, i) => {
        const top = GROUP_TOP + i * GROUP_H
        return (
          <g key={g.period}>
            <text x="0" y={top} className="font-mono" fontSize={SMALL} fill={GRAPHITE}>
              {g.period}
            </text>
            <Row y={top + 12} label="calls" n={g.calls} spends={false} />
            <Row y={top + 34} label="messages" n={g.messages} spends />
          </g>
        )
      })}

      <line x1="0" y1={legendY} x2={W} y2={legendY} stroke={RULE} strokeWidth="1" />
      <g className="font-mono" fontSize={SMALL} fill={GRAPHITE}>
        <rect x="0" y={legendY + 12} width={TICK} height={TICK} fill={ACCENT} stroke={ACCENT} />
        <text x={TICK + 8} y={legendY + 21}>
          the unit one login code spends,
        </text>
        <text x={TICK + 8} y={legendY + 35}>
          in all three windows at once
        </text>
      </g>
    </>
  )
}

export const contactBudget = {
  arrangements: [
    { key: 'only', viewBox: `0 0 ${W} ${H}`, width: W, height: H, Marks, className: 'max-w-[336px]' },
  ],
  description:
    `Creditor-initiated contact ceilings under article 7. Phone calls are capped at ` +
    `${value('dgCallsDay')} per day, ${value('dgCallsWeek')} per week and ${value('dgCallsMonth')} ` +
    `per month. Electronic messages are capped separately at ${value('dgMessagesDay')} per day, ` +
    `${value('dgMessagesWeek')} per week and ${value('dgMessagesMonth')} per month. One SMS login ` +
    `code consumes one message unit from each of the three windows simultaneously.`,
}
