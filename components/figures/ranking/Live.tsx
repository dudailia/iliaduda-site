'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { FigureFrame, Readouts } from '@/components/FigureFrame'
import { useReducedMotion } from '../surface/env'

/**
 * The ranking, live: three treatments of one dataset, and the top of the
 * ranking under each. Switching treatment moves every row from its old place
 * to its new one, so the reader sees which segments rose and which fell —
 * that movement is the finding, which is why this figure animates at all.
 *
 * FLIP: measure, switch, measure again, and play each row's displacement back
 * to zero on transform. 280ms on a strong ease-in-out: rows already on screen,
 * moving from A to B. Rows entering the top fade and rise slightly; a
 * repeated switch retargets from wherever the rows are. Reduced motion: rows
 * are simply in their new places.
 */

export type Variant = 'a' | 'b' | 'c'
export interface Row {
  name: string
  zeroed: boolean
  a: { score: number; rank: number }
  b: { score: number; rank: number }
  c: { score: number; rank: number }
}

const SHOWN = 12
const MOVE = 'transform 280ms cubic-bezier(0.77, 0, 0.175, 1), opacity 200ms cubic-bezier(0.23, 1, 0.32, 1)'

export function RankingLive({
  rows,
  variants,
  rho,
  description,
  frame,
}: {
  rows: readonly Row[]
  variants: readonly { key: Variant; label: string; note: string }[]
  rho: Record<Variant, number>
  description: string
  frame: { id: string; number: string; vt: string; title: string; subtitle: string; caption: ReactNode; table: ReactNode }
}) {
  const [v, setV] = useState<Variant>('a')
  const reduced = useReducedMotion()
  const list = useRef<HTMLOListElement>(null)
  const before = useRef<Map<string, number>>(new Map())

  const shown = [...rows].sort((x, y) => x[v].rank - y[v].rank).slice(0, SHOWN)
  const max = Math.max(...rows.map((r) => Math.max(r.a.score, r.b.score, r.c.score)))

  const radios = useRef<Record<string, HTMLButtonElement | null>>({})
  const moveTo = (next: Variant) => {
    choose(next)
    radios.current[next]?.focus()
  }
  const choose = (next: Variant) => {
    if (next === v) return
    // First: where every row is now.
    const m = new Map<string, number>()
    list.current?.querySelectorAll<HTMLLIElement>('li[data-name]').forEach((li) => {
      m.set(li.dataset.name!, li.getBoundingClientRect().top)
    })
    before.current = m
    setV(next)
  }

  // Last, Invert, Play.
  useLayoutEffect(() => {
    const el = list.current
    if (!el || reduced || before.current.size === 0) return
    el.querySelectorAll<HTMLLIElement>('li[data-name]').forEach((li) => {
      const was = before.current.get(li.dataset.name!)
      const now = li.getBoundingClientRect().top
      li.style.transition = 'none'
      if (was === undefined) {
        li.style.opacity = '0'
        li.style.transform = 'translateY(6px)'
      } else {
        li.style.transform = `translateY(${was - now}px)`
      }
    })
    // Force the inverted frame, then release to the natural position.
    void el.offsetHeight
    el.querySelectorAll<HTMLLIElement>('li[data-name]').forEach((li) => {
      li.style.transition = MOVE
      li.style.transform = ''
      li.style.opacity = ''
    })
    before.current = new Map()
  }, [v, reduced])

  const current = variants.find((x) => x.key === v)!
  const zeroed = rows.filter((r) => r.zeroed).length

  const rail = (
    <Readouts
      rows={[
        { label: 'Treatment', value: current.label },
        { label: 'Top pick', value: shown[0]!.name },
        { label: 'Spearman ρ against as written', value: v === 'a' ? '1.00' : rho[v].toFixed(2) },
        { label: 'Scored zero on growth', value: v === 'a' ? `${zeroed} of ${rows.length}` : 'none' },
      ]}
    />
  )

  return (
    <FigureFrame {...frame} rail={rail}>
    <div>
      <div role="radiogroup" aria-label="Treatment of the data" className="text-meta flex flex-wrap gap-2 font-mono">
        {variants.map((x) => (
          <button
            key={x.key}
            ref={(el) => {
              radios.current[x.key] = el
            }}
            type="button"
            role="radio"
            aria-checked={v === x.key}
            onClick={() => choose(x.key)}
            onKeyDown={(e) => {
              const i = variants.findIndex((y) => y.key === v)
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault()
                moveTo(variants[(i + 1) % variants.length]!.key)
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault()
                moveTo(variants[(i + variants.length - 1) % variants.length]!.key)
              }
            }}
            tabIndex={v === x.key ? 0 : -1}
            className={`rounded-sm border px-2.5 py-2 transition-colors duration-150 ease-out ${
              v === x.key ? 'border-ink bg-ink text-paper' : 'border-graphite text-ink hover:border-ink'
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <p className="text-note mt-3 min-h-[3em] text-graphite" aria-live="polite">
        {current.note}
      </p>

      <ol ref={list} aria-label={`Top ${SHOWN} segments, ${current.label.toLowerCase()}`} className="mt-3 grid list-none border-t border-rule">
        {shown.map((r) => {
          const was = r.a.rank
          const now = r[v].rank
          const delta = was - now
          return (
            <li
              key={r.name}
              data-name={r.name}
              className="grid min-w-0 grid-cols-[1.5rem_minmax(0,8.5rem)_1fr_2.5rem_2.25rem] items-center gap-x-2.5 border-b border-rule py-1.5 sm:grid-cols-[2rem_12rem_1fr_3rem_3rem] sm:gap-x-3"
            >
              <span className="text-meta tabular text-graphite">{now}</span>
              <span className="text-note truncate">
                {r.name}
                {v === 'a' && r.zeroed ? (
                  <span className="text-meta ml-1.5 font-mono text-graphite" title="Absent from the growth table: growth and CAGR scored zero">
                    ∅
                  </span>
                ) : null}
              </span>
              <span className="relative h-2.5" aria-hidden>
                <span
                  className="absolute inset-y-0 left-0 w-full origin-left bg-indigo"
                  style={{ transform: `scaleX(${r[v].score / max})`, transition: reduced ? 'none' : 'transform 280ms cubic-bezier(0.77, 0, 0.175, 1)' }}
                />
              </span>
              <span className="text-meta tabular text-right text-graphite">{r[v].score.toFixed(1)}</span>
              {/* Its own column, always present: a second line that appeared
                  only after a switch changed every row's height mid-move. */}
              <span className="text-meta tabular text-right text-ink">
                {v !== 'a' && delta !== 0 ? (delta > 0 ? `↑${delta}` : `↓${-delta}`) : ''}
              </span>
            </li>
          )
        })}
      </ol>

      <p className="text-meta mt-3 font-mono text-graphite">
        ∅ absent from the notebook’s growth table, so scored zero on growth and CAGR · arrows: places moved against as written
      </p>
      <p className="sr-only">{description}</p>
    </div>
    </FigureFrame>
  )
}
