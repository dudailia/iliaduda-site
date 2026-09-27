'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { FigureFrame, Readouts } from '@/components/FigureFrame'
import { cssColor, useColorScheme, useInView, useReducedMotion } from '@/components/stage/env'
import { fade, underlay } from '@/components/stage/useStage'
import { EVENTS, HAWKES, MARKET_BUY, MARKET_SELL, type Flow } from '@/lib/market/flow'
import { HEIGHT, LAM_MAX, LAM_MID, LANE_H, QUEUE_MID, Y, lamY, laneAt, laneTop } from '@/lib/orderbook/flowLayout'
import { LANES, LANE_NAMES, LANE_OF, NAMES, SECONDS, causes, flowFrame, pickEvent, type FlowFrame } from '@/lib/orderbook/flowview'
import { fmt } from '@/lib/orderbook/read'
import { market } from '../orderbook/market'
import { drawFlow, plot, type Look, type Selected } from './draw'

/**
 * Fig. 2 of /order-book, live: the order flow behind Fig. 1's terrain, on the
 * same market at the same moment (../orderbook/market.ts): the last ten
 * seconds of orders in six lanes, how fast market orders are arriving, and the
 * queues at the touch, with each moment one ran out. Pointing at an order,
 * tapping it, or stepping to it with the arrow keys reads it: what it was, and
 * what set it off, by the kind of earlier order, beside the chance it came on
 * its own, with each kind's wake shaded behind it; Fig. 1 marks it on its
 * terrain.
 *
 * Its motion is the market's own, on Fig. 1's clock, held by the same Pause:
 * there is no second signature. Under reduced motion it draws the still
 * frame's moment once, and reading an order still works.
 */

export interface Initial {
  buys: number
  sells: number
  own: number
  theory: number
  emptied: number
}

const CONTROL =
  'text-meta min-h-8 rounded-sm border border-graphite px-2.5 py-1.5 font-mono text-ink transition-[border-color,scale] duration-150 ease-out hover:border-ink active:scale-[0.97]'
const noop = () => () => {}
const onVisibility = (fn: () => void) => {
  document.addEventListener('visibilitychange', fn)
  return () => document.removeEventListener('visibilitychange', fn)
}

/** An order, by its place in the market's ring and its time, which together say it is still the same order. */
type Ref = { e: number; t: number }
/** An order read: what it was, and what set it off. Times are absolute, so a reading never goes stale. */
type Read = { type: number; price: number; size: number; t: number; own: number; byKind: { type: number; p: number }[] }

const ageOf = (f: Flow, e: number) => (((f.eventHead - e) % EVENTS) + EVENTS) % EVENTS
const alive = (f: Flow, r: Ref | null): r is Ref => !!r && f.ev.t[r.e] === r.t && f.t - r.t <= SECONDS
const rgb = (name: string) => `rgb(${cssColor(name).map((v) => Math.round(v * 255)).join(' ')})`
const upper = (s: string) => `${s[0]!.toUpperCase()}${s.slice(1)}`

