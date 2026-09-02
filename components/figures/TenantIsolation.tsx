import { value } from '@/content/facts'
import { ACCENT, DIAGRAM_W, GRAPHITE, INK, LABEL, RULE, SMALL, WASH } from '../figureKit'

/**
 * Fig 2. Where tenant isolation actually lives in CloseBooks — which is two
 * places, not one. The interesting thing is not the row-level security; it is
 * that a sixth of the routes go around it and are isolated by hand instead.
 * Drawing only the policy layer would have been the flattering version.
 */

const ROUTES = value('cbApiRoutes')
const SERVICE = value('cbServiceRoleRoutes')
const POLICY = ROUTES - SERVICE

const W = DIAGRAM_W
const H = 286
const AX = 84
const BX = 248
const BYPASS = 322

const box = { w: 128, h: 34 }

function Node({ x, y, lines, solid }: { x: number; y: number; lines: string[]; solid?: boolean }) {
  return (
    <g>
      <rect
        x={x - box.w / 2}
        y={y}
        width={box.w}
        height={box.h + (lines.length > 1 ? 14 : 0)}
        fill={solid ? WASH : 'none'}
        stroke={solid ? ACCENT : RULE}
        strokeWidth="1"
      />
      {lines.map((l, i) => (
        <text
          key={l}
          x={x}
          y={y + 21 + i * 14}
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

function Marks() {
  return (
    <>
      {/* the boundary */}
      <rect x="0" y="120" width={W} height="30" fill={RULE} opacity="0.45" />
      <text x="4" y="139" className="font-mono" fontSize={SMALL} fill={INK}>
        row-level security
      </text>

      {/* left: policy path passes through the boundary */}
      <Node x={AX} y={34} lines={[`${POLICY} routes`, 'Supabase client']} />
      <line x1={AX} y1={82} x2={AX} y2={120} stroke={INK} strokeWidth="1" />
      <line x1={AX} y1={150} x2={AX} y2={182} stroke={INK} strokeWidth="1" />
      <Node x={AX} y={182} lines={['firm membership', 'and role rank']} solid />

      {/* right: service-role path routes around it */}
      <Node x={BX} y={34} lines={[`${SERVICE} routes`, 'service-role key']} />
      <path
        d={`M ${BX} 82 L ${BX} 104 L ${BYPASS} 104 L ${BYPASS} 170 L ${BX} 170 L ${BX} 182`}
        fill="none"
        stroke={INK}
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <text
        x={BYPASS - 4}
        y={136}
        textAnchor="end"
        className="font-mono"
        fontSize={SMALL}
        fill={GRAPHITE}
      >
        bypassed
      </text>
      <Node x={BX} y={182} lines={['owner check', 'written by hand']} solid />

      {/* both arrive at the same rows */}
      <line x1={AX} y1={230} x2={AX} y2={252} stroke={INK} strokeWidth="1" />
      <line x1={BX} y1={230} x2={BX} y2={252} stroke={INK} strokeWidth="1" />
      <line x1={AX} y1={252} x2={BX} y2={252} stroke={INK} strokeWidth="1" />
      <text
        x={(AX + BX) / 2}
        y={272}
        textAnchor="middle"
        className="font-mono"
        fontSize={LABEL}
        fill={INK}
      >
        one firm&rsquo;s rows
      </text>
    </>
  )
}

export const tenantIsolation = {
  arrangements: [
    {
      key: 'only',
      viewBox: `0 0 ${W} ${H}`,
      width: W,
      height: H,
      Marks,
      className: 'max-w-[336px]',
    },
  ],
  description:
    `Of ${ROUTES} API routes, ${POLICY} reach client data through the Supabase client and are ` +
    `constrained by row-level security policies keyed on firm membership and role rank. The other ` +
    `${SERVICE} use the service-role key, which bypasses row-level security entirely, and are ` +
    `constrained instead by an owner check written by hand in each route. Both paths end at the ` +
    `same rows.`,
}
