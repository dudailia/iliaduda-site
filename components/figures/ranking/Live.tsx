'use client'

import { EASE_IN_OUT_CSS, EASE_OUT_CSS } from '@/lib/ease'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { FigureFrame, Readouts } from '@/components/FigureFrame'
import { Items } from '@/components/Layout'
import { useReducedMotion } from '@/components/stage/env'
import { option } from '@/components/stage/controls'

/**
 * The ranking, live: three treatments of one dataset, and the top of the
 * ranking under each. Switching treatment moves every row from its old place
 * to its new one, so the reader sees which segments rose and which fell —
 * that movement is the finding, which is why this figure animates at all.
 *
 * FLIP: measure, switch, measure again, and play each row's displacement back
 * to zero on transform. 280ms on a strong ease-in-out: rows already on screen,
 * moving from A to B. Rows entering the top fade and rise slightly on the
 * ease-out; rows leaving it fade where they stood (200ms), so the biggest
 * fallers are seen going too. A repeated switch retargets from wherever the
 * rows are: every read comes before any write, and the new places are measured
 * with the moving rows' transforms off. Reduced motion: rows are simply in
 * their new places.
 */

export type Variant = 'a' | 'b' | 'c'
export interface Row {
  name: string
  zeroed: boolean
  a: { score: number; rank: number }
  b: { score: number; rank: number }
  c: { score: number; rank: number }
}

