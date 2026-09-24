import { CaseStudyTitle, Meta, Section } from '@/components/CaseStudy'
import { Annotated, Shell } from '@/components/Layout'
import { SurfaceFigure } from '@/components/figures/VolSurface'
import { fact, type FactKey } from '@/content/facts'
import { papers } from '@/content/papers'
import { pageMeta } from '@/lib/meta'

const paper = papers.find((p) => p.slug === 'iv-surface')!

export const metadata = pageMeta('/iv-surface', 'An arbitrage-free implied-volatility surface', paper.abstract)

const SRC = 'https://github.com/dudailia/iliaduda-site/blob/redesign'

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
  return (
    <Shell>
      <article>
        <CaseStudyTitle
          byline={paper.byline}
          level="h1"
          title={paper.title}
          standfirst={<p>{paper.abstract}</p>}
        />

        <SurfaceFigure entrance={false} />

        <Section heading="What it is">
          <p>
            An implied-volatility surface says what volatility the market prices into an option at
            each strike and expiry. Quoting it well is a modelling problem, because a surface drawn
            freehand will usually admit arbitrage somewhere: a butterfly that costs less than
            nothing, or a longer-dated option that is cheaper than a shorter one.
          </p>
          <Annotated
            note={
              <>
                Synthetic throughout. The parameters were chosen to look like an equity index,
                not fitted to any market&rsquo;s quotes, and they are not any employer&rsquo;s
                model.
              </>
            }
          >
            <p>
              This one uses SSVI, the surface parametrisation Gatheral and Jacquier published in
              2014. Total implied variance w = σ²T is written as a function of log-moneyness k and
              the at-the-money total variance θ(T), with a correlation-like skew ρ and a curvature
              function φ(θ) = η / (θ<sup>γ</sup>(1 + θ)<sup>1−γ</sup>). The at-the-money term
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
            Durrleman&rsquo;s condition g(k) ≥ 0 — or a butterfly spread prices below zero. Across
            expiries, total variance must not fall as maturity lengthens, or a calendar spread
            does.
          </p>
          <p>
            SSVI makes both checkable in closed form. θ(T) here is strictly increasing, which
            settles the calendar condition at the money, and with γ = ½ the inequality η(1 + |ρ|)
            ≤ 2 is sufficient for no butterfly arbitrage at any strike. For these parameters it is{' '}
            {(eta * (1 + Math.abs(rho))).toFixed(2)}.
          </p>
        </Section>

        <Section heading="What the margin reads">
          <Annotated
            note={
              <>
                Sticky-strike: σ is held fixed while each Greek is taken. How the surface itself
                moves when the underlying does is a separate, larger question this figure does not
                model.
              </>
            }
          >
            <p>
              At the probe, the margin gives implied volatility and prices a call on Black&rsquo;s
              formula, on a forward of {fact('ivForward').value} with rates and dividends at zero,
              so nothing depends on a curve the figure would have to invent. Delta, gamma, vega per
              volatility point and theta per calendar day are the closed-form Greeks at that
              point&rsquo;s own implied volatility.
            </p>
          </Annotated>
          <p>
            Local volatility is Dupire&rsquo;s, written in total variance: the calendar slope of w
            divided by Durrleman&rsquo;s g. It is the volatility a diffusion would need at that
            strike and time to reproduce every price on the surface, which is why it runs steeper
            than implied volatility on the downside — the skew compounds.
          </p>
        </Section>

        <Section heading="How it is checked">
          <p>
            The surface is synthetic, which makes it the one figure on this site whose numbers
            could be anything at all. So the tests hold it to the standard it claims. Durrleman&rsquo;s
            g is evaluated across the drawn expiries at strikes well beyond the drawn range and
            must stay positive; ∂w/∂T must stay positive everywhere the figure draws. Each Greek is
            compared with a finite difference of the price, and put–call parity is checked away
            from the money.
          </p>
          <p>
            Local volatility is checked by an independent route: call prices are built from the
            surface, differentiated numerically in strike and time, and Dupire&rsquo;s formula in
            prices has to agree with the total-variance form the margin uses.
          </p>
        </Section>

        <Section heading="How it is drawn">
          <p>
            The first paint is a contour map computed on the server from the same functions, so
            the figure is readable, and probe-able by keyboard, before any script runs. Where the
            browser has WebGL2, the reader has not asked for reduced motion or reduced data, and
            the figure is on screen, a renderer written directly against WebGL2 takes over: no
            library, a height field with contour lines drawn in the fragment shader, and picking
            by marching a ray against the surface&rsquo;s own height function. It draws only when
            something changes.
          </p>
        </Section>

        <Meta
          rows={[
            ['model', <a key="m" href={`${SRC}/lib/svi.ts`}>lib/svi.ts</a>],
            ['pricing', <a key="p" href={`${SRC}/lib/bs.ts`}>lib/bs.ts</a>],
            ['tests', <a key="t" href={`${SRC}/tests/svi.test.ts`}>tests/svi.test.ts</a>],
            ['renderer', <a key="r" href={`${SRC}/components/figures/surface/gl.ts`}>components/figures/surface/gl.ts</a>],
            ['data', 'synthetic; parameters set by hand'],
            ['reference', 'Gatheral and Jacquier, Arbitrage-free SVI volatility surfaces, Quantitative Finance 14(1), 2014'],
          ]}
        />
      </article>
    </Shell>
  )
}
