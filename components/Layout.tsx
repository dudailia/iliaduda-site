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
 * Two earlier versions of this were wrong, in opposite directions.
 *
 * The first gave the note its own grid column nested inside the text column,
 * which narrowed the paragraph it annotated to half the measure of the ones
 * around it — the note changed the thing it was commenting on.
 *
 * The second positioned the note absolutely into the margin. That fixed the
 * measure and broke something quieter: an absolutely positioned note takes no
 * space, so a long note on a short paragraph simply printed over whatever came
 * next. In a section with two annotated paragraphs the two notes landed on top
 * of each other.
 *
 * This version puts the note back in flow. The wrapper is pulled left by the
 * rail plus the gutter, so its second column lands exactly where the text
 * column already was — the paragraph keeps the full measure — while the row
 * height becomes the taller of note and paragraph, which is what makes an
 * overlap impossible rather than merely unlikely.
 *
 * DOM order stays paragraph then note, which is the reading order; explicit
 * placement puts the note in the first column on wide screens. Below that it
 * follows the paragraph as an indented block, which is the closest thing to
 * adjacency a single column allows.
 */
export function Annotated({
  note,
  children,
}: {
  note: ReactNode
  children: ReactNode
}) {
  return (
    <div className="lg:-ml-[calc(var(--rail)+2.5rem)] lg:grid lg:grid-cols-[var(--rail)_minmax(0,1fr)] lg:gap-x-10">
      <div className="min-w-0 lg:col-start-2 lg:row-start-1">{children}</div>
      <aside className="text-note mt-3 border-l-2 border-rule pl-4 text-graphite lg:col-start-1 lg:row-start-1 lg:mt-0 lg:mb-2 lg:border-l-0 lg:pl-0 lg:text-right">
        {note}
      </aside>
    </div>
  )
}

/** Body prose. One measure, one rhythm, no bullet lists. */
export function Prose({ children }: { children: ReactNode }) {
  return <div className="max-w-[var(--measure)] [&>p+p]:mt-[1.1em]">{children}</div>
}
