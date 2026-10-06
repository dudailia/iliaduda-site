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
    // The rules on a wrapper: WebKit cut the table's own top border short where its hidden header cell sits. On paper the
    // table is whole and goes with the entry it belongs to (on A4 it opened a sheet alone, under no heading).
    <div className="mt-4 border-y border-rule print:break-before-avoid print:break-inside-avoid">
    <table className="text-note w-full">
      <caption className="sr-only">Monito in the Young Enterprise company program, round by round</caption>
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

/**
 * The portrait: a plain <picture>, encoded once at build size in AVIF and WebP (next/image would add its client
 * runtime to this page for one 3 KB portrait). Drawn twice, the margin's and a phone's, each shown at its own width;
 * the two ask for the same files, so they are fetched once.
 */
function Portrait({ className, size }: { className: string; size: string }) {
  return (
    <picture className={className}>
      <source type="image/avif" srcSet={`${avif176.src} 176w, ${avif256.src} 256w`} sizes="(min-width: 64rem) 128px, (min-width: 40rem) 88px, 56px" />
      <img
        src={webp256.src}
        srcSet={`${webp176.src} 176w, ${webp256.src} 256w`}
        sizes="(min-width: 64rem) 128px, (min-width: 40rem) 88px, 56px"
        width={128}
        height={160}
        alt={PERSON.name}
        decoding="async"
        className={`${size} border border-rule dark:brightness-90 print:brightness-100`}
      />
    </picture>
  )
}

export default function About() {
  return (
    <Shell>
      <article id="cv">
        <Row
          className="pt-6 sm:pt-10 lg:pt-16"
          // From sm the portrait stands in the margin; on a phone beside the name instead (portrait component below), so
          // the first screen still ends on the contact links at 360×800 (stacked above the name it cost ~150px).
          rail={<Portrait className="hidden sm:block" size="h-auto w-[5.5rem] lg:ml-auto lg:w-32" />}
        >
          {/* The person, not the word: /about is a landing page from LinkedIn and email (its tab still says About). */}
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-h2 sm:text-h1">{PERSON.name}</h1>
            <Portrait className="shrink-0 sm:hidden" size="h-auto w-14" />
          </div>
          <div className="mt-5 max-w-[37.9rem]">
            <p>{POSITIONING}</p>
            {/* What he is looking for, on the first screen as on the home page and the CV, the roles as well as when: a
                paragraph of its own, so on a phone the ask does not start at the eleventh line of one long lede. */}
            <p className="mt-2 sm:mt-[1.05em]">
              {AVAILABILITY.line} in {rolesInWords()}, based in Boston and just as open to{' '}
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
                    {/* Named with its paper in one string: an sr-only span was read as "Read the paper : X". */}
                    <a href={r.href} aria-label={`Read the paper: ${r.org}`} className="inline-block py-1 whitespace-nowrap">
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

        <Section heading="Research">
          <ol className="grid list-none gap-y-5">
            {research.map((p) => (
              <li key={p.slug}>
                {/* On paper an entry's title and byline go with its description (A4 left one closing a sheet alone). */}
                <h3 className="text-body font-semibold tracking-normal print:break-after-avoid">
                  <a href={p.href}>{p.title}</a>
                </h3>
                <p className="text-meta mt-0.5 font-mono text-graphite print:break-after-avoid">
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
                  <h3 className="text-body font-semibold tracking-normal print:break-after-avoid">
                    <a href={o.href}>{o.name}</a>
                  </h3>
                  <p className="text-meta mt-0.5 font-mono text-graphite print:break-after-avoid">
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
          {/* One column: in two, nine of the ten course names wrapped onto two or three lines. */}
          <ul className="mt-1.5 grid list-none gap-y-2">
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
          {/* One column, as the coursework above: in two, "Interest Theory and Life Insurance" wrapped. */}
          <ul className="mt-1.5 grid list-none gap-y-2">
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
