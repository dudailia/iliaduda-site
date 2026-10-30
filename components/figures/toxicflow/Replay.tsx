'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { FigureFrame, Readouts } from '@/components/FigureFrame'
import { useInView, useReducedMotion } from '@/components/stage/env'
import { CONTROL, option } from '@/components/stage/controls'
import { useRadios } from '@/components/stage/radios'
import { rangeFill } from '@/components/stage/range'
import { book, height, type Book } from '@/lib/toxicflow/hero'
import { emptyReplay, type ReplayData, type ReplayHead, type ReplayStrategy } from '@/lib/toxicflow/replayShape'

/**
 * Fig. 1: one real minute of the BTCUSDT book as the strategies saw it, with B1's, B3's and F's simulated quotes, fills
 * and pulls on it in three lanes on one clock, and B3's Hawkes intensities under them. The lanes are drawn in data
 * units (milliseconds across, ticks from the mid up) with non-scaling strokes, so they fill any width without being
 * measured, and are drawn once; what moves is the playhead and the veil over what has not happened yet (every frame,
 * in place), the ladder and the readouts (once a step). A fill bursts as the playhead reaches it; a pulled side's
 * marker fades out of the ladder and comes back as it rejoins.
 *
 * It plays once by itself, at real time, when it is first seen; the reader can pause it, change its speed (0.25× to
 * 4×), scrub it and step it from the keyboard. Under reduced motion it opens on the whole minute and every control
 * but Play still reads it.
 */

const ROWS = 8
const SPEEDS = [0.25, 0.5, 1, 2, 4] as const
const LANE_H = 'h-(--lane)'
const GUTTER = 'ml-[3.4rem]'

