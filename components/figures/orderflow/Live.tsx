'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { FigureFrame, Readouts } from '@/components/FigureFrame'
import { CONTROL } from '@/components/stage/controls'
import { cssColor, onDprChange, useColorScheme, useInView, useReducedMotion } from '@/components/stage/env'
import { FocusRing } from '@/components/stage/FocusRing'
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
  /** Of the window's market orders, the share set off by earlier orders; and the model's long-run share. */
  setOff: number
  theory: number
  emptied: number
}

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
/** Still in the market's ring of recent orders (about 27 simulated seconds), so it can be read. */
const alive = (f: Flow, r: Ref | null): r is Ref => !!r && f.ev.t[r.e] === r.t
/** And inside the strips' ten seconds, so it can be drawn. */
const onStrip = (f: Flow, r: Ref | null): r is Ref => alive(f, r) && f.t - r.t <= SECONDS
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
  const ready = useSyncExternalStore(market.subscribe, market.getReady, () => false)
  const still = useSyncExternalStore(market.subscribe, market.getStill, () => false)
  const held = useSyncExternalStore(market.subscribe, market.getHeld, () => false)
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
      // A pinned order the strips have moved past stays readable, and says so.
      write('ev-more', `· ${fmt.shares(x.size)} at ${fmt.usd(x.price)} · ${(f.t - x.t).toFixed(2)} s ago${f.t - x.t > SECONDS ? ', off the strip' : ''}`)
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
      write('own', fmt.pct(1 - fr.ownMarket))
      write('emptied', String(fr.emptied.length))
    },
    [write],
  )

  // The drawing loop: while the figure is on screen, the page is shown, motion is welcome, the market not paused and
  // Fig. 1 live; otherwise one frame, redrawn on any change. The market is built (in slices) only for a reader who
  // comes near the figure; until it is, the still frame stays.
  useEffect(() => {
    if (!mounted) return
    if (!ready) {
      if (inView) void market.prepare()
      return
    }
    const st = stage.current!, cv = canvas.current!
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const look: Look = { ink: rgb('--color-ink'), paper: rgb('--color-paper'), graphite: rgb('--color-graphite'), rule: rgb('--color-rule'), indigo: rgb('--color-indigo'), wash: rgb('--color-indigo-wash') }
    let w = 0, dpr = 1, raf = 0, statsAt = -1e9, draws = 0, first = false
    const size = () => {
      w = st.clientWidth
      dpr = Math.min(3, window.devicePixelRatio || 1)
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(HEIGHT * dpr)
    }
    // The last frame's strips: refilled in place each frame, and used as they are until the window moves on a column
    // (a pointer moving over a paused figure redraws the selection, not the window).
    let fr: FlowFrame | undefined
    let frAt = NaN, frCols = 0
    const draw = () => {
      const f = market.flow
      const cols = Math.max(60, Math.min(900, Math.round(plot(w).pw)))
      // The window ends on a whole column, so the strips step by exactly one column as time passes: binned against a
      // window sliding by a fraction every frame, an order would hop between neighbouring columns and the curves shimmer.
      const step = SECONDS / cols
      const t1 = Math.floor(f.t / step) * step
      if (!fr || t1 !== frAt || cols !== frCols) {
        fr = flowFrame(f, { t0: t1 - SECONDS, t1, cols }, HAWKES, fr)
        frAt = t1
        frCols = cols
      }
      if (pinned.current && !alive(f, pinned.current)) pinned.current = null
      if (hovered.current && !onStrip(f, hovered.current)) hovered.current = null
      const r = hovered.current ?? pinned.current
      let sel: Selected | null = null
      if (r && onStrip(f, r)) {
        const x = read(f, r)
        sel = { ago: Math.max(0, t1 - x.t), lane: LANE_OF[x.type]!, wake: x.byKind.map((k) => ({ lane: LANE_OF[k.type]!, p: k.p, beta: HAWKES.decay[k.type]! })) }
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
      if (!first) {
        first = true
        setDrawn(true)
      }
    }
    // A change the reader made (a pointer, a key): drawn in the next frame, once, however many arrive before it.
    let asked = 0
    redraw.current = () => {
      statsAt = -1e9
      if (!asked) asked = requestAnimationFrame(() => {
        asked = 0
        draw()
      })
    }
    size()
    const ro = new ResizeObserver(() => {
      size()
      draw()
    })
    ro.observe(st)
    // On another screen's density, or a zoom: its own pixels again.
    const unDpr = onDprChange(() => {
      size()
      draw()
    })
    // Paused, it draws on while the market coasts to rest (240ms), then stops.
    const loop = () => {
      market.tick()
      draw()
      if (paused && !market.moving) return
      raf = requestAnimationFrame(loop)
    }
    if (inView && shown && !reduced && (!paused || market.moving) && !still && !held) raf = requestAnimationFrame(loop)
    else if (inView || reduced || still || held) draw()
    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(asked)
      ro.disconnect()
      unDpr()
      redraw.current = () => {}
    }
  }, [mounted, ready, inView, shown, reduced, paused, still, held, scheme, read, writeReading, writeStats])

  // Reading an order, by pointer or by key.
  const under = (e: PointerEvent<HTMLDivElement>): Ref | null => {
    if (!market.ready) return null
    const f = market.flow
    const box = stage.current!.getBoundingClientRect()
    const x = e.clientX - box.left
    const lane = laneAt(e.clientY - box.top)
    const { x0, pw } = plot(box.width)
    if (lane < 0 || x < x0 - 4 || x > x0 + pw + 4) return null
    // Six pixels either side for a mouse; a fingertip is wider, and the strips move under it, so fourteen.
    const reach = e.pointerType === 'touch' ? 14 : 6
    const age = pickEvent(f, { t0: f.t - SECONDS, t1: f.t, cols: 1 }, (x - x0) / pw, lane, (reach / pw) * SECONDS)
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
    const f = market.ready ? market.flow : null
    const x = f && r && alive(f, r) ? read(f, r) : null
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
    // A key on the strips is the keyboard reading them: they hold while it does.
    market.hold('focus', true)
    if (e.key === ' ' && !reduced && !still) {
      e.preventDefault()
      market.setPaused(!market.paused)
      return
    }
    // Before the market is built there is nothing to step through yet; it is on its way.
    if (!market.ready) {
      void market.prepare()
      if (e.key.startsWith('Arrow') || e.key === 'Home') e.preventDefault()
      return
    }
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
      hint={
        // Room kept for the longest hint (the live figure's, three lines on a phone), so going live never moves the page below.
        <span className="block min-h-[3lh] sm:min-h-[2lh]">
          {/* Said for the pointer this reader has, once the browser has said which: a finger taps, and has no keys to name. */}
          {!mounted
            ? 'Tap or click an order, or tab to the figure and use the arrow keys, to read what set it off.'
            : matchMedia('(pointer: coarse)').matches
              ? 'Tap an order to read what set it off.'
              : `${reduced ? 'Click an order' : 'Point at an order, or click it'}, or tab to the figure and use the arrow keys, to read what set it off.${live && !reduced && !still ? ' Space pauses both figures.' : ''}`}
        </span>
      }
      caption={caption}
      table={table}
    >
      {/* The stage's width decides where the lane names go, so it sits in a container it can be measured by. */}
      <div className="@container relative -mx-6 sm:mx-0">
        <div
          ref={stage}
          role="group"
          tabIndex={0}
          aria-roledescription="interactive figure"
          aria-label="The order flow behind Fig. 1. Arrow keys step through the orders: left and right in time, up and down between kinds; Home goes to the newest; Escape clears; Space pauses."
          aria-describedby="fig-order-flow-reading"
          onKeyDown={onKey}
          onFocus={(e) => {
            // Stepping through orders from the keyboard holds the strips too, until focus moves on; a click that
            // focuses the strips holds nothing (a mouse over them holds them already), so the market never stays frozen.
            if (e.currentTarget.matches(':focus-visible')) market.hold('focus', true)
            if (pinned.current) return
            if (market.ready) return pin(newest(LANES.indexOf(MARKET_BUY)))
            void market.prepare().then(() => {
              if (!pinned.current && document.activeElement === stage.current) pin(newest(LANES.indexOf(MARKET_BUY)))
            })
          }}
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse') market.hold('pointer', true)
          }}
          onPointerMove={onMove}
          onPointerLeave={(e) => {
            market.hold('pointer', false)
            onLeave()
            void e
          }}
          onBlur={() => market.hold('focus', false)}
          // A click pins the order being read, the one under the pointer a moment ago, not whatever slid under it.
          onPointerUp={(e) => pin(e.pointerType === 'mouse' && hovered.current && alive(market.flow, hovered.current) ? hovered.current : under(e))}
          className="peer relative cursor-crosshair touch-pan-y touch-pinch-zoom select-none [--g:0px] focus-visible:outline-none @min-[520px]:[--g:124px]"
          style={{ height: HEIGHT }}
        >
          <div className="absolute inset-y-0 right-2 left-(--g)" style={underlay(live)} data-orderflow-still="">
            {poster}
          </div>
          <canvas ref={canvas} aria-hidden className="absolute inset-0 size-full" style={fade(live)} />
          <Labels />
        </div>
        <FocusRing />
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
        {/* Room kept for the longest reading, so choosing an order never moves the page below it. */}
        <dl
          id="fig-order-flow-reading"
          className="text-meta grid min-h-[6.6rem] min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] content-start gap-x-3 font-mono sm:min-h-[4lh]"
          aria-label="Reading"
        >
          <dt className="text-graphite">Order</dt>
          <dd className="text-ink">
            <span ref={ref('ev')}>—</span>{' '}
            <span ref={ref('ev-more')} className="text-graphite">
              point at an order
            </span>
          </dd>
          <dt className="text-graphite">Set off by</dt>
          <dd ref={ref('par')} className="text-ink">
            —
          </dd>
          <dt className="text-graphite">On its own</dt>
          <dd ref={ref('own-one')} className="text-ink">
            —
          </dd>
        </dl>
        <div data-orderflow-controls="" className="flex min-h-8 shrink-0 gap-2">
          {live && !reduced && !still ? (
            <button type="button" onClick={() => market.setPaused(!market.paused)} className={`${CONTROL} min-w-[4.5rem]`} data-hold="">
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
    { label: 'Market orders set off, 10 s', value: <span ref={set(`own${suffix}`)}>{fmt.pct(initial.setOff)}</span> },
    { label: 'In theory', value: fmt.pct(initial.theory) },
    { label: 'Queues emptied, 10 s', value: <span ref={set(`emptied${suffix}`)}>{String(initial.emptied)}</span> },
  ]
  return <Readouts rows={rows} across={across} />
}

