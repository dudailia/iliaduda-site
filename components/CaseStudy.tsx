import type { ReactNode } from 'react'
import { Items, Row, Whole, keepDashes } from './Layout'

/**
 * Section headings live in the rail, right-aligned, rather than stacked above
 * their prose. Two reasons: it uses the asymmetric grid for something instead
 * of decorating it, and it puts every heading on the page in one vertical
 * column, which is more scannable than a stack of bold text — a reader looking
 * for "the hard part" finds it by running one eye down one line.
 *
 * The rail carries two things and they are distinguishable: headings in ink,
 * limitation notes in graphite.
 */

export function CaseStudyTitle({
  byline,
  title,
  standfirst,
  level = 'h2',
  figure = true,
}: {
  /** Role and dates, as on the résumé. Sits under the title, never above it:
   *  a label over a heading is a kicker, and the heading has to carry itself. */
  byline?: ReactNode
  title: string
  standfirst: ReactNode
  level?: 'h1' | 'h2'
  /** A figure follows (every paper's Fig. 1): it sits closer under the abstract's rule at lg. */
  figure?: boolean
}) {
  const Heading = level
  // At lg the first figure sits 2.5rem under the abstract's rule rather than the 4rem between figures (its own margin,
  // less this block's 1.5rem), so a laptop's first screen shows more of Fig. 1's stage.
  return (
    <Row className={`pt-10 lg:pt-12 ${figure ? 'lg:-mb-6' : ''}`}>
      <Heading className={level === 'h1' ? 'text-h2 sm:text-h1' : 'text-h2'}>
        <Whole text={title} />
      </Heading>
      {byline ? (
        <p className="text-meta mt-3 font-mono text-graphite">{typeof byline === 'string' ? <Items items={byline} /> : byline}</p>
      ) : null}
      <div className="mt-5 max-w-[37.9rem]">{keepDashes(standfirst)}</div>
      <hr className="mt-8 border-0 border-t border-rule" />
    </Row>
  )
}

/**
 * `level` is not cosmetic. On a case-study route the page title is the h1, so
 * these are h2. On the home page cricstate sits under the site h1 as an h2, so
 * they are h3. Getting this wrong costs an accessibility point and it is
 * invisible on screen — heading-order is an axe best-practice rule rather than
 * a WCAG A/AA rule, so an axe run scoped to wcag tags passes while Lighthouse
 * reports 0.98. Both gates now include it.
 */
export function Section({
  heading,
  children,
  id,
  level = 'h2',
}: {
  heading: string
  children: ReactNode
  id?: string
  level?: 'h2' | 'h3'
}) {
  const Heading = level
  return (
    <section {...(id ? { id } : {})} className="mt-10 lg:mt-14">
      {/* On paper, a block: a grid row gives the printer nowhere to hold a heading with the text under it. */}
      <div className="grid grid-cols-1 gap-y-2 lg:grid-cols-[var(--rail)_minmax(0,var(--measure))] lg:gap-x-(--gutter) lg:gap-y-0 print:block">
        <Heading className="text-meta font-mono font-normal tracking-normal text-ink print:mb-2 print:break-after-avoid lg:col-start-1 lg:row-start-1 lg:self-start lg:pt-1 lg:text-right">
          {heading}
        </Heading>
        {/* When a section opens with an annotated paragraph, that note wants
            the rail at the same row the section heading already occupies, so
            the two print on top of each other. Margin, not padding, on the
            first note: padding sits inside the box, so it moves the text and
            leaves the occupied space unchanged — which looks fixed and still
            collides. every later note keeps aligning with its paragraph.
            tests/e2e/rail.spec.ts asserts no two rail items ever intersect. */}
        {/* The measure holds at every width, not only beside the rail: a tablet's column would otherwise run to 85
            characters a line. */}
        <div className="min-w-0 max-w-(--measure) lg:col-start-2 lg:row-start-1 lg:[&>div:first-child>aside]:mt-8 [&>p+p]:mt-[1.05em] [&>div+p]:mt-[1.05em] [&>p+div]:mt-[1.05em] [&>div+div]:mt-[1.05em]">
          {keepDashes(children)}
        </div>
      </div>
    </section>
  )
}

/** Trailing metadata: links, repo, status. Two typeset columns, mono values. */
export function Meta({ rows }: { rows: readonly (readonly [string, ReactNode])[] }) {
  return (
    // On paper it keeps to the sheet before it: alone, with the footer line, it made a sheet of its own.
    <div className="mt-12 lg:mt-16 print:break-before-avoid">
      <Row rail="">
        <hr className="mb-5 border-0 border-t border-rule" />
        {/* Single column below sm: a repo URL is one unbreakable token and at
            360px it does not fit beside a label. `break-words` lets the mono
            values wrap rather than push the document wider than the viewport,
            which is what they did before. */}
        {/* On a phone each label sits on its value (a pair per row, further apart from the next); from sm, two columns.
            On paper a block of whole rows, which may break between rows: kept whole as a list, it jumped onto a sheet
            of its own with only the colophon under it. */}
        <dl className="text-note grid gap-y-4 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-y-2 print:block">
          {rows.map(([k, v]) => (
            <div key={k} className="sm:contents print:mb-2 print:grid! print:grid-cols-[7.5rem_minmax(0,1fr)] print:break-inside-avoid">
              <dt className="text-meta mb-0.5 font-mono text-graphite sm:mb-0 sm:pt-0.5">{k}</dt>
              {/* Its links take a little more room above and below than their line, so a finger has room; inline, so a
                  long address still wraps at 360px. */}
              <dd className="min-w-0 break-words font-mono [&_a]:py-1">{typeof v === 'string' ? <Items items={v} /> : v}</dd>
            </div>
          ))}
        </dl>
      </Row>
    </div>
  )
}

/**
 * A two-column register. Used where a claim needs its own boundary drawn —
 * what was frozen before a test was read, and what was not.
 */
export function Register({
  columns,
}: {
  columns: readonly { readonly heading: string; readonly items: readonly string[] }[]
}) {
  return (
    <div className="mt-6 grid gap-x-10 gap-y-6 border-t border-rule pt-6 sm:grid-cols-2 print:break-inside-avoid">
      {columns.map((c) => (
        <div key={c.heading}>
          <p className="text-meta font-mono text-ink">{c.heading}</p>
          <ul className="text-note mt-2.5 grid list-none gap-y-2 text-graphite">
            {c.items.map((i) => (
              <li key={i}>
                <Whole text={i} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
