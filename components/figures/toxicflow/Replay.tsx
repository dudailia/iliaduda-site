'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FigureFrame, Readouts } from '@/components/FigureFrame'
import { useInView, useReducedMotion } from '@/components/stage/env'
import { CONTROL, option } from '@/components/stage/controls'
import { useRadios } from '@/components/stage/radios'
import { rangeFill } from '@/components/stage/range'
import { emptyReplay, type ReplayData, type ReplayHead, type ReplayStrategy } from '@/lib/toxicflow/replayShape'

/**
 * Fig. 1: one real minute of the BTCUSDT book as the strategies saw it, with a strategy's simulated quotes, fills and
 * pulls on it, and B3's Hawkes intensities under it on the same clock. The chart and the intensities are drawn in
 * data units (milliseconds across, ticks or events a second up) with non-scaling strokes, so they fill any width
 * without being measured; the fills are HTML dots, which stay round as the plot stretches, as the site's other
 * figures draw their points. It opens on the whole minute; Play runs it again at real time, and the slider reads any
 * step. Nothing moves until the reader asks.
 */

const PRICE_H = 'h-[17rem] sm:h-[18rem]'
const LAM_H = 'h-24'
const ROWS = 8

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

/**
 * The minute is loaded on its own once the page is up, not carried in the page's HTML (where it was the largest part,
 * and held the first paint back on a slow phone); until it arrives the figure holds its full size, empty, so nothing
 * under it moves when it fills.
 */
