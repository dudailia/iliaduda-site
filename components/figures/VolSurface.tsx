import { fact, value } from '@/content/facts'
import { levels } from '@/lib/surfaceLevels'
import { DOMAIN, iv } from '@/lib/svi'
import { EXPIRY_TICKS, LABELLED, STRIKE_TICKS, cssPct, expiryLabel, wholePct as pct } from '@/lib/surfaceView'
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
                // Inset from the frame, so a label never sits on its line.
                left: cssPct(Math.min(0.95, Math.max(0.05, l.label.x))),
                top: cssPct(Math.min(0.91, Math.max(0.05, l.label.y))),
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
    // The column this sits in also holds the strike labels under the plot, so
    // the ticks are placed in a box that stops at the plot's bottom edge
    // (bottom-7 = the strike row's mt-2 + h-5). Placed against the full column
    // they sat low, and 2Y fell into the strike row.
    <div aria-hidden className="text-meta relative h-full w-8 shrink-0 font-mono text-graphite">
      <div className="absolute inset-x-0 top-0 bottom-7">
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
      {...(entrance ? {} : { vt: 'iv-surface' })}
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
          <a href="/iv-surface">How it is built</a>.
        </>
      }
    />
  )
}
