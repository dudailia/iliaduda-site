import { Fragment, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { PERSON, SITE } from '@/lib/site'

/**
 * The whole site is one asymmetric grid: a 710px text column with a 15rem rail
 * to its left. The rail holds figure numbers, statuses and limitation notes.
 * It is what makes the page read as a document rather than a landing page.
 *
 * Everything aligns to the text column's left edge and the rail hangs outside
 * it. Below 64rem the rail collapses and its contents move inline.
 */

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[calc(var(--rail)+var(--gutter)+var(--measure))] px-6 sm:px-8 print:max-w-none print:px-0">
      {children}
      {/* The running head and footer do not print, so a printed page carries its author here (the CV's sheet has its own). */}
      {/* As items, so a line never starts with the dot; on one line on paper (7pt), so it stays with the page's last lines
          and can never split across two sheets. */}
      <p className="text-meta mt-10 hidden font-mono text-graphite print:mt-3 print:block print:break-before-avoid print:text-[7pt]">
        <Items items={[PERSON.name, PERSON.email, SITE.public, PERSON.linkedin, PERSON.github].map((v) => v.replace(/^https?:\/\/(www\.)?/, ''))} />
      </p>
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
      className={`grid grid-cols-1 gap-y-2 lg:grid-cols-[var(--rail)_minmax(0,var(--measure))] lg:gap-x-(--gutter) lg:gap-y-0 print:block ${className}`}
    >
      {/* On paper the row is a block (a grid row gives the printer nowhere to hold a heading with what follows): the
          margin's label, a section's heading among them, keeps with what it names. */}
      <div className="text-meta font-mono text-graphite lg:self-start lg:pt-1 lg:text-right print:mb-2 print:break-after-avoid">{rail}</div>
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
    <div className="lg:-ml-[calc(var(--rail)+var(--gutter))] lg:grid lg:grid-cols-[var(--rail)_minmax(0,1fr)] lg:gap-x-(--gutter)">
      <div className="min-w-0 lg:col-start-2 lg:row-start-1">{keepDashes(children)}</div>
      <aside className="text-note mt-3 border-l-2 border-rule pl-4 text-graphite lg:col-start-1 lg:row-start-1 lg:mt-0 lg:mb-2 lg:border-l-0 lg:pl-0 lg:text-right">
        {keepDashes(note)}
      </aside>
    </div>
  )
}

/** Body prose. One measure, one rhythm, no bullet lists. */
export function Prose({ children }: { children: ReactNode }) {
  return <div className="max-w-[var(--measure)] [&>p+p]:mt-[1.1em]">{keepDashes(children)}</div>
}

/**
 * A mono metadata line — role · place · dates — that wraps between items and
 * never inside one. On a phone "January 2026 – present" split across two lines
 * reads as two facts; each item is kept whole, and the separator stays with the
 * item before it so no line starts with a dot. An item too long for a phone's
 * measure (a degree name) is left free to wrap rather than overflow.
 */
export function Items({ items }: { items: readonly (string | undefined | false)[] | string }) {
  const list = (typeof items === 'string' ? items.split(' · ') : items).filter(Boolean) as string[]
  return (
    <>
      {/* The space between items sits outside the unbreakable span: inside
          it, there was nowhere left to break and the line ran off a phone. */}
      {list.map((it, i) => {
        // Held to its item by a no-break space, inside an inline block, which no engine breaks (WebKit found a break
        // before the middle dot at the no-break space in a nowrap span): a line never starts with the dot. A long item
        // may wrap, but its last word keeps the dot.
        const dot = i < list.length - 1 ? '\u00a0·' : ''
        const cut = it.length > 34 ? it.lastIndexOf(' ') : -1
        return (
          <Fragment key={it}>
            {cut > 0 ? (
              <span>
                {it.slice(0, cut + 1)}
                <span className="inline-block whitespace-nowrap">
                  {it.slice(cut + 1)}
                  {dot}
                </span>
              </span>
            ) : (
              <span className={it.length <= 34 ? 'inline-block whitespace-nowrap' : ''}>
                {it}
                {dot}
              </span>
            )}
            {i < list.length - 1 ? ' ' : ''}
          </Fragment>
        )
      })}
    </>
  )
}

/**
 * Text whose hyphenated words and en-dash compounds stay on one line ("off-cycle" split as "off- / cycle" on a phone,
 * "Hawkes- / driven" in a title, "Fourier– / Bessel"): the fonts carry no no-break hyphen, so each such word is held in
 * a nowrap span.
 */
export function Whole({ text }: { text: string }) {
  // A spaced em dash stays at the end of its line, never opening the next.
  return text.replace(/ — /g, '\u00a0— ').split(/(\S+[-–]\S+)/).map((part, i) =>
    i % 2 ? (
      <span key={i} className="whitespace-nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  )
}

/**
 * Prose whose spaced em dashes stay at the end of their line, never opening the next (as Whole does for one string):
 * the text in it, down through its plain elements (a link, an emphasis, a paragraph, a fragment), gets a no-break space before each
 * " — ". A component's own children are left as they are.
 */
export function keepDashes(node: ReactNode): ReactNode {
  // A dash at a string's end ("… a log line —", then {' '} and the next words) is held to the word before it too.
  if (typeof node === 'string') return node.includes(' —') ? node.replace(/ —( |$)/g, '\u00a0—$1') : node
  if (Array.isArray(node)) return node.map(keepDashes)
  if (isValidElement(node) && (typeof node.type === 'string' || node.type === Fragment)) {
    const el = node as ReactElement<{ children?: ReactNode }>
    const c = el.props.children
    if (c === undefined) return node
    return Array.isArray(c) ? cloneElement(el, undefined, ...c.map(keepDashes)) : cloneElement(el, undefined, keepDashes(c))
  }
  return node
}