export function OrderFlowLive({ poster, initial, title, subtitle, caption, table }: { poster: ReactNode; initial: Initial; title: string; subtitle: string; caption: ReactNode; table: ReactNode }) {
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const out = useRef<Record<string, HTMLElement | null>>({})
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  const shown = useSyncExternalStore(onVisibility, () => document.visibilityState === 'visible', () => true)
  const inView = useInView(stage, '100px')
  const reduced = useReducedMotion()
  const scheme = useColorScheme()
  const paused = useSyncExternalStore(market.subscribe, market.getPaused, () => false)
  const [drawn, setDrawn] = useState(false)
  const [spoken, setSpoken] = useState('')
  /** The pinned order (a click, a tap, the keyboard) and the one under the mouse; the mouse's wins while it is there. */
  const pinned = useRef<Ref | null>(null)
  const hovered = useRef<Ref | null>(null)
  const cache = useRef(new Map<string, Read>())
  const redraw = useRef<() => void>(() => {})

  const write = useCallback((id: string, text: string) => {
    for (const k of [id, `${id}-m`]) {
      const el = out.current[k]
      if (el && el.textContent !== text) el.textContent = text
    }
  }, [])
  const ref = (id: string) => (el: HTMLElement | null) => {
    out.current[id] = el
  }

  /** What an order was and what set it off: worked out once per order, since neither ever changes. */
  const read = useCallback((f: Flow, r: Ref): Read => {
    const key = `${r.e}:${r.t}`
    const got = cache.current.get(key)
    if (got) return got
    const c = causes(f, HAWKES, ageOf(f, r.e))
    const x: Read = { type: f.ev.type[r.e]!, price: f.ev.price[r.e]!, size: f.ev.size[r.e]!, t: r.t, own: c.own, byKind: c.byKind }
    cache.current.set(key, x)
    if (cache.current.size > 64) cache.current.delete(cache.current.keys().next().value!)
    return x
  }, [])

  /** The reading below the figure, and the mark Fig. 1 shows: for the order under the pointer, or the pinned one. */
  const writeReading = useCallback(
    (f: Flow): Read | null => {
      const r = alive(f, hovered.current) ? hovered.current : alive(f, pinned.current) ? pinned.current : null
      if (!r) {
        write('ev', '—')
        write('ev-more', 'point at an order')
        write('par', '—')
        write('own-one', '—')
        market.highlight = null
        return null
      }
      const x = read(f, r)
      write('ev', upper(NAMES[x.type]!))
      write('ev-more', `· ${fmt.shares(x.size)} at ${fmt.usd(x.price)} · ${(f.t - x.t).toFixed(2)} s ago`)
      write('par', setOff(x))
      write('own-one', fmt.pct(x.own))
      market.highlight = { price: x.price, t: x.t }
      return x
    },
    [read, write],
  )

  const writeStats = useCallback(
    (fr: FlowFrame, cols: number) => {
      const count = (type: number) => {
        let n = 0
        const l = LANE_OF[type]!
        for (let c = 0; c < cols; c++) n += fr.counts[l * cols + c]!
        return n
      }
      write('buys', perSecond(count(MARKET_BUY)))
      write('sells', perSecond(count(MARKET_SELL)))
      write('own', `${fmt.pct(fr.own)}`)
      write('emptied', String(fr.emptied.length))
    },
    [write],
  )

  // The drawing loop: while the figure is on screen, the page is shown, motion is welcome and the market not paused;
  // otherwise one frame, redrawn on any change.
  useEffect(() => {
    if (!mounted) return
    const st = stage.current!, cv = canvas.current!
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const look: Look = { ink: rgb('--color-ink'), paper: rgb('--color-paper'), graphite: rgb('--color-graphite'), rule: rgb('--color-rule'), indigo: rgb('--color-indigo'), wash: rgb('--color-indigo-wash') }
    let w = 0, dpr = 1, raf = 0, statsAt = -1e9, draws = 0
    const size = () => {
      w = st.clientWidth
      dpr = Math.min(2, window.devicePixelRatio || 1)
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(HEIGHT * dpr)
    }
    const draw = () => {
      const f = market.flow
      const cols = Math.max(60, Math.min(900, Math.round(plot(w).pw)))
      const fr = flowFrame(f, { t0: f.t - SECONDS, t1: f.t, cols }, HAWKES)
      if (pinned.current && !alive(f, pinned.current)) pinned.current = null
      if (hovered.current && !alive(f, hovered.current)) hovered.current = null
      const r = hovered.current ?? pinned.current
      let sel: Selected | null = null
      if (r) {
        const x = read(f, r)
        sel = { ago: f.t - x.t, lane: LANE_OF[x.type]!, wake: x.byKind.map((k) => ({ lane: LANE_OF[k.type]!, p: k.p, beta: HAWKES.decay[k.type]! })) }
      }
      drawFlow(ctx, w, HEIGHT, dpr, fr, cols, look, sel)
      // For the specs and ?debug=1: frames drawn, and the market's simulated clock.
      cv.dataset.draws = String(++draws)
      cv.dataset.simT = f.t.toFixed(3)
      const now = performance.now()
      if (now - statsAt > 250) {
        statsAt = now
        writeStats(fr, cols)
        writeReading(f)
      }
      setDrawn(true)
    }
    redraw.current = () => {
      statsAt = -1e9
      draw()
    }
    size()
    const ro = new ResizeObserver(() => {
      size()
      draw()
    })
    ro.observe(st)
    const loop = () => {
      market.tick()
      draw()
      raf = requestAnimationFrame(loop)
    }
    if (inView && shown && !reduced && !paused) raf = requestAnimationFrame(loop)
    else if (inView || reduced) draw()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      redraw.current = () => {}
    }
  }, [mounted, inView, shown, reduced, paused, scheme, read, writeReading, writeStats])

  // Reading an order, by pointer or by key.
  const under = (e: PointerEvent<HTMLDivElement>): Ref | null => {
    const f = market.flow
    const box = stage.current!.getBoundingClientRect()
    const x = e.clientX - box.left
    const lane = laneAt(e.clientY - box.top)
    const { x0, pw } = plot(box.width)
    if (lane < 0 || x < x0 - 4 || x > x0 + pw + 4) return null
    const age = pickEvent(f, { t0: f.t - SECONDS, t1: f.t, cols: 1 }, (x - x0) / pw, lane, (6 / pw) * SECONDS)
    if (age === null) return null
    const i = f.event(age)
    return { e: i, t: f.ev.t[i]! }
  }
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pin = (r: Ref | null) => {
    pinned.current = r
    hovered.current = null
    redraw.current()
    // Announce an order the reader chose, once it settles: never the stream.
    const f = market.flow
    const x = r && alive(f, r) ? read(f, r) : null
    if (settle.current) clearTimeout(settle.current)
    settle.current = setTimeout(() => setSpoken(x ? `${upper(NAMES[x.type]!)}, ${fmt.shares(x.size)} at ${fmt.usd(x.price)}. Set off by ${setOff(x)}; on its own, ${fmt.pct(x.own)}.` : ''), 400)
  }
  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current)
    },
    [],
  )

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return
    hovered.current = under(e)
    redraw.current()
  }
  const onLeave = () => {
    hovered.current = null
    redraw.current()
  }

  /** The next order in `lane` from ring age `from`, older (dir +1) or newer (−1), inside the window. */
  const step = (f: Flow, from: number, lane: number, dir: 1 | -1): Ref | null => {
    const type = LANES[lane]
    for (let a = from + dir; a >= 0 && a < f.eventCount; a += dir) {
      const i = f.event(a)
      if (f.t - f.ev.t[i]! > SECONDS) return null
      if (f.ev.type[i] === type) return { e: i, t: f.ev.t[i]! }
    }
    return null
  }
  /** The order in `lane` nearest in time to t. */
  const nearest = (f: Flow, t: number, lane: number): Ref | null => {
    const age = pickEvent(f, { t0: f.t - SECONDS, t1: f.t, cols: 1 }, (t - (f.t - SECONDS)) / SECONDS, lane, SECONDS)
    return age === null ? null : { e: f.event(age), t: f.ev.t[f.event(age)]! }
  }
  const newest = (lane: number) => step(market.flow, -1, lane, 1)

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const f = market.flow
    const cur = alive(f, pinned.current) ? pinned.current : null
    const lane = cur ? LANE_OF[f.ev.type[cur.e]!]! : LANES.indexOf(MARKET_BUY)
    const go = (r: Ref | null) => {
      e.preventDefault()
      if (r) pin(r)
    }
    switch (e.key) {
      case 'ArrowLeft':
        return go(cur ? step(f, ageOf(f, cur.e), lane, 1) : newest(lane))
      case 'ArrowRight':
        return go(cur ? step(f, ageOf(f, cur.e), lane, -1) : newest(lane))
      case 'ArrowUp':
      case 'ArrowDown': {
        const next = Math.max(0, Math.min(LANES.length - 1, lane + (e.key === 'ArrowUp' ? -1 : 1)))
        return go(cur ? nearest(f, cur.t, next) : newest(next))
      }
      case 'Home':
        return go(newest(lane))
      case 'Escape':
        return pin(null)
      case ' ':
        if (reduced) return
        e.preventDefault()
        market.setPaused(!market.paused)
        return
    }
  }

  const live = mounted && drawn

  return (
    <FigureFrame
      id="fig-order-flow"
      number="Fig. 2"
      title={title}
      subtitle={subtitle}
      rail={<Stats initial={initial} set={ref} suffix="" />}
      railBelow={false}
      hint={`${mounted && !reduced ? 'Point at an order, or tap it' : 'Tap an order'}, or tab to the figure and use the arrow keys, to read what set it off.${live && !reduced ? ' Space pauses both figures.' : ''}`}
      caption={caption}
      table={table}
    >
      {/* The stage's width decides where the lane names go, so it sits in a container it can be measured by. */}
      <div className="@container -mx-6 sm:mx-0">
        <div
          ref={stage}
          role="group"
          tabIndex={0}
          aria-roledescription="interactive figure"
          aria-label="The order flow behind Fig. 1. Arrow keys step through the orders: left and right in time, up and down between kinds; Home goes to the newest; Escape clears; Space pauses."
          aria-describedby="fig-order-flow-reading"
          onKeyDown={onKey}
          onFocus={() => {
            if (!pinned.current) pin(newest(LANES.indexOf(MARKET_BUY)))
          }}
          onPointerMove={onMove}
          onPointerLeave={onLeave}
          onPointerUp={(e) => pin(under(e))}
          className="relative cursor-crosshair touch-pan-y select-none [--g:0px] focus-visible:outline-offset-[-4px] @min-[520px]:[--g:124px]"
          style={{ height: HEIGHT }}
        >
          <div className="absolute inset-y-0 right-2 left-(--g)" style={underlay(live)}>
            {poster}
          </div>
          <canvas ref={canvas} aria-hidden className="absolute inset-0 size-full" style={fade(live)} />
          <Labels />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        {/* Room kept for the longest reading, so choosing an order never moves the page below it. */}
        <dl
          id="fig-order-flow-reading"
          className="text-meta grid min-h-[6.6rem] min-w-0 grid-cols-[auto_minmax(0,1fr)] content-start gap-x-3 font-mono sm:min-h-[3.9rem]"
          aria-label="Reading"
        >
          <dt className="text-graphite">Order</dt>
          <dd className="text-ink sm:truncate">
            <span ref={ref('ev')}>—</span>{' '}
            <span ref={ref('ev-more')} className="text-graphite">
              point at an order
            </span>
          </dd>
          <dt className="text-graphite">Set off by</dt>
          <dd ref={ref('par')} className="text-ink sm:truncate">
            —
          </dd>
          <dt className="text-graphite">On its own</dt>
          <dd ref={ref('own-one')} className="text-ink sm:truncate">
            —
          </dd>
        </dl>
        <div data-orderflow-controls="" className="flex min-h-8 flex-wrap gap-2">
          {live && !reduced ? (
            <button type="button" onClick={() => market.setPaused(!market.paused)} aria-pressed={paused} className={CONTROL}>
              {paused ? 'Resume' : 'Pause'}
            </button>
          ) : null}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {spoken}
      </p>
      <div className="mt-4 lg:hidden">
        <Stats initial={initial} set={ref} suffix="-m" across />
      </div>
    </FigureFrame>
  )
}

