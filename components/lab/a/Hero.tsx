'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react'
import { Shell } from '@/components/Layout'
import { MODEL, bs } from '@/lib/lab/a/mc'
import { POSTER_PATHS, fill, strands, summarize, type Bar, type Summary } from '@/lib/lab/a/poster'
import { saveData, supportsWebGL2 } from '../../figures/surface/env'
import { fade, useStage, type Create, type Renderer } from '../useStage'
import { Convergence, type Point } from './Convergence'
import { Poster } from './Poster'
import type { LabRenderer, Stats } from './renderer'

/**
 * Lab A. The page arrives with the poster — a real frame computed on the
 * server with the CPU mirror of the GPU generator — and the numbers that go
 * with it. When the stage goes live, a WebGL2 renderer (loaded on idle, its
 * own chunk) takes over the picture and the counter: the Monte Carlo price,
 * its standard error, the paths simulated and the rate this device simulates
 * them at, all read back from the GPU.
 *
 * Without the live renderer (reduced motion, a software rasteriser, no float
 * render targets) the
 * inputs still work: the still frame is redrawn and repriced on the CPU, in
 * slices small enough never to block the page.
 */

const noop = () => () => {}
const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US')
/** Paths per second, as "71.9M" or "812k". */
const fmtRate = (r: number) => (r >= 1e6 ? `${(r / 1e6).toFixed(r >= 1e8 ? 0 : 1)}M` : r >= 1e3 ? `${Math.round(r / 1e3)}k` : fmtInt(r))

type Mode = 'server' | 'cpu' | 'gpu'
interface Shown extends Summary {
  rate: number
  mode: Mode
  done: boolean
}

/** Paths per CPU slice: about 3 ms on a laptop, well under a long task on a phone. */
const SLICE = 1024

