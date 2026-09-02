import { Row, Shell } from './Layout'

const NAV = [
  ['cricstate', '/#cricstate'],
  ['CloseBooks', '/closebooks'],
  ['Glacier Capital Systems', '/glacier'],
  ['Debt-settlement portal', '/digital-group'],
  ['AdConfirm', '/adconfirm'],
  ['Startup investment analysis', '/startup-investments'],
  ['nucarbon', '/nucarbon'],
] as const

const ELSEWHERE = [
  ['duda.i@northeastern.edu', 'mailto:duda.i@northeastern.edu'],
  ['github.com/dudailia', 'https://github.com/dudailia'],
  ['linkedin.com/in/ilia-duda', 'https://www.linkedin.com/in/ilia-duda'],
] as const

/**
 * Navigation lives here rather than in a sticky header. A header would put site
 * chrome above the measurement, and the measurement is the only thing that
 * needs to be above the fold.
 */
export function Footer() {
  return (
    <footer className="mt-24 border-t border-rule py-12 lg:mt-32">
      <Shell>
        <Row rail="Pages">
          <nav aria-label="Case studies">
            <ul className="grid gap-y-1.5 sm:grid-cols-2">
              {NAV.map(([label, href]) => (
                <li key={href}>
                  <a href={href} className="text-note">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </Row>
        <div className="h-8" />
        <Row rail="Elsewhere">
          <ul className="text-note grid gap-y-1.5">
            {ELSEWHERE.map(([label, href]) => (
              <li key={href}>
                <a href={href} className="font-mono">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </Row>
        <div className="h-8" />
        <Row rail="Boston, MA">
          <p className="text-note text-graphite">
            Built with Next.js and TypeScript. Two self-hosted typefaces, no third-party
            requests, no analytics.
          </p>
        </Row>
      </Shell>
    </footer>
  )
}