/** What set an order off, by the kind of earlier order, likeliest first: the three likeliest kinds, and the rest. */
function setOff(x: Read): string {
  if (!x.byKind.length) return 'no earlier order'
  // Each kind held to its share by no-break spaces, and each dot to the item before it: a line breaks between items only.
  const whole = (t: string) => t.replace(/ /g, '\u00a0')
  const kinds = x.byKind.slice(0, 3).map((k) => whole(`${LANE_NAMES[LANE_OF[k.type]!]!.toLowerCase()} ${fmt.pct(k.p)}`))
  const rest = x.byKind.slice(3).reduce((s, k) => s + k.p, 0)
  return [...kinds, ...(rest >= 0.0005 ? [whole(`others ${fmt.pct(rest)}`)] : [])].join('\u00a0· ')
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
    // Clipped to the stage: enlarged text (the strips' geometry is the canvas's, in pixels) never widens the page.
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-x-clip">
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
        Market orders a second: <Swatch className="bg-rule" /> on their own <Swatch className="bg-indigo/70" /> set off
        <span className="hidden @min-[600px]:inline"> by earlier orders</span>
      </span>
      <span className={`${text.replace('leading-none', 'leading-[1.3]')} left-1.5 text-ink @min-[520px]:hidden`} style={top(Y.intensity - 34)}>
        Market orders a second:
        <br />
        <Swatch className="bg-rule" /> on their own <Swatch className="bg-indigo/70" /> set off by others
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
        Shares at the touch: <Swatch className="bg-ink" /> ran out<span className="hidden @min-[520px]:inline">, the price stepped</span>
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