export function Hero({ initial }: { initial: { stats: Summary; bars: Bar[] } }) {
  const [sigma, setSigma] = useState<number>(MODEL.sigma)
  const [strike, setStrike] = useState<number>(MODEL.strike)
  const [shown, setShown] = useState<Shown>({ ...initial.stats, rate: 0, mode: 'server', done: true })
  const [bars, setBars] = useState<Bar[]>(initial.bars)
  const [history, setHistory] = useState<Point[]>([])
  // Why the live renderer declined, when it did.
  const [declined, setDeclined] = useState<'software' | 'float' | null>(null)
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  const [spoken, setSpoken] = useState('')

  const section = useRef<HTMLElement>(null)
  const caption = useRef<HTMLElement>(null)
  const labels = useRef<HTMLDivElement>(null)
  const renderer = useRef<LabRenderer | null>(null)
  const progress = useRef(0)
  const params = useRef({ sigma, strike })
  const liveRef = useRef(false)

  const onStats = useCallback((s: Stats) => {
    if (!liveRef.current) return
    setShown({ n: s.n, mean: s.mean, se: s.se, rate: s.rate, mode: 'gpu', done: s.done })
    if (s.n > 0) {
      setHistory((h) => {
        const last = h[h.length - 1]
        if (last && s.n < last.n * 1.12) return h
        return [...h, { n: s.n, mean: s.mean, se: s.se }]
      })
    }
  }, [])

  const create: Create = useCallback(
    (env) => {
      const gl = env.gl
      // A software rasteriser runs every draw on the CPU, and every readback
      // blocks the page while it does: the still frame is the light version.
      if (env.tier === 'software') {
        setDeclined('software')
        return null
      }
      if (!gl.getExtension('EXT_color_buffer_float') || !gl.getExtension('EXT_float_blend') || !labels.current) {
        setDeclined('float')
        return null
      }
      let real: LabRenderer | null = null
      let size: [number, number, number, number] | null = null
      let quality = 2
      let palette = env.palette
      let gone = false
      void import('./renderer').then((m) => {
        if (gone || !labels.current) return
        real = m.createRenderer({ ...env, palette }, { labels: labels.current, progress: () => progress.current, onStats })
        real.setQuality!(quality)
        if (size) real.resize(...size)
        real.setParams(params.current.sigma, params.current.strike)
        renderer.current = real
      })
      const wrap: Renderer = {
        frame: (t, dt) => (real ? real.frame(t, dt) : false),
        resize: (...a) => {
          size = a
          real?.resize(...a)
        },
        setQuality: (q) => {
          quality = q
          real?.setQuality!(q)
        },
        setPalette: (p) => {
          palette = p
          real?.setPalette!(p)
        },
        dispose: () => {
          gone = true
          real?.dispose()
          renderer.current = null
        },
      }
      return wrap
    },
    [onStats],
  )

  const { box, canvas, live, eligible, reduced, fps, quality, tier } = useStage(create)
  // The kit reports live once the renderer draws; from then the GPU owns the counter.
  useEffect(() => {
    liveRef.current = live
  }, [live])
  const tall = eligible && !reduced

  // Committed parameters reach the renderer, which restarts its estimate.
  useEffect(() => {
    params.current = { sigma, strike }
    renderer.current?.setParams(sigma, strike)
  }, [sigma, strike])

  // Scroll progress through the tall section, read by the renderer each frame.
  useEffect(() => {
    if (!tall) return
    const el = section.current
    if (!el) return
    const overlay = window.matchMedia('(min-width: 40rem)')
    const onScroll = () => {
      const r = el.getBoundingClientRect()
      const span = r.height - window.innerHeight
      const p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0
      progress.current = p
      // Over the stage (sm and up) the caption gives way to the flight; on a
      // phone it sits above the stage and stays, since it carries the legend.
      if (caption.current) caption.current.style.opacity = overlay.matches ? String(1 - Math.min(1, Math.max(0, (p - 0.06) / 0.1))) : '1'
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [tall])

  // The still frame, repriced on the CPU when the live renderer is not drawing.
  const ens = useRef<{ sigma: number; t: Float32Array; n: number; ms: number } | null>(null)
  useEffect(() => {
    if (live) return
    if (sigma === MODEL.sigma && strike === MODEL.strike && !ens.current) return
    let cancelled = false
    let timer = 0
    const finish = () => {
      const e = ens.current!
      const s = summarize(e.t, strike)
      setBars(s.bars)
      setShown({ ...s.stats, rate: e.ms > 0 ? (e.n / e.ms) * 1000 : 0, mode: 'cpu', done: true })
    }
    if (ens.current && ens.current.sigma === sigma && ens.current.n === POSTER_PATHS) {
      finish()
      return
    }
    ens.current = { sigma, t: new Float32Array(POSTER_PATHS), n: 0, ms: 0 }
    const step = () => {
      if (cancelled) return
      const e = ens.current!
      const t0 = performance.now()
      const n = Math.min(SLICE, POSTER_PATHS - e.n)
      fill(e.t, sigma, e.n, n)
      e.n += n
      e.ms += performance.now() - t0
      if (e.n < POSTER_PATHS) timer = window.setTimeout(step, 0)
      else finish()
    }
    timer = window.setTimeout(step, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
      // An unfinished ensemble is dropped, never priced from.
      if (ens.current && ens.current.n < POSTER_PATHS) ens.current = null
    }
  }, [sigma, strike, live])

  // Changing an input starts a new run: the convergence plot starts again.
  // Changes made on the canvas, not on a slider, are also spoken: the slider
  // speaks for itself through its value text.
  const said = useRef(0)
  const commit = useCallback((s: number, k: number, fromCanvas = false) => {
    setSigma(s)
    setStrike(k)
    setHistory([])
    window.clearTimeout(said.current)
    if (fromCanvas)
      said.current = window.setTimeout(
        () => setSpoken(`Volatility ${Math.round(s * 100)}%, strike $${k}: Black–Scholes price ${bs(s, k).toFixed(2)}.`),
        600,
      )
  }, [])

  // Pointer: drag sideways for volatility, point (or tap) for the strike.
  const drag = useRef<{ id: number; x: number; s: number; moved: boolean } | null>(null)
  const kAt = (x: number, y: number) => {
    const p = renderer.current?.priceAt(x, y)
    return p == null ? null : Math.round(Math.min(MODEL.strikeMax, Math.max(MODEL.strikeMin, p)))
  }
  const strikeAt = (x: number, y: number) => {
    const k = kAt(x, y)
    window.clearTimeout(rest.current)
    renderer.current?.preview(null)
    if (k != null && k !== strike) commit(sigma, k, true)
  }
  // Hover draws the strike under the pointer at once, and prices it only once
  // the pointer rests: passing over the figure never throws the estimate away.
  const rest = useRef(0)
  const hover = (x: number, y: number) => {
    const k = kAt(x, y)
    renderer.current?.preview(k)
    window.clearTimeout(rest.current)
    if (k != null && k !== strike) rest.current = window.setTimeout(() => strikeAt(x, y), 450)
  }
  const onLeave = () => {
    window.clearTimeout(rest.current)
    renderer.current?.preview(null)
  }
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!live || drag.current) return
    drag.current = { id: e.pointerId, x: e.clientX, s: sigma, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!live) return
    const d = drag.current
    if (d && d.id === e.pointerId) {
      const dx = e.clientX - d.x
      if (Math.abs(dx) > 4) d.moved = true
      if (!d.moved) return
      const w = e.currentTarget.getBoundingClientRect().width
      const s = Math.round(Math.min(MODEL.sigmaMax, Math.max(MODEL.sigmaMin, d.s + (dx / w) * 0.9)) * 100) / 100
      if (s !== sigma) commit(s, strike, true)
    } else if (!d && e.pointerType === 'mouse') hover(e.clientX, e.clientY)
  }
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (!d.moved) strikeAt(e.clientX, e.clientY)
  }

  const exact = useMemo(() => bs(sigma, strike), [sigma, strike])
  const posterStrands = useMemo(() => strands(sigma, strike), [sigma, strike])
  const diff = Math.abs(shown.mean - exact)
  const hasMean = shown.n > 1 && Number.isFinite(shown.mean)
  const fresh = shown.mode === 'gpu' || shown.mode === 'cpu' || (sigma === MODEL.sigma && strike === MODEL.strike)

  const speed =
    shown.mode === 'gpu' || shown.mode === 'cpu'
      ? `${fmtRate(shown.rate)} paths/s`
      : mounted && eligible && !reduced
        ? 'starting'
        : 'computed at build'
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  const hint = `Scroll to fly through · ${coarse ? 'tap' : 'point'} to set the strike · drag sideways for volatility.`
  // Said only once the browser has answered; the server cannot know.
  const why = !mounted
    ? null
    : reduced
      ? 'Still frame: your system asks for reduced motion.'
      : declined === 'software'
        ? 'Still frame: this browser draws WebGL in software.'
        : declined === 'float'
          ? 'Still frame: this browser offers no float render targets.'
          : !eligible
            ? saveData()
              ? 'Still frame: your browser asks to save data.'
              : supportsWebGL2()
                ? 'Still frame.'
                : 'Still frame: this browser has no WebGL2.'
            : null

  return (
    <section ref={section} aria-label="Live figure: a million simulated futures" className="relative" style={{ height: tall ? '250vh' : undefined }}>
      {/* The stage is one screen under the lab bar, whose height depends on how its line wraps. */}
      <figure data-fps={fps} data-quality={quality} data-tier={tier ?? ''} className="sticky top-0 flex h-[calc(100svh-6.1rem)] min-h-[36rem] flex-col min-[26rem]:h-[calc(100svh-4.95rem)] min-[32.2rem]:h-[calc(100svh-2.5rem)]">
        <figcaption
          ref={caption}
          className="pointer-events-none z-10 mx-auto w-full max-w-[calc(var(--rail)+var(--gutter)+var(--measure))] px-6 pt-3 sm:absolute sm:inset-x-0 sm:top-0 sm:px-8 sm:pt-5 lg:pt-7"
        >
          <span className="pointer-events-auto block max-w-[34rem] rounded-sm sm:-mx-2.5 sm:bg-paper/85 sm:px-2.5 sm:py-2">
            <span className="block text-[1.1875rem] leading-snug font-semibold tracking-[-0.01em] text-ink sm:text-h3">
              Every line is one possible year for a $100 stock.
            </span>
            <span className="text-note mt-1 block text-ink">
              An option pays whatever the stock finishes above the strike. Its fair price is that payoff averaged over
              all the futures and discounted to today; the counter below closes in on the exact answer.
            </span>
            <span className="text-meta mt-1.5 flex flex-wrap gap-x-4 font-mono text-graphite">
              <span>
                <span aria-hidden="true" className="mr-1.5 inline-block h-[3px] w-4 rounded-full bg-indigo align-middle" />
                futures where it pays
              </span>
              <span>
                <span aria-hidden="true" className="mr-1.5 inline-block w-4 border-t-[1.5px] border-dashed border-ink align-middle" />
                the strike
              </span>
            </span>
          </span>
        </figcaption>
        <div
          ref={box}
          className={`relative min-h-0 flex-1 overflow-hidden ${live ? 'cursor-crosshair touch-pan-y select-none' : ''}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onLeave}
        >
          <div data-lab-poster className="absolute inset-0" style={fade(!live)}>
            <Poster strands={posterStrands} bars={bars} strike={strike} />
          </div>
          <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 size-full" style={fade(live)} />
          <div ref={labels} aria-hidden="true" className="pointer-events-none absolute inset-0" style={fade(live)} />
        </div>

        <div className="border-t border-rule bg-paper py-3 lg:py-4">
          <Shell>
            <div className="grid grid-cols-1 gap-y-3 lg:grid-cols-[var(--rail)_minmax(0,var(--measure))] lg:gap-x-(--gutter)">
              <div className="hidden lg:block">{live && <Convergence points={history} exact={exact} />}</div>
              <div className="min-w-0">
                <dl className="text-meta grid grid-cols-2 items-end gap-x-6 gap-y-1.5 font-mono sm:grid-cols-[repeat(5,max-content)] sm:justify-between sm:gap-x-3">
                  <div>
                    <dt className="text-graphite">Monte Carlo ± 2 SE</dt>
                    <dd className="tabular text-note text-indigo" data-mc-price={hasMean && fresh ? shown.mean : ''} data-mc-se={hasMean && fresh ? shown.se : ''}>
                      {hasMean && fresh ? `${shown.mean.toFixed(4)} ± ${(2 * shown.se).toFixed(4)}` : '…'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-graphite">Black–Scholes</dt>
                    <dd className="tabular text-ink" data-bs-price={exact}>
                      {exact.toFixed(4)}
                    </dd>
                  </div>
                  <div className="hidden sm:block">
                    <dt className="text-graphite">Gap to formula</dt>
                    <dd className="tabular text-ink">{hasMean && fresh ? `${(diff / shown.se).toFixed(1)} SE` : '…'}</dd>
                  </div>
                  <div>
                    <dt className="text-graphite">{shown.mode === 'gpu' && shown.done ? 'Paths · complete' : 'Paths simulated'}</dt>
                    <dd className="tabular text-ink" data-paths={fresh ? shown.n : 0}>
                      {fresh ? fmtInt(shown.n) : '…'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-graphite">{shown.mode === 'cpu' ? 'On this CPU' : shown.mode === 'gpu' ? 'On this GPU' : 'Speed'}</dt>
                    <dd className="tabular text-ink" data-speed={shown.mode}>
                      {speed}
                    </dd>
                  </div>
                </dl>

                <div className="mt-2.5 grid grid-cols-2 gap-x-6">
                  <label className="block">
                    <span className="text-meta font-mono text-graphite">
                      Volatility <span className="tabular text-ink">{Math.round(sigma * 100)}%</span>
                    </span>
                    <input
                      type="range"
                      min={MODEL.sigmaMin * 100}
                      max={MODEL.sigmaMax * 100}
                      step={1}
                      value={Math.round(sigma * 100)}
                      aria-valuetext={`${Math.round(sigma * 100)}% a year`}
                      onChange={(e) => commit(Number(e.currentTarget.value) / 100, strike)}
                      className="mt-0.5 block h-6 w-full accent-[var(--color-indigo)]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-meta font-mono text-graphite">
                      Strike <span className="tabular text-ink">${strike}</span>
                    </span>
                    <input
                      type="range"
                      min={MODEL.strikeMin}
                      max={MODEL.strikeMax}
                      step={1}
                      value={strike}
                      aria-valuetext={`$${strike}`}
                      onChange={(e) => commit(sigma, Number(e.currentTarget.value))}
                      className="mt-0.5 block h-6 w-full accent-[var(--color-indigo)]"
                    />
                  </label>
                </div>
                {/* Two lines reserved on a phone, one above: the words change as the stage decides, the band must not move. */}
                <p className="text-meta mt-2 min-h-[2.9em] font-mono text-graphite sm:min-h-[1.45em]">
                  {why ?? (live ? hint : 'Scroll to fly through the futures.')}
                </p>
                <p className="text-meta font-mono text-graphite">Simulated, not market data · $100 today · one year · 3% rate · 64 steps a path</p>
              </div>
            </div>
          </Shell>
        </div>
        <p className="sr-only">
          {`The figure draws simulated one-year price paths for a $100 stock at ${Math.round(sigma * 100)}% volatility, coloured by whether they finish above the $${strike} strike, and the histogram of where they end. `}
          {hasMean && fresh
            ? `From ${fmtInt(shown.n)} simulated paths the option is worth ${shown.mean.toFixed(4)}, give or take ${(2 * shown.se).toFixed(4)}; the Black–Scholes formula gives ${exact.toFixed(4)}.`
            : `The Black–Scholes formula gives ${exact.toFixed(4)}.`}
        </p>
        <p className="sr-only" aria-live="polite">
          {spoken}
        </p>
      </figure>
    </section>
  )
}
