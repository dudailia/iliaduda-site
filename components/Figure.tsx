import type { ComponentType, ReactNode } from 'react'
import { Row } from './Layout'

/**
 * Every figure goes through here so the accessibility wiring cannot be
 * forgotten in one of them: this component owns the <svg> element and the
 * caller supplies only the marks.
 *
 * `description` must state the real values in prose — not "chart" or "bar
 * graph". A figure a screen reader cannot read would break the accessibility
 * claim this site makes about itself, and tests/e2e/a11y.spec.ts asserts every
 * <desc> on every route is non-empty.
 *
 * Some figures ship two arrangements for two widths. They share their data and
 * their scale function, so the proportions are provably the same — only the
 * placement of labels changes. Each arrangement gets its own title and desc
 * element ids, because two elements with one id is invalid however well hidden
 * one of them is.
 *
 * `id` is a permanent anchor: these get pasted into email, which is how this
 * site actually gets used. They are listed in the sitemap and never renamed.
 */

export interface Arrangement {
  viewBox: string
  width: number
  height: number
  Marks: ComponentType
  /** Which widths this arrangement is for. */
  className: string
  /** Suffix for this arrangement's element ids. */
  key: string
}

export interface FigureProps {
  id: string
  number: string
  title: string
  subtitle?: string
  description: string
  caption: ReactNode
  arrangements: readonly Arrangement[]
  table?: ReactNode
}

export function Figure({
  id,
  number,
  title,
  subtitle,
  description,
  caption,
  arrangements,
  table,
}: FigureProps) {
  return (
    <figure id={id} className="my-12 lg:my-16">
      <Row rail={number}>
        <div className="text-note border-b border-rule pb-2">
          <span className="block text-ink">{title}</span>
          {subtitle ? (
            <span className="text-meta block pt-0.5 font-mono text-graphite">{subtitle}</span>
          ) : null}
        </div>

        {arrangements.map(({ key, viewBox, width, height, Marks, className }) => {
          const titleId = `${id}-${key}-title`
          const descId = `${id}-${key}-desc`
          return (
            <svg
              key={key}
              role="img"
              aria-labelledby={titleId}
              aria-describedby={descId}
              viewBox={viewBox}
              width={width}
              height={height}
              className={`mt-5 h-auto w-full ${className}`}
              style={{ aspectRatio: `${width} / ${height}` }}
            >
              <title id={titleId}>{title}</title>
              <desc id={descId}>{description}</desc>
              <Marks />
            </svg>
          )
        })}

        <figcaption className="text-note mt-5 max-w-[60ch] text-graphite">{caption}</figcaption>

        {table ? <div className="sr-only">{table}</div> : null}
      </Row>
    </figure>
  )
}
