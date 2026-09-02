import type { ReactNode } from 'react'

/**
 * The whole site is one asymmetric grid: a 68ch text column with a 15rem rail
 * to its left. The rail holds figure numbers, statuses and limitation notes.
 * It is what makes the page read as a document rather than a landing page.
 *
 * Everything aligns to the text column's left edge and the rail hangs outside
 * it. Below 64rem the rail collapses and its contents move inline.
 */

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[calc(var(--rail)+2.5rem+var(--measure))] px-6 sm:px-8">
      {children}
    </div>
  )
}

/**
 * One row of the grid. `rail` top-aligns with the row's content on wide
 * screens; on narrow ones it sits above in mono, which is how a figure number
 * or a status wants to read when there is no margin to put it in.
 */
export function Row({
  rail,
  children,
  className = '',
}: {
  rail?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-y-2 lg:grid-cols-[var(--rail)_minmax(0,var(--measure))] lg:gap-x-10 lg:gap-y-0 ${className}`}
    >
      <div className="text-meta font-mono text-graphite lg:self-start lg:pt-1 lg:text-right">{rail}</div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/**
 * A paragraph (or group) with a limitation note in the margin.
 *
 * The note sits beside the claim it qualifies rather than in a section at the
 * end of the page. Adjacency is the point: a limitation next to its claim reads
 * as precision, and the same sentence collected into a list headed "weaknesses"
 * reads as performance.
 *
 * The note is positioned into the margin rather than given a grid column,
 * because a nested column would narrow the paragraph it annotates. The first
 * version of this component did exactly that, and annotated paragraphs came out
 * at half the measure of the ones around them — the note changed the thing it
 * was supposed to be commenting on.
 *
 * DOM order is paragraph then note, which is also the reading order, so the
 * narrow-screen layout needs no reordering: the note simply follows, indented
 * behind a rule.
 */
export function Annotated({
  note,
  children,
}: {
  note: ReactNode
  children: ReactNode
}) {
  return (
    <div className="relative">
      {children}
      <aside className="text-note mt-3 border-l-2 border-rule pl-4 text-graphite lg:absolute lg:right-full lg:top-0 lg:mr-8 lg:mt-0 lg:w-[12rem] lg:border-l-0 lg:pl-0 lg:text-right">
        {note}
      </aside>
    </div>
  )
}

/** Body prose. One measure, one rhythm, no bullet lists. */
export function Prose({ children }: { children: ReactNode }) {
  return <div className="max-w-[var(--measure)] [&>p+p]:mt-[1.1em]">{children}</div>
}
