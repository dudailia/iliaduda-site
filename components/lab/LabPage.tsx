import type { ReactNode } from 'react'
import { Shell } from '../Layout'

/**
 * The frame for one hero prototype: a lab bar to move between the three, the
 * hero itself at full width, and under it the plain-English caption a
 * recruiter reads in three seconds, then how it is computed for the reader
 * who wants to check.
 */

const LAB = [
  { slug: 'a', name: 'A million futures' },
  { slug: 'b', name: 'The order book as terrain' },
  { slug: 'c', name: 'The vol surface, reborn' },
] as const

export function LabPage({
  slug,
  hero,
  headline,
  caption,
  method,
}: {
  slug: (typeof LAB)[number]['slug']
  /** The hero, full width. It owns its own height. */
  hero: ReactNode
  /** One plain-English sentence: what you are looking at. */
  headline: ReactNode
  /** Two or three sentences a non-specialist can follow. */
  caption: ReactNode
  /** How it is computed, for the technical reader. */
  method: ReactNode
}) {
  return (
    <>
      <div className="border-b border-rule">
        <Shell>
          <nav aria-label="Hero prototypes" className="text-meta flex flex-wrap items-baseline justify-between gap-x-6 font-mono">
            <p className="py-2.5 text-graphite">Lab · hero prototypes · not linked, not indexed</p>
            <ul className="flex gap-x-2">
              {LAB.map((l) => (
                <li key={l.slug}>
                  <a
                    href={`/lab/${l.slug}`}
                    aria-current={l.slug === slug ? 'page' : undefined}
                    className={`inline-block min-w-6 px-1.5 py-2.5 text-center ${l.slug === slug ? 'text-ink' : 'text-graphite'}`}
                  >
                    {l.slug.toUpperCase()}
                    <span className="sr-only">: {l.name}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </Shell>
      </div>

      {hero}

      <Shell>
        <div className="grid grid-cols-1 gap-y-2 pt-8 lg:grid-cols-[var(--rail)_minmax(0,var(--measure))] lg:gap-x-(--gutter) lg:pt-12">
          <p className="text-meta font-mono text-graphite lg:pt-1 lg:text-right">
            {slug.toUpperCase()} · {LAB.find((l) => l.slug === slug)!.name}
          </p>
          <div className="min-w-0">
            <h1 className="text-h3 sm:text-h2">{headline}</h1>
            <div className="mt-4 max-w-[38rem] [&>p+p]:mt-3">{caption}</div>
            <div className="text-note mt-8 max-w-[38rem] border-t border-rule pt-5 text-graphite [&>p+p]:mt-3">
              {method}
            </div>
          </div>
        </div>
      </Shell>
    </>
  )
}