function stepAt(t: readonly number[], ms: number): number {
  let lo = 0
  let hi = t.length - 1
  if (ms < t[0]!) return 0
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (t[mid]! <= ms) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** A step path through values held from one step to the next, broken where a value is missing. */
function steps(t: readonly number[], v: readonly (number | null)[], end: number, y: (x: number) => number): string {
  let d = ''
  let open = false
  for (let i = 0; i < t.length; i++) {
    const x1 = i + 1 < t.length ? t[i + 1]! : end
    const val = v[i]
    if (val == null) {
      open = false
      continue
    }
    d += open ? `V${y(val)}H${x1}` : `M${t[i]} ${y(val)}H${x1}`
    open = true
  }
  return d
}

const BURST: Keyframe[] = [
  { transform: 'scale(0.6)', opacity: 0.9 },
  { transform: 'scale(2.8)', opacity: 0 },
]
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'
/** One formatter, made once: toLocaleString builds one a call, thirty times a step. */
const PRICE = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/**
 * The minute is loaded on its own once the page is up, not carried in the page's HTML; until it arrives the figure
 * holds its full size, empty, so nothing under it moves when it fills.
 */
export function ReplayFigure({ head, description, table }: { head: ReplayHead; description: string; table: ReactNode }) {
  const [d, setD] = useState<ReplayData | null>(null)
  useEffect(() => {
    let live = true
    import('@/lib/toxicflow/replay')
      .then(({ replayData }) => {
        if (live) setD(replayData())
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  const empty = useMemo(() => emptyReplay(head), [head])
  return <ReplayView key={d ? 'minute' : 'frame'} d={d ?? empty} ready={!!d} description={description} table={table} />
}

interface Picked {
  readonly lane: number
  readonly n: number
}

function ReplayView({ d, ready, description, table }: { d: ReplayData; ready: boolean; description: string; table: ReactNode }) {
  const reduced = useReducedMotion()
  // A first look plays from the start, so it opens empty; reduced motion opens on the whole minute.
  // The step lives outside React's state: only the ladder, the readouts and the slider subscribe to it, so a step
  // redraws them alone, never the whole figure.
  const step = useMemo(() => stepStore(d.t.length - 1), [d])
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<number>(1)
  const [picked, setPicked] = useState<Picked | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const seen = useInView(box, '0px', 0.35)
  const ms = useRef(d.span)
  const veil = useRef<HTMLDivElement>(null)
  const head = useRef<HTMLDivElement>(null)
  const dots = useRef<(HTMLSpanElement | null)[]>([])
  const bursts = useRef(new Map<string, HTMLElement>())
  const played = useRef(false)
  // While it plays, the ladder and the readouts (a React render) follow the playhead at most every 45ms, a frame in
  // three at 60Hz: at 4× a step lasts 25ms, and a render each frame cost a phone its frame budget. The playhead, the
  // veil and the intensities' dots still move every frame, and a pause, a scrub or a key lands on the exact step.
  const shown = useRef(0)

  const mids = useMemo(() => d.bids.map((b, n) => (b[0]![0] + d.asks[n]![0]![0]) / 2), [d])
  const lamMax = useMemo(() => Math.max(1, ...d.lamB, ...d.lamS), [d.lamB, d.lamS])

  const place = useCallback(
    (t: number, burst = false) => {
      const from = ms.current
      ms.current = t
      const f = `${(t / d.span) * 100}%`
      if (veil.current) veil.current.style.left = f
      if (head.current) head.current.style.left = f
      const k = stepAt(d.t, t)
      for (const [n, v] of [d.lamB[k]!, d.lamS[k]!].entries()) {
        const el = dots.current[n]
        if (el) {
          el.style.left = f
          el.style.top = `${(1 - v / lamMax) * 100}%`
        }
      }
      if (burst && t > from) {
        d.strategies.forEach((s, lane) => {
          s.fills.forEach(([ft], n) => {
            if (ft > from && ft <= t) bursts.current.get(`${lane}-${n}`)?.animate(BURST, { duration: 650, easing: EASE_OUT })
          })
          s.pulls.forEach(([a], n) => {
            if (a > from && a <= t)
              bursts.current.get(`p${lane}-${n}`)?.animate([{ opacity: 0.9 }, { opacity: 0.3 }], { duration: 900, easing: EASE_OUT })
          })
        })
      }
      const at = performance.now()
      if (!burst || at - shown.current >= 45 || t >= d.span) {
        shown.current = at
        step.set(k)
      }
    },
    [d, lamMax, step],
  )
  const register = useCallback((key: string, el: HTMLElement | null) => {
    if (el) bursts.current.set(key, el)
    else bursts.current.delete(key)
  }, [])

  // The first look: the minute opens empty and plays at real time once a third of the figure is on screen.
  useEffect(() => {
    if (!ready || reduced || played.current) return
    place(0)
  }, [ready, reduced, place])
  useEffect(() => {
    if (!ready || reduced || played.current || !seen) return
    played.current = true
    setPlaying(true)
  }, [ready, reduced, seen])

  // Off screen, or in a hidden tab, the minute waits where it is and goes on when it is seen again.
  const running = playing && seen && !reduced
  useEffect(() => {
    if (!running) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      // A hidden tab or a long frame does not skip the minute ahead.
      const dt = Math.min(now - last, 100) * speed
      last = now
      const t = ms.current + dt
      if (t >= d.span) {
        place(d.span, true)
        setPlaying(false)
        return
      }
      place(t, true)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running, d.span, place, speed])

  const toggle = useCallback(() => {
    if (playing) setPlaying(false)
    else {
      played.current = true
      if (ms.current >= d.span) place(0)
      setPlaying(true)
    }
  }, [playing, d.span, place])
  const go = useCallback(
    (k: number) => {
      setPlaying(false)
      played.current = true
      place(d.t[Math.max(0, Math.min(d.t.length - 1, k))]!)
    },
    [d.t, place],
  )
  const faster = (by: 1 | -1) => setSpeed((v) => SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(v as (typeof SPEEDS)[number]) + by))]!)
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement
    const button = el.tagName === 'BUTTON'
    if ((e.key === ' ' && !button) || e.key === 'k' || e.key === 'K') {
      if (reduced) return
      e.preventDefault()
      toggle()
    } else if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && el.getAttribute('role') !== 'radio') {
      e.preventDefault()
      go(step.get() + (e.key === 'ArrowRight' ? 1 : -1) * Math.round(1000 / d.stepMs))
    } else if ((e.key === '-' || e.key === '_') && !reduced) {
      e.preventDefault()
      faster(-1)
    } else if ((e.key === '+' || e.key === '=') && !reduced) {
      e.preventDefault()
      faster(1)
    }
  }

  const radio = useRadios<number>(speed, (v) => setSpeed(v))

  const scale = useMemo(() => book(d), [d])
  // Stable across steps, so the lanes (memo) are drawn once, not once a step.
  const price = useCallback((ticks: number) => PRICE.format(d.base + ticks * d.tick), [d.base, d.tick])
  const clock = (t: number) => clockAt(d.from, t)
  const glide = playing && !reduced

  const seconds = useMemo(() => Array.from({ length: 5 }, (_, j) => (d.span * j) / 4), [d.span])
  const xPct = (t: number) => `${(t / d.span) * 100}%`
  const fill = picked ? d.strategies[picked.lane]!.fills[picked.n] : null

  const rail = <Rail d={d} step={step} price={price} ready={ready} />

  return (
    <FigureFrame
      id="replay"
      number="Fig. 1"
      vt="toxic-flow"
      title={`One minute of the BTCUSDT book, ${d.from} to ${d.to} UTC on ${d.day}, with three strategies’ simulated quotes`}
      subtitle={`Binance USDT-M perpetual · top ${d.levels} levels · ${d.stepMs} ms steps · B1, B3 and F on one clock`}
      rail={rail}
      hint="Space plays or pauses · the arrow keys step it, with Shift a second · − + the speed · point at a fill, or choose one, to read it"
      caption={
        <>
          Left, the book at the playhead: the {ROWS} prices either side of the spread, each bar the size waiting there, and
          each strategy’s bid and ask as an indigo mark in its own column, which fades out while that side is pulled. Right,
          the minute: over it the mid, with every print as a short stroke in its side’s colour (up for a buyer’s market
          order, down for a seller’s); then one lane per strategy, drawn in ticks from the mid so a quote’s place against the
          touch shows at any price, with its quotes in indigo, the touch in ink, its pulls as indigo bands on the side it
          pulled, and its simulated fills at their exchange time (bought: a filled dot; sold: a hollow one); under them the
          Hawkes intensities B3 reads. A fill’s 1 s markout is the mid one second after it against its price, signed so that
          negative is adverse, as the study defines it. The minute was fixed by a rule written before its data was looked
          at; it shows how the strategies behave, not how they perform, which only whole days measure.
        </>
      }
      table={table}
    >
      <p className="sr-only">{description}</p>
      <p className="text-meta mb-4 font-mono text-ink">Replay of historical Binance data. Fills are simulated.</p>
      <div onKeyDown={onKey}>
        <div ref={box} className={`grid gap-x-4 gap-y-5 sm:grid-cols-[12.5rem_minmax(0,1fr)] ${ready ? '' : 'invisible'}`}>
          <Ladder d={d} step={step} glide={glide} price={price} scale={scale} />

          {/* The minute, one column on one clock. */}
          <div className="min-w-0">
            <div className={`relative ${GUTTER} [--lane:5.5rem] sm:[--lane:6rem]`}>
              <MidStrip d={d} mids={mids} />
              {d.strategies.map((s, lane) => (
                <Lane key={s.name} d={d} s={s} lane={lane} mids={mids} register={register} pick={setPicked} picked={picked?.lane === lane ? picked.n : null} />
              ))}
              <Lambda d={d} lamMax={lamMax} dots={dots} />
              {/* What has not happened yet, and now. */}
              <div ref={veil} aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-[5] bg-paper/75" style={{ left: '100%' }} />
              <div ref={head} aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-[6] w-px bg-ink" style={{ left: '100%' }} />
              {fill && picked ? (
                <Tip
                  name={d.strategies[picked.lane]!.name}
                  f={fill}
                  price={price}
                  lane={picked.lane}
                  x={fill[0] / d.span}
                  y={(d.offHi - (fill[1] - mids[stepAt(d.t, fill[0])]!)) / (d.offHi - d.offLo)}
                  at={clock(fill[0])}
                />
              ) : null}
            </div>
            <div aria-hidden="true" className={`text-meta relative mt-1 h-4 font-mono tabular text-graphite ${GUTTER}`}>
              {seconds.map((t, n) => (
                <span key={t} className={`absolute whitespace-nowrap ${n === 0 ? '' : n === seconds.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: xPct(t) }}>
                  {(t / 1000).toFixed(0)} s
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 pointer-coarse:gap-y-3.5">
          {/* Under reduced motion the row keeps its room (the server's page is the reduced one, and nothing may move
              when a live reader's controls arrive), its controls hidden and out of the tab order. */}
          <button type="button" className={`${CONTROL} min-w-[4.25rem] ${reduced ? 'invisible' : ''}`} disabled={!ready || reduced} onClick={toggle}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <div role="radiogroup" aria-label="Speed" className={`flex gap-1 ${reduced ? 'invisible' : ''}`}>
            {SPEEDS.map((v) => (
              <button key={v} {...radio(v, SPEEDS)} className={option(v === speed)}>
                {v}×
              </button>
            ))}
          </div>
        </div>
        <label className="mt-4 block">
          <span className="text-meta font-mono text-graphite">Read a fill</span>
          <select
            value={picked ? `${picked.lane}-${picked.n}` : ''}
            disabled={!ready}
            onChange={(e) => {
              const [lane, n] = e.currentTarget.value.split('-').map(Number)
              setPicked(e.currentTarget.value ? { lane: lane!, n: n! } : null)
            }}
            className="text-note mt-1 block h-11 w-full rounded-sm border border-graphite bg-paper px-2 text-ink transition-[border-color] duration-150 ease-out hover:border-ink focus-visible:border-ink"
          >
            <option value="">none</option>
            {d.strategies.flatMap((s, lane) =>
              s.fills.map(([t, p, side, mk], n) => (
                <option key={`${lane}-${n}`} value={`${lane}-${n}`}>
                  {`${s.name} ${side > 0 ? 'bought' : 'sold'} at ${price(p)}, ${clock(t)}; 1 s markout ${mk == null ? 'past the minute' : `${mk < 0 ? '−' : '+'}${Math.abs(mk).toFixed(2)} bp`}`}
                </option>
              )),
            )}
          </select>
        </label>
        <Scrub d={d} step={step} price={price} ready={ready} go={go} />
      </div>
    </FigureFrame>
  )
}

/** The mid over the minute, and every print in its side's colour: the market every lane is drawn against. */
const MidStrip = memo(function MidStrip({ d, mids }: { d: ReplayData; mids: readonly number[] }) {
  const lo = Math.min(d.lo, ...d.trades.map((t) => t[1])) - 0.5
  const hi = Math.max(d.hi, ...d.trades.map((t) => t[1])) + 0.5
  const y = (p: number) => hi - p
  const mid = useMemo(() => steps(d.t, mids, d.span, y), [d, mids]) // eslint-disable-line react-hooks/exhaustive-deps
  const prints = useMemo(() => {
    const qm = Math.max(...d.trades.map((t) => t[2]))
    const out = { buy: '', sell: '' }
    for (const [t, p, q, side] of d.trades) {
      // Kept inside the strip (its viewBox), however near the minute's high or low the print is.
      const y0 = y(p)
      const y1 = Math.min(hi - lo, Math.max(0, y0 - side * (0.6 + Math.sqrt(q / qm) * (hi - lo) * 0.18)))
      out[side > 0 ? 'buy' : 'sell'] += `M${t} ${y0}V${y1}`
    }
    return out
  }, [d]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div aria-hidden="true">
      <p className="text-meta relative z-10 font-mono tabular text-graphite">
        mid, and every print: <span className="text-buy">buy ┃</span> <span className="text-sell">sell ┃</span>
      </p>
      <div className="relative mt-1 h-12">
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${d.span} ${hi - lo}`} preserveAspectRatio="none">
        <path d={prints.buy} stroke="var(--color-buy)" strokeWidth={1.25} fill="none" vectorEffect="non-scaling-stroke" />
        <path d={prints.sell} stroke="var(--color-sell)" strokeWidth={1.25} fill="none" vectorEffect="non-scaling-stroke" />
        <path d={mid} stroke="var(--color-ink)" strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
      </div>
    </div>
  )
})

/** One strategy's minute: its quotes against the touch, in ticks from the mid, its pulls and its fills. */
const Lane = memo(function Lane({
  d,
  s,
  lane,
  mids,
  register,
  pick,
  picked,
}: {
  d: ReplayData
  s: ReplayStrategy
  lane: number
  mids: readonly number[]
  register: (key: string, el: HTMLElement | null) => void
  pick: (p: Picked | null) => void
  picked: number | null
}) {
  const range = d.offHi - d.offLo
  const y = (off: number) => d.offHi - off
  const nearest = (e: { clientX: number; clientY: number; currentTarget: HTMLElement }, within: number): Picked | null => {
    const r = e.currentTarget.getBoundingClientRect()
    let best: Picked | null = null
    let dist = within
    s.fills.forEach(([t, p], n) => {
      const dx = r.left + (t / d.span) * r.width - e.clientX
      const dy = r.top + (y(p - mids[stepAt(d.t, t)]!) / range) * r.height - e.clientY
      const h = Math.hypot(dx, dy)
      if (h <= dist) {
        dist = h
        best = { lane, n }
      }
    })
    return best
  }
  const paths = useMemo(() => {
    const rel = (v: readonly (number | null)[]) => v.map((x, n) => (x == null ? null : x - mids[n]!))
    return {
      bid: steps(d.t, rel(d.bids.map((b) => b[0]![0])), d.span, y),
      ask: steps(d.t, rel(d.asks.map((a) => a[0]![0])), d.span, y),
      qb: steps(d.t, rel(s.bid), d.span, y),
      qa: steps(d.t, rel(s.ask), d.span, y),
    }
  }, [d, s, mids]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div
      className={`relative ${LANE_H} mt-2 border-t border-rule`}
      // The fills sit closer than a finger's width on a phone, so the lane reads the nearest one under the pointer or a
      // tap; the keyboard and a screen reader read them from the list under the figure's controls.
      onPointerMove={(e) => e.pointerType === 'mouse' && pick(nearest(e, 14))}
      onPointerLeave={(e) => e.pointerType === 'mouse' && pick(null)}
      onClick={(e) => {
        const f = nearest(e, 22)
        pick(f && f.n === picked ? null : f)
      }}
    >
      <span aria-hidden="true" className="text-meta absolute top-1/2 right-[calc(100%+0.5rem)] -translate-y-1/2 font-mono text-ink">
        {s.name}
      </span>
      {s.pulls.map(([a, b, side], n) => (
        <span
          key={n}
          ref={(el) => register(`p${lane}-${n}`, el)}
          aria-hidden="true"
          className={`absolute min-w-[3px] bg-indigo ${side > 0 ? 'top-1/2 bottom-0' : 'top-0 bottom-1/2'}`}
          style={{ left: `${(a / d.span) * 100}%`, width: `${((b - a) / d.span) * 100}%`, opacity: 0.3 }}
        />
      ))}
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox={`0 0 ${d.span} ${range}`} preserveAspectRatio="none">
        <line x1={0} x2={d.span} y1={y(0)} y2={y(0)} stroke="var(--color-rule)" vectorEffect="non-scaling-stroke" />
        <path d={paths.bid} stroke="var(--color-ink)" strokeOpacity={0.6} strokeWidth={1} fill="none" vectorEffect="non-scaling-stroke" />
        <path d={paths.ask} stroke="var(--color-ink)" strokeOpacity={0.6} strokeWidth={1} fill="none" vectorEffect="non-scaling-stroke" />
        <path d={paths.qb} stroke="var(--color-indigo)" strokeWidth={2} fill="none" vectorEffect="non-scaling-stroke" />
        <path d={paths.qa} stroke="var(--color-indigo)" strokeWidth={2} fill="none" vectorEffect="non-scaling-stroke" strokeDasharray="5 3" />
      </svg>
      {s.fills.map(([t, p, side], n) => (
        <span
          key={n}
          aria-hidden="true"
          className={`pointer-events-none absolute z-[4] grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full ${picked === n ? 'outline-2 -outline-offset-4 outline-ink' : ''}`}
          style={{ left: `${(t / d.span) * 100}%`, top: `${(y(p - mids[stepAt(d.t, t)]!) / range) * 100}%` }}
        >
          <span
            ref={(el) => register(`${lane}-${n}`, el)}
            className={`absolute size-[10px] rounded-full border-2 opacity-0 ${side > 0 ? 'border-buy' : 'border-sell'}`}
          />
          <span className={`block size-[10px] rounded-full border-2 ${side > 0 ? 'border-buy bg-buy' : 'border-sell bg-paper'}`} />
        </span>
      ))}
      <span aria-hidden="true" className="text-meta absolute top-0 right-[calc(100%+0.5rem)] font-mono tabular text-graphite">
        +{Math.round(d.offHi)}
      </span>
      <span aria-hidden="true" className="text-meta absolute right-[calc(100%+0.5rem)] bottom-0 font-mono tabular text-graphite">
        −{Math.round(-d.offLo)}
      </span>
    </div>
  )
})

/** B3's Hawkes intensities on the same clock, with a dot on each at the playhead. */
const Lambda = memo(function Lambda({ d, lamMax, dots }: { d: ReplayData; lamMax: number; dots: RefObject<(HTMLSpanElement | null)[]> }) {
  const ly = (v: number) => lamMax - v
  const lam = useMemo(() => ({ b: steps(d.t, d.lamB, d.span, ly), s: steps(d.t, d.lamS, d.span, ly) }), [d]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div aria-hidden="true" className="mt-3 border-t border-rule pt-2">
      <p className="text-meta relative z-10 font-mono text-graphite">
        B3’s Hawkes intensity, market orders a second · <span className="text-buy">buy ━</span> <span className="text-sell">sell ━</span>
      </p>
      <div className="relative mt-1.5 h-20">
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${d.span} ${lamMax}`} preserveAspectRatio="none">
          <line x1={0} x2={d.span} y1={lamMax} y2={lamMax} stroke="var(--color-rule)" vectorEffect="non-scaling-stroke" />
          <path d={lam.b} stroke="var(--color-buy)" strokeWidth={1.25} fill="none" vectorEffect="non-scaling-stroke" />
          <path d={lam.s} stroke="var(--color-sell)" strokeWidth={1.25} fill="none" vectorEffect="non-scaling-stroke" />
        </svg>
        {[0, 1].map((n) => (
          <span
            key={n}
            ref={(el) => {
              dots.current[n] = el
            }}
            className={`absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${n === 0 ? 'bg-buy' : 'bg-sell'}`}
            style={{ left: '100%', top: '100%' }}
          />
        ))}
        <span className="text-meta absolute top-0 right-[calc(100%+0.5rem)] font-mono tabular text-graphite">{lamMax.toFixed(0)}</span>
        <span className="text-meta absolute right-[calc(100%+0.5rem)] bottom-0 translate-y-1/3 font-mono tabular text-graphite">0</span>
      </div>
    </div>
  )
})

/** A fill, read: its side, price, time and 1 s markout, beside it. */
function Tip({ name, f, price, x, y, at, lane }: { name: string; f: readonly [number, number, number, number | null]; price: (t: number) => string; x: number; y: number; at: string; lane: number }) {
  const [, p, side, mk] = f
  const right = x > 0.6
  return (
    <div
      aria-hidden="true"
      className="text-meta pointer-events-none absolute z-20 w-max max-w-[15rem] rounded-sm border border-rule bg-paper px-2 py-1.5 font-mono tabular text-ink"
      style={{
        left: `${x * 100}%`,
        // The lanes sit under the mid strip (its label line and 3rem), each 0.5rem under the last; the tip sits beside
        // its fill.
        top: `calc(1.178rem + 3.25rem + 0.5rem + ${lane} * (var(--lane) + 0.5rem) + ${y} * var(--lane))`,
        transform: `translate(${right ? 'calc(-100% - 0.75rem)' : '0.75rem'}, -50%)`,
      }}
    >
      <span className={side > 0 ? 'text-buy' : 'text-sell'}>{side > 0 ? 'bought' : 'sold'}</span> · {name} · {at}
      <br />
      at {price(p)}
      <br />
      1 s markout{' '}
      {mk == null ? <span className="text-graphite">past the minute</span> : <span className={mk < 0 ? 'text-sell' : 'text-buy'}>{`${mk < 0 ? '−' : '+'}${Math.abs(mk).toFixed(2)} bp`}</span>}
    </div>
  )
}

function clockAt(from: string, t: number) {
  const [h, m, sec] = from.split(':').map(Number) as [number, number, number]
  const total = sec + t / 1000
  return `${String(h).padStart(2, '0')}:${String(m + Math.floor(total / 60)).padStart(2, '0')}:${(total % 60).toFixed(1).padStart(4, '0')}`
}

/** Where each strategy's quotes sit at step i; a pulled side keeps its last place, faded out, so it rejoins where it left. */
function marksAt(d: ReplayData, i: number) {
  const now = d.t[i]!
  return d.strategies.map((s) => {
    const last = (v: readonly (number | null)[]) => {
      for (let k = i; k >= 0; k--) if (v[k] != null) return v[k]!
      return null
    }
    return { name: s.name, bid: last(s.bid), ask: last(s.ask), bidOut: s.bid[i] == null, askOut: s.ask[i] == null, fills: s.fills.filter((f) => f[0] <= now + d.stepMs).length }
  })
}

/** The book at the playhead: drawn once a step, and only then (memo), not when the figure starts, stops or is seen. */
const Ladder = memo(function Ladder({ d, step, glide, price, scale }: { d: ReplayData; step: Step; glide: boolean; price: (t: number) => string; scale: Book }) {
  const i = useStep(step)
  const bids = d.bids[i]!
  const asks = d.asks[i]!
  const bestBid = bids[0]![0]
  const bestAsk = asks[0]![0]
  const qty = new Map<number, number>([...bids, ...asks].map(([p, q]) => [p, q]))
  const rows = [...Array.from({ length: ROWS }, (_, n) => bestAsk + ROWS - 1 - n), ...Array.from({ length: ROWS }, (_, n) => bestBid - n)]
  const marks = marksAt(d, i)
  return (
    <div aria-hidden="true" className="text-meta font-mono tabular" data-glide={glide ? '' : undefined}>
      <div className="grid grid-cols-[4.9rem_minmax(0,1fr)_repeat(3,1.35rem)] items-center gap-x-1.5 border-b border-rule pb-1 text-graphite">
        <span>price</span>
        <span>size</span>
        {marks.map((m) => (
          <span key={m.name} className="text-center">
            {m.name}
          </span>
        ))}
      </div>
      {rows.map((p) => {
        const v = qty.get(p) ?? 0
        const ask = p >= bestAsk
        return (
          <div key={p} className={`grid h-[1.0625rem] grid-cols-[4.9rem_minmax(0,1fr)_repeat(3,1.35rem)] items-center gap-x-1.5 ${p === bestBid ? 'border-b border-rule' : ''}`}>
            <span className={p === bestBid || p === bestAsk ? 'text-ink' : 'text-graphite'}>{price(p)}</span>
            <span className="relative h-2.5">
              <span
                className={`absolute inset-y-0 left-0 w-full origin-left in-data-glide:transition-transform in-data-glide:duration-[120ms] in-data-glide:ease-out ${ask ? 'bg-sell/45' : 'bg-buy/40'}`}
                style={{ transform: `scaleX(${height(v, scale)})` }}
              />
            </span>
            {marks.map((m) => {
              const here = p === m.bid || p === m.ask
              const out = p === m.bid ? m.bidOut : m.askOut
              return (
                <span key={m.name} className="flex h-full items-center justify-center">
                  {here ? (
                    <span
                      className="block h-2.5 w-2 rounded-[1px] bg-indigo transition-opacity duration-[240ms] ease-out data-out:opacity-0 data-out:duration-[120ms] motion-reduce:transition-none"
                      data-out={out ? '' : undefined}
                    />
                  ) : null}
                </span>
              )
            })}
          </div>
        )
      })}
      <p className="mt-1.5 text-graphite">
        <span className="mr-1 inline-block h-2.5 w-2 rounded-[1px] bg-indigo align-middle" /> a strategy’s quote
      </p>
    </div>
  )
})

/** The readouts in the rail, once a step. */
const Rail = memo(function Rail({ d, step, price, ready }: { d: ReplayData; step: Step; price: (t: number) => string; ready: boolean }) {
  const i = useStep(step)
  const marks = marksAt(d, i)
  return (
    <div className={ready ? undefined : 'invisible'}>
      <Readouts
        rows={[
          { label: 'Time, UTC', value: clockAt(d.from, d.t[i]!), ch: 10 },
          { label: 'Best bid · ask', value: `${price(d.bids[i]![0]![0])} · ${price(d.asks[i]![0]![0])}`, ch: 19 },
          { label: 'Intensity, buy · sell', value: `${d.lamB[i]!.toFixed(2)} · ${d.lamS[i]!.toFixed(2)} a second`, ch: 22 },
          ...marks.map((m) => ({
            label: `${m.name} bid · ask`,
            value: `${m.bidOut ? 'pulled' : price(m.bid!)} · ${m.askOut ? 'pulled' : price(m.ask!)}`,
            ch: 19,
          })),
          { label: 'Fills so far', value: marks.map((m) => `${m.name} ${m.fills}`).join(' · '), ch: 18 },
        ]}
      />
    </div>
  )
})

interface Step {
  get(): number
  set(k: number): void
  subscribe(f: () => void): () => void
}

/** The playhead's step, as a tiny store. */
function stepStore(first: number): Step {
  let v = first
  const subs = new Set<() => void>()
  return {
    get: () => v,
    set: (k) => {
      if (k === v) return
      v = k
      for (const f of subs) f()
    },
    subscribe: (f) => {
      subs.add(f)
      return () => {
        subs.delete(f)
      }
    },
  }
}

const useStep = (s: Step) => useSyncExternalStore(s.subscribe, s.get, s.get)

/** The time slider and its label: the reader's scrub, and what it reads out, once a step. */
const Scrub = memo(function Scrub({ d, step, price, ready, go }: { d: ReplayData; step: Step; price: (t: number) => string; ready: boolean; go: (k: number) => void }) {
  const i = useStep(step)
  const now = d.t[i]!
  const marks = marksAt(d, i)
  return (
    <label className="mt-4 block">
      <span className="text-meta font-mono text-graphite">
        Time{' '}
        <span aria-hidden="true" className="tabular text-ink">
          {clockAt(d.from, now)}
        </span>
      </span>
      <input
        type="range"
        min={0}
        max={d.t.length - 1}
        step={1}
        disabled={!ready}
        value={i}
        aria-valuetext={`${clockAt(d.from, now)} UTC: best bid ${price(d.bids[i]![0]![0])}, best ask ${price(d.asks[i]![0]![0])}; ${marks
          .map((m) => `${m.name} bid ${m.bidOut ? 'pulled' : price(m.bid!)}, ask ${m.askOut ? 'pulled' : price(m.ask!)}`)
          .join('; ')}`}
        onChange={(e) => go(Number(e.currentTarget.value))}
        className="mt-0.5 block h-6 w-full pointer-coarse:-mb-2.5 pointer-coarse:mt-[calc(0.125rem-10px)] pointer-coarse:h-11"
        style={rangeFill(i, 0, d.t.length - 1)}
      />
    </label>
  )
})
