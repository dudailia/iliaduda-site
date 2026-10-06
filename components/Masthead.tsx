import { AVAILABILITY, PERSON, POSITIONING, resumeLink } from '@/lib/site'
import { Items, Row, Whole } from './Layout'

/**
 * The home page's first screen, and the only place every hiring essential is
 * stated together: who, what, when, where, and four ways to act on it. It has
 * to fit above the fold at 390x844 with room for the top of Fig. 1, so every
 * line here earns its place or is not here.
 *
 * The status block is a definition list, not a row of badges: the labels sit
 * in the rail on wide screens, exactly where the case studies keep their
 * metadata, so the masthead reads as the issue's front matter rather than as a
 * landing-page hero.
 */

const whole = (place: string) => place.replace(/ /g, '\u00a0')

export function contactLinks() {
  return [
    { href: resumeLink.href, label: resumeLink.label },
    { href: `mailto:${PERSON.email}`, label: PERSON.email },
    { href: PERSON.linkedin, label: 'LinkedIn' },
    { href: PERSON.github, label: 'GitHub' },
  ] as const
}

export function ContactLinks({ className = '' }: { className?: string }) {
  return (
    <ul role="list" className={`flex flex-wrap gap-x-5 gap-y-0 ${className}`}>
      {contactLinks().map((l) => (
        <li key={l.href}>
          {/* The padding is the tap target, not the look: 36px tall at the
              meta size without moving a single glyph. */}
          <a href={l.href} className="inline-block max-w-full min-w-6 py-2 text-center leading-5 [overflow-wrap:anywhere]">
            {l.label}
            {/* On paper a profile link says where it goes, as the site's own links do. */}
            {l.href.startsWith('http') ? <span className="hidden text-graphite print:inline"> ({l.href.replace(/^https?:\/\/(www\.)?/, '')})</span> : null}
          </a>
        </li>
      ))}
    </ul>
  )
}

export function Masthead() {
  const elsewhere = AVAILABILITY.locations.filter((l) => !PERSON.base.startsWith(l))
  const rows = [
    ['Seeking', AVAILABILITY.line],
    ['Roles', AVAILABILITY.roles.join(' · ')],
    [
      'Location',
      // A city's name is never split across two lines ("San / Francisco"); the base is not listed again after it, as on
      // /about ("Based in Boston, MA; open to Boston, …" said it twice).
      `Based in ${PERSON.base}; open to ${elsewhere.slice(0, -1).map(whole).join(', ')} or ${whole(elsewhere.at(-1)!)}`,
    ],
  ] as const

  return (
    <header className="pt-8 sm:pt-14 lg:pt-12 [@media(max-height:30rem)]:pt-6">
      <Row>
        <h1 className="text-h1 lg:text-display">{PERSON.name}</h1>
        {/* The full measure at lg: three lines instead of four, so the front matter and Fig. 1 share a laptop's first screen;
            on a short screen (a phone turned sideways) too, so the contact links are on its first. */}
        {/* Wrapped, not balanced: pretty shortened its last lines into a notch on the first screen. */}
        <p className="mt-4 max-w-[36rem] [text-wrap:wrap] lg:max-w-none [@media(max-height:30rem)]:max-w-none">{POSITIONING}</p>
      </Row>

      <dl className="mt-6 grid grid-cols-[5.25rem_minmax(0,1fr)] gap-x-4 gap-y-2 border-t border-rule pt-5 lg:mt-6 lg:grid-cols-[var(--rail)_minmax(0,var(--measure))] lg:gap-x-(--gutter)">
        {/* Contact second, under Seeking: what a recruiter acts on, on a phone's first screen under the positioning line. */}
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-meta pt-0.5 font-mono text-graphite lg:text-right">{k}</dt>
            <dd className="text-note min-w-0 text-ink">{k === 'Roles' ? <Items items={v} /> : k === 'Seeking' ? <Whole text={v} /> : v}</dd>
            {k === 'Seeking' ? (
              <>
                <dt className="text-meta pt-0.5 font-mono text-graphite lg:text-right">Contact</dt>
                {/* -my-2 takes back the links' own py-2 above and below: the row sits on its label's line, and keeps
                    its tap height. */}
                <dd className="text-note min-w-0 -my-2">
                  <ContactLinks />
                </dd>
              </>
            ) : null}
          </div>
        ))}
      </dl>
    </header>
  )
}
