'use client'

import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react'
import { useInView, useReducedMotion } from '@/components/stage/env'

/**
 * Fig. 2's live part (./Toy loads it as it nears the screen): the fitted Hawkes model as a toy. The reader adds market buys and sells; each lifts both intensities by the
 * fitted α (a buy lifts the buy rate by α_bb and the sell rate by α_sb), and the lift decays at the fitted β. The
 * intensity is computed exactly from the reader's own events, nothing else: no event is invented. The fitted decay is
 * fast (a lift halves in about 50 ms), so the toy runs at a tenth of real time and its axis is in model milliseconds.
 * It moves only while a lift is still decaying. Under reduced motion its clock does not run: each tap adds an event and
 * moves the clock on by a fixed step, and the frame is redrawn still.
 */

export interface HawkesParams {
  readonly mu_b: number
  readonly mu_s: number
  readonly alpha_bb: number
  readonly alpha_bs: number
  readonly alpha_sb: number
  readonly alpha_ss: number
  readonly beta: number
}

/** Model milliseconds the chart shows, and how fast the toy's clock runs against the reader's. */
const WINDOW = 600
const RATE = 0.1
/** Under reduced motion, how far a tap moves the still clock on. */
const STEP = 120
const SAMPLES = 160

type Ev = readonly [number, 1 | -1]

/** λ_b and λ_s at model time t (ms) from the reader's events: μ + Σ α e^{−β(t − tᵢ)}, strictly earlier events only. */
export function intensity(p: HawkesParams, evs: readonly Ev[], t: number): [number, number] {
  let b = p.mu_b
  let s = p.mu_s
  for (const [te, side] of evs) {
    if (te >= t) continue
    const k = Math.exp((-p.beta * (t - te)) / 1000)
    if (side > 0) {
      b += p.alpha_bb * k
      s += p.alpha_sb * k
    } else {
      b += p.alpha_bs * k
      s += p.alpha_ss * k
    }
  }
  return [b, s]
}

/** The chart's height, the room ./Toy keeps for it before it loads (the same value there), so nothing under it moves. */
const CHART_H = 'h-[14rem]'

/** What ./Toy's buttons call: the toy's own add, once it has loaded. */
export interface ToyApi {
  add(side: 1 | -1): void
}

