import Link from 'next/link'
import { fact, value } from '@/content/facts'
import { contour, pathD } from '@/lib/contours'
import { DOMAIN, iv } from '@/lib/svi'
import { EXPIRY_TICKS, LABELLED, LEVELS, STRIKE_TICKS, cssPct, expiryLabel, wholePct as pct } from '@/lib/surfaceView'
import { U, fx, fy } from './surface/frames'
import { VolSurfaceLive } from './VolSurfaceLive'

/**
 * The hero figure's poster: implied volatility as a contour map, computed at
 * build time from the same SSVI maths the live figure uses. It is the first
 * paint, the reduced-motion figure, and the no-WebGL fallback all at once, so
 * it has to be a complete figure on its own — levels labelled, axes ticked,
 * readable without the 3D view ever loading.
 *
 * Colour follows the site rule: contours in ink and graphite are context; the
 * only indigo is the probe, drawn by the client, because the probe is the value
 * being read.
 */

const NARROW_HIDDEN = new Set<number>([STRIKE_TICKS[1], STRIKE_TICKS[5]])

const NK = 71
const NT = 49

function sample(): Float64Array {
  const out = new Float64Array(NK * NT)
  for (let j = 0; j < NT; j++) {
    const T = DOMAIN.tMin + ((DOMAIN.tMax - DOMAIN.tMin) * j) / (NT - 1)
    for (let i = 0; i < NK; i++) {
      const k = DOMAIN.kMin + ((DOMAIN.kMax - DOMAIN.kMin) * i) / (NK - 1)
      out[j * NK + i] = iv(k, T)
    }
  }
  return out
}

/** Grid coordinates (i over strike, j over expiry) to plot units. */
const gx = (i: number) => (i / (NK - 1)) * U
const gy = (j: number) => (j / (NT - 1)) * U

interface Level {
  readonly level: number
  readonly d: string
  /** Where its label sits, as fractions of the plot, or null if unlabelled. */
  readonly label: { x: number; y: number } | null
}

function levels(): readonly Level[] {
  const field = sample()
  return LEVELS.map((level) => {
    const lines = contour(field, NK, NT, level)
    const d = lines.map((l) => pathD(l.map(([i, j]) => [gx(i), gy(j)] as const))).join('')
    let label: Level['label'] = null
    if (LABELLED.has(level)) {
      // Prefer where the line leaves through the long-expiry (bottom) edge;
      // lines that never reach it leave through the low-strike (left) edge.
      const pts = lines.flat()
      const top = pts.filter(([, j]) => j > NT - 1.01).sort((a, b) => a[0] - b[0])[0]
      const left = pts.filter(([i]) => i < 0.01).sort((a, b) => b[1] - a[1])[0]
      const p = top ?? left
      if (p) label = { x: p[0] / (NK - 1), y: p[1] / (NT - 1) }
    }
    return { level, d, label }
  })
}

/** The prose a screen reader gets in place of the picture, with real values. */
export function surfaceDescription(): string {
  const at = (K: number, T: number) => pct(iv(Math.log(K), T))
  return (
    `Contour map of a synthetic implied-volatility surface, strike from ${pct(Math.exp(DOMAIN.kMin))} to ` +
    `${pct(Math.exp(DOMAIN.kMax))} of the forward across, expiry from five weeks at the top to two years at the bottom. ` +
    `At the money, volatility falls from ${at(1, DOMAIN.tMin)} at five weeks to ${at(1, 2)} at two years. ` +
    `Three months out it is ${at(0.7, 0.25)} at a 70% strike and ${at(1.3, 0.25)} at 130%: the downward skew ` +
    `of an equity index. Contours every two volatility points up to 30%, then every five.`
  )
}

