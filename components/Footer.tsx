import { otherWork, visiblePapers } from '@/content/papers'

const CURRENT = `document.currentScript.closest('footer').querySelectorAll('nav a[href]').forEach(function(a){if(a.getAttribute('href')===location.pathname)a.setAttribute('aria-current','page')})`
import { AVAILABILITY, SITE } from '@/lib/site'
import { Row, Shell } from './Layout'
import { ContactLinks } from './Masthead'

/**
 * Every page ends on the ask, not on a colophon: the end of a visit is the
 * part a reader remembers, so it says what Ilia is looking for and how to
 * reach him, then lists the papers, then — last and smallest — how the site is
 * built.
 */
export function Footer() {
  const papers = visiblePapers(SITE.isProduction)
  return (
    <footer className="mt-24 border-t border-rule py-12 lg:mt-32 print:hidden">
      <Shell>
        <Row rail="Contact">
          <p className="max-w-[36rem]">
            {AVAILABILITY.line}, in quant and risk, investments, investment banking or data
            science in finance. The fastest way to reach me is email.
          </p>
          <ContactLinks className="text-note mt-3" />
        </Row>
        <div className="h-10" />
        <Row rail="Papers">
          <nav aria-label="Papers">
            <ul className="text-note grid gap-y-1.5 sm:grid-cols-2 sm:gap-x-8">
              {papers.map((p) => (
                <li key={p.href}>
                  <a href={p.href} className="inline-block py-1 aria-[current=page]:text-ink aria-[current=page]:no-underline">
                    {p.title}
                  </a>
                </li>
              ))}
              {otherWork.map((o) => (
                <li key={o.href}>
                  <a href={o.href} className="inline-block py-1 aria-[current=page]:text-ink aria-[current=page]:no-underline">
                    {o.name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </Row>
        <div className="h-6" />
        <Row rail="Pages">
          <nav aria-label="Pages">
            <ul className="text-note flex flex-wrap gap-x-8 gap-y-1.5">
              <li>
                <a href="/about" className="inline-block py-1 aria-[current=page]:text-ink aria-[current=page]:no-underline">
                  About
                </a>
              </li>
              <li>
                <a href="/cv" className="inline-block py-1 aria-[current=page]:text-ink aria-[current=page]:no-underline">
                  CV
                </a>
              </li>
            </ul>
          </nav>
        </Row>
        <div className="h-10" />
        <Row rail="Colophon">
          <p className="text-note max-w-[36rem] text-graphite">
            Set in Source Serif 4 and Source Code Pro, both self-hosted. No third-party requests;
            visits are counted by Vercel Web Analytics, from this site&rsquo;s own address and without cookies.{' '}
            <a href="https://github.com/dudailia/iliaduda-site">Source on GitHub</a>.
          </p>
        </Row>
        {/* The page the reader is on is marked in the footer's lists: the footer is the same on every page, so the
            browser marks it, as soon as the lists are parsed. */}
        <script dangerouslySetInnerHTML={{ __html: CURRENT }} />
      </Shell>
    </footer>
  )
}
