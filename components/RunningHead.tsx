import Link from 'next/link'
import { PERSON, resumeLink } from '@/lib/site'
import { Shell } from './Layout'

/**
 * A journal's running head: whose paper this is and the way back to the
 * contents, on every page except the one that already has the masthead. A
 * reader who lands on a paper from a pasted link should never have to scroll
 * to learn whose site it is or how to reach him.
 */
export function RunningHead() {
  return (
    <header className="border-b border-rule print:hidden">
      <Shell>
        <div className="text-meta flex flex-wrap items-baseline justify-between gap-x-6 font-mono">
          <p className="flex items-baseline gap-x-3">
            <Link prefetch={false} href="/" className="inline-block py-2.5 font-serif no-underline hover:underline text-note text-ink">
              {PERSON.name}
            </Link>
            <span className="hidden text-graphite sm:inline">Co-op from January 2027</span>
          </p>
          <nav aria-label="Site">
            <ul className="flex gap-x-4">
              <li>
                <Link prefetch={false} href="/#contents" className="inline-block py-2.5">
                  Contents
                </Link>
              </li>
              <li>
                <a href={resumeLink.href} className="inline-block min-w-6 py-2.5 text-center">
                  {resumeLink.label}
                </a>
              </li>
              <li>
                <a href={`mailto:${PERSON.email}`} className="inline-block py-2.5">
                  Email
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </Shell>
    </header>
  )
}
