import { CaseStudyTitle, Meta, Section } from '@/components/CaseStudy'
import { Annotated, Shell } from '@/components/Layout'
import { ArbitrageBound } from '@/components/figures/ArbitrageBound'
import { SurfaceFigure } from '@/components/figures/Surface'
import { fact, type FactKey } from '@/content/facts'
import { papers } from '@/content/papers'
import { pageMeta } from '@/lib/meta'
import { ETA_CAP, params } from '@/lib/surface/shock'
import { iv, localVol } from '@/lib/surface/ssvi'
import { SOURCE } from '@/lib/site'

const paper = papers.find((p) => p.slug === 'iv-surface')!

export const metadata = pageMeta('/iv-surface', paper.title, paper.description)

const SRC = SOURCE

const PARAMS: readonly (readonly [string, FactKey, (v: number) => string])[] = [
  ['σ short', 'ivSigmaShort', (v) => `${(v * 100).toFixed(0)}%`],
  ['σ long', 'ivSigmaLong', (v) => `${(v * 100).toFixed(0)}%`],
  ['κ', 'ivKappa', (v) => v.toFixed(1)],
  ['ρ', 'ivRho', (v) => `−${Math.abs(v).toFixed(2)}`],
  ['η', 'ivEta', (v) => v.toFixed(1)],
  ['γ', 'ivGamma', (v) => v.toFixed(1)],
]

