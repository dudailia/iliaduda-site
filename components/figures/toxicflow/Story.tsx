'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useReducedMotion } from '@/components/stage/env'

/**
 * The page's scroll story, its three pieces: a block that arrives as it is reached, the design history drawing itself,
 * and C2's two verdicts. Each plays once a visit, when it is first seen, and never on its way out. Everything is in the
 * HTML from the first byte: a block is held back only once the page's script has seen that it starts below the screen,
 * so a reader without script, a printer, or a block already on screen never waits for it. Reduced motion: all of it
 * arrives at once, finished.
 */

/** Seen once, from the moment `share` of it is on screen; true at once where it was already above the fold's end. */
function useArrived(share = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  // 'shown' until the script knows better: the server's HTML is the finished page.
  const [state, setState] = useState<'shown' | 'held' | 'arrived'>('shown')
  useEffect(() => {
    const el = ref.current
    if (!el || reduced) return
    if (el.getBoundingClientRect().top < window.innerHeight) return
    setState('held')
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setState('arrived')
          io.disconnect()
        }
      },
      { threshold: share },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [reduced, share])
  return { ref, state }
}

/** A block that rises 12px into place as it arrives (500ms on the ease-out). */
export function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { ref, state } = useArrived()
  const style: CSSProperties =
    state === 'held'
      ? { opacity: 0, translate: '0 12px' }
      : state === 'arrived'
        ? { opacity: 1, translate: '0 0', transition: 'opacity 500ms var(--ease-out), translate 500ms var(--ease-out)' }
        : {}
  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  )
}

export interface Step {
  readonly date: string | null
  readonly event: string
  readonly commit: string | null
  readonly href: string | null
  /** The one step the history turns on: v1's failure, marked so in words and by a hollow ring, not by colour. */
  readonly failed?: boolean
}

/**
 * The design history as a line that draws itself down the page (1.2s on the in-out), each step arriving 70ms after
 * the last, its mark filling as the line reaches it. A step still to come keeps a hollow mark.
 */