export function ReplayFigure({ head, description, table }: { head: ReplayHead; description: string; table: React.ReactNode }) {
  const [d, setD] = useState<ReplayData | null>(null)
  useEffect(() => {
    let live = true
    // A chunk of its own: compressed and cached like the page's other scripts, and loaded only once the page is up.
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

function ReplayView({ d, ready, description, table }: { d: ReplayData; ready: boolean; description: string; table: React.ReactNode }) {
  const [k, setK] = useState(0)
  const [i, setI] = useState(d.t.length - 1)
  const [playing, setPlaying] = useState(false)
  const s: ReplayStrategy = d.strategies[k]!
  const reduced = useReducedMotion()
  const box = useRef<HTMLDivElement>(null)
  const seen = useInView(box, '0px')
  const ms = useRef(d.span)
  const veil = useRef<HTMLDivElement[]>([])
  const head = useRef<HTMLDivElement[]>([])

  // The chart is in ticks from the mid at each step, so a quote's place against the touch reads at any price.
  const range = d.offHi - d.offLo
  const mids = useMemo(() => d.bids.map((b, n) => (b[0]![0] + d.asks[n]![0]![0]) / 2), [d])
  const y = useCallback((off: number) => d.offHi - off, [d.offHi])
  const rel = useCallback((v: readonly (number | null)[]) => v.map((x, n) => (x == null ? null : x - mids[n]!)), [mids])
  const midSpan = Math.max(1, d.hi - d.lo)
  const my = useCallback((m: number) => d.hi - m, [d.hi])
  const lamMax = useMemo(() => Math.max(...d.lamB, ...d.lamS), [d.lamB, d.lamS])
  const ly = useCallback((v: number) => lamMax - v, [lamMax])

  const touch = useMemo(
    () => ({
      bid: steps(d.t, rel(d.bids.map((b) => b[0]![0])), d.span, y),
      ask: steps(d.t, rel(d.asks.map((a) => a[0]![0])), d.span, y),
      mid: steps(d.t, mids, d.span, my),
    }),
    [d, y, my, rel, mids],
  )
  const prints = useMemo(
    () => d.trades.map(([t, p, qty, side]) => `M${t} ${y(p - mids[stepAt(d.t, t)]!)}v${-side * (0.3 + Math.sqrt(qty) * 0.35)}`).join(''),
    [d.t, d.trades, y, mids],
  )
  const quotes = useMemo(() => ({ bid: steps(d.t, rel(s.bid), d.span, y), ask: steps(d.t, rel(s.ask), d.span, y) }), [d, s, y, rel])
  const lam = useMemo(
    () => ({ b: steps(d.t, d.lamB, d.span, ly), s: steps(d.t, d.lamS, d.span, ly) }),
    [d, ly],
  )

  // The playhead and the veil over what has not happened yet move every frame; the step, and so the book and the
  // readouts, ten times a second.
  const place = useCallback(
    (t: number) => {
      ms.current = t
      const f = `${(t / d.span) * 100}%`
      for (const v of veil.current) if (v) v.style.left = f
      for (const h of head.current) if (h) Object.assign(h.style, { left: f, right: 'auto' })
      setI(stepAt(d.t, t))
    },
    [d],
  )

  // Off screen, or in a hidden tab, the minute waits where it is and goes on when it is seen again.
  const running = playing && seen && !reduced
  useEffect(() => {
    if (!running) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      // A hidden tab or a long frame does not skip the minute ahead.
      const dt = Math.min(now - last, 100)
      last = now
      const t = ms.current + dt
      if (t >= d.span) {
        place(d.span)
        setPlaying(false)
        return
      }
      place(t)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running, d.span, place])

  const radio = useRadios<number>(k, (n) => setK(n))
  const keys = d.strategies.map((_, n) => n)

  const bids = d.bids[i]!
  const asks = d.asks[i]!
  const bestBid = bids[0]![0]
  const bestAsk = asks[0]![0]
  const qMax = useMemo(() => Math.max(...d.bids.flat().map((l) => l[1]), ...d.asks.flat().map((l) => l[1])), [d])
  const qty = new Map<number, number>([...bids, ...asks].map(([p, q]) => [p, q]))
  const rows = [
    ...Array.from({ length: ROWS }, (_, n) => bestAsk + ROWS - 1 - n),
    ...Array.from({ length: ROWS }, (_, n) => bestBid - n),
  ]
  const price = (ticks: number) => ((d.base + ticks * d.tick)).toFixed(1)
  const filled = s.fills.filter((f) => f[0] <= d.t[i]! + d.stepMs)
  const pulledNow = s.pulls.filter((p) => p[0] <= d.t[i]! && d.t[i]! < p[1])
  const clock = (t: number) => {
    const [h, m, sec] = d.from.split(':').map(Number) as [number, number, number]
    const total = sec + t / 1000
    return `${String(h).padStart(2, '0')}:${String(m + Math.floor(total / 60)).padStart(2, '0')}:${(total % 60).toFixed(1).padStart(4, '0')}`
  }
  const ourBid = s.bid[i]
  const ourAsk = s.ask[i]

  // Gridlines every two ticks from the mid, where the quotes live.
  const gridOffs = useMemo(() => {
    const out: number[] = []
    for (let o = Math.ceil(d.offLo / 2) * 2; o <= d.offHi; o += 2) out.push(o)
    return out
  }, [d.offLo, d.offHi])
  const seconds = useMemo(() => {
    const n = 4
    return Array.from({ length: n + 1 }, (_, j) => (d.span * j) / n)
  }, [d.span])

  const rail = (
    <div className={ready ? undefined : 'invisible'}>
    <Readouts
      rows={[
        { label: 'Time, UTC', value: clock(d.t[i]!), ch: 10 },
        { label: 'Best bid · ask', value: `${price(bestBid)} · ${price(bestAsk)}`, ch: 17 },
        { label: `${s.name} bid · ask`, value: `${ourBid == null ? 'pulled' : price(ourBid)} · ${ourAsk == null ? 'pulled' : price(ourAsk)}`, ch: 17 },
        { label: `${s.name} inventory`, value: `${s.q[i]! > 0 ? '+' : ''}${s.q[i]} order sizes`, ch: 14 },
        { label: 'Intensity, buy · sell', value: `${d.lamB[i]!.toFixed(2)} · ${d.lamS[i]!.toFixed(2)} a second`, ch: 22 },
        { label: `${s.name} fills so far`, value: String(filled.length), ch: 3 },
      ]}
    />
    </div>
  )

  const xPct = (t: number) => `${(t / d.span) * 100}%`

  return (
    <FigureFrame
      id="replay"
      number="Fig. 1"
      vt="toxic-flow"
      title={`One minute of the BTCUSDT book, ${d.from} to ${d.to} UTC on ${d.day}, with a strategy’s simulated quotes`}
      subtitle={`Binance USDT-M perpetual · top ${d.levels} levels · ${d.stepMs} ms steps · simulated fills`}
      rail={rail}
      hint="Choose a strategy · Play runs the minute at real time · the slider reads any step"
      caption={
        <>
          Left, the book at the step the slider marks: the {ROWS} prices either side of the spread, each bar the size waiting
          there, and the strategy’s own bid and ask in indigo. Right, the whole minute, drawn in ticks from the mid so a
          quote’s place against the touch shows at any price: the touch in ink, each print a short stroke up from its price
          (buyer-initiated) or down (seller-initiated), the strategy’s quotes, its simulated fills at their exchange time, and
          its pulls as indigo rules. Over it, the mid itself, which a sell sweep took down near the end; under it, the Hawkes
          intensities B3 reads, on the same clock. The minute was fixed by a rule written before its data was looked at; it shows how the strategies behave, not how they perform, which only whole days measure. Over the whole day,{' '}
          {s.name} ended at a break-even maker fee of {s.dayBef < 0 ? '−' : ''}{Math.abs(s.dayBef).toFixed(3)} bp on{' '}
          {s.dayFills.toLocaleString('en-US')} simulated fills, the result its committed run reports.
        </>
      }
      table={table}
    >
      <p className="sr-only">{description}</p>
      <div ref={box} aria-hidden="true" className={`grid gap-x-4 gap-y-5 sm:grid-cols-[11.5rem_minmax(0,1fr)] ${ready ? '' : 'invisible'}`}>
        {/* The book at this step. */}
        <div className="text-meta font-mono tabular">
          <div className="grid grid-cols-[4.6rem_minmax(0,1fr)_3.2rem] items-center gap-x-2 border-b border-rule pb-1 text-graphite">
            <span>price</span>
            <span>size</span>
            <span className="text-right">BTC</span>
          </div>
          {rows.map((p) => {
            const v = qty.get(p)
            const ours = p === ourBid ? 'bid' : p === ourAsk ? 'ask' : null
            const ask = p >= bestAsk
            return (
              <div key={p} className={`grid h-[1.0625rem] grid-cols-[4.6rem_minmax(0,1fr)_3.2rem] items-center gap-x-2 ${p === bestBid ? 'border-b border-rule' : ''}`}>
                <span className={ours ? 'text-indigo' : p === bestBid || p === bestAsk ? 'text-ink' : 'text-graphite'}>{price(p)}</span>
                <span className="relative h-2.5">
                  {v ? (
                    <span
                      className={`absolute inset-y-0 left-0 ${ask ? 'bg-graphite/45' : 'bg-graphite/25'}`}
                      style={{ width: `${Math.max(2, Math.sqrt(v / qMax) * 100)}%` }}
                    />
                  ) : null}
                  {ours ? <span className="absolute inset-y-[-2px] left-0 w-1 bg-indigo" /> : null}
                </span>
                <span className="text-right text-graphite">{v ? v.toFixed(3) : ''}</span>
              </div>
            )
          })}
          <p className="mt-1.5 text-graphite">
            {pulledNow.length ? (
              <span className="text-indigo">{s.name} pulled its {pulledNow[0]![2] > 0 ? 'bid' : 'ask'}</span>
            ) : (
              <>
                <span className="mr-1 inline-block h-2 w-1 bg-indigo align-middle" /> {s.name}’s quote
              </>
            )}
          </p>
        </div>

        {/* The minute. */}
        <div className="min-w-0">
          {/* The mid over the minute: where the price went, sweep and all. */}
          <div className="relative ml-[4.2rem] h-12">
            <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${d.span} ${midSpan}`} preserveAspectRatio="none">
              <path d={touch.mid} stroke="var(--color-ink)" strokeWidth={1.25} fill="none" vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="text-meta absolute right-[calc(100%+0.5rem)] -top-1 font-mono tabular text-graphite">{price(d.hi)}</span>
            <span className="text-meta absolute right-[calc(100%+0.5rem)] -bottom-1 font-mono tabular text-graphite">{price(d.lo)}</span>
            <span className="text-meta absolute right-0 -top-1 bg-paper/80 pl-1 font-mono text-graphite">mid</span>
            <div ref={(el) => { if (el) veil.current[2] = el }} className="absolute inset-y-0 right-0 bg-paper/75" />
            <div ref={(el) => { if (el) head.current[2] = el }} className="absolute inset-y-0 right-0 w-px bg-ink" />
          </div>
          <div className={`relative ${PRICE_H} ml-[4.2rem] mt-3 overflow-hidden`}>
            <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${d.span} ${range}`} preserveAspectRatio="none">
              {gridOffs.map((o) => (
                <line key={o} x1={0} x2={d.span} y1={y(o)} y2={y(o)} stroke="var(--color-rule)" vectorEffect="non-scaling-stroke" />
              ))}
              {s.pulls.map(([a2, , side], n) => (
                <line key={n} x1={a2} x2={a2} y1={0} y2={range} stroke="var(--color-indigo)" strokeOpacity={0.55} strokeWidth={2} vectorEffect="non-scaling-stroke" data-side={side} />
              ))}
              <path d={prints} stroke="var(--color-graphite)" strokeWidth={1.25} fill="none" vectorEffect="non-scaling-stroke" />
              <path d={touch.bid} stroke="var(--color-ink)" strokeWidth={1} fill="none" vectorEffect="non-scaling-stroke" />
              <path d={touch.ask} stroke="var(--color-ink)" strokeWidth={1} fill="none" vectorEffect="non-scaling-stroke" />
              <path d={quotes.bid} stroke="var(--color-indigo)" strokeWidth={2} fill="none" vectorEffect="non-scaling-stroke" />
              <path d={quotes.ask} stroke="var(--color-indigo)" strokeWidth={2} fill="none" vectorEffect="non-scaling-stroke" strokeDasharray="5 3" />
            </svg>
            {s.fills.map(([t, p, side], n) => (
              <span
                key={n}
                className={`absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-indigo ${side > 0 ? 'bg-indigo' : 'bg-paper'}`}
                style={{ left: xPct(t), top: `${(y(p - mids[stepAt(d.t, t)]!) / range) * 100}%` }}
              />
            ))}
            <div ref={(el) => { if (el) veil.current[0] = el }} className="absolute inset-y-0 right-0 bg-paper/75" />
            <div ref={(el) => { if (el) head.current[0] = el }} className="absolute inset-y-0 right-0 w-px bg-ink" />
          </div>
          {/* Its labels, outside the clipped box. */}
          <div className={`pointer-events-none relative ${PRICE_H} -mt-[17rem] sm:-mt-[18rem] ml-[4.2rem]`}>
            {gridOffs.map((o) => (
              <span key={o} className="text-meta absolute right-[calc(100%+0.5rem)] -translate-y-1/2 whitespace-nowrap font-mono tabular text-graphite" style={{ top: `${(y(o) / range) * 100}%` }}>
                {o === 0 ? 'mid' : `${o > 0 ? '+' : '\u2212'}${Math.abs(o)}`}
              </span>
            ))}
          </div>
          <p className="text-meta ml-[4.2rem] mt-1 font-mono text-graphite">
            ticks from the mid · {s.name} bid <span className="inline-block h-0.5 w-4 bg-indigo align-middle" /> ask{' '}
            <span className="inline-block w-4 border-t-2 border-dashed border-indigo align-middle" /> · fills: bought{' '}
            <span className="inline-block size-2 rounded-full bg-indigo align-middle" /> sold{' '}
            <span className="inline-block size-2 rounded-full border-2 border-indigo align-middle" />
          </p>
          <p className="text-meta ml-[4.2rem] mt-4 font-mono text-graphite">
            B3’s Hawkes intensity, market orders a second · buy <span className="inline-block h-px w-4 bg-ink align-middle" /> sell{' '}
            <span className="inline-block w-4 border-t border-dashed border-graphite align-middle" />
          </p>
          <div className={`relative ${LAM_H} ml-[4.2rem] mt-2`}>
            <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${d.span} ${lamMax}`} preserveAspectRatio="none">
              <line x1={0} x2={d.span} y1={lamMax} y2={lamMax} stroke="var(--color-rule)" vectorEffect="non-scaling-stroke" />
              {s.pulls.map(([a], n) => (
                <line key={n} x1={a} x2={a} y1={0} y2={lamMax} stroke="var(--color-indigo)" strokeOpacity={0.55} strokeWidth={2} vectorEffect="non-scaling-stroke" />
              ))}
              <path d={lam.b} stroke="var(--color-ink)" strokeWidth={1.25} fill="none" vectorEffect="non-scaling-stroke" />
              <path d={lam.s} stroke="var(--color-graphite)" strokeWidth={1.25} fill="none" vectorEffect="non-scaling-stroke" strokeDasharray="3 2" />
            </svg>
            <span className="text-meta absolute right-[calc(100%+0.5rem)] top-0 font-mono tabular text-graphite">{lamMax.toFixed(0)}</span>
            <span className="text-meta absolute right-[calc(100%+0.5rem)] bottom-0 translate-y-1/3 font-mono tabular text-graphite">0</span>
            <div ref={(el) => { if (el) veil.current[1] = el }} className="absolute inset-y-0 right-0 bg-paper/75" />
            <div ref={(el) => { if (el) head.current[1] = el }} className="absolute inset-y-0 right-0 w-px bg-ink" />
          </div>
          <div className="text-meta relative ml-[4.2rem] mt-1 h-4 font-mono tabular text-graphite">
            {seconds.map((t, n) => (
              <span key={t} className={`absolute whitespace-nowrap ${n === 0 ? '' : n === seconds.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: xPct(t) }}>
                {(t / 1000).toFixed(0)} s
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 pointer-coarse:gap-y-3.5">
        <div role="radiogroup" aria-label="Strategy" className="flex gap-1.5">
          {keys.map((n) => (
            <button key={n} {...radio(n, keys)} className={option(n === k)} aria-label={d.strategies[n]!.name}>
              {d.strategies[n]!.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`${CONTROL} ${reduced ? 'hidden' : ''}`}
          disabled={!ready}
          onClick={() => {
            if (playing) setPlaying(false)
            else {
              if (ms.current >= d.span) place(0)
              setPlaying(true)
            }
          }}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
      </div>
      <label className="mt-4 block">
        <span className="text-meta font-mono text-graphite">
          Step{' '}
          <span aria-hidden="true" className="tabular text-ink">
            {clock(d.t[i]!)}
          </span>
        </span>
        <input
          type="range"
          min={0}
          max={d.t.length - 1}
          step={1}
          disabled={!ready}
          value={i}
          aria-valuetext={`${clock(d.t[i]!)} UTC: best bid ${price(bestBid)}, best ask ${price(bestAsk)}; ${s.name} bid ${ourBid == null ? 'pulled' : price(ourBid)}, ask ${ourAsk == null ? 'pulled' : price(ourAsk)}; ${filled.length} fills so far`}
          onChange={(e) => {
            setPlaying(false)
            place(d.t[Number(e.currentTarget.value)]!)
          }}
          className="mt-0.5 block h-6 w-full pointer-coarse:-mb-2.5 pointer-coarse:mt-[calc(0.125rem-10px)] pointer-coarse:h-11"
          style={rangeFill(i, 0, d.t.length - 1)}
        />
      </label>
    </FigureFrame>
  )
}