export default function IvSurface() {
  const eta = fact('ivEta').value
  const rho = fact('ivRho').value
  // At the peak of a full shock, one year out, at the money: what the margin reads, computed as the figure computes it.
  const peak = params(1)
  const pctOf = (x: number) => `${(x * 100).toFixed(1)}%`
  return (
    <Shell>
      <article>
        <CaseStudyTitle
          byline={paper.byline}
          level="h1"
          title={paper.title}
          standfirst={<p>{paper.standfirst ?? paper.abstract}</p>}
        />

        <SurfaceFigure />

        <Section heading="What it is">
          <p>
            An implied-volatility surface says what volatility the market prices into an option at
            each strike and expiry. Quoting it well is a modeling problem, because a surface drawn
            freehand will usually admit arbitrage somewhere: a butterfly that costs less than
            nothing, or a longer-dated option that is cheaper than a shorter one.
          </p>
          <Annotated
            note={
              <>
                Synthetic throughout: the parameters are chosen to look like an equity index,
                not fitted to market quotes.
              </>
            }
          >
            <p>
              This one uses SSVI, the surface parametrization Gatheral and Jacquier published in
              2014. Total implied variance w = σ²T is written as a function of log-moneyness k and
              the at-the-money total variance θ(T), with a correlation-like skew ρ and a curvature
              function <span className="whitespace-nowrap">φ(θ) = η / (θ<sup>γ</sup>(1 + θ)<sup>1−γ</sup>)</span>. The at-the-money term
              structure decays from a short-end volatility to a long-run one at rate κ, the shape a
              variance term structure takes under mean reversion.
            </p>
          </Annotated>
          <dl className="text-note mt-6 grid grid-cols-3 gap-x-6 gap-y-3 border-y border-rule py-5 sm:grid-cols-6">
            {PARAMS.map(([sym, key, fmt]) => (
              <div key={key}>
                <dt className="text-note text-graphite italic">{sym}</dt>
                <dd className="tabular mt-0.5">{fmt(fact(key).value)}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section heading="Why these conditions">
          <p>
            Static arbitrage comes in two kinds and the surface has to rule out both. Across
            strikes, the smile at one expiry must imply a non-negative probability density —
            Durrleman&rsquo;s condition g(k){'\u00a0'}≥{'\u00a0'}0 — or a butterfly spread prices below zero. Across
            expiries, total variance must not fall as maturity lengthens, or a calendar spread
            does.
          </p>
          <p>
            SSVI makes both checkable in closed form. θ(T) here is strictly increasing, which
            settles the calendar condition at the money, and with γ = ½ the inequality η(1 + |ρ|)
            ≤ 2 is sufficient for no butterfly arbitrage at any strike. For the calm parameters it is{' '}
            {(eta * (1 + Math.abs(rho))).toFixed(2)}. The shock in Fig.{'\u00a0'}1 steepens ρ, so η is capped as it does: the
            product never passes {ETA_CAP.toFixed(2)}, and every frame of the shock is checked directly.
          </p>
        </Section>

        <ArbitrageBound />

        <Section heading="What the margin reads">
          <Annotated
            note={
              <>
                Greeks are sticky-strike: σ is held fixed while each is taken, even while the surface
                moves.
              </>
            }
          >
            <p>
              At the probe, the margin gives implied volatility and prices a call on Black&rsquo;s
              formula, on a forward of {fact('ivForward').value} with rates and dividends at zero,
              so nothing depends on a curve the figure would have to invent. Delta, gamma, vega per
              volatility point and theta per calendar day are the closed-form Greeks at that
              point&rsquo;s own implied volatility. All of it is computed from the parameters on
              screen, so in the shock every number moves with the surface.
            </p>
          </Annotated>
          <p>
            Local volatility is Dupire&rsquo;s, written in total variance: the calendar slope of w
            divided by Durrleman&rsquo;s g. It is the volatility a diffusion would need at that
            strike and time to reproduce every price on the surface, which is why it runs steeper
            than implied volatility on the downside: the skew compounds. At the money it runs below
            implied, because the calm term structure slopes down and the variance still to come is
            less than the variance already priced. The shock inverts that slope further: at its peak,
            one year out, at-the-money local volatility is {pctOf(localVol(peak, 0, 1))} against{' '}
            {pctOf(iv(peak, 0, 1))} implied.
          </p>
        </Section>

        <Section heading="How it is checked">
          <p>
            Because the parameters are chosen rather than fitted, the tests hold the surface to
            the standard real quotes would face. Durrleman&rsquo;s g is evaluated across the drawn expiries at strikes well beyond the drawn range and
            must stay positive; <span className="whitespace-nowrap">∂w/∂T</span> must stay positive everywhere the figure draws. Each Greek is
            compared with a finite difference of the price, and <span className="whitespace-nowrap">put–call</span> parity is checked away
            from the money.
          </p>
          <p>
            Local volatility is checked by an independent route: call prices are built from the
            surface, differentiated numerically in strike and time, and Dupire&rsquo;s formula in
            prices has to agree with the total-variance form the margin uses, at calm, at the peak of
            a full shock and at the largest shock the slider allows. The shock itself is held to
            the same standard: both conditions are checked on a dense grid at hundreds of moments
            along its path, at every size the slider reaches.
          </p>
        </Section>

        <Section heading="How it is drawn">
          <p>
            The surface is drawn on the server too, projected and lit from the same functions and the
            same camera, with its numbers in the margin: without any script the figure is still the
            finished picture, and the keyboard reads it as soon as the page is interactive. On a first
            visit that picture waits for the surface to form out of the page. Where the browser has
            WebGL2 on a graphics processor, the reader
            has not asked for reduced motion or reduced data, and the figure is on screen, a renderer
            written directly against WebGL2 takes over, with no library: the vertex shader evaluates
            SSVI from the parameters of the moment, so the shock is the formula on every frame, not a
            mesh morphed between keyframes; the fragment shader draws the contours and the light;
            picking marches a ray against the surface&rsquo;s own height function. It forms its smiles
            first and takes one shock; after that it rests, and the shock is the slider&rsquo;s. Where the renderer does not run, the slider redraws the still
            frame.
          </p>
        </Section>

        <Meta
          rows={[
            ['model', <a key="m" href={`${SRC}/lib/svi.ts`}>lib/svi.ts</a>],
            ['in motion', <a key="s" href={`${SRC}/lib/surface/shock.ts`}>lib/surface/shock.ts</a>],
            ['pricing', <a key="p" href={`${SRC}/lib/bs.ts`}>lib/bs.ts</a>],
            [
              'tests',
              <span key="t">
                <span className="inline-block max-w-full"><a className="inline-block max-w-full py-0.5 [overflow-wrap:anywhere]" href={`${SRC}/tests/svi.test.ts`}>tests/svi.test.ts</a>{'\u00a0·'}</span>{' '}
                <span className="inline-block max-w-full"><a className="inline-block max-w-full py-0.5 [overflow-wrap:anywhere]" href={`${SRC}/tests/surface-dynamics.test.ts`}>tests/surface-dynamics.test.ts</a>{'\u00a0·'}</span>{' '}
                <a className="inline-block max-w-full py-0.5 [overflow-wrap:anywhere]" href={`${SRC}/tests/surface-greeks.test.ts`}>tests/surface-greeks.test.ts</a>
              </span>,
            ],
            ['renderer', <a key="r" href={`${SRC}/components/figures/surface/renderer.ts`}>
                {/* The line may break after the last slash, never inside the file's name. */}
                components/figures/surface/<wbr />
                <span className="whitespace-nowrap">renderer.ts</span>
              </a>,
            ],
            ['data', 'synthetic; parameters set by hand'],
            ['reference', 'Gatheral and Jacquier, Arbitrage-free SVI volatility surfaces, Quantitative Finance 14(1), 2014'],
          ]}
        />
      </article>
    </Shell>
  )
}