const perSecond = (n: number) => `${n} · ${(n / SECONDS).toFixed(1)} a second`

/** The margin's readouts, written live from the drawing loop (the "-m" copy is the phone's, below the figure). */
function Stats({ initial, set, suffix, across = false }: { initial: Initial; set: (id: string) => (el: HTMLElement | null) => void; suffix: string; across?: boolean }) {
  const rows = [
    { label: 'Market buys, 10 s', value: <span ref={set(`buys${suffix}`)}>{perSecond(initial.buys)}</span> },
    { label: 'Market sells, 10 s', value: <span ref={set(`sells${suffix}`)}>{perSecond(initial.sells)}</span> },
    { label: 'Arrived on their own', value: <span ref={set(`own${suffix}`)}>{`${fmt.pct(initial.own)}`}</span> },
    { label: 'In theory', value: `${fmt.pct(initial.theory)}` },
    { label: 'Queues emptied, 10 s', value: <span ref={set(`emptied${suffix}`)}>{String(initial.emptied)}</span> },
  ]
  return <Readouts rows={rows} across={across} />
}

/** What set an order off, by the kind of earlier order, likeliest first (the three likeliest kinds). */
function setOff(x: Read): string {
  return x.byKind.length ? x.byKind.slice(0, 3).map((k) => `${LANE_NAMES[LANE_OF[k.type]!]!.toLowerCase()} ${fmt.pct(k.p)}`).join(' · ') : 'no earlier order'
}

