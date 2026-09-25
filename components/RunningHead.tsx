import { PERSON, resumeLink } from '@/lib/site'
import { Shell } from './Layout'

/**
 * A journal's running head: whose paper this is and the way back to the
 * contents, on every page except the one that already has the masthead. A
 * reader who lands on a paper from a pasted link should never have to scroll
 * to learn whose site it is or how to reach him.
 *
 * Plain anchors, not next/link: every navigation on this site is a document
 * navigation, so the cross-document view transition runs, and the client
 * router's runtime stays off pages that do not otherwise need it.
 */
export function RunningHead() {
  return (
    // Its own view-transition name: going from one paper to the next, the
    // running head is the same pixels on both pages, so it holds still while
    // the page under it crossfades instead of blinking with it.
    <header className="border-b border-rule print:hidden [view-transition-name:running-head]">
      <Shell>
        <div className="text-meta flex flex-wrap items-baseline justify-between gap-x-6 font-mono">
          <p className="flex items-baseline gap-x-3">
            <a href="/" className="inline-block py-2.5 font-serif no-underline hover:underline text-note text-ink">
              {PERSON.name}
            </a>
            <span className="hidden text-graphite sm:inline">Co-op from January 2027</span>
          </p>
          <nav aria-label="Site">
            <ul className="flex gap-x-4">
              <li>
                <a href="/#contents" className="inline-block py-2.5">
                  Contents
                </a>
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
