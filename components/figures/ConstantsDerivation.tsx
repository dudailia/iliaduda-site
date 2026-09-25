import { fact, value } from '@/content/facts'
import { ACCENT, DIAGRAM_W, GRAPHITE, INK, RULE, WASH } from '../figureKit'

/**
 * Every number nucarbon displays, traced back to where it comes from: six
 * constants and a set of adoption rates produce every figure on nine pages.
 * The accent marks the two inputs taken from published sources — the grid's
 * carbon intensity and the energy per query — so the figure separates cited
 * inputs from adjustable assumptions without a sentence to do it.
 */

interface Constant {
  readonly name: string
  readonly display: string
  readonly sourced: boolean
}

const CONSTANTS: readonly Constant[] = [
  { name: 'studentPopulation', display: fact('ncStudents').value.toLocaleString('en-US'), sourced: false },
  { name: 'facultyStaff', display: fact('ncFaculty').value.toLocaleString('en-US'), sourced: false },
  { name: 'queriesPerPersonPerDay', display: String(value('ncQueriesPerDay')), sourced: false },
  { name: 'energyPerQueryKwh', display: String(value('ncEnergyPerQuery')), sourced: true },
  { name: 'co2PerKwhKg', display: String(value('ncCo2PerKwh')), sourced: true },
  { name: 'semesterStartDate', display: 'a date', sourced: false },
]

const W = DIAGRAM_W
const TOP = 16
const PITCH = 19
const H = TOP + CONSTANTS.length * PITCH + 96
const BRACKET_X = 208
const BOX_X = BRACKET_X + 22
const BOX_W = W - BOX_X - 5

function Marks() {
  const midY = TOP + (CONSTANTS.length * PITCH) / 2 - 4
  const lastY = TOP + CONSTANTS.length * PITCH
  return (
    <>
      {CONSTANTS.map((c, i) => {
        const y = TOP + i * PITCH
        return (
          <g key={c.name} className="font-mono">
            <rect
              x="0"
              y={y - 8}
              width="8"
              height="8"
              fill={c.sourced ? ACCENT : 'none'}
              stroke={c.sourced ? ACCENT : RULE}
            />
            <text x="14" y={y} fontSize="10" fill={INK}>
              {c.name}
            </text>
            <text x={BRACKET_X - 12} y={y} textAnchor="end" fontSize="10" fill={GRAPHITE}>
              {c.display}
            </text>
          </g>
        )
      })}

      {/* everything on the dashboard hangs off the six above */}
      <path
        d={`M ${BRACKET_X} ${TOP - 10} L ${BRACKET_X + 7} ${TOP - 10} L ${BRACKET_X + 7} ${lastY - 12} L ${BRACKET_X} ${lastY - 12}`}
        fill="none"
        stroke={RULE}
        strokeWidth="1"
      />
      <line
        x1={BRACKET_X + 7}
        y1={midY}
        x2={BRACKET_X + 22}
        y2={midY}
        stroke={INK}
        strokeWidth="1"
      />
      <rect x={BOX_X} y={midY - 22} width={BOX_W} height="44" fill={WASH} stroke={ACCENT} />
      <text
        x={BOX_X + BOX_W / 2}
        y={midY - 9}
        textAnchor="middle"
        className="font-mono"
        fontSize="9.5"
        fill={INK}
      >
        every figure
      </text>
      <text
        x={BOX_X + BOX_W / 2}
        y={midY + 3}
        textAnchor="middle"
        className="font-mono"
        fontSize="9.5"
        fill={INK}
      >
        on nine
      </text>
      <text
        x={BOX_X + BOX_W / 2}
        y={midY + 15}
        textAnchor="middle"
        className="font-mono"
        fontSize="9.5"
        fill={INK}
      >
        pages
      </text>

      <line x1="0" y1={lastY + 18} x2={W} y2={lastY + 18} stroke={RULE} strokeWidth="1" />
      <g className="font-mono" fontSize="10" fill={GRAPHITE}>
        <rect x="0" y={lastY + 30} width="8" height="8" fill={ACCENT} stroke={ACCENT} />
        <text x="14" y={lastY + 38}>
          taken from a published source
        </text>
        <text x="14" y={lastY + 52}>
          {`plus ${value('ncTools')} tools with adjustable adoption rates;`}
        </text>
        <text x="14" y={lastY + 64}>
          {`uncertainty reported on the page: ±${value('ncSelfReportedError')}%`}
        </text>
      </g>
    </>
  )
}

export const constantsDerivation = {
  arrangements: [
    { key: 'only', viewBox: `0 0 ${W} ${H}`, width: W, height: H, Marks, className: 'max-w-[336px]' },
  ],
  description:
    `Every number displayed across nine pages derives from ${value('ncConstants')} constants: a ` +
    `student population, a faculty and staff count, an assumed number of AI queries per person ` +
    `per day, an energy figure per query, a carbon intensity per kilowatt hour, and a semester ` +
    `start date — plus ${value('ncTools')} tools with adjustable adoption rates. The carbon ` +
    `intensity and the energy per query come from published sources. The application reports ` +
    `its uncertainty as plus or minus ${value('ncSelfReportedError')} percent.`,
}