/**
 * The strips' names and rules, over the poster and the canvas alike: lane names in the gutter on a wide stage and
 * inside the lanes on a phone, the intensity's two halves, the queues' sides, and the time axis.
 */
function Labels() {
  const text = 'pointer-events-none absolute whitespace-nowrap font-mono text-meta leading-none'
  const gutter = `${text} hidden @min-[520px]:block right-[calc(100%-var(--g)+0.5rem)] text-right text-graphite`
  const inside = `${text} left-1.5 rounded-sm bg-paper px-1 text-graphite @min-[520px]:hidden`
  const top = (y: number) => ({ top: Math.round(y) })
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {LANE_NAMES.map((name, i) => (
        <span key={name} className={gutter} style={top(laneTop(i) + LANE_H / 2 - 6.5)}>
          {name}
        </span>
      ))}
      {LANE_NAMES.map((name, i) => (
        <span key={`${name}-in`} className={inside} style={top(laneTop(i) + LANE_H / 2 - 7)}>
          {name}
        </span>
      ))}

      {/* One line where there is room; on a phone two, so none runs off the frame. */}
      <span className={`${text} hidden text-ink @min-[520px]:block @min-[520px]:left-(--g)`} style={top(Y.intensity - 17)}>
        Market orders a second: <Swatch className="bg-rule" /> on their own <Swatch className="bg-indigo-wash" /> set off
        <span className="hidden @min-[600px]:inline"> by earlier orders</span>
      </span>
      <span className={`${text} left-1.5 text-ink @min-[520px]:hidden`} style={top(Y.intensity - 32)}>
        Market orders a second:
        <br />
        <Swatch className="bg-rule" /> on their own <Swatch className="bg-indigo-wash" /> set off by others
      </span>
      <span className={gutter} style={top(lamY(0, LAM_MAX / 2) - 6.5)}>
        Buys
      </span>
      <span className={gutter} style={top(lamY(1, LAM_MAX / 2) - 6.5)}>
        Sells
      </span>
      <span className={inside} style={top(lamY(0, LAM_MAX * 0.85) - 7)}>
        Buys
      </span>
      <span className={inside} style={top(lamY(1, LAM_MAX * 0.85) - 7)}>
        Sells
      </span>
      <div className="absolute right-2 left-(--g) border-t border-graphite/60" style={top(LAM_MID)} />

      <span className={`${text} left-1.5 text-ink @min-[520px]:left-(--g)`} style={top(Y.queue - 17)}>
        Shares at the touch: <Swatch className="bg-indigo" /> ran out<span className="hidden @min-[520px]:inline">, the price stepped</span>
      </span>
      <span className={gutter} style={top(QUEUE_MID - 26)}>
        Best bid
      </span>
      <span className={gutter} style={top(QUEUE_MID + 14)}>
        Best ask
      </span>
      <span className={inside} style={top(QUEUE_MID - 44)}>
        Best bid
      </span>
      <span className={inside} style={top(QUEUE_MID + 31)}>
        Best ask
      </span>
      <div className="absolute right-2 left-(--g) border-t border-graphite/60" style={top(QUEUE_MID)} />

      <div className="absolute right-2 left-(--g) flex justify-between pl-1.5 font-mono text-meta leading-none text-graphite @min-[520px]:pl-0" style={top(Y.axis + 7)}>
        <span>{`${SECONDS} s ago`}</span>
        <span>{`${SECONDS / 2} s ago`}</span>
        <span>now</span>
      </div>
    </div>
  )
}

function Swatch({ className }: { className: string }) {
  return <span className={`inline-block size-2.5 translate-y-px rounded-[1px] ${className}`} />
}
