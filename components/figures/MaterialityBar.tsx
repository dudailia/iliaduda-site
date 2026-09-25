import { value } from '@/content/facts'

/**
 * Fig 1. The only place on this site where the accent colour appears above the
 * fold, and the only bold element on the page.
 *
 * Everything is on ONE unit: relative improvement in negative log-likelihood
 * over the B0 marginal baseline, T1/T20 cell, post-calibration. An earlier
 * draft put "93% of recoverable signal" beside "+0.31%" — a ratio and a rate
 * sharing an axis, which would have made the small mark look small for the
 * wrong reason. Same measurement, honest scale.
 *
 * Rules this figure obeys:
 *   · the scale is not exaggerated. 0.31 beside 4.17 is small and 0.024 is
 *     nearly invisible. That is the finding, so that is how it looks.
 *   · no animation. It is a measurement, not a reveal.
 *   · the wash fill carries a stroke, because #E4E6F2 on #FAF9F7 is 1.18:1 and
 *     a fill alone would not be reliably visible.
 *   · two arrangements, one geometry. Both read the same facts through the same
 *     scale function, so the proportions are provably identical.
 *
 * On sizing: SVG text scales with its container, so a single viewBox can only
 * be the right type size at one viewport. Each arrangement is therefore capped
 * at its intrinsic width, and the pair covers every width at close to 1:1 —
 * which is why the labels here are the same physical size as the labels in the
 * running text, at 360px and at 1440px.
 */

// ── scale ───────────────────────────────────────────────────────────────────
// The axis maximum is a presentation choice, not a measurement: 5% contains the
// largest bar without pushing the small ones below a pixel.
const AXIS_MAX = 5
const TICKS = [0, 1, 2, 3, 4, 5] as const

const STATE = value('crStateGain')
const IDENTITY = value('crIdentityGain')
const LATENT = value('crLatentGain')
const JUSTIFY = value('crJustifyBar')
const AMBIG_LO = value('crAmbiguousFloor')

/** Gains keep the precision the paper reports them at. */
const gain = (v: number) => `+${v}%`
/** Thresholds are quoted to one decimal, so 1 does not read as "1%". */
const threshold = (v: number) => `${v.toFixed(1)}%`

interface Series {
  readonly key: string
  readonly label: string
  readonly gain: number
  /** Wash + stroke for the context quantity; solid for the value under test. */
  readonly role: 'context' | 'measured'
}

const SERIES: readonly Series[] = [
  { key: 'state', label: 'match state', gain: STATE, role: 'context' },
  { key: 'identity', label: 'player identity', gain: IDENTITY, role: 'measured' },
  { key: 'latent', label: 'per-match latent', gain: LATENT, role: 'measured' },
]

const INK = 'var(--color-ink)'
const GRAPHITE = 'var(--color-graphite)'
const RULE = 'var(--color-rule)'
const ACCENT = 'var(--color-indigo)'
const WASH = 'var(--color-indigo-wash)'

const fill = (role: Series['role']) => (role === 'context' ? WASH : ACCENT)
const stroke = (role: Series['role']) => (role === 'context' ? 1 : 0)

/** Tick labels at the ends of the axis would otherwise clip the viewBox. */
const anchorFor = (t: number) => (t === 0 ? 'start' : t === AXIS_MAX ? 'end' : 'middle')

// ── legend ──────────────────────────────────────────────────────────────────
// Both threshold annotations live below the axis. In an earlier pass they sat
// at the top of the plot, where "justifies further work" collided with the
// first bar's label and read like a chart title.
function Legend({
  x,
  y,
  gapX,
  size,
  stacked,
}: {
  x: number
  y: number
  gapX: number
  size: number
  stacked: boolean
}) {
  const secondX = stacked ? x : x + gapX
  const secondY = stacked ? y + size * 1.6 : y
  return (
    <g className="font-mono" fontSize={size} fill={GRAPHITE}>
      <rect x={x} y={y - size + 2} width="13" height={size} fill={RULE} opacity="0.85" />
      <text x={x + 19} y={y}>
        {`ambiguous ${threshold(AMBIG_LO)} to ${threshold(JUSTIFY)}`}
      </text>
      <line
        x1={secondX + 6}
        y1={secondY - size + 2}
        x2={secondX + 6}
        y2={secondY + 2}
        stroke={INK}
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <text x={secondX + 19} y={secondY}>
        {`${threshold(JUSTIFY)} justifies further work`}
      </text>
    </g>
  )
}

// ── wide: labels beside bars ────────────────────────────────────────────────
const W = { vbW: 620, vbH: 240, x0: 158, x1: 600, top: 34, barH: 22, gap: 28, axisY: 180 }
const wScale = (v: number) => ((W.x1 - W.x0) / AXIS_MAX) * v
const wRowY = (i: number) => W.top + i * (W.barH + W.gap)

