import { Section } from '@/components/CaseStudy'
import { Items, Row, Shell } from '@/components/Layout'
import { ContactLinks } from '@/components/Masthead'
import { OfzCurve } from '@/components/figures/OfzCurve'
import { certifications, education, monitoRounds, roles, SKILLS } from '@/content/experience'
import { pageMeta } from '@/lib/meta'
import { AVAILABILITY, PERSON, POSITIONING, SITE } from '@/lib/site'
import avif176 from './headshot-176.avif'
import avif256 from './headshot-256.avif'
import webp176 from './headshot-176.webp'
import webp256 from './headshot-256.webp'

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
  // Result, region, date. On a phone the region folds under its result: three
  // columns at 390px broke "Worcestershire and Warwickshire" over three lines.
  return (
    <table className="text-note mt-4 w-full border-y border-rule">
      <caption className="sr-only">Monito in the Young Enterprise company programme, round by round</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Result</th>
          <th scope="col" className="hidden sm:table-cell">
            Round
          </th>
          <th scope="col">Date</th>
        </tr>
      </thead>
      <tbody>
        {monitoRounds.map((r) => (
          <tr key={r.round} className="border-b border-rule last:border-b-0">
            <th scope="row" className="py-1.5 pr-4 text-left align-baseline font-normal">
              {r.result}
              <span className="text-meta block font-mono text-graphite sm:hidden">{r.round}</span>
            </th>
            <td className="hidden py-1.5 pr-4 align-baseline text-graphite sm:table-cell">{r.round}</td>
            <td className="text-meta py-1.5 text-right align-baseline font-mono whitespace-nowrap text-graphite">{r.date}</td>
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
            // A plain <picture>, encoded once at build size in AVIF and WebP:
            // next/image would add its client runtime to this page for one
            // 3 KB portrait.
            <picture>
              <source
                type="image/avif"
                srcSet={`${avif176.src} 176w, ${avif256.src} 256w`}
                sizes="(min-width: 64rem) 128px, 88px"
              />
              <img
                src={webp256.src}
                srcSet={`${webp176.src} 176w, ${webp256.src} 256w`}
                sizes="(min-width: 64rem) 128px, 88px"
                width={128}
                height={160}
                alt={PERSON.name}
                decoding="async"
                className="h-auto w-[5.5rem] border border-rule lg:ml-auto lg:w-32"
              />
            </picture>
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
                  <Items items={[r.title, r.place, r.dates]} />
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
                    <a href={r.href} className="whitespace-nowrap">
                      Read the paper
                    </a>
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
            <Items items={[education.degree, education.dates]} />
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
        </Section>
      </article>
    </Shell>
  )
}
