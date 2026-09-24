import { CaseStudyTitle, Section } from '@/components/CaseStudy'
import { Shell } from '@/components/Layout'
import { ContactLinks } from '@/components/Masthead'
import { certifications, education, languages, roles } from '@/content/experience'
import { pageMeta } from '@/lib/meta'
import { AVAILABILITY, POSITIONING, SITE } from '@/lib/site'

export const metadata = pageMeta(
  '/about',
  'About and CV',
  `Experience, education and coursework. ${AVAILABILITY.line}.`,
)

/**
 * The CV in the site's own register. The masthead's résumé link points here
 * until the PDF exists, so this page has to stand in for it completely:
 * experience, education, coursework, skills, and how to get in touch.
 */

const SKILLS = [
  [
    'Quantitative',
    'Options pricing (Black–Scholes), Greeks, volatility surface modelling, portfolio construction, Fama–French and CAPM regression, isotonic calibration, leakage auditing, bootstrap inference, hypothesis testing.',
  ],
  [
    'Programming',
    'Python (pandas, NumPy, SciPy, scikit-learn, PyTorch, matplotlib), SQL, TypeScript, JavaScript, React, Next.js, Node, PostgreSQL and Supabase, Stripe, the Anthropic API, Git. Deploys on Vercel, Fly.io and Yandex Cloud. Excel financial modelling.',
  ],
] as const

export default function About() {
  return (
    <Shell>
      <article id="cv">
        <CaseStudyTitle
          level="h1"
          title="About and CV"
          standfirst={
            <>
              <p>
                {POSITIONING} {AVAILABILITY.line}; based in Boston and open to{' '}
                {AVAILABILITY.locations.join(', ').replace(/, ([^,]*)$/, ' or $1')}.
              </p>
              <ContactLinks className="text-note mt-3 text-ink" />
            </>
          }
        />

        <Section heading="Experience">
          <ol className="grid list-none gap-y-8">
            {roles.map((r) => (
              <li key={r.id} id={r.id}>
                <h3 className="text-body font-semibold tracking-normal">
                  {r.org}
                  <span className="font-normal text-graphite">, {r.orgNote}</span>
                </h3>
                <p className="text-meta mt-0.5 font-mono text-graphite">
                  {[r.title, r.place, r.dates].filter(Boolean).join(' · ')}
                </p>
                {r.draft && SITE.isProduction ? null : (
                  <ul className="mt-2 grid list-disc gap-y-1 pl-5 marker:text-graphite">
                    {r.detail.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                )}
                {r.draft && !SITE.isProduction ? (
                  <p className="text-meta mt-2 font-mono text-graphite">{r.draft}</p>
                ) : null}
                {r.href ? (
                  <p className="text-note mt-2">
                    <a href={r.href}>Read the paper</a>
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </Section>

        <Section heading="Education" id="education">
          <h3 className="text-body font-semibold tracking-normal">{education.school}</h3>
          <p className="text-meta mt-0.5 font-mono text-graphite">
            {education.degree} · {education.dates}
          </p>
          <p className="mt-2">{education.honours}.</p>
          <p className="text-meta mt-5 font-mono text-graphite">Quantitative coursework</p>
          <ul className="mt-1.5 grid list-none gap-y-0.5 sm:grid-cols-2 sm:gap-x-8">
            {education.coursework.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p className="mt-5">
            {education.school2}. {education.school2Note}.
          </p>
        </Section>

        <Section heading="Skills">
          <dl className="grid gap-y-3">
            {SKILLS.map(([k, v]) => (
              <div key={k}>
                <dt className="text-meta font-mono text-graphite">{k}</dt>
                <dd className="mt-0.5">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section heading="Certifications">
          <ul className="grid list-none gap-y-0.5">
            {certifications.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p className="mt-4">{languages}</p>
        </Section>
      </article>
    </Shell>
  )
}
