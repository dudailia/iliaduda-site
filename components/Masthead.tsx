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
          {/* The padding is the tap target, not the look: 36px tall at the meta size without moving a single glyph, and
              44px under a finger (its 20px line and 12px above and below). */}
          <a href={l.href} className="inline-block max-w-full min-w-6 py-2 text-left leading-5 [overflow-wrap:anywhere] pointer-coarse:py-3">
            {/* An address breaks after its @ where the column is narrower than it (320px and less): not mid-domain. */}
            {l.label.includes('@') ? (
              <>
                {l.label.slice(0, l.label.indexOf('@') + 1)}
                <wbr />
                {l.label.slice(l.label.indexOf('@') + 1)}
              </>
            ) : (
              l.label
            )}
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
    <header className="pt-8 sm:pt-14 lg:pt-12 [@media(max-height:30rem)]:pt-4 low:pt-4 flat:pt-4">
      <Row>
        {/* Under 21rem tall (a phone turned sideways at a large font size, or an iPhone SE's 326px) a step smaller, so the
            contact links reach the first screen: at 130% they stood 55px under it. */}
        <h1 className="text-h1 lg:text-display flat:text-h1 [@media(max-height:21rem)]:text-h2">{PERSON.name}</h1>
        {/* The full measure at lg: three lines instead of four, so the front matter and Fig. 1 share a laptop's first screen;
            on a short screen (a phone turned sideways) too, so the contact links are on its first. */}
        {/* Wrapped, not balanced: pretty shortened its last lines into a notch on the first screen. */}
        {/* On a screen under 600px tall (an iPhone SE) the line is set at the note size and the head closes up, so every
            contact link is on the first screen (at 17px only "CV (PDF)" was, across the fold). The SE turned sideways
            too (326px tall): at 19px the line took six lines and Contact began under the screen. */}
        <p className="mt-4 max-w-[36rem] [text-wrap:wrap] lg:max-w-none [@media(max-height:30rem)]:max-w-(--measure) low:text-note low:mt-3 short:mt-3 flat:mt-3 [@media(max-height:21rem)]:text-note">{POSITIONING}</p>
      </Row>

      <dl className="mt-6 grid grid-cols-[5.25rem_minmax(0,1fr)] gap-x-4 gap-y-2 border-t border-rule pt-5 low:mt-4 low:pt-3 short:mt-4 short:pt-3 lg:mt-6 flat:mt-3 flat:pt-3 lg:grid-cols-[var(--rail)_minmax(0,var(--measure))] lg:gap-x-(--gutter)">
        {/* Contact second, under Seeking: what a recruiter acts on, on a phone's first screen under the positioning line. */}
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-meta pt-0.5 font-mono text-graphite lg:text-right">{k}</dt>
            <dd className="text-note min-w-0 text-ink">{k === 'Roles' ? <Items items={v} /> : k === 'Seeking' ? <Whole text={v} /> : v}</dd>
            {k === 'Seeking' ? (
              <>
                <dt className="text-meta pt-0.5 font-mono text-graphite lg:text-right">Contact</dt>
                {/* -my-2 takes back the links' own py-2 above and below: the row sits on its label's line. Under a
                    finger only above (-mt-3 their py-3): stacked 44px apart, three lines of links read as three loose
                    rows when Roles came as close under them as they stand to each other, so their last 12px is kept. */}
                <dd className="text-note min-w-0 -my-2 pointer-coarse:-mt-3 pointer-coarse:mb-0">
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
