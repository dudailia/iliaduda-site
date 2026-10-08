import { PERSON, resumeLink } from '@/lib/site'
import { Shell, TAP } from './Layout'

// The page a reader is on, marked as the footer marks it (the About link on /about).
const CURRENT = `document.currentScript.closest('header').querySelectorAll('nav a[href]').forEach(function(a){if(a.getAttribute('href')===location.pathname)a.setAttribute('aria-current','page')})`

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
            <a href="/" className={`inline-block py-2.5 ${TAP} font-serif -mx-1 px-1 focus-visible:outline-offset-[-2px] underline decoration-transparent hover:decoration-ink text-note text-ink`}>
              {PERSON.name}
            </a>
            {/* The one thing a recruiter on a phone most needs, in the room a phone has: the head takes two lines there. */}
            <span className="text-graphite">
              <span className="sm:hidden">Co-op Jan 2027</span>
              <span className="hidden sm:inline">Co-op from January 2027</span>
            </span>
          </p>
          <nav aria-label="Site">
            {/* Under 18.5rem (a 360px phone at a 130% font size) closer and from the left: its four links then share a
                line, where "Email" stood alone on a third. */}
            <ul className="flex flex-wrap justify-end gap-x-4 max-[18.5rem]:justify-start max-[18.5rem]:gap-x-3">
              <li>
                <a href="/#contents" className={`inline-block py-2.5 ${TAP} -mx-1 px-1 focus-visible:outline-offset-[-2px]`}>
                  Contents
                </a>
              </li>
              {/* Who this is, from any page: a reader landing on a paper from a link reaches it without the footer. */}
              <li>
                <a href="/about" className={`inline-block py-2.5 ${TAP} -mx-1 px-1 focus-visible:outline-offset-[-2px] aria-[current=page]:text-ink aria-[current=page]:no-underline`}>
                  About
                </a>
              </li>
              <li>
                <a href={resumeLink.href} className={`inline-block min-w-6 py-2.5 ${TAP} text-center -mx-1 px-1 focus-visible:outline-offset-[-2px]`}>
                  {resumeLink.label}
                </a>
              </li>
              <li>
                <a href={`mailto:${PERSON.email}`} className={`inline-block py-2.5 ${TAP} -mx-1 px-1 focus-visible:outline-offset-[-2px]`}>
                  Email
                </a>
              </li>
            </ul>
          </nav>
          <script dangerouslySetInnerHTML={{ __html: CURRENT }} />
        </div>
      </Shell>
    </header>
  )
}
