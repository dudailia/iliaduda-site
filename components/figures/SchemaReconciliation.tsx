import { value } from '@/content/facts'
import { ACCENT, DIAGRAM_W, GRAPHITE, INK, RULE, SMALL, WASH } from '../figureKit'

/**
 * Fig 5. Eight vendor schemas converging on one internal type.
 *
 * There is no central reconciler in AdConfirm and the figure should not imply
 * one: the seam is the target interface, and each adapter owns a private mapper
 * that lands on it. So the honest drawing is a convergence, not a pipeline.
 *
 * The marks record what the convergence costs. A hollow square means the
 * adapter cannot populate line items at all, so the shared type is a lowest
 * common denominator rather than a union.
 */

interface Source {
  readonly name: string
  readonly auth: 'oauth' | 'static'
  readonly lineItems: boolean
}

const SOURCES: readonly Source[] = [
  { name: 'Xero', auth: 'oauth', lineItems: true },
  { name: 'QuickBooks', auth: 'oauth', lineItems: true },
  { name: 'FreeAgent', auth: 'oauth', lineItems: true },
  { name: 'Sage', auth: 'oauth', lineItems: false },
  { name: 'Square', auth: 'oauth', lineItems: false },
  { name: 'Zettle', auth: 'oauth', lineItems: true },
  { name: 'Shopify', auth: 'static', lineItems: true },
  { name: 'EposNow', auth: 'static', lineItems: false },
]

const W = DIAGRAM_W
const TOP = 14
const PITCH = 20
const LABEL_X = 96
const HUB_X = 190
const HUB_W = 134
const H = TOP + SOURCES.length * PITCH + 74
const HUB_Y = TOP + (SOURCES.length * PITCH) / 2 - 22

function Marks() {
  const midY = TOP + (SOURCES.length * PITCH) / 2 - 4
  return (
    <>
      {SOURCES.map((s, i) => {
        const y = TOP + i * PITCH
        return (
          <g key={s.name}>
            <text
              x={LABEL_X}
              y={y + 8}
              textAnchor="end"
              className="font-mono"
              fontSize={SMALL}
              fill={INK}
            >
              {s.name}
            </text>
            <rect
              x={LABEL_X + 8}
              y={y}
              width="8"
              height="8"
              fill={s.lineItems ? ACCENT : 'none'}
              stroke={ACCENT}
            />
            <text x={LABEL_X + 22} y={y + 8} className="font-mono" fontSize="12" fill={GRAPHITE}>
              {s.auth === 'static' ? 'static' : 'oauth'}
            </text>
            <path
              d={`M ${LABEL_X + 78} ${y + 4} C ${HUB_X - 24} ${y + 4}, ${HUB_X - 24} ${midY}, ${HUB_X - 4} ${midY}`}
              fill="none"
              stroke={RULE}
              strokeWidth="1"
            />
          </g>
        )
      })}

      <rect x={HUB_X} y={HUB_Y} width={HUB_W} height="46" fill={WASH} stroke={ACCENT} />
      <text
        x={HUB_X + HUB_W / 2}
        y={HUB_Y + 20}
        textAnchor="middle"
        className="font-mono"
        fontSize={SMALL}
        fill={INK}
      >
        InvoiceData
      </text>
      <text
        x={HUB_X + HUB_W / 2}
        y={HUB_Y + 34}
        textAnchor="middle"
        className="font-mono"
        fontSize="12"
        fill={GRAPHITE}
      >
        one target type
      </text>

      <line
        x1="0"
        y1={H - 56}
        x2={W}
        y2={H - 56}
        stroke={RULE}
        strokeWidth="1"
      />
      <g className="font-mono" fontSize="12" fill={GRAPHITE}>
        <rect x="0" y={H - 44} width="8" height="8" fill="none" stroke={ACCENT} />
        <text x="14" y={H - 36}>
          {`${value('acAdaptersWithoutLineItems')} of ${value('acIntegrations')} cannot supply line items,`}
        </text>
        <text x="14" y={H - 24}>
          so the shared type is a lowest common
        </text>
        <text x="14" y={H - 12}>
          denominator, not a union
        </text>
      </g>
    </>
  )
}

export const schemaReconciliation = {
  arrangements: [
    { key: 'only', viewBox: `0 0 ${W} ${H}`, width: W, height: H, Marks, className: 'max-w-[336px]' },
  ],
  description:
    `Eight accounting and point-of-sale integrations — Xero, QuickBooks, FreeAgent, Sage, Square, ` +
    `Zettle, Shopify and EposNow — each map onto one internal interface called InvoiceData. Six ` +
    `authenticate by OAuth refresh and two by a static key. ` +
    `${value('acAdaptersWithoutLineItems')} of the ${value('acIntegrations')} cannot supply line ` +
    `items at all, so the shared type is a lowest common denominator rather than a union of what ` +
    `the vendors offer.`,
}
