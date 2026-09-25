import Image from 'next/image'
import { Section } from '@/components/CaseStudy'
import { Row, Shell } from '@/components/Layout'
import { ContactLinks } from '@/components/Masthead'
import { OfzCurve } from '@/components/figures/OfzCurve'
import { certifications, education, languages, monitoRounds, roles, SKILLS } from '@/content/experience'
import { pageMeta } from '@/lib/meta'
import { AVAILABILITY, PERSON, POSITIONING, SITE } from '@/lib/site'
import headshot from './headshot.jpg'

export const metadata = pageMeta(
  '/about',
  'About',
  `Experience, education and coursework. ${AVAILABILITY.line}.`,
)

/**
 * The long form of the CV: every role with its detail, the figure that goes
 * with the BCS internship, Monito's competition round by round, education,
 * coursework and skills. /cv is the same facts cut to one printed page.
 */


function MonitoRounds() {
  return (
    <table className="text-note mt-4 w-full border-y border-rule">
      <caption className="sr-only">Monito in the Young Enterprise company programme, round by round</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Round</th>
          <th scope="col">Result</th>
          <th scope="col">Date</th>
        </tr>
      </thead>
      <tbody>
        {monitoRounds.map((r) => (
          <tr key={r.round} className="border-b border-rule last:border-b-0">
            <th scope="row" className="py-1.5 pr-4 text-left font-normal text-graphite">
              {r.round}
            </th>
            <td className="py-1.5 pr-4">{r.result}</td>
            <td className="text-meta py-1.5 text-right font-mono whitespace-nowrap text-graphite">{r.date}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function About() {
  return (
    <Shell>
      <article id="cv">
        <Row
          className="pt-10 lg:pt-16"
          rail={
            <Image
              src={headshot}
              alt={`${PERSON.name}`}
              sizes="(min-width: 64rem) 128px, 88px"
              loading="eager"
              className="h-auto w-[5.5rem] border border-rule lg:ml-auto lg:w-32"
            />
          }
        >
          <h1 className="text-h2 sm:text-h1">About</h1>
          <div className="mt-5 max-w-[37.9rem]">
            <p>
              {POSITIONING} {AVAILABILITY.line}, based in Boston and just as open to{' '}
              {AVAILABILITY.locations
                .filter((l) => !PERSON.base.startsWith(l))
                .join(', ')
                .replace(/, ([^,]*)$/, ' or $1')}
              .
            </p>
            <ContactLinks className="text-note mt-3 text-ink" />
            <p className="text-note mt-1 text-graphite">
              The same record cut to one page: <a href="/cv">the CV</a>.
            </p>
          </div>
          <hr className="mt-8 border-0 border-t border-rule" />
        </Row>

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
                {r.id === 'bcs' ? <OfzCurve inline /> : null}
                {r.id === 'monito' ? <MonitoRounds /> : null}
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
