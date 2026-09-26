'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react'
import { FigureFrame } from '@/components/FigureFrame'
import { saveData, supportsWebGL2 } from '@/components/stage/env'
import { fade, underlay, useStage, type Create, type Renderer } from '@/components/stage/useStage'
import { Flight } from '@/lib/futures/flight'
import { MODEL, bs } from '@/lib/futures/mc'
import { POSTER_PATHS, bands, fill, strands, summarize, type Frame } from '@/lib/futures/poster'
import { Timeline, isSkipInput } from '@/lib/futures/sequence'
import { Convergence, type Point } from './Convergence'
import { Poster } from './Poster'
import type { FuturesRenderer, Stats } from './renderer'

/**
 * Fig. 1, live. The page arrives with the poster — a real frame computed on
 * the server with the CPU mirror of the GPU generator — and its numbers. When
 * the stage goes live, a WebGL2 renderer (loaded on idle, its own chunk) takes
 * over the picture and the counter: the Monte Carlo price, its standard error,
 * the paths simulated and the rate this device simulates them at, all read
 * back from the GPU.
 *
 * Once per visit, the first time a third of the stage is on screen, it plays the
 * signature sequence (lib/futures/sequence.ts). A click, a key or any control
 * finishes it at once; scrolling does not. Fly through is the optional flight
 * along the futures; Replay plays the sequence again.
 *
 * Without the live renderer (reduced motion, a software rasteriser, no float
 * render targets) the inputs still work: the still frame is redrawn and
 * repriced on the CPU, in slices small enough never to block the page.
 */

const SEEN = 'futures-seq'
const noop = () => () => {}
const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US')
/** Paths per second, as "71.9M" or "812k". */
const fmtRate = (r: number) => (r >= 1e6 ? `${(r / 1e6).toFixed(r >= 1e8 ? 0 : 1)}M` : r >= 1e3 ? `${Math.round(r / 1e3)}k` : fmtInt(r))
const pct = (x: number) => `${Math.round(x * 100)}%`
const dollars = (x: number) => `$${x.toFixed(2)}`

/** A figure control: quiet, 4px corners, the border goes to ink on hover. */
const CONTROL =
  'text-meta min-h-8 rounded-sm border border-graphite px-2.5 py-1.5 font-mono text-ink transition-colors duration-150 ease-out hover:border-ink'

type Mode = 'server' | 'cpu' | 'gpu'
type Seq = 'off' | 'pending' | 'playing' | 'done'
interface Shown {
  n: number
  mean: number
  se: number
  rate: number
  mode: Mode
  done: boolean
}

/** Paths per CPU slice: about 3 ms on a laptop, well under a long task on a phone. */
const SLICE = 1024

const priceLine = (mean: number) => `Average, discounted to today: ${dollars(mean)}`

