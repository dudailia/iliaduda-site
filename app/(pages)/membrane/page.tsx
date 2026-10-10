import { CaseStudyTitle, Meta, Section } from '@/components/CaseStudy'
import { Annotated, Shell } from '@/components/Layout'
import { MembraneConvergence } from '@/components/figures/MembraneConvergence'
import { MembraneFigure } from '@/components/figures/Membrane'
import { papers } from '@/content/papers'
import { besselZeros } from '@/lib/membrane/bessel'
import { pageMeta } from '@/lib/meta'
import { SOURCE } from '@/lib/site'

const paper = papers.find((p) => p.slug === 'membrane')!

export const metadata = pageMeta('/membrane', paper.title, paper.description)

const SRC = SOURCE

export default function Membrane() {
  const z0 = besselZeros(0, 3)
  const ratio = (z0[1]! / z0[0]!).toFixed(3)
  return (
    <Shell>
      <article>
        <CaseStudyTitle byline={paper.byline} level="h1" title={paper.title} standfirst={<p>{paper.standfirst ?? paper.abstract}</p>} />

        <MembraneFigure />

        <Section heading="What it shows">
          <p>
            A drum is a membrane stretched over a circle and fixed at its rim. Struck, or released from a shape, it
            vibrates as a sum of modes: patterns that each keep their shape and only grow and shrink in time, each at its
            own frequency. The figure is that sum, kept to as many modes as the reader chooses, for the initial shapes of
            the directed study&rsquo;s exercises. The exercises worked each expansion to two terms by hand; the figure keeps
            up to twenty, so the effect of every further term can be seen.
          </p>
          <Annotated
            note={
              <>
                λ<sub>0,2</sub> / λ<sub>0,1</sub> = {z0[1]!.toFixed(4)} / {z0[0]!.toFixed(4)} = {ratio}. A string&rsquo;s would be 2.
              </>
            }
          >
            <p>
              The drum&rsquo;s modes do not ring in tune with one another, as a string&rsquo;s do. A string&rsquo;s
              frequencies are whole multiples of its lowest; a drum&rsquo;s are set by the zeros of Bessel functions, and
              the second axisymmetric one is {ratio} times the first, not twice it. That is why a drum sounds as a drum.
            </p>
          </Annotated>
        </Section>

        <Section heading="The mathematics">
          <p>
            The membrane&rsquo;s height u(r, θ, t) satisfies the wave equation in polar coordinates, with u = 0 on the rim.
            Separating variables, writing u as a product of a function of r, one of θ and one of t, gives a sine or cosine
            of nθ round the drum, a sine or cosine of λt in time, and Bessel&rsquo;s equation of order n across it, whose
            solutions bounded at the centre are J<sub>n</sub>(λr). The rim being fixed asks J<sub>n</sub>(λ) = 0: the allowed
            λ are the zeros of J<sub>n</sub>, and they are the drum&rsquo;s frequencies.
          </p>
          <p>
            An initial displacement f and velocity g expand in these modes. Across the drum the modes are orthogonal with
            weight r, so each coefficient is found on its own: the integral of the shape&rsquo;s radial profile against
            J<sub>n</sub>(λr), with weight r, divided by the same integral of the mode&rsquo;s square, which is half of
            J<sub>n+1</sub>(λ)<sup>2</sup>. The displacement&rsquo;s coefficients ring as cos λt; the velocity&rsquo;s, divided
            by λ, as sin λt.
          </p>
        </Section>

        <MembraneConvergence />

        <Section heading="The exercises">
          <p>
            Four drums from the course&rsquo;s section on the circular membrane: released from 2 sin 2θ, set moving with
            velocity −cos θ, released from r sin θ, and set moving with velocity (r − 1) cos 2θ. Each has a single angular
            order, so only the Bessel function of that order appears. The four radial profiles of the section on Bessel
            series, f(r) = 1, 2r + 1, 1 − 3r and a step from 3 to 1 at half the radius (the section writes x for r), were
            expansions on a line; Fig. 2 shows them as the exercises do, in J<sub>0</sub> and J<sub>1</sub>, and the drum
            also strikes them as initial shapes.
          </p>
        </Section>

        <Section heading="How it is computed and tested">
          <p>
            Everything is computed in the page, in TypeScript with no library. J<sub>n</sub> comes from Miller&rsquo;s backward
            recurrence, normalised by the sum identity; the zeros by a scan for each change of sign, closed by bisection;
            the coefficients by Gauss–Legendre quadrature, split where a profile jumps. The tests hold the Bessel functions
            and their zeros to SciPy&rsquo;s values within 10<sup>−12</sup>, check the modes&rsquo; orthogonality, check that a pure
            mode expands to itself, that the error never grows as modes are added, that the drum&rsquo;s energy is the same
            at every moment, and that the exercises&rsquo; two-term coefficients come out to four places.
          </p>
          <p>
            The drum is drawn with WebGL2: its heights are summed on the processor every frame from a table of J<sub>n</sub>(λr)
            made once per shape, and lit as the implied-volatility surface on this site is. Where the drum does not run
            live, its still frame is the same solution, drawn, and every control still redraws it.
          </p>
        </Section>

        <Meta
          rows={[
            ['Bessel\u00a0functions', <a key="b" href={`${SRC}/lib/membrane/bessel.ts`}>lib/membrane/bessel.ts</a>],
            ['the drum', <a key="e" href={`${SRC}/lib/membrane/expand.ts`}>lib/membrane/expand.ts</a>],
            [
              'tests',
              <span key="t">
                <span className="inline-block max-w-full"><a className="inline-block max-w-full py-0.5 [overflow-wrap:anywhere]" href={`${SRC}/tests/membrane-bessel.test.ts`}>tests/membrane-bessel.test.ts</a>{'\u00a0·'}</span>{' '}
                <a className="inline-block max-w-full py-0.5 [overflow-wrap:anywhere]" href={`${SRC}/tests/membrane-expand.test.ts`}>tests/membrane-expand.test.ts</a>
              </span>,
            ],
            [
              'renderer',
              <a key="r" href={`${SRC}/components/figures/membrane/renderer.ts`}>
                {/* The line may break after the last slash, never inside the file's name. */}
                components/figures/membrane/<wbr />
                <span className="whitespace-nowrap">renderer.ts</span>
              </a>,
            ],
            ['course', 'MATH 4992, directed study, Northeastern University, Spring 2026'],
          ]}
        />
      </article>
    </Shell>
  )
}
