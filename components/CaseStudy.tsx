import { Fragment, type ReactNode } from 'react'
import { TITLE_PHRASES } from '@/content/papers'
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
  measure = '',
}: {
  /** Role and dates, as on the résumé. Sits under the title, never above it:
   *  a label over a heading is a kicker, and the heading has to carry itself. */
  byline?: ReactNode
  title: string
  standfirst: ReactNode
  level?: 'h1' | 'h2'
  /** A figure follows (every paper's Fig. 1): it sits closer under the abstract's rule at lg. */
  figure?: boolean
  /** A narrower measure for a title whose line count would differ between the fallback face and Source Serif. */
  measure?: string
}) {
  const Heading = level
  // At lg the first figure sits 2.5rem under the abstract's rule rather than the 4rem between figures (its own margin,
  // less this block's 1.5rem), so a laptop's first screen shows more of Fig. 1's stage.
  // A phone turned sideways keeps the phone's title size: at 44px the title took up to 148px of a 326–390px screen. On
  // every phone held upright (to 28rem, a Pro Max's 440) it is 28px: at 31px a 360px phone left "beyond" and "membrane"
  // alone on a line, and a Pro Max "remembers:" and "CloseBooks:" ("Order flow that remembers:" is 407px at 31, 368 at
  // 28, in a 382–392px column). Under 26rem (a Pixel, 412px) 27px, where "Order flow that remembers:" (368px at 28)
  // fits its 364px; under 25.5rem (an iPhone 15–17, a 384px Galaxy) 25px ("An implied-volatility surface" in 336px), under 23.5rem (an SE) 24px and under 22.75rem
  // (a 360px Android) 23px, where "Ranking startup segments," (352px at 28, 1.9px too wide at 25 in a 312px column),
  // "Order flow that remembers:" and "on a circular membrane" each keep a line of their own. A
  // larger Android font size narrows the page in CSS px: at 130% (277px) "Fourier–Bessel series", held whole, was 258px
  // in a 229px column and the page scrolled sideways. So 21px under 20.5rem (115%, 313px: "Ranking startup segments,"
  // and "A debt-settlement portal" each on a line in 265px), 18px under 18.5rem (130%, 229px) and 17px at 150%.
  return (
    <Row className={`pt-10 lg:pt-12 ${figure ? 'lg:-mb-6' : ''}`}>
      <Heading className={`${level === 'h1' ? 'text-h2 max-[28rem]:text-[1.75rem] max-[26rem]:text-[1.6875rem] max-[25.5rem]:text-[1.5625rem] max-[23.5rem]:text-[1.5rem] max-[22.75rem]:text-[1.4375rem] max-[20.5rem]:text-[1.3125rem] max-[18.5rem]:text-[1.125rem] max-[16rem]:text-[1.0625rem] sm:[@media(min-height:30.0625rem)]:text-h1' : 'text-h2'} ${measure}`}>
        <TitleText title={title} />
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
 * A paper's title, in its phrases where it has them (content/papers.ts, TITLE_PHRASES): each an inline block, so the
 * lines break between them, and inside one only where it is wider than the line. The page's h1 and the Contents' entry
 * alike: the entry broke "cricket / predicts beyond / the scoreboard" where the page no longer did.
 */
export function TitleText({ title }: { title: string }) {
  const phrases = TITLE_PHRASES[title]
  if (!phrases) return <Whole text={title} />
  return phrases.map((p, i) => (
    <Fragment key={p}>
      {i ? (phrases[i - 1]!.endsWith('-') ? <wbr /> : ' ') : null}
      <span className="inline-block max-w-full">
        <Whole text={p} />
      </span>
    </Fragment>
  ))
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
        {/* On paper the rule goes with the rows it heads: left behind, it ended the sheet before them on a lone line. */}
        <hr className="mb-5 border-0 border-t border-rule print:break-after-avoid" />
        {/* Single column below sm: a repo URL is one unbreakable token and at
            360px it does not fit beside a label. `break-words` lets the mono
            values wrap rather than push the document wider than the viewport,
            which is what they did before. */}
        {/* On a phone each label sits on its value (a pair per row, further apart from the next); from sm, two columns.
            On paper a block of whole rows, which may break between rows: kept whole as a list, it jumped onto a sheet
            of its own with only the colophon under it. */}
        {/* One column on a phone, as wide as the page and no wider: left to size itself, a long path
            ("tests/membrane-bessel.test.ts · …") widened it past the screen, and the page scrolled sideways at 360px. */}
        <dl className="text-note grid grid-cols-1 gap-y-4 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-y-2 print:block">
          {rows.map(([k, v]) => (
            <div key={k} className="sm:contents print:mb-2 print:grid! print:grid-cols-[7.5rem_minmax(0,1fr)] print:break-inside-avoid">
              <dt className="text-meta mb-0.5 font-mono text-graphite sm:mb-0 sm:pt-0.5 sm:pointer-coarse:[&:has(+dd_a)]:pt-[calc((44px-1.5*var(--text-note))/2+0.125rem)]">{k}</dt>
              {/* Its links take a little more room above and below than their line, so a finger has room; inline, so a
                  long address still wraps at 360px. Under a finger each is a 44px line of its own (inline-block, so a
                  wrapped list's lines stand 44px apart instead of covering each other; it still wraps, never wider
                  than the column). Beside its label (from sm) that padding lowers the link's glyphs by half of 44px less
                  its line, so the label of a row that holds a link comes down by as much. */}
              <dd className="min-w-0 break-words font-mono [&_a]:py-1 pointer-coarse:[&_a]:inline-block pointer-coarse:[&_a]:max-w-full pointer-coarse:[&_a]:py-[calc((44px-1lh)/2)]">{typeof v === 'string' ? <Items items={v} /> : v}</dd>
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
