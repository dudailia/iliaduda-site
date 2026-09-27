import { syntheticValue as value } from '@/content/synthetic'
import { prepaint } from '@/lib/stage/prepaint'
import { describe } from '@/lib/surface/poster'
import { pct } from '@/lib/surface/readouts'
import { params } from '@/lib/surface/shock'
import { CALM, iv } from '@/lib/surface/ssvi'
import { EXPIRY_TICKS, STRIKE_TICKS } from '@/lib/surface/view'
import { STAGE_CSS } from './surface/marks'
import { SurfaceLive } from './surface/Live'
import { Poster } from './surface/Poster'

/**
 * Fig. 1 of /iv-surface: the SSVI surface in 3D, forming on a first visit and
 * taking one simulated volatility shock, then resting at calm with the shock
 * on a slider. The poster is computed here, at build time, from the calm
 * parameters (content/synthetic.ts, through lib/svi.ts); the browser draws the
 * same surface live.
 */
export function SurfaceFigure() {
  const forward = value('ivForward')
  const full = params(1)
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: prepaint('surface') }} />
      <style>{STAGE_CSS}</style>
      <SurfaceLive
        poster={<Poster at={CALM} />}
        title="Implied volatility for every strike and expiry: skewed toward crash insurance, and free of static arbitrage."
        subtitle={`Synthetic SSVI · forward ${forward} · rates and dividends zero · one simulated shock · not market data`}
        caption={
          <>
            Height and colour are implied volatility, strikes run across and time to expiry runs back. The surface is
            highest at low strikes and short expiries: insurance against a fall costs more than the rest, and most of all
            for the near term. On a first visit it forms, then takes one simulated shock, the textbook shape of a
            sell-off: one-month at-the-money volatility jumps from {pct(iv(CALM, 0, 1 / 12))} to {pct(iv(full, 0, 1 / 12))},
            the skew steepens and the term structure inverts, and then it relaxes. Every frame on the way is a complete
            surface that the margin checks for static arbitrage; the slider applies the shock yourself. Synthetic
            parameters, set by hand; not market data.
          </>
        }
        table={
          <table>
            <caption>{describe(CALM)}</caption>
            <thead>
              <tr>
                <th scope="col">Strike, % of the forward</th>
                {EXPIRY_TICKS.map(([, s]) => (
                  <th key={s} scope="col">
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STRIKE_TICKS.map((K) => (
                <tr key={K}>
                  <th scope="row">{pct(K, 0)}</th>
                  {EXPIRY_TICKS.map(([T, s]) => (
                    <td key={s}>{pct(iv(CALM, Math.log(K), T))}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        }
      />
    </>
  )
}

