import type { CSSProperties, ReactNode } from 'react'

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
  children: ReactNode
}) {
  const wide = !inline
  return (
    <figure id={id} className={inline ? 'relative my-8 scroll-mt-28' : 'my-12 lg:my-16'} aria-labelledby={`${id}-title`}>
      <div
        className={`grid grid-cols-1 gap-y-2 ${wide ? 'lg:grid-cols-[var(--rail)_minmax(0,var(--measure))] lg:gap-x-(--gutter) lg:gap-y-0' : ''}`}
      >
        <div className={`text-meta font-mono text-graphite ${wide ? 'lg:pt-1 lg:text-right' : ''}`}>
          {/* Inline on a wide screen, the number still goes where every
              figure's number goes: in the rail, level with the title. */}
          <span
            className={
              inline ? 'lg:absolute lg:right-[calc(100%+var(--gutter))] lg:top-px lg:whitespace-nowrap' : undefined
            }
          >
            {number}
          </span>
          {rail && wide ? <div className="sticky top-6 mt-[4.75rem] hidden lg:block">{rail}</div> : null}
        </div>
        <div className="min-w-0">
          <div className="text-note border-b border-rule pb-2">
            <span id={`${id}-title`} className="block text-ink">
              {title}
            </span>
            <span className="text-meta block pt-px font-mono text-graphite">{subtitle}</span>
          </div>
          <div className="mt-5" style={vt ? vtStyle(vt) : undefined}>
            {children}
          </div>
          {rail && (railBelow || inline) ? <div className={`mt-5 ${wide ? 'lg:hidden' : ''}`}>{rail}</div> : null}
          {hint ? <p className="text-meta mt-4 max-w-[36rem] font-mono text-graphite">{hint}</p> : null}
          <figcaption className="text-note mt-4 max-w-[39.2rem] text-graphite">{caption}</figcaption>
          {table ? <div className="sr-only">{table}</div> : null}
        </div>
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
