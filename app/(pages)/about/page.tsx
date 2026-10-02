import { Section } from '@/components/CaseStudy'
import { Items, Row, Shell, Whole } from '@/components/Layout'
import { ContactLinks } from '@/components/Masthead'
import { OfzCurve } from '@/components/figures/OfzCurve'
import { certifications, education, monitoRounds, roles, SKILLS } from '@/content/experience'
import { otherWork, papers } from '@/content/papers'
import { pageMeta } from '@/lib/meta'
import { AVAILABILITY, PERSON, POSITIONING, SITE, rolesInWords } from '@/lib/site'
import avif176 from './headshot-176.avif'
import avif256 from './headshot-256.avif'
import webp176 from './headshot-176.webp'
import webp256 from './headshot-256.webp'

export const metadata = pageMeta(
  '/about',
  'About',
  `Experience, education and coursework. ${AVAILABILITY.line}.`,
)

/** The research papers, the market's three first (the record's quantitative work leads, as on the CV). */
const RESEARCH = ['market', 'order-book', 'iv-surface', 'cricstate', 'startup-investments']
const other = otherWork.filter((o) => !roles.some((r) => r.href === o.href))
const research = RESEARCH.map((slug) => papers.find((p) => p.slug === slug && p.status === 'published')).filter((p) => p !== undefined)

/**
 * The long form of the CV: every role with its detail, the figure that goes
 * with the BCS internship, Monito's competition round by round, education,
 * coursework and skills. /cv is the same facts cut to one printed page.
 */


function MonitoRounds() {
  // Result, region, date. On a phone the region folds under its result: three
  // columns at 390px broke "Worcestershire and Warwickshire" over three lines.
  return (
    // The rules on a wrapper: WebKit cut the table's own top border short where its hidden header cell sits.
    <div className="mt-4 border-y border-rule">
    <table className="text-note w-full">
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
              <span className="text-meta block text-graphite sm:hidden">{r.round}</span>
            </th>
            <td className="hidden py-1.5 pr-4 align-baseline text-graphite sm:table-cell">{r.round}</td>
            <td className="text-meta py-1.5 text-right align-baseline font-mono whitespace-nowrap text-graphite">{r.date}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  )
}

export default function About() {
  return (
    <Shell>
      <article id="cv">
        <Row
          className="pt-6 sm:pt-10 lg:pt-16"
          rail={
            // A plain <picture>, encoded once at build size in AVIF and WebP:
            // next/image would add its client runtime to this page for one
            // 3 KB portrait.
            <picture>
              <source
                type="image/avif"
                srcSet={`${avif176.src} 176w, ${avif256.src} 256w`}
                sizes="(min-width: 64rem) 128px, (min-width: 40rem) 88px, 56px"
              />
              <img
                src={webp256.src}
                srcSet={`${webp176.src} 176w, ${webp256.src} 256w`}
                sizes="(min-width: 64rem) 128px, (min-width: 40rem) 88px, 56px"
                width={128}
                height={160}
                alt={PERSON.name}
                decoding="async"
                // Smaller on a phone, so a 360×800 screen still ends on the contact links: the portrait above the name
                // and the lede had pushed LinkedIn and GitHub below its fold.
                className="h-auto w-14 border border-rule sm:w-[5.5rem] lg:ml-auto lg:w-32 dark:brightness-90"
              />
            </picture>
          }
        >
          {/* The person, not the word: /about is a landing page from LinkedIn and email (its tab still says About). */}
          <h1 className="text-h2 sm:text-h1">{PERSON.name}</h1>
          <div className="mt-5 max-w-[37.9rem]">
            <p>
              {/* What he is looking for, on the first screen as on the home page and the CV: the roles as well as when. */}
              {POSITIONING} {AVAILABILITY.line} in {rolesInWords()}, based in Boston and just as open to{' '}
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
                <h3 className="text-body font-semibold tracking-normal print:break-after-avoid">
                  {r.org}
                  <span className="font-normal text-graphite">, {r.orgNote}</span>
                </h3>
                <p className="text-meta mt-0.5 font-mono text-graphite print:break-after-avoid">
                  <Items items={[r.title, r.place, r.dates]} />
                </p>
                {r.draft && SITE.isProduction ? null : (
                  <ul className="mt-2 grid list-disc gap-y-1 pl-5 marker:text-graphite">
                    {r.detail.map((d) => (
                      <li key={d}>
                        <Whole text={d} />
                      </li>
                    ))}
                  </ul>
                )}
                {r.draft && !SITE.isProduction ? (
                  <p className="text-meta mt-2 font-mono text-graphite">{r.draft}</p>
                ) : null}
                {r.href ? (
                  <p className="text-note mt-2">
                    <a href={r.href} className="inline-block py-1 whitespace-nowrap">
                      Read the paper<span className="sr-only">: {r.org}</span>
                    </a>
                  </p>
                ) : null}
                {r.id === 'bcs' ? <OfzCurve inline /> : null}
                {r.id === 'monito' ? <MonitoRounds /> : null}
              </li>
            ))}
          </ol>
        </Section>

        <Section heading="Research">
          <ol className="grid list-none gap-y-5">
            {research.map((p) => (
              <li key={p.slug}>
                <h3 className="text-body font-semibold tracking-normal">
                  <a href={p.href}>{p.title}</a>
                </h3>
                <p className="text-meta mt-0.5 font-mono text-graphite">
                  <Items items={p.byline} />
                </p>
                <p className="mt-1.5">
                  <Whole text={p.dek} />
                </p>
              </li>
            ))}
          </ol>
        </Section>

        {/* Work the Experience entries do not already link, so the footer is not its only mention. */}
        {other.length ? (
          <Section heading="Other work">
            <ol className="grid list-none gap-y-5">
              {other.map((o) => (
                <li key={o.slug}>
                  <h3 className="text-body font-semibold tracking-normal">
                    <a href={o.href}>{o.name}</a>
                  </h3>
                  <p className="text-meta mt-0.5 font-mono text-graphite">
                    <Items items={o.status} />
                  </p>
                  <p className="mt-1.5">{o.what}.</p>
                </li>
              ))}
            </ol>
          </Section>
        ) : null}

        <Section heading="Education" id="education">
          <h3 className="text-body font-semibold tracking-normal">{education.school}</h3>
          {/* Wrapped between its items, not balanced (pretty pulled the degree's last word down onto the dates). */}
          <p className="text-meta mt-0.5 font-mono text-graphite [text-wrap:wrap]">
            <Items items={[education.degree, education.dates]} />
          </p>
          <p className="mt-2">{education.honours}.</p>
          <p className="text-meta mt-5 font-mono text-graphite">Coursework</p>
          <ul className="mt-1.5 grid list-none gap-y-2 sm:grid-cols-2 sm:gap-x-8">
            {education.coursework.map((c) => (
              <li key={c}>
                <Whole text={c} />
              </li>
            ))}
          </ul>
          <p className="mt-4">
            Directed study, {education.directedStudy.code} ({education.directedStudy.term}):{' '}
            {education.directedStudy.title}. {education.directedStudy.detail}
          </p>
          <p className="text-meta mt-4 font-mono text-graphite">In progress, Fall 2026</p>
          <ul className="mt-1.5 grid list-none gap-y-2 sm:grid-cols-2 sm:gap-x-8">
            {education.inProgress.map((c) => (
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