function Wide() {
  return (
    <>
      <rect
        x={W.x0 + wScale(AMBIG_LO)}
        y={W.top}
        width={wScale(JUSTIFY - AMBIG_LO)}
        height={W.axisY - W.top}
        fill={RULE}
        opacity="0.5"
      />
      <line
        x1={W.x0 + wScale(JUSTIFY)}
        y1={W.top}
        x2={W.x0 + wScale(JUSTIFY)}
        y2={W.axisY}
        stroke={INK}
        strokeWidth="1"
        strokeDasharray="3 3"
      />

      {SERIES.map((s, i) => {
        const y = wRowY(i)
        const w = Math.max(wScale(s.gain), 1.5)
        return (
          <g key={s.key} className="font-mono">
            <text x={W.x0 - 12} y={y + 16} textAnchor="end" fontSize="12.5" fill={INK}>
              {s.label}
            </text>
            <rect
              x={W.x0}
              y={y}
              width={w}
              height={W.barH}
              fill={fill(s.role)}
              stroke={ACCENT}
              strokeWidth={stroke(s.role)}
            />
            {/* A paper halo: the small gains' labels cross the ambiguous band
                and the 1% line. */}
            <text x={W.x0 + w + 9} y={y + 16} fontSize="12.5" fill={INK} stroke="var(--color-paper)" strokeWidth={4} paintOrder="stroke">
              {gain(s.gain)}
            </text>
          </g>
        )
      })}

      <line x1={W.x0} y1={W.axisY} x2={W.x1} y2={W.axisY} stroke={INK} strokeWidth="1" />
      {TICKS.map((t) => (
        <g key={t}>
          <line
            x1={W.x0 + wScale(t)}
            y1={W.axisY}
            x2={W.x0 + wScale(t)}
            y2={W.axisY + 5}
            stroke={INK}
            strokeWidth="1"
          />
          <text
            x={W.x0 + wScale(t)}
            y={W.axisY + 19}
            textAnchor={anchorFor(t)}
            className="font-mono"
            fontSize="12"
            fill={GRAPHITE}
          >
            {t}%
          </text>
        </g>
      ))}

      <Legend x={W.x0} y={W.axisY + 46} gapX={215} size={11.5} stacked={false} />
    </>
  )
}

// ── narrow: labels stacked above full-width bars ────────────────────────────
const N = { vbW: 336, vbH: 286, x0: 6, x1: 330, top: 28, barH: 20, gap: 46, axisY: 200 }
const nScale = (v: number) => ((N.x1 - N.x0) / AXIS_MAX) * v
const nRowY = (i: number) => N.top + i * (N.barH + N.gap)

function Narrow() {
  return (
    <>
      <rect
        x={N.x0 + nScale(AMBIG_LO)}
        y={N.top}
        width={nScale(JUSTIFY - AMBIG_LO)}
        height={N.axisY - N.top}
        fill={RULE}
        opacity="0.5"
      />
      <line
        x1={N.x0 + nScale(JUSTIFY)}
        y1={N.top}
        x2={N.x0 + nScale(JUSTIFY)}
        y2={N.axisY}
        stroke={INK}
        strokeWidth="1"
        strokeDasharray="3 3"
      />

      {SERIES.map((s, i) => {
        const y = nRowY(i)
        const w = Math.max(nScale(s.gain), 1.5)
        return (
          <g key={s.key} className="font-mono">
            <text x={N.x0} y={y - 7} fontSize="12" fill={INK} stroke="var(--color-paper)" strokeWidth={4} paintOrder="stroke">
              {`${s.label}  ${gain(s.gain)}`}
            </text>
            <rect
              x={N.x0}
              y={y}
              width={w}
              height={N.barH}
              fill={fill(s.role)}
              stroke={ACCENT}
              strokeWidth={stroke(s.role)}
            />
          </g>
        )
      })}

      <line x1={N.x0} y1={N.axisY} x2={N.x1} y2={N.axisY} stroke={INK} strokeWidth="1" />
      {TICKS.map((t) => (
        <g key={t}>
          <line
            x1={N.x0 + nScale(t)}
            y1={N.axisY}
            x2={N.x0 + nScale(t)}
            y2={N.axisY + 5}
            stroke={INK}
            strokeWidth="1"
          />
          <text
            x={N.x0 + nScale(t)}
            y={N.axisY + 19}
            textAnchor={anchorFor(t)}
            className="font-mono"
            fontSize="12"
            fill={GRAPHITE}
          >
            {t}%
          </text>
        </g>
      ))}

      <Legend x={N.x0} y={N.axisY + 46} gapX={0} size={11} stacked />
    </>
  )
}

export const materialityArrangements = [
  {
    key: 'narrow',
    viewBox: `0 0 ${N.vbW} ${N.vbH}`,
    width: N.vbW,
    height: N.vbH,
    Marks: Narrow,
    className: 'sm:hidden max-w-[336px]',
  },
  {
    key: 'wide',
    viewBox: `0 0 ${W.vbW} ${W.vbH}`,
    width: W.vbW,
    height: W.vbH,
    Marks: Wide,
    className: 'hidden sm:block max-w-[620px]',
  },
] as const

export const materialityBar = {
  description:
    `Relative improvement in negative log-likelihood over a marginal baseline, T1/T20, after calibration. ` +
    `Match state improves on the baseline by ${STATE} percent. Player identity adds ${IDENTITY} percent and a ` +
    `per-match latent adds ${LATENT} percent, both below the ${threshold(JUSTIFY)} threshold at which the ` +
    `decision rule would justify building the model, and player identity falls inside the ambiguous band ` +
    `between ${threshold(AMBIG_LO)} and ${threshold(JUSTIFY)}.`,
}