/** The data behind the picture, for screen readers: a grid sample. */
export function SurfaceTable() {
  return (
    <table>
      <caption>
        Implied volatility by strike (percent of the forward, {fact('ivForward').value}) and expiry.
        Synthetic SSVI parameters, set by hand.
      </caption>
      <thead>
        <tr>
          <th scope="col">Expiry</th>
          {STRIKE_TICKS.map((K) => (
            <th key={K} scope="col">{`Strike ${pct(K)}`}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {EXPIRY_TICKS.map((T) => (
          <tr key={T}>
            <th scope="row">{expiryLabel(T)}</th>
            {STRIKE_TICKS.map((K) => (
              <td key={K}>{pct(iv(Math.log(K), T))}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * The contour map itself: an SVG stretched to its box (strokes stay one pixel
 * wide at any stretch) with its level labels in an HTML layer on top, so the
 * type is the same size at every width.
 */
export function SurfacePoster({ titleId, descId }: { titleId: string; descId: string }) {
  const ls = levels()
  const forward = value('ivForward')
  return (
    <>
      <svg
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
        viewBox={`0 0 ${U} ${U}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        <title id={titleId}>{`Implied volatility across strike and expiry, forward ${forward}`}</title>
        <desc id={descId}>{surfaceDescription()}</desc>
        <g stroke="var(--color-rule)" strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none">
          {STRIKE_TICKS.map((K) => (
            <line key={K} x1={fx(Math.log(K)) * U} x2={fx(Math.log(K)) * U} y1={0} y2={U} vectorEffect="non-scaling-stroke" />
          ))}
          {EXPIRY_TICKS.map((T) => (
            <line key={T} x1={0} x2={U} y1={fy(T) * U} y2={fy(T) * U} vectorEffect="non-scaling-stroke" />
          ))}
          <rect x={0} y={0} width={U} height={U} stroke="var(--color-graphite)" vectorEffect="non-scaling-stroke" />
        </g>
        <g fill="none" strokeLinejoin="round" strokeLinecap="round">
          {ls.map((l) => (
            <path
              key={l.level}
              d={l.d}
              stroke={LABELLED.has(l.level) ? 'var(--color-ink)' : 'var(--color-graphite)'}
              strokeWidth={LABELLED.has(l.level) ? 1.25 : 0.75}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      </svg>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {ls.map((l) =>
          l.label ? (
            <span
              key={l.level}
              className="text-meta absolute -translate-x-1/2 -translate-y-1/2 bg-paper px-1 font-mono leading-none text-ink"
              style={{
                left: cssPct(Math.min(0.96, Math.max(0.04, l.label.x))),
                top: cssPct(Math.min(0.96, Math.max(0.03, l.label.y))),
              }}
            >
              {pct(l.level)}
            </span>
          ) : null,
        )}
      </div>
    </>
  )
}

/** Axis ticks, outside the plot box, in HTML. */
export function StrikeAxis() {
  return (
    <div aria-hidden className="text-meta relative mt-2 h-5 font-mono text-graphite">
      {STRIKE_TICKS.map((K) => (
        <span
          key={K}
          // Every tick on wide screens; on a phone the neighbours of 100% would touch.
          className={`absolute -translate-x-1/2 ${NARROW_HIDDEN.has(K) ? 'hidden sm:inline' : ''}`}
          style={{ left: cssPct(fx(Math.log(K))) }}
        >
          {pct(K)}
        </span>
      ))}
    </div>
  )
}

export function ExpiryAxis() {
  return (
    <div aria-hidden className="text-meta relative h-full w-8 shrink-0 font-mono text-graphite">
      {EXPIRY_TICKS.map((T) => (
        <span
          key={T}
          // The last tick sits on the bottom edge; hang it above the edge
          // rather than across it, into the strike axis.
          className={`absolute right-2 ${fy(T) > 0.95 ? '-translate-y-full' : '-translate-y-1/2'}`}
          style={{ top: cssPct(fy(T)) }}
        >
          {expiryLabel(T)}
        </span>
      ))}
    </div>
  )
}

/**
 * Fig. 1, composed: the server-rendered map handed to the client figure as its
 * poster. `entrance` is true only on the home page, where this is the one
 * orchestrated moment on the site.
 */
export function SurfaceFigure({ entrance, number = 'Fig. 1' }: { entrance: boolean; number?: string }) {
  const id = 'fig-surface'
  return (
    <VolSurfaceLive
      id={id}
      number={number}
      entrance={entrance}
      descId={`${id}-desc`}
      title="Implied volatility across strike and expiry"
      subtitle="SSVI surface · synthetic parameters, set by hand · not market data"
      poster={<SurfacePoster titleId={`${id}-svg-title`} descId={`${id}-desc`} />}
      strikeAxis={<StrikeAxis />}
      expiryAxis={<ExpiryAxis />}
      table={<SurfaceTable />}
      caption={
        <>
          A surface shaped like an equity index: volatility climbs toward low strikes, the skew,
          and settles as expiry lengthens. Every point passes the no-arbitrage checks the
          repository&rsquo;s tests run, and the margin prices a call wherever the probe sits.{' '}
          <Link href="/iv-surface">How it is built</Link>.
        </>
      }
    />
  )
}
