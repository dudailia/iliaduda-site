'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Shell } from '@/components/Layout'
import { fade, underlay, useStage, type Create, type Palette, type Renderer } from '@/components/stage/useStage'
import { posterSim, type Sim, type Stats } from '@/lib/lab/b/sim'
import { fmt, readAt, sentence, type Reading } from '@/lib/lab/b/read'
import type { KeyProbe, Shared } from './renderer'

/**
 * Lab B, live. The poster is the server's frame of the seeded market; the
 * renderer module and a fresh copy of the same market load only when the
 * stage decides to go live, so the canvas's first frame is the poster's frame.
 *
 * Readouts are written straight into the DOM from the frame loop, not through
 * React state: they change every frame, and a re-render per frame would be
 * the most expensive thing on the page. The probe works on the poster too —
 * with reduced motion the arrow keys read the frozen snapshot.
 */

export interface Initial {
  rate: number
  trades: number
  shares: number
  mid: number
  spread: number
  rho: number
  expected: number
}

const PROBE_START: KeyProbe = { dp: 4, age: 12 }
const HINT = 'hover or tap the terrain'
const MAX_DP = 60

type Mod = typeof import('./renderer')

export function BookHero({ posterWide, posterNarrow, initial }: { posterWide: ReactNode; posterNarrow: ReactNode; initial: Initial }) {
  const labels = useRef<HTMLDivElement>(null)
  const out = useRef<Record<string, HTMLElement | null>>({})
  const shared = useRef<Shared | null>(null)
  const frozen = useRef<Sim | null>(null)
  const key = useRef<KeyProbe | null>(null)
  const last = useRef<Reading | null>(null)
  const [spoken, setSpoken] = useState('')
  const [probing, setProbing] = useState(false)
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)

  const write = useCallback((id: string, text: string) => {
    for (const k of [id, `${id}-m`]) {
      const el = out.current[k]
      if (el && el.textContent !== text) el.textContent = text
    }
  }, [])

  const writeStats = useCallback(
    (s: Pick<Stats, 'rate' | 'trades' | 'shares' | 'mid' | 'spread'>) => {
      write('rate', `${s.rate.toFixed(1)} a second`)
      write('mid', fmt.mid(s.mid))
      write('spread', fmt.spread(s.spread))
      write('trades', `${s.trades} · ${fmt.shares(s.shares)}`)
    },
    [write],
  )

  const writeProbe = useCallback(
    (r: Reading | null) => {
      last.current = r
      if (!r) {
        write('p-price', '—')
        write('p-side', HINT)
        write('p-queue', '—')
        write('p-cum', '')
        write('p-ago', '—')
        return
      }
      write('p-price', fmt.usd(r.price))
      write('p-side', fmt.side(r))
      write('p-queue', r.side === 'spread' ? 'no queue' : `${fmt.shares(r.queue)} at this price`)
      write('p-cum', r.side === 'spread' ? `· mid ${fmt.mid(r.mid)}` : `· ${Math.round(r.cum).toLocaleString('en-US')} between here and the ${r.side === 'bid' ? 'best bid' : 'best ask'}`)
      write('p-ago', fmt.ago(r.ago))
    },
    [write],
  )

  const create: Create = useCallback(
    (env) => {
      let mod: Mod | null = null
      let inner: Renderer | null = null
      let size: [number, number, number, number] | null = null
      let q = 2
      let pal: Palette = env.palette
      let dead = false
      void import('./renderer').then((m) => (mod = m))
      const sim = posterSim()
      shared.current = {
        sim,
        labels: labels.current!,
        key: key.current,
        paused: pausedRef.current,
        onFrame: (stats, reading) => {
          writeStats(stats)
          writeProbe(reading)
        },
      }
      return {
        frame(t, dt) {
          if (dead) return false
          if (!inner) {
            if (!mod || !shared.current) return false
            inner = mod.createBookRenderer({ ...env, palette: pal }, shared.current)
            if (size) inner.resize(...size)
            inner.setQuality?.(q)
          }
          return inner.frame(t, dt)
        },
        resize(...a) {
          size = a
          inner?.resize(...a)
        },
        setQuality(l) {
          q = l
          inner?.setQuality?.(l)
        },
        setPalette(p) {
          pal = p
          inner?.setPalette?.(p)
        },
        dispose() {
          dead = true
          inner?.dispose()
          shared.current = null
        },
      }
    },
    [writeProbe, writeStats],
  )

  const { box, canvas, live } = useStage(create)

  // Readouts start as the poster's frame: the same numbers, computed on the server.
  useEffect(() => {
    writeStats(initial)
    writeProbe(null)
  }, [initial, writeStats, writeProbe])

  // Announce a probe the reader moved, once it settles — never the stream.
  const announce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settle = () => {
    if (announce.current) clearTimeout(announce.current)
    announce.current = setTimeout(() => {
      const r = last.current
      if (r) setSpoken(sentence(r))
    }, 400)
  }
  useEffect(() => () => {
    if (announce.current) clearTimeout(announce.current)
  }, [])

  const setKey = (k: KeyProbe | null) => {
    key.current = k
    if (shared.current) shared.current.key = k
    if (!live) {
      // The still frame: read the frozen snapshot directly.
      if (!k) return writeProbe(null)
      frozen.current ??= posterSim()
      const s = frozen.current
      writeProbe(readAt(s, Math.round(s.mids[s.row(0)]!) + k.dp, k.age))
    }
  }

  const togglePause = () => {
    const next = !pausedRef.current
    pausedRef.current = next
    if (shared.current) shared.current.paused = next
    setPaused(next)
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = key.current ?? shared.current?.key ?? null
    const big = e.shiftKey
    const move = (ddp: number, dage: number) => {
      e.preventDefault()
      const cur = k ?? PROBE_START
      const next = k
        ? { dp: Math.max(-MAX_DP, Math.min(MAX_DP, cur.dp + ddp * (big ? 10 : 1))), age: Math.max(0, Math.min(240, cur.age + dage * (big ? 60 : 12))) }
        : cur
      setKey(next)
      setProbing(true)
      settle()
    }
    switch (e.key) {
      case 'ArrowLeft':
        return move(-1, 0)
      case 'ArrowRight':
        return move(1, 0)
      case 'ArrowUp':
        return move(0, 1)
      case 'ArrowDown':
        return move(0, -1)
      case 'Home':
        e.preventDefault()
        setKey(PROBE_START)
        setProbing(true)
        settle()
        return
      case 'Escape':
        setKey(null)
        setProbing(false)
        return
      case ' ':
        if (!live) return
        e.preventDefault()
        togglePause()
        return
    }
  }

  const ref = (id: string) => (el: HTMLElement | null) => {
    out.current[id] = el
  }

  return (
    <section aria-labelledby="lab-b-title" className="border-b border-rule">
      <div className="relative isolate h-[88svh] min-h-[520px] overflow-hidden">
        <div
          ref={box}
          role="group"
          tabIndex={0}
          aria-roledescription="interactive figure"
          aria-label="Synthetic order book as terrain. Arrow keys move the probe across price and back in time; Home resets; Escape clears; Space pauses."
          aria-describedby="lab-b-probe"
          onKeyDown={onKey}
          onFocus={() => {
            if (!key.current) {
              setKey(PROBE_START)
              setProbing(true)
            }
          }}
          className="absolute inset-0 cursor-crosshair touch-pan-y select-none focus-visible:outline-offset-[-4px]"
        >
          <div data-lab-poster className="absolute inset-0" style={underlay(live)}>
            <div className="h-full portrait:hidden">{posterWide}</div>
            <div className="hidden h-full portrait:block">{posterNarrow}</div>
          </div>
          <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full" style={fade(live)} />
          <div ref={labels} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={fade(live)} />
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 pt-4 sm:pt-6">
          <Shell>
            <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-3">
              <div className="max-w-[34rem]">
                <p id="lab-b-title" className="text-small text-ink sm:text-body">
                  Buyers wait on the left, sellers on the right. The line in the valley is the price, and each spark is a trade.
                </p>
                <p className="text-meta mt-1 font-mono text-graphite">Synthetic order flow, simulated live in your browser</p>
              </div>
              <Readouts className="hidden lg:grid" initial={initial} set={ref} />
            </div>
          </Shell>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 pb-4 sm:pb-6">
          <Shell>
            <div className="flex items-end justify-between gap-x-6">
              <dl id="lab-b-probe" className="text-meta grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] gap-x-3 font-mono sm:flex-none" aria-label="Probe reading">
                <dt className="text-graphite">Probe</dt>
                <dd className="truncate text-ink">
                  <span ref={ref('p-price')} className="tabular">
                    —
                  </span>{' '}
                  <span ref={ref('p-side')} className="text-graphite">
                    {HINT}
                  </span>
                </dd>
                <dt className="text-graphite">Queue</dt>
                <dd className="truncate text-ink">
                  <span ref={ref('p-queue')} className="tabular">
                    —
                  </span>{' '}
                  <span ref={ref('p-cum')} className="text-graphite" />
                </dd>
                <dt className="text-graphite">When</dt>
                <dd ref={ref('p-ago')} className="tabular truncate text-ink">
                  —
                </dd>
              </dl>
              {live ? (
                <button
                  type="button"
                  onClick={togglePause}
                  aria-pressed={paused}
                  className="text-meta pointer-events-auto h-8 flex-none rounded-sm border border-graphite bg-paper px-2.5 font-mono text-ink transition-[border-color,transform] duration-150 ease-out hover:border-ink active:scale-[0.97]"
                >
                  {paused ? 'Resume' : 'Pause'}
                </button>
              ) : null}
            </div>
            <p className="sr-only" aria-live="polite">
              {probing ? spoken : ''}
            </p>
          </Shell>
        </div>
      </div>
      <div className="border-t border-rule py-4 lg:hidden">
        <Shell>
          <Readouts className="grid" initial={initial} set={ref} suffix="-m" />
        </Shell>
      </div>
    </section>
  )
}

function Readouts({ className, initial, set, suffix = '' }: { className: string; initial: Initial; set: (id: string) => (el: HTMLElement | null) => void; suffix?: string }) {
  const rows: [string, string, ReactNode][] = [
    ['mid', 'Mid', fmt.mid(initial.mid)],
    ['spread', 'Spread', fmt.spread(initial.spread)],
    ['trades', 'Trades, 10 s', `${initial.trades} · ${fmt.shares(initial.shares)}`],
    ['rate', 'Events, 10 s', `${initial.rate.toFixed(1)} a second`],
    ['expected', 'Stationary rate', `${initial.expected.toFixed(1)} a second`],
    ['rho', 'Branching ratio', initial.rho.toFixed(2)],
  ]
  return (
    <dl className={`text-meta grid-cols-[auto_17ch] gap-x-3 font-mono sm:grid-cols-[auto_17ch_auto_17ch] sm:gap-x-5 lg:grid-cols-[auto_17ch] lg:gap-x-4 ${className}`}>
      {rows.map(([id, label, value]) => (
        <div key={id} className="contents">
          <dt className="text-graphite lg:text-right">{label}</dt>
          <dd ref={id === 'expected' || id === 'rho' ? undefined : set(id + suffix)} className="tabular text-ink">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
