import type { CSSProperties, ReactNode } from 'react'
import { Items } from './Layout'

/**
 * The layout every live figure shares: number and readouts in the rail, title
 * block, the figure, a hint line, the caption and a screen-reader table. No
 * hooks, so a server figure and a client figure can both render it.
 *
 * `vt` names the figure for the view transition from the contents page: the
 * thumbnail there and this figure carry the same view-transition-name, so
 * opening a paper grows one into the other.
 */

export function vtStyle(slug: string): CSSProperties {
  return { viewTransitionName: `fig-${slug}`, viewTransitionClass: 'figure' } as CSSProperties
}

export function FigureFrame({
  id,
  number,
  title,
  subtitle,
  rail,
  hint,
  caption,
  table,
  vt,
  railBelow = true,
  inline = false,
  span = false,
  className,
  children,
}: {
  id: string
  number: string
  title: string
  subtitle: string
  /** Readouts in the margin on wide screens; below the figure on narrow ones. */
  rail?: ReactNode
  hint?: ReactNode
  caption: ReactNode
  table?: ReactNode
  vt?: string
  /** Repeat the rail under the figure on narrow screens. Off when the figure
   *  already shows its state inline where a phone reader needs it. */
  railBelow?: boolean
  /** Already inside the text column (an entry on /about, not a paper), so the
   *  narrow-screen arrangement holds at every width: number above, readouts
   *  below, nothing in a margin that belongs to someone else. */
  inline?: boolean
  /** Takes the whole frame at lg, the rail's width too (/market's three views side by side): the number above the title
   *  and the readouts below the figure, as on narrow screens. */
  span?: boolean
  /** Replaces the figure's own vertical margins (the home page's Fig. 1 sits closer to the front matter). */
  className?: string
  children: ReactNode
}) {
  const wide = !inline && !span
  return (
    // Named by its title and described by its caption, by id: both sit inside the grid, not as the figure's own first
    // or last child, so they are not its caption by position.
    <figure id={id} className={className ?? (inline ? 'relative my-8 scroll-mt-28' : 'my-12 lg:my-16')} aria-labelledby={`${id}-title`} aria-describedby={`${id}-caption`}>
      <div
        // On paper, one column of plain blocks (the printed width is under lg, so its grid is one column anyway): its
        // number, title and stage then go to a new sheet together, never leaving the number or title at the foot of one.
        className={`grid grid-cols-1 gap-y-2 print:block ${wide ? 'lg:grid-cols-[var(--rail)_minmax(0,var(--measure))] lg:grid-rows-[auto_1fr] lg:gap-x-(--gutter) lg:gap-y-0' : ''}`}
      >
        <div className={`text-meta font-mono text-graphite print:mb-2 print:break-after-avoid ${wide ? 'lg:col-start-1 lg:row-start-1 lg:pt-1 lg:text-right' : ''}`}>
          {/* Inline on a wide screen, the number still goes where every
              figure's number goes: in the rail, level with the title. */}
          <span
            className={
              inline ? 'lg:absolute lg:right-[calc(100%+var(--gutter))] lg:top-px lg:whitespace-nowrap' : undefined
            }
          >
            {number}
          </span>
        </div>
        <div className={`min-w-0 ${wide ? 'lg:col-start-2 lg:row-span-2 lg:row-start-1' : ''}`}>
          <div className="text-note border-b border-rule pb-2 print:break-inside-avoid print:break-after-avoid">
            <span id={`${id}-title`} className="block text-pretty text-ink">
              {title}
            </span>
            {/* A subtitle wraps between its items, never inside one (DESIGN.md, the Whole Item Rule). */}
            <span className="text-meta block pt-px font-mono text-graphite">
              <Items items={subtitle} />
            </span>
          </div>
          <div className="mt-5" style={vt ? vtStyle(vt) : undefined}>
            {children}
          </div>
          {rail && (railBelow || inline) ? <div className={`mt-5 ${wide ? 'lg:hidden' : ''}`}>{rail}</div> : null}
          {/* A hint written as items (" · ") wraps between them, never inside one or before its dot. */}
          {hint ? <p className="text-meta mt-4 max-w-[36rem] font-mono text-graphite print:hidden">{typeof hint === 'string' ? <Items items={hint} /> : hint}</p> : null}
          <figcaption id={`${id}-caption`} className="text-note mt-4 max-w-[39.2rem] text-graphite">{caption}</figcaption>
          {table ? <div className="sr-only">{table}</div> : null}
        </div>
        {/* The margin's readouts, under the number and sticking as the figure scrolls. After the figure in the page's
            order, so the keyboard and a screen reader meet the figure before what reads it. */}
        {rail && wide ? (
          <div className="text-meta hidden text-right font-mono text-graphite lg:col-start-1 lg:row-start-2 lg:block">
            <div className="sticky top-6 mt-[4.75rem]">{rail}</div>
          </div>
        ) : null}
      </div>
    </figure>
  )
}

/** A rail readout list: label over value, right-aligned in the margin. */
export function Readouts({
  rows,
  across = false,
}: {
  rows: readonly { readonly label: string; readonly value: ReactNode }[]
  /** Label over value in a row of columns, for a figure with no margin to stack them in. */
  across?: boolean
}) {
  if (across) {
    return (
      <dl className="text-meta grid grid-cols-2 gap-x-6 gap-y-3 border-t border-rule pt-3 font-mono sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.label} className="min-w-0">
            <dt className="text-graphite">{r.label}</dt>
            <dd className="tabular text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
    )
  }
  return (
    <dl className="text-meta grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono lg:grid-cols-1 lg:gap-y-px lg:[&_dd]:mb-2">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-graphite">{r.label}</dt>
          <dd className="tabular text-ink">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}