export function Timeline({ steps }: { steps: readonly Step[] }) {
  const { ref, state } = useArrived(0.2)
  const held = state === 'held'
  const go = state === 'arrived'
  return (
    <div ref={ref} className="relative mt-6 border-t border-rule pt-4">
      <span
        aria-hidden="true"
        className="absolute top-6 bottom-3 left-[0.3125rem] w-px origin-top bg-ink"
        style={{ transform: held ? 'scaleY(0)' : 'scaleY(1)', transition: go ? 'transform 1200ms var(--ease-in-out)' : undefined }}
      />
      <ol className="text-note grid gap-y-3">
        {steps.map((h, n) => {
          const delay = `${n * 70}ms`
          const arrive: CSSProperties = held
            ? { opacity: 0, translate: '0 6px' }
            : go
              ? { transition: `opacity 360ms var(--ease-out) ${delay}, translate 360ms var(--ease-out) ${delay}` }
              : {}
          return (
            <li key={h.event} className="relative grid gap-x-4 pl-6 sm:grid-cols-[6.5rem_minmax(0,1fr)]" style={arrive}>
              <span
                aria-hidden="true"
                className={`absolute top-[0.45rem] left-0 size-[0.6875rem] rounded-full border-2 ${
                  h.failed ? 'border-ink bg-paper' : h.date ? 'border-ink bg-ink' : 'border-graphite bg-paper'
                }`}
              />
              <span className="text-meta font-mono tabular text-graphite">{h.date ?? 'not yet'}</span>
              <span className={h.failed ? 'text-ink' : undefined}>
                {h.failed ? <span className="text-meta mr-1.5 font-mono text-ink">failed:</span> : null}
                {h.event}
                {h.commit && h.href ? (
                  <>
                    {' '}
                    <a className="text-meta font-mono" href={h.href}>
                      {h.commit}
                    </a>
                  </>
                ) : null}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export interface Verdict {
  readonly name: string
  readonly what: string
  readonly commit: string
  readonly href: string
}

/**
 * C2, the oracle, in v1 and in v2. v1's verdict is the design history's own words (the site's data holds no number for
 * it, so none is drawn); v2's is drawn: its mean over the validation days as a bar from 0, its bootstrap interval, and
 * the bar it had to clear. On arrival, v1's line comes first, then v2's bar grows to its mean (900ms on the ease-out)
 * and its interval and verdict follow.
 */
export function CanaryStory({
  v1,
  v2,
  mean,
  lo,
  hi,
  bar,
  labels,
  passes,
}: {
  v1: Verdict
  v2: Verdict
  mean: number
  lo: number
  hi: number
  bar: number
  labels: { readonly mean: string; readonly ci: string; readonly bar: string; readonly days: string }
  passes: boolean
}) {
  const { ref, state } = useArrived(0.4)
  const held = state === 'held'
  const go = state === 'arrived'
  const top = Math.max(hi, bar) * 1.08
  const x = (v: number) => `${(Math.max(0, v) / top) * 100}%`
  const fade = (ms: number): CSSProperties => (held ? { opacity: 0 } : go ? { transition: `opacity 300ms var(--ease-out) ${ms}ms` } : {})
  return (
    <div ref={ref} className="text-note mt-6 grid gap-y-5 border-t border-rule pt-4">
      <div className="grid gap-x-4 sm:grid-cols-[6.5rem_minmax(0,1fr)]" style={fade(0)}>
        <span className="text-meta font-mono text-graphite">{v1.name}</span>
        <p>
          <span className="text-meta mr-1.5 font-mono text-ink">failed:</span>
          {v1.what}{' '}
          <a className="text-meta font-mono" href={v1.href}>
            {v1.commit}
          </a>
        </p>
      </div>
      <div className="grid gap-x-4 sm:grid-cols-[6.5rem_minmax(0,1fr)]">
        <span className="text-meta font-mono text-graphite" style={fade(500)}>
          {v2.name}
        </span>
        <div>
          <p style={fade(500)}>
            {v2.what}{' '}
            <a className="text-meta font-mono" href={v2.href}>
              {v2.commit}
            </a>
          </p>
          <div aria-hidden="true" className="text-meta relative mt-3 h-4 font-mono tabular text-graphite">
            <span className="absolute pl-1.5 whitespace-nowrap" style={{ left: x(bar), ...fade(500) }}>
              {labels.bar}
            </span>
          </div>
          <div aria-hidden="true" className="relative h-9">
            <span className="absolute inset-x-0 top-1/2 h-px bg-rule" />
            <span className="absolute -inset-y-1 left-0 w-px bg-ink" />
            <span className="absolute -inset-y-1 border-l border-dashed border-ink" style={{ left: x(bar) }} />
            <span
              className="absolute top-1/2 left-0 h-2.5 -translate-y-1/2 origin-left bg-indigo"
              style={{
                width: x(mean),
                transform: held ? 'scaleX(0)' : 'scaleX(1)',
                transition: go ? 'transform 900ms var(--ease-out) 600ms' : undefined,
              }}
            />
            <span className="absolute top-1/2 h-px -translate-y-1/2 bg-ink" style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})`, ...fade(1400) }} />
          </div>
          <div className="text-meta relative h-4 font-mono tabular text-graphite" aria-hidden="true">
            <span className="absolute">0</span>
            <span className="absolute -translate-x-full whitespace-nowrap" style={{ left: '100%' }}>
              bp
            </span>
          </div>
          <p className="text-meta mt-2 font-mono tabular text-ink" style={fade(1500)}>
            <span className="text-indigo">{passes ? 'passes' : 'fails'}</span> · mean {labels.mean} bp {labels.ci} · {labels.days}
          </p>
        </div>
      </div>
    </div>
  )
}
