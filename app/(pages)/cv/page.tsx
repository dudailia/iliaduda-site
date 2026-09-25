import { certifications, education, roles, SKILLS } from '@/content/experience'
import { papers } from '@/content/papers'
import { pageMeta } from '@/lib/meta'
import { AVAILABILITY, PERSON, RESUME, SITE } from '@/lib/site'

export const metadata = pageMeta(
  '/cv',
  'CV',
  `${PERSON.name}: experience, research and education on one page. ${AVAILABILITY.line}.`,
)

/**
 * The public résumé. Same facts as /about and the papers, cut to one sheet,
 * and the source of the PDF the masthead links to: scripts/cv-pdf.mjs prints
 * this route with the print stylesheet at build time and fails the build if
 * it runs to a second page, on Letter or on A4.
 *
 * On screen at tablet width and up it is drawn as the sheet it prints to —
 * every size inside is in em, so the preview is the printed page at a
 * slightly larger scale, line breaks included.
 *
 * Links are absolute, because inside a PDF there is no page to be relative to.
 */

const url = (path = '') => `${SITE.public}${path}`
const MONTH = /\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]+/g
const shortDates = (d: string) => d.replace(MONTH, '$1')
const bare = (href: string) => href.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')

const PROJECTS = papers.filter((p) => p.status === 'published' && p.cv)

function Head({ children }: { children: string }) {
  return <h2 className="cv-h2">{children}</h2>
}

export default function Cv() {
  const contact = [
    { href: `mailto:${PERSON.email}`, label: PERSON.email },
    { href: PERSON.linkedin, label: bare(PERSON.linkedin) },
    { href: PERSON.github, label: bare(PERSON.github) },
    { href: url(), label: bare(url()) },
  ]
  const places = `${AVAILABILITY.locations.slice(0, -1).join(', ')} or ${AVAILABILITY.locations.at(-1)}`

  return (
    <div className="mx-auto w-full max-w-[872px] px-6 pt-8 sm:px-8 md:px-0 lg:pt-12 print:max-w-none print:p-0">
      <p className="text-meta mb-4 flex flex-wrap justify-between gap-x-6 gap-y-1 font-mono text-graphite print:hidden">
        <span>One page · prints to Letter or A4</span>
        <a href={RESUME.pdf} className="text-ink" download>
          Download the PDF
        </a>
      </p>

      <article className="cv">
        <header className="cv-header">
          <h1 className="cv-name">{PERSON.name}</h1>
          <p className="cv-line">
            {AVAILABILITY.line} in {AVAILABILITY.roles.slice(0, -1).join(', ').toLowerCase()} or{' '}
            {AVAILABILITY.roles.at(-1)!.toLowerCase()}; {places}.
          </p>
          <ul className="cv-contact">
            <li>{PERSON.base}</li>
            {contact.map((c) => (
              <li key={c.href}>
                <a href={c.href}>{c.label}</a>
              </li>
            ))}
          </ul>
        </header>

        <section className="cv-section">
          <Head>Education</Head>
          <div>
            <div className="cv-entry-head">
              <p>
                <strong>{education.school}</strong>
              </p>
              <p className="cv-date">{shortDates(education.dates)}</p>
            </div>
            <p>
              {education.degree}. {education.honours}.
            </p>
            <p className="cv-muted">
              Coursework: {education.coursework.map((c) => c.replace(/^[A-Z]{4} \d{4} /, '')).join(', ')}.
            </p>
            <p className="cv-muted">
              {education.school2}. {education.school2Note}.
            </p>
          </div>
        </section>

        <section className="cv-section">
          <Head>Experience</Head>
          <div className="cv-stack">
            {roles.map((r) => (
              <div key={r.id}>
                <div className="cv-entry-head">
                  <p>
                    <strong>{r.org}</strong>
                    <span className="cv-muted">, {r.orgNote}</span>
                    <span className="cv-sep"> · </span>
                    <span>{r.title}</span>
                  </p>
                  <p className="cv-date">{shortDates(r.dates)}</p>
                </div>
                <ul className="cv-bullets">
                  {(r.cv ?? r.detail).map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="cv-section">
          <Head>Research</Head>
          <div className="cv-stack">
            {PROJECTS.map((p) => (
              <p key={p.slug}>
                <strong>
                  <a href={url(p.href)}>{p.cvName ?? p.title}</a>.
                </strong>{' '}
                {p.cv}
              </p>
            ))}
          </div>
        </section>

        <section className="cv-section">
          <Head>Skills</Head>
          <dl className="cv-skills">
            {[...SKILLS, ['Certifications', `${certifications.join('; ')}.`] as const].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </article>
    </div>
  )
}