export function FuturesLive({ initial }: { initial: Frame }) {
  const [sigma, setSigma] = useState<number>(MODEL.sigma)
  const [strike, setStrike] = useState<number>(MODEL.strike)
  const [shown, setShown] = useState<Shown>({ ...initial.stats, rate: 0, mode: 'server', done: true })
  const [frame, setFrame] = useState<Frame>(initial)
  const [history, setHistory] = useState<Point[]>([])
  // Why the live renderer declined, when it did.
  const [declined, setDeclined] = useState<'software' | 'float' | null>(null)
  const [flying, setFlying] = useState(false)
  const [seq, setSeq] = useState<Seq>('off')
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  const [spoken, setSpoken] = useState('')

  const labels = useRef<HTMLDivElement>(null)
  const renderer = useRef<FuturesRenderer | null>(null)
  const params = useRef({ sigma, strike })
  const liveRef = useRef(false)
  const timeline = useRef(new Timeline())
  const flight = useRef(new Flight())
  /** This visit plays the sequence: decided before first paint (components/figures/Futures.tsx). */
  const armed = useRef(false)
  const seqRef = useRef<Seq>('off')

  const setSeqState = useCallback((s: Seq) => {
    if (seqRef.current === s) return
    seqRef.current = s
    setSeq(s)
  }, [])

  // Claim the figure for the pre-paint script, and read its decision.
  useEffect(() => {
    const d = document.documentElement
    d.dataset.futuresLive = '1'
    if (d.dataset.futuresSeq === '1') {
      armed.current = true
      setSeqState('pending')
    }
  }, [setSeqState])

  /** The live figure will not run here: show the finished picture, and do not wait for a sequence. */
  const release = useCallback(() => {
    armed.current = false
    delete document.documentElement.dataset.futuresSeq
    setSeqState('off')
  }, [setSeqState])

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

  // The clocks move only on drawn frames: off screen, nothing is drawn, and
  // the sequence and the flight wait where they were.
  const onTick = useCallback(
    (dtMs: number) => {
      const t = timeline.current
      t.advance(dtMs)
      const f = flight.current
      const was = f.flying
      f.advance(dtMs)
      if (was && !f.flying) setFlying(false)
      if (armed.current && t.started) setSeqState(t.done ? 'done' : 'playing')
    },
    [setSeqState],
  )

  const onSequenceFrame = useCallback(() => {
    try {
      sessionStorage.setItem(SEEN, '1')
    } catch {}
    setHistory([])
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
      let real: FuturesRenderer | null = null
      let size: [number, number, number, number] | null = null
      let quality = 2
      let palette = env.palette
      let gone = false
      void import('./renderer').then((m) => {
        if (gone || !labels.current) return
        real = m.createRenderer(
          { ...env, palette },
          {
            labels: labels.current,
            sequence: () => (armed.current ? timeline.current.phases() : null),
            camera: () => flight.current.p,
            tick: onTick,
            onStats,
            onSequenceFrame,
          },
        )
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
    [onStats, onTick, onSequenceFrame],
  )

  const { box, canvas, live, eligible, reduced, fps, quality, tier } = useStage(create)
  // The kit reports live once the renderer draws; from then the GPU owns the counter.
  const wasLive = useRef(false)
  useEffect(() => {
    liveRef.current = live
    // A lost context puts the poster back: it must be the finished picture.
    if (wasLive.current && !live) release()
    wasLive.current = live
  }, [live, release])
  useEffect(() => {
    if (declined || (mounted && (!eligible || reduced))) release()
  }, [declined, eligible, reduced, mounted, release])

  // The sequence starts the first time a good third of the stage is on
  // screen: enough to see the futures leave today, and early enough that a
  // laptop's first screen does not sit on an empty frame.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e && e.intersectionRatio >= 0.35 && armed.current && !timeline.current.started) timeline.current.start()
      },
      { threshold: [0.35] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [box])

  // Any input finishes the sequence; Escape also ends a flight. A return
  // through the back-forward cache finishes a sequence that was interrupted.
  const stopFlight = useCallback(() => {
    flight.current.stop()
    setFlying(false)
  }, [])
  useEffect(() => {
    const onInput = (e: Event) => {
      const k = e as Event & { pointerType?: string; key?: string }
      if (isSkipInput(k)) timeline.current.skip()
      if (e.type === 'keydown' && k.key === 'Escape' && flight.current.flying) stopFlight()
    }
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) timeline.current.skip()
    }
    for (const t of ['click', 'keydown', 'pointerdown']) document.addEventListener(t, onInput, true)
    addEventListener('pageshow', onShow)
    return () => {
      for (const t of ['click', 'keydown', 'pointerdown']) document.removeEventListener(t, onInput, true)
      removeEventListener('pageshow', onShow)
    }
  }, [stopFlight])

  // Committed parameters reach the renderer, which restarts its estimate.
  useEffect(() => {
    params.current = { sigma, strike }
    renderer.current?.setParams(sigma, strike)
  }, [sigma, strike])

  // The still frame, repriced on the CPU when the live renderer is not drawing.
  const ens = useRef<{ sigma: number; t: Float32Array; n: number; ms: number } | null>(null)
  useEffect(() => {
    if (live) return
    if (sigma === MODEL.sigma && strike === MODEL.strike && !ens.current) return
    let cancelled = false
    let timer = 0
    const finish = () => {
      const e = ens.current!
      const f = summarize(e.t, strike)
      setFrame(f)
      setShown({ ...f.stats, rate: e.ms > 0 ? (e.n / e.ms) * 1000 : 0, mode: 'cpu', done: true })
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
    timeline.current.skip()
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

  const toggleFlight = () => {
    if (flight.current.flying) return stopFlight()
    timeline.current.skip()
    flight.current.start()
    setFlying(true)
  }
  const replay = () => {
    const r = renderer.current
    if (!r) return
    stopFlight()
    armed.current = true
    r.fadeOut(200, () => {
      timeline.current.replay()
      setHistory([])
    })
  }

  // Pointer: drag sideways for volatility, point (or tap) for the strike.
  const drag = useRef<{ id: number; x: number; s: number; moved: boolean } | null>(null)
  const rest = useRef(0)
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
    // Touching the figure mid-flight brings the camera home instead.
    if (flight.current.flying) return stopFlight()
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
    } else if (!d && e.pointerType === 'mouse' && !flight.current.flying) hover(e.clientX, e.clientY)
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
  const priced = hasMean && fresh

  const speed =
    (shown.mode === 'gpu' || shown.mode === 'cpu') && shown.rate > 0
      ? `${fmtRate(shown.rate)} paths/s`
      : shown.mode === 'gpu' || shown.mode === 'cpu'
        ? 'measuring…'
        : mounted && eligible && !reduced
          ? 'starting'
          : 'computed at build'
  const coarse = mounted && window.matchMedia('(pointer: coarse)').matches
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
  const hint = why ?? `${coarse ? 'Tap' : 'Point at'} a price to set the strike · drag sideways for volatility.`

  const mc = priced ? `${shown.mean.toFixed(4)} ± ${(2 * shown.se).toFixed(4)}` : '…'
  const paths = fresh ? fmtInt(shown.n) : '…'
  const speedLabel = shown.mode === 'cpu' ? 'On this CPU' : shown.mode === 'gpu' ? 'On this GPU' : 'Speed'
  const perSec = (shown.mode === 'gpu' || shown.mode === 'cpu') && shown.rate > 0 ? fmtRate(shown.rate) : shown.mode === 'server' ? 'at build' : '…'
  const years = MODEL.T === 1 ? 'one year' : `${MODEL.T} years`

  const rail = (
    <div className="text-meta font-mono lg:text-right">
      <dl className="grid grid-cols-1 gap-y-px [&_dd]:mb-2">
        <dt className="text-graphite">Simulated price ± 2 SE</dt>
        <dd className="tabular text-indigo" data-mc-price={priced ? shown.mean : ''} data-mc-se={priced ? shown.se : ''}>
          {mc}
        </dd>
        <dt className="text-graphite">Black–Scholes formula</dt>
        <dd className="tabular text-ink" data-bs-price={exact}>
          {exact.toFixed(4)}
        </dd>
        <dt className="text-graphite">Gap to the formula</dt>
        <dd className="tabular text-ink">{priced ? `${(diff / shown.se).toFixed(1)} SE` : '…'}</dd>
        <dt className="text-graphite">{shown.mode === 'gpu' && shown.done ? 'Paths · complete' : 'Paths simulated'}</dt>
        <dd className="tabular text-ink" data-paths={fresh ? shown.n : 0}>
          {paths}
        </dd>
        <dt className="text-graphite">{speedLabel}</dt>
        <dd className="tabular text-ink" data-speed={shown.mode}>
          {speed}
        </dd>
      </dl>
      {live && <Convergence points={history} exact={exact} />}
    </div>
  )

  const table = (
    <table>
      <caption>
        {`Where ${fmtInt(frame.stats.n)} simulated futures of a $${MODEL.s0} stock end after ${years} at ${pct(sigma)} volatility, and what a call struck at $${strike} pays there. Priced by simulation at ${priced ? shown.mean.toFixed(4) : frame.stats.mean.toFixed(4)}; the Black–Scholes formula gives ${exact.toFixed(4)}.`}
      </caption>
      <thead>
        <tr>
          <th scope="col">Price at expiry</th>
          <th scope="col">Share of futures</th>
          <th scope="col">Average payoff there</th>
        </tr>
      </thead>
      <tbody>
        {bands(frame).map((b) => (
          <tr key={b.lo}>
            <td>{`$${b.lo}–$${b.hi}`}</td>
            <td>{`${(b.share * 100).toFixed(1)}%`}</td>
            <td>{dollars(b.payoff)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <FigureFrame
      id="fig-futures"
      number="Fig. 1"
      title={`Every line is one possible year for a $${MODEL.s0} stock.`}
      subtitle={`Simulated · geometric Brownian motion · σ ${pct(MODEL.sigma)} · r ${(MODEL.r * 100).toFixed(1)}% · ${MODEL.steps} steps · not market data`}
      rail={rail}
      railBelow={false}
      hint={hint}
      caption={
        <>
          An option that pays whatever the stock finishes above the strike is worth that payoff averaged over every
          future and discounted to today. The histogram at expiry is where the futures end; the indigo bars are what
          each ending pays, weighted by how often it happens, and together they are the price. The margin shows the
          simulation closing in on the Black–Scholes formula as the paths pile up. Simulated, not market data.
        </>
      }
      table={table}
    >
      <div
        ref={box}
        data-seq={seq}
        data-fps={fps}
        data-quality={quality}
        data-tier={tier ?? ''}
        className={`relative -mx-6 h-[clamp(22rem,60svh,32rem)] overflow-hidden sm:mx-0 lg:h-[clamp(26rem,56svh,38rem)] ${live ? 'cursor-crosshair touch-pan-y select-none' : ''}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onLeave}
      >
        <div data-futures-poster="" className="absolute inset-0" style={underlay(live)}>
          <Poster strands={posterStrands} payBars={frame.payBars} outline={frame.outline} strike={strike} price={priceLine(frame.stats.mean)} />
        </div>
        <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 size-full" style={fade(live)} />
        <div ref={labels} aria-hidden="true" className="pointer-events-none absolute inset-0" style={fade(live)} />
        {/* The legend sits in the plot's one empty corner, under the fan, in label type, with no panel behind it. */}
        <p aria-hidden="true" className="text-meta pointer-events-none absolute bottom-2 left-6 flex flex-wrap gap-x-4 gap-y-1 font-mono text-graphite sm:left-0">
          <span>
            <span className="mr-1.5 inline-block h-[3px] w-4 rounded-full bg-indigo align-middle" />
            futures where it pays
          </span>
          <span>
            <span className="mr-1.5 inline-block w-4 border-t-[1.5px] border-dashed border-ink align-middle" />
            the strike
          </span>
        </p>
      </div>

      {/* A phone gets the three numbers that tell the story; the margin has the rest. */}
      <dl className="text-meta mt-3 grid grid-cols-3 gap-x-4 border-t border-rule pt-3 font-mono lg:hidden">
        <div className="min-w-0">
          <dt className="text-graphite">Simulated</dt>
          <dd className="tabular text-indigo">{priced ? shown.mean.toFixed(3) : '…'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-graphite">Formula</dt>
          <dd className="tabular text-ink">{exact.toFixed(3)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-graphite">Paths/s</dt>
          <dd className="tabular text-ink">{perSec}</dd>
        </div>
      </dl>

      <div className="mt-4 grid grid-cols-2 gap-x-6">
        <label className="block">
          <span className="text-meta font-mono text-graphite">
            Volatility <span className="tabular text-ink">{pct(sigma)}</span>
          </span>
          <input
            type="range"
            min={MODEL.sigmaMin * 100}
            max={MODEL.sigmaMax * 100}
            step={1}
            value={Math.round(sigma * 100)}
            aria-valuetext={`${pct(sigma)} a year`}
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
      {/* Space is kept for the controls from the first paint, so nothing moves when the figure goes live. */}
      <div className={`mt-3 flex min-h-8 flex-wrap gap-2 ${live ? '' : 'invisible'}`}>
        <button type="button" aria-pressed={flying} onClick={toggleFlight} className={CONTROL}>
          {flying ? 'Stop' : 'Fly through'}
        </button>
        <button type="button" onClick={replay} className={CONTROL}>
          Replay
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {spoken}
      </p>
    </FigureFrame>
  )
}