// The top fifteen, the reach of the paper's conclusion: the segments that stay in it under all three treatments are
// the claim, in indigo; the rest are context, in graphite.
const SHOWN = 15
const survives = (r: { a: { rank: number }; b: { rank: number }; c: { rank: number } }) => r.a.rank <= SHOWN && r.b.rank <= SHOWN && r.c.rank <= SHOWN
const MOVE = `transform 280ms ${EASE_IN_OUT_CSS}, opacity 200ms ${EASE_OUT_CSS}`
const ENTER = `transform 240ms ${EASE_OUT_CSS}, opacity 200ms ${EASE_OUT_CSS}`
/** A row caught mid-glide by another switch: away at once from where it is drawn, on the ease-out, so it never stalls. */
const RETARGET = `transform 280ms ${EASE_OUT_CSS}, opacity 200ms ${EASE_OUT_CSS}`

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
  /** The list's height as seen before a switch, and the glide of its height that follows (see the FLIP below). */
  const beforeH = useRef(0)
  const heightGlide = useRef(0)
  /** The tallest the list has been at this width: kept as its least height, so a shorter treatment moves nothing under it. */
  const reserved = useRef({ w: 0, h: 0 })
  /** Rows that have just left the top, fading where they stood: each with its row and its place, in px from the list's top. */
  // The rows leaving the top, with the numbers they had there (the treatment just left), fading where they stood.
  const [gone, setGone] = useState<{ row: Row; top: number; height: number; key: number; rank: number; score: number; frac: number }[]>([])
  const goneKey = useRef(0)

  const shown = [...rows].sort((x, y) => x[v].rank - y[v].rank).slice(0, SHOWN)
  const max = Math.max(...rows.map((r) => Math.max(r.a.score, r.b.score, r.c.score)))

  const radios = useRef<Record<string, HTMLButtonElement | null>>({})
  const moveTo = (next: Variant) => {
    choose(next)
    radios.current[next]?.focus()
  }
  const choose = (next: Variant) => {
    if (next === v) return
    // First: where every row is now, as seen (a row still moving is where it is drawn).
    const m = new Map<string, number>()
    const el = list.current
    const top0 = el?.getBoundingClientRect().top ?? 0
    const leaving: (typeof gone)[number][] = []
    const kept = new Set([...rows].sort((x, y) => x[next].rank - y[next].rank).slice(0, SHOWN).map((r) => r.name))
    el?.querySelectorAll<HTMLLIElement>('li[data-name]').forEach((li) => {
      const r = li.getBoundingClientRect()
      m.set(li.dataset.name!, r.top)
      const row = rows.find((x) => x.name === li.dataset.name)
      if (!reduced && row && !kept.has(row.name)) leaving.push({ row, top: r.top - top0, height: r.height, key: ++goneKey.current, rank: row[v].rank, score: row[v].score, frac: row[v].score / max })
    })
    before.current = m
    beforeH.current = el?.getBoundingClientRect().height ?? 0
    setV(next)
    if (leaving.length) {
      setGone(leaving)
      window.setTimeout(() => setGone((g) => g.filter((x) => !leaving.includes(x))), 300)
    }
  }

  // Last, Invert, Play: every write to clear the rows, one read of where they now sit, every write to put them back
  // where they were seen, then release them to their new places.
  useLayoutEffect(() => {
    const el = list.current
    if (!el || reduced || before.current.size === 0) return
    const lis = [...el.querySelectorAll<HTMLLIElement>('li[data-name]')]
    // Which rows are still on their way, read before their moves are cut.
    const moving = new Set(
      lis
        .filter((li) => li.getAnimations().some((a) => a.playState === 'running' && 'transitionProperty' in a && (a as CSSTransition).transitionProperty === 'transform'))
        .map((li) => li.dataset.name!),
    )
    for (const li of lis) {
      // Only the move is cut for the measurement: a row still fading in goes on fading.
      li.style.transition = 'transform 0s'
      li.style.transform = 'none'
    }
    // The new places from layout, which no transform touches: a glide still running to "none" is not cancelled by
    // setting it again, and a drawn position read here would include it (a switch mid-glide jumped rows 154px).
    const top0 = el.getBoundingClientRect().top + el.clientTop
    const now = lis.map((li) => top0 + li.offsetTop)
    lis.forEach((li, i) => {
      const was = before.current.get(li.dataset.name!)
      if (was === undefined) {
        li.style.opacity = '0'
        li.style.transform = 'translateY(6px)'
        li.dataset.entering = ''
      } else {
        li.style.transform = `translateY(${was - now[i]!}px)`
        delete li.dataset.entering
      }
    })
    // A name that wraps under one treatment and not another (on a phone) changes the list's height. The room it took is
    // kept (at this width), so a shorter list moves nothing under it; a list taller than any yet glides open with the
    // rows, once, rather than moving everything under it in one frame.
    el.style.height = ''
    el.style.transition = ''
    el.style.minHeight = ''
    const box = el.getBoundingClientRect()
    if (Math.abs(box.width - reserved.current.w) > 0.5) reserved.current = { w: box.width, h: 0 }
    const h = Math.max(box.height, reserved.current.h)
    reserved.current.h = h
    const h0 = beforeH.current
    const glide = h - h0 > 0.5 && h0 > 0
    if (glide) el.style.height = `${h0}px`
    else el.style.minHeight = `${h}px`
    // Force the inverted frame, then release to the natural position.
    void el.offsetHeight
    for (const li of lis) {
      li.style.transition = li.dataset.entering !== undefined ? ENTER : moving.has(li.dataset.name!) ? RETARGET : MOVE
      li.style.transform = ''
      li.style.opacity = ''
    }
    if (glide) {
      el.style.transition = `height 280ms ${EASE_IN_OUT_CSS}`
      el.style.height = `${h}px`
      const token = ++heightGlide.current
      window.setTimeout(() => {
        if (token !== heightGlide.current) return
        el.style.height = ''
        el.style.transition = ''
        el.style.minHeight = `${h}px`
      }, 300)
    }
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
            className={option(v === x.key)}
          >
            {x.label}
          </button>
        ))}
      </div>
      <p className="text-note mt-3 min-h-[4.5em] text-graphite sm:min-h-[3em]" aria-live="polite">
        {current.note}
      </p>

      {/* The key before the rows: what indigo marks is read before the list, not after fifteen of them. */}
      <p className="text-meta mt-3 font-mono text-graphite">
        <Items items="indigo: in the top fifteen under all three treatments · ∅ absent from the notebook’s growth table, so scored zero on growth and CAGR · arrows: places moved against as written" />
      </p>
      <ol ref={list} role="list" aria-label={`Top ${SHOWN} segments, ${current.label.toLowerCase()}`} className="relative mt-3 grid list-none border-t border-rule">
        {shown.map((r) => {
          const was = r.a.rank
          const now = r[v].rank
          const delta = was - now
          return (
            <li
              key={r.name}
              data-name={r.name}
              className="grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)_2.5rem_2.25rem] items-center gap-x-2.5 gap-y-1 border-b border-rule py-1.5 sm:grid-cols-[2rem_12rem_1fr_3rem_3rem] sm:gap-x-3"
            >
              <span className="text-meta tabular text-graphite">{now}</span>
              {/* The whole name, wrapping if it must (at a phone's width, or enlarged): a row's height is its name's,
                  the same under every treatment, so a switch still moves rows without resizing them. */}
              <span className="text-note min-w-0 leading-snug [overflow-wrap:anywhere]">
                {r.name}
                {v === 'a' && r.zeroed ? (
                  <span className="text-meta ml-1.5 font-mono text-graphite" title="Absent from the growth table: growth and CAGR scored zero">
                    ∅
                  </span>
                ) : null}
              </span>
              {/* On a phone the bar takes its own line under the name, across the row: squeezed beside it (70–100px on
                  a 0–100 scale) the treatments' scores drew twelve identical bars. */}
              <span className="relative col-[2/-1] row-start-2 h-2.5 sm:col-auto sm:row-auto" aria-hidden>
                <span
                  className={`absolute inset-y-0 left-0 w-full origin-left ${survives(r) ? 'bg-indigo' : 'bg-graphite'}`}
                  style={{ transform: `scaleX(${r[v].score / max})`, transition: reduced ? 'none' : `transform 280ms ${EASE_IN_OUT_CSS}` }}
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
        {/* The rows that just left the top, fading where they stood. */}
        {gone.map((g) => (
          <li
            key={`gone-${g.key}`}
            aria-hidden
            className="absolute inset-x-0 grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)_2.5rem_2.25rem] items-center gap-x-2.5 gap-y-1 border-b border-rule py-1.5 opacity-0 transition-opacity duration-[280ms] ease-(--ease-in-out) starting:opacity-100 sm:grid-cols-[2rem_12rem_1fr_3rem_3rem] sm:gap-x-3"
            style={{ top: g.top, height: g.height }}
          >
            <span className="text-meta tabular text-graphite">{g.rank}</span>
            <span className="text-note min-w-0 leading-snug [overflow-wrap:anywhere]">{g.row.name}</span>
            <span className="relative col-[2/-1] row-start-2 h-2.5 sm:col-auto sm:row-auto">
              <span className={`absolute inset-y-0 left-0 w-full origin-left ${survives(g.row) ? 'bg-indigo' : 'bg-graphite'}`} style={{ transform: `scaleX(${g.frac})` }} />
            </span>
            <span className="text-meta tabular text-right text-graphite">{g.score.toFixed(1)}</span>
            <span className="text-meta tabular text-right text-ink">↓</span>
          </li>
        ))}
      </ol>

      <p className="sr-only">{description}</p>
    </div>
    </FigureFrame>
  )
}