export function ToyBody({ p, apiRef, pendingRef }: { p: HawkesParams; apiRef: RefObject<ToyApi | null>; pendingRef: RefObject<(1 | -1)[]> }) {
  const reduced = useReducedMotion()
  const box = useRef<HTMLDivElement>(null)
  const seen = useInView(box, '0px')
  // The reader's events and the clock live outside React: a tap draws, it does not re-render.
  const evs = useRef<Ev[]>([])
  const raf = useRef(0)
  const visible = useRef(false)
  const now = useRef(WINDOW)
  const pathB = useRef<SVGPathElement>(null)
  const pathS = useRef<SVGPathElement>(null)
  const marks = useRef<SVGGElement>(null)
  const readB = useRef<HTMLSpanElement>(null)
  const readS = useRef<HTMLSpanElement>(null)
  const yMax = useMemo(() => Math.ceil((Math.max(p.mu_b + p.alpha_bb, p.mu_s + p.alpha_ss) * 2.2) / 5) * 5, [p])

  const draw = useCallback(
    (list: readonly Ev[]) => {
      const t1 = now.current
      const t0 = t1 - WINDOW
      // The samples, and each event's own instant twice (just before and just after), so a lift is drawn as the jump it
      // is, not a ramp between samples.
      const at: number[] = []
      for (let k = 0; k <= SAMPLES; k++) at.push(t0 + (k / SAMPLES) * WINDOW)
      for (const [te] of list) if (te > t0 && te <= t1) at.push(te, te + 1e-6)
      at.sort((a, b) => a - b)
      let db = ''
      let ds = ''
      at.forEach((t, k) => {
        const [b, s] = intensity(p, list, t)
        const x = t - t0
        db += `${k ? 'L' : 'M'}${x} ${Math.max(0, yMax - b)}`
        ds += `${k ? 'L' : 'M'}${x} ${Math.max(0, yMax - s)}`
      })
      pathB.current?.setAttribute('d', db)
      pathS.current?.setAttribute('d', ds)
      const [b, s] = intensity(p, list, t1)
      if (readB.current) readB.current.textContent = b.toFixed(2)
      if (readS.current) readS.current.textContent = s.toFixed(2)
      if (marks.current)
        marks.current.innerHTML = list
          .filter(([te]) => te > t0)
          .map(([te, side]) => `<line x1="${te - t0}" x2="${te - t0}" y1="${yMax}" y2="${yMax - yMax * 0.08}" stroke="var(--color-${side > 0 ? 'buy' : 'sell'})" stroke-width="2" vector-effect="non-scaling-stroke"/>`)
          .join('')
      return Math.max(b - p.mu_b, s - p.mu_s)
    },
    [p, yMax],
  )

  // The clock runs only while a lift is still decaying and the toy is on screen; at rest it holds.
  const kick = useCallback(() => {
    if (raf.current) return
    if (reduced || !visible.current) {
      draw(evs.current)
      return
    }
    let last = performance.now()
    const tick = (t: number) => {
      now.current += Math.min(t - last, 100) * RATE
      last = t
      const lift = draw(evs.current)
      raf.current = lift < 0.01 || !visible.current ? 0 : requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }, [draw, reduced])
  useEffect(() => {
    visible.current = seen
    kick()
  }, [seen, kick])
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current)
      raf.current = 0
    },
    [],
  )

  const add = (side: 1 | -1) => {
    const t = now.current
    evs.current = [...evs.current.filter(([te]) => te > t - WINDOW * 2), [t, side]]
    if (reduced) now.current = t + STEP
    if (raf.current) return
    kick()
  }
  // The buttons are ./Toy's, in the page from the first byte; they reach the toy through `api`, and a tap made before it
  // loaded is played as it arrives.
  const addRef = useRef(add)
  useEffect(() => {
    addRef.current = add
  })
  useEffect(() => {
    apiRef.current = { add: (side) => addRef.current(side) }
    for (const side of pendingRef.current.splice(0)) addRef.current(side)
    return () => {
      apiRef.current = null
    }
  }, [apiRef, pendingRef])
  const ticks = [0, WINDOW / 2, WINDOW]

  return (
    <div ref={box} className={CHART_H}>
      <p className="text-meta mt-2 font-mono tabular text-graphite">
        now: λ buy <span ref={readB} className="text-buy">{p.mu_b.toFixed(2)}</span> · λ sell <span ref={readS} className="text-sell">{p.mu_s.toFixed(2)}</span> market orders a second
      </p>
      <div aria-hidden="true" className="relative mt-4 ml-8 h-40 border-b border-rule">
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${WINDOW} ${yMax}`} preserveAspectRatio="none">
          <line x1={0} x2={WINDOW} y1={yMax - p.mu_b} y2={yMax - p.mu_b} stroke="var(--color-buy)" strokeOpacity={0.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <line x1={0} x2={WINDOW} y1={yMax - p.mu_s} y2={yMax - p.mu_s} stroke="var(--color-sell)" strokeOpacity={0.5} strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
          <path ref={pathS} stroke="var(--color-sell)" strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
          <path ref={pathB} stroke="var(--color-buy)" strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
          <g ref={marks} />
        </svg>
        <span className="text-meta absolute top-0 right-[calc(100%+0.5rem)] -translate-y-1/2 font-mono tabular text-graphite">{yMax}</span>
        <span className="text-meta absolute right-[calc(100%+0.5rem)] bottom-0 translate-y-1/2 font-mono tabular text-graphite">0</span>
        <span className="text-meta absolute top-0 right-0 bg-paper/80 pl-1 font-mono text-graphite">dashed: μ</span>
      </div>
      <div aria-hidden="true" className="text-meta relative mt-1 ml-8 h-4 font-mono tabular text-graphite">
        {ticks.map((t, n) => (
          <span key={t} className={`absolute whitespace-nowrap ${n === 0 ? '' : n === ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: `${(t / WINDOW) * 100}%` }}>
            {n === ticks.length - 1 ? 'now' : `−${WINDOW - t} ms`}
          </span>
        ))}
      </div>
    </div>
  )
}
