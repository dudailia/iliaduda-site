import { AVAILABILITY, PERSON, POSITIONING, resumeLink } from '@/lib/site'
import { Row } from './Layout'

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
    <ul className={`flex flex-wrap gap-x-5 gap-y-0 ${className}`}>
      {contactLinks().map((l) => (
        <li key={l.href}>
          {/* The padding is the tap target, not the look: 36px tall at the
              meta size without moving a single glyph. */}
          <a href={l.href} className="inline-block min-w-6 py-2 text-center leading-5">
            {l.label}
          </a>
        </li>
      ))}
    </ul>
  )
}

export function Masthead() {
  const rows = [
    ['Seeking', AVAILABILITY.line],
    ['Roles', AVAILABILITY.roles.join(' · ')],
    [
      'Location',
      `Based in ${PERSON.base}; open to ${AVAILABILITY.locations.slice(0, -1).join(', ')} or ${AVAILABILITY.locations.at(-1)}`,
    ],
  ] as const

  return (
    <header className="pt-10 sm:pt-14 lg:pt-20">
      <Row>
        <h1 className="text-h1 lg:text-display">{PERSON.name}</h1>
        <p className="mt-4 max-w-[36rem]">{POSITIONING}</p>
      </Row>

      <dl className="mt-7 grid grid-cols-[5.25rem_minmax(0,1fr)] gap-x-4 gap-y-2 border-t border-rule pt-5 lg:mt-9 lg:grid-cols-[var(--rail)_minmax(0,var(--measure))] lg:gap-x-(--gutter)">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-meta pt-0.5 font-mono text-graphite lg:text-right">{k}</dt>
            <dd className="text-note min-w-0 text-ink">{v}</dd>
          </div>
        ))}
        <dt className="text-meta pt-2.5 font-mono text-graphite lg:text-right">Contact</dt>
        <dd className="text-note min-w-0 -mt-1">
          <ContactLinks />
        </dd>
      </dl>
    </header>
  )
}
