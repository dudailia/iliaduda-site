import { certifications, education, roles, SKILLS } from '@/content/experience'
import { papers } from '@/content/papers'
import { pageMeta } from '@/lib/meta'
import { AVAILABILITY, CV_PHONE, PERSON, RESUME, SITE, rolesInWords } from '@/lib/site'
import { TAP, Whole } from '@/components/Layout'

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

/**
 * The résumé keeps its own list and order, so a new paper in Contents does not reshuffle it. The one-page sheet holds
 * three: the market (the Hawkes order book, the determinism, the fan and the surface in one frame) took the startup
 * ranking's place, which stays on the site (TODO(owner): the swap is revertible, here).
 */
/** Courses /about lists that the one printed page leaves out, the least quantitative first (the owner's rule: keep the
 * strongest when the sheet is full); the sheet also leaves out /about's notes in brackets (the A-Level transfer credit). */
const CV_DROP = ['MATH 2321', 'FINA 4340', 'FINA 4320']
const CV_ORDER = ['iv-surface', 'cricstate', 'market']
const PROJECTS = papers
  .filter((p) => p.status === 'published' && p.cv && CV_ORDER.includes(p.slug))
  .sort((a, b) => (CV_ORDER.indexOf(a.slug) + 1 || 99) - (CV_ORDER.indexOf(b.slug) + 1 || 99))

function Head({ children }: { children: string }) {
  return <h2 className="cv-h2">{children}</h2>
}

export default function Cv() {
  const contact = [
    { href: `mailto:${PERSON.email}`, label: PERSON.email },
    { href: CV_PHONE.href, label: CV_PHONE.label },
    { href: PERSON.linkedin, label: bare(PERSON.linkedin) },
    { href: PERSON.github, label: bare(PERSON.github) },
    { href: url(), label: bare(url()) },
  ]
  // The base leads the places (so the contact line keeps one row with the phone number in it): based in Boston, open to
  // the others.
  const base = PERSON.base.split(',')[0]!
  const others = AVAILABILITY.locations.filter((l) => l !== base)
  const places = `based in ${base}, open to ${others.slice(0, -1).join(', ')} or ${others.at(-1)}`

  // From lg the sheet is Letter at screen scale (68em at 13.5px, 918px), so its lines break where the printed page's do.
  return (
    <div className="mx-auto w-full max-w-[918px] px-6 pt-8 sm:px-8 lg:px-0 lg:pt-12 print:max-w-none print:p-0">
      <p className="text-meta mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 font-mono text-graphite print:hidden">
        <span>One page · prints to Letter or A4</span>
        {/* Opened, not downloaded: on a phone a download files it away unseen; the reader can save it from the viewer. */}
        <a href={RESUME.pdf} className={`inline-block py-2.5 ${TAP} text-ink`}>
          Open the PDF
        </a>
      </p>

      <article className="cv">
        <header className="cv-header">
          <h1 className="cv-name">{PERSON.name}</h1>
          <p className="cv-line">
            {AVAILABILITY.line} in {rolesInWords()}; {places}.
          </p>
          <ul className="cv-contact">
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
            {/* On screen the honours take their own line: the degree and honours together sit at the sheet's full width,
                so a fallback font (a slow connection, before the webfont) wrapped them and the swap moved the sheet. In
                print, where the page is held to one sheet, they share the line. */}
            <p>
              {education.degree}. <span className="cv-honours">{education.honours}.</span>
            </p>
            <p className="cv-muted">
              Coursework: {education.coursework.filter((c) => !CV_DROP.some((d) => c.startsWith(d))).map((c) => c.replace(/^[A-Z]{4} \d{4} /, '').replace(/ \(.*\)$/, '')).join(', ')}; directed study (
              {education.directedStudy.term}): {education.directedStudy.title}; in progress
              (Fall 2026): {education.inProgress.map((c) => c.replace(/^[A-Z]{4} \d{4} /, '')).join(', ')}.
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
                    {/* The title is one item: it moves to the next line whole rather than breaking inside itself. Its dot
                        hangs in the gap before it (globals.css, .cv-title), so a wrapped head never ends on a dot. */}
                    {/* On screen the note is one item too (globals.css, .cv-note): its last word no longer stays behind
                        beside the title it was held to ("accounting / firms · Founder"). */}
                    <span className="cv-muted">
                      , <span className="cv-note">{r.orgNote}</span>
                      {'\u00a0\u00a0 '}
                    </span>
                    <span className="cv-title">{r.title}</span>
                  </p>
                  <p className="cv-date">{shortDates(r.dates)}</p>
                </div>
                <ul className="cv-bullets">
                  {(r.cv ?? r.detail).map((b) => (
                    <li key={b}>
                      <Whole text={b} />
                    </li>
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
                {p.cv ? <Whole text={p.cv} /> : null}
              </p>
            ))}
          </div>
        </section>

        <section className="cv-section">
          <Head>Skills</Head>
          <dl className="cv-skills">
            {[...SKILLS, ['Certifications', `${certifications.map((c) => c.replace(' — ', '\u00a0— ')).join('; ')}.`] as const].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>
                  <Whole text={v} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </article>
    </div>
  )
}
