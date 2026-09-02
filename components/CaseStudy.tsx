import type { ReactNode } from 'react'
import { Row } from './Layout'

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
  slug,
  title,
  standfirst,
  level = 'h2',
}: {
  slug: string
  title: string
  standfirst: ReactNode
  level?: 'h1' | 'h2'
}) {
  const Heading = level
  return (
    <Row rail={slug} className="pt-10 lg:pt-16">
      <Heading className={level === 'h1' ? 'text-h1' : 'text-h2'}>{title}</Heading>
      <div className="mt-4 max-w-[37.9rem] text-graphite">{standfirst}</div>
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
      <div className="grid grid-cols-1 gap-y-2 lg:grid-cols-[var(--rail)_minmax(0,var(--measure))] lg:gap-x-10 lg:gap-y-0">
        <Heading className="text-meta font-mono font-normal tracking-normal text-ink lg:col-start-1 lg:row-start-1 lg:self-start lg:pt-1 lg:text-right">
          {heading}
        </Heading>
        {/* When a section opens with an annotated paragraph, that note is
            positioned into the rail at the paragraph's own top — which is
            exactly where the section heading already is, so the two print on
            top of each other. Pushing only the first note down clears the
            heading; every later note keeps aligning with its paragraph.
            tests/e2e/rail.spec.ts asserts no note ever intersects a heading. */}
        <div className="min-w-0 lg:col-start-2 lg:row-start-1 lg:[&>div:first-child>aside]:top-10 [&>p+p]:mt-[1.05em] [&>div+p]:mt-[1.05em] [&>p+div]:mt-[1.05em]">
          {children}
        </div>
      </div>
    </section>
  )
}

/** Trailing metadata: links, repo, status. Two typeset columns, mono values. */
export function Meta({ rows }: { rows: readonly (readonly [string, ReactNode])[] }) {
  return (
    <div className="mt-12 lg:mt-16">
      <Row rail="">
        <hr className="mb-5 border-0 border-t border-rule" />
        {/* Single column below sm: a repo URL is one unbreakable token and at
            360px it does not fit beside a label. `break-words` lets the mono
            values wrap rather than push the document wider than the viewport,
            which is what they did before. */}
        <dl className="text-note grid gap-y-3 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-y-2">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-meta font-mono text-graphite sm:pt-0.5">{k}</dt>
              <dd className="min-w-0 break-words font-mono">{v}</dd>
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
    <div className="mt-6 grid gap-x-10 gap-y-6 border-y border-rule py-6 sm:grid-cols-2">
      {columns.map((c) => (
        <div key={c.heading}>
          <p className="text-meta font-mono text-ink">{c.heading}</p>
          <ul className="text-note mt-2.5 grid list-none gap-y-1 text-graphite">
            {c.items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
