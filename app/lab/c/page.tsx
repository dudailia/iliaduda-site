import type { Metadata } from 'next'
import { LabPage } from '@/components/lab/LabPage'
import { STAGE_CSS } from '@/components/lab/c/marks'
import { Poster } from '@/components/lab/c/Poster'
import { SurfaceHero } from '@/components/lab/c/SurfaceHero'
import { describe } from '@/lib/lab/c/poster'
import { amplitude, params, PEAK } from '@/lib/lab/c/shock'
import { check } from '@/lib/lab/c/ssvi'

export const metadata: Metadata = {
  title: 'Lab C — The vol surface, reborn',
  description: 'A synthetic implied-volatility surface living through a simulated market shock, recomputed and checked for arbitrage on every frame.',
}

export default function LabC() {
  const peak = params(amplitude(PEAK))
  const points = check(peak).points.toLocaleString('en-US')
  return (
    <>
      <style>{STAGE_CSS}</style>
      <LabPage
        slug="c"
        hero={
          <SurfaceHero
            poster={<Poster />}
            desc={describe(peak)}
            lede="What the market charges to insure against big price swings."
            introShort="That price is implied volatility, here for every strike and expiry. Watch a simulated shock hit."
            intro="That price is implied volatility. Here it is for every strike and expiry of an index’s options: the higher and deeper the colour, the more protection costs. Watch a simulated shock hit, then fade."
          />
        }
        headline="A market shock, recomputed on every frame."
        caption={
          <>
            <p>
              Implied volatility is the size of the price swings an option’s price assumes. In
              practice it is what traders pay for protection, and it is quoted for every strike and
              every expiry, which makes it a surface.
            </p>
            <p>
              Even in calm markets insurance against a crash costs a little more than the rest, so
              the surface leans toward low strikes. When a shock hits, near-term protection is bid up
              at once and the lean steepens; then, over the following weeks, it relaxes. The
              animation plays that out on a synthetic index, and every number under it is computed
              from the surface on screen.
            </p>
          </>
        }
        method={
          <>
            <p>
              The surface is SSVI (Gatheral and Jacquier, 2014) with the hand-set synthetic
              parameters of <a href="/iv-surface">the implied-volatility paper</a>. The shock moves
              four of them along a path: short-end volatility and the term structure’s decay rate
              rise, the skew ρ turns more negative, and curvature is capped so η(1 + |ρ|) ≤ 2 keeps
              holding. The vertex shader evaluates the surface from those parameters, so each
              frame’s shape is the formula itself, not an interpolation between key frames.
            </p>
            <p>
              A surface that moves can break. The no-arbitrage readout re-checks the snapshot on
              screen four times a second: Durrleman’s butterfly condition g(k) ≥ 0 over {points}{' '}
              strike and expiry points, and total variance rising with expiry at every strike. The
              repository’s tests run the same checks on hundreds of snapshots across the cycle, at
              every shock size the slider allows. The put is priced with Black’s formula on a
              forward of 100, rates at zero.
            </p>
          </>
        }
      />
    </>
  )
}
