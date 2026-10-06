'use client'

import { Items } from '@/components/Layout'
import { EASE_OUT_CSS } from '@/lib/ease'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react'
import { flushSync } from 'react-dom'
import { FigureFrame, Steady } from '@/components/FigureFrame'
import { CONTROL } from '@/components/stage/controls'
import { saveData, supportsWebGL2, useColorScheme } from '@/components/stage/env'
import { DebugSlot } from '@/components/stage/DebugSlot'
import { fade, underlay, useStage, type Create, type Renderer } from '@/components/stage/useStage'
import type { LiveInfo } from '@/lib/stage/debug'
import { Flight } from '@/lib/futures/flight'
import { MODEL, bs } from '@/lib/futures/mc'
import { POSTER_PATHS, bands, fill, strands, summarize, type PosterFrame } from '@/lib/futures/poster'
import { Timeline, isSkipInput } from '@/lib/futures/sequence'
import { Lean } from '@/lib/futures/tilt'
import { withError } from '@/lib/futures/format'
import { Convergence, type Point } from './Convergence'
import { Poster } from './Poster'
import type { FuturesRenderer, Stats } from './renderer'
import { rangeFill } from '@/components/stage/range'

/**
 * Fig. 1, live. The page arrives with the poster — a real frame computed on
 * the server with the CPU mirror of the GPU generator — and its numbers. When
 * the stage goes live, a WebGL2 renderer (loaded on idle, its own chunk) takes
 * over the picture and the counter: the Monte Carlo price, its standard error,
 * the paths simulated and the rate this device simulates them at, all read
 * back from the GPU.
 *
 * Once per visit, the first time the stage is on screen down to today's price,
 * it plays the signature sequence (lib/futures/sequence.ts), then falls still.
 * A click or a key finishes it quickly; scrolling does not; using the figure
 * itself (a control, a strike, Fly through) ends it at once. Fly through is the
 * optional flight along the paths; Replay plays the sequence again.
 *
 * Without the live renderer (reduced motion, a software rasteriser, a driver
 * that cannot render its targets, a failed load, a lost context) the inputs still work: the
 * still frame is redrawn and repriced on the CPU, in slices small enough never
 * to block the page.
 */

const SEEN = 'futures-seq'
const PAUSED = 'futures-paused'
type Permission = 'unasked' | 'granted' | 'denied' | 'none'
const noop = () => () => {}
const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US')
/** Paths per second, as "71.9M" or "812k". */
const fmtRate = (r: number) => (r >= 1e6 ? `${(r / 1e6).toFixed(r >= 1e8 ? 0 : 1)}M` : r >= 1e3 ? `${Math.round(r / 1e3)}k` : fmtInt(r))
const pct = (x: number) => `${Math.round(x * 100)}%`
const dollars = (x: number) => `$${x.toFixed(2)}`

/** A figure control: quiet, 4px corners, the border goes to ink on hover, and a press is felt. */

type Mode = 'server' | 'cpu' | 'gpu'
type Seq = 'off' | 'pending' | 'playing' | 'done'
type Declined = 'software' | 'targets' | 'load' | 'error' | 'lost' | null
interface Shown {
  /** The option a live estimate is for (absent: the one on screen, as the server's and the CPU's are). */
  for?: { sigma: number; strike: number }
  n: number
  mean: number
  se: number
  rate: number
  mode: Mode
  done: boolean
}
/** What the screen-reader table describes, with the inputs it was computed for, so its words always match its rows. */
interface Table {
  sigma: number
  strike: number
  n: number
  mean: number
  se: number
  counts: readonly number[]
  payoff: readonly number[]
}

/** A phone may draw this figure at two device pixels per CSS pixel: crisp ribbons on a phone as on a laptop. */
const STAGE_OPTS = { maxQ: { mid: 3 } } as const

/** Paths per CPU slice: about 3 ms on a laptop, well under a long task on a phone. */
const SLICE = 1024
/** If the live figure has not drawn by now, the finished poster shows instead of the empty frame it was waiting on. */
const FIRST_FRAME_MS = 6000

/** The simulated market the stock's volatility comes from: its seed, the moment it is read at, and what the server read. */
export interface MarketSigma {
  seed: number
  t: number
  sigma: number
}

export function FuturesLive({ initial, market }: { initial: PosterFrame; market: MarketSigma }) {
  const [sigma, setSigma] = useState<number>(MODEL.sigma)
  const [strike, setStrike] = useState<number>(MODEL.strike)
  const [shown, setShown] = useState<Shown>({ ...initial.stats, rate: 0, mode: 'server', done: true })
  const [frame, setFrame] = useState<PosterFrame>(initial)
  /** On paper, the poster's price is the readouts' own estimate, so a printed sheet never sets two prices for one call. */
  const [paperPrice, setPaperPrice] = useState<number | null>(null)
  const paperRef = useRef<number | null>(null)
  const [table, setTable] = useState<Table>({ sigma: MODEL.sigma, strike: MODEL.strike, ...initial.stats, counts: initial.counts, payoff: initial.payoff })
  const [history, setHistory] = useState<Point[]>([])
  // Why the live renderer declined, when it did.
  const [declined, setDeclined] = useState<Declined>(null)
  const [flying, setFlying] = useState(false)
  const [seq, setSeq] = useState<Seq>('off')
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  const scheme = useColorScheme()
  // The still frame, for a reader who does not get the live figure: drawn on a 2D canvas, from the same camera.
  const stillCanvas = useRef<HTMLCanvasElement>(null)
  const stillLabels = useRef<HTMLDivElement>(null)
  const [stillReady, setStillReady] = useState(false)
  const stillWasShown = useRef(false)
  const sigmaInput = useRef<HTMLInputElement>(null)
  const [stillKey, setStillKey] = useState(0)
  /** The live figure has not drawn within FIRST_FRAME_MS: show the still frame while it may yet come. */
  const [timedOut, setTimedOut] = useState(false)
  const [spoken, setSpoken] = useState('')
  // Pause holds the figure's own motion (the stream, the drift, the settle into depth), for the rest of the visit:
  // WCAG 2.2.2. It is read before the renderer exists, and the button only appears once it is live.
  const [paused, setPaused] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && sessionStorage.getItem(PAUSED) === '1'
    } catch {
      return false
    }
  })
  const pausedRef = useRef(paused)
  // The lean the reader asks for, from the pointer on a laptop or the tilt of a phone, each in −1…1.
  const lean = useRef({ x: 0, y: 0 })
  const leanFrom = useRef<'drift' | 'pointer' | 'tilt'>('drift')
  const tilt = useRef(new Lean())
  const [permission, setPermission] = useState<Permission>('unasked')
  // ?debug=1: a report a phone's owner can screenshot, loaded only when asked for (DebugSlot).
  const debugInfo = useRef<() => LiveInfo>(null)

  const labels = useRef<HTMLDivElement>(null)
  const renderer = useRef<FuturesRenderer | null>(null)
  const params = useRef({ sigma, strike })
  const liveRef = useRef(false)
  const frameRef = useRef(frame)
  const timeline = useRef(new Timeline())
  const flight = useRef(new Flight())
  /** This visit plays the sequence: decided before first paint (components/figures/Futures.tsx). */
  const armed = useRef(false)
  const seqRef = useRef<Seq>('off')
  useEffect(() => {
    frameRef.current = frame
  }, [frame])

  const setSeqState = useCallback((s: Seq) => {
    if (seqRef.current === s) return
    seqRef.current = s
    setSeq(s)
  }, [])
  const playing = () => seqRef.current === 'pending' || seqRef.current === 'playing'

  const readDebug = useCallback((): LiveInfo => debugInfo.current!(), [])

  // Claim the figure for the pre-paint script, and read its decision.
  useEffect(() => {
    const d = document.documentElement
    d.dataset.futuresLive = '1'
    if (d.dataset.futuresSeq === '1') {
      armed.current = true
      setSeqState('pending')
    }
  }, [setSeqState])

  /** The live figure will not play the sequence here: show the finished picture. */
  const release = useCallback(() => {
    armed.current = false
    timeline.current.finish()
    delete document.documentElement.dataset.futuresSeq
    setSeqState('off')
  }, [setSeqState])

  const onStats = useCallback((s: Stats) => {
    if (!liveRef.current) return
    // Ten reports a second; a figure that is paused or finished pricing sends the same one each time, and re-rendering
    // the figure for it would be work for nothing.
    // A new run's first moment (the reader just moved an input) holds the last estimate in the margin until the new
    // one is back, rather than blinking to "…"; the sequence's own run starts from nothing, as its convergence is shown.
    setShown((was) =>
      was.mode === 'gpu' && was.n === s.n && was.mean === s.mean && was.se === s.se && was.rate === s.rate && was.done === s.done
        ? was
        : s.n === 0 && was.mode === 'gpu' && was.n > 0 && !(armed.current && !timeline.current.done)
          ? was
          : { n: s.n, mean: s.mean, se: s.se, rate: s.rate, mode: 'gpu', done: s.done, for: { ...params.current } },
    )
    if (s.hist) {
      const { sigma: sg, strike: k } = params.current
      const hist = s.hist
      // Once a second; paused or finished, the same table each time, which need not render the figure again.
      setTable((was) =>
        was.n === s.n && was.mean === s.mean && was.sigma === sg && was.strike === k
          ? was
          : { sigma: sg, strike: k, n: s.n, mean: s.mean, se: s.se, counts: hist.counts, payoff: hist.payoff },
      )
    }
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
      if (armed.current && t.started) {
        setSeqState(t.done ? 'done' : 'playing')
        // The story is over: the mark that hid the poster for it goes, as the other figures' do, so a still frame
        // later (a lost context) shows.
        if (t.done) delete document.documentElement.dataset.futuresSeq
      }
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
      if (!labels.current) return null
      let real: FuturesRenderer | null = null
      let size: [number, number, number, number] | null = null
      let quality = 2
      let palette = env.palette
      /** The display's refresh as the stage has learned it, for a renderer that loads after it was told. */
      let interval: number | null = null
      let gone = false
      let broken = false
      // Whatever becomes of it — a failed load, a shader that will not link, a
      // renderer that throws — the reader is left with the finished picture,
      // never an empty frame waiting on a figure that will not come.
      const fail = (why: 'targets' | 'load' | 'error') => {
        if (gone || broken) return
        broken = true
        setDeclined(why)
        release()
      }
      const slow = window.setTimeout(() => {
        if (liveRef.current) return
        release()
        setTimedOut(true)
      }, FIRST_FRAME_MS)
      import('./renderer')
        .then((m) => {
          if (gone || !labels.current) return
          if (m.cannotRun(gl)) return fail('targets')
          try {
            real = m.createRenderer(
              { ...env, palette },
              {
                labels: labels.current,
                sequence: () => (armed.current ? timeline.current.phases() : null),
                camera: () => flight.current.p,
                paused: () => pausedRef.current,
                parallax: () => lean.current,
                tick: onTick,
                onStats,
                onSequenceFrame,
                atRest: () => stillWasShown.current,
                opening: () => frameRef.current.stats.mean,
              },
            )
            real.setQuality!(quality)
            if (interval !== null) real.refresh?.(interval)
            if (size) real.resize(...size)
            real.setParams(params.current.sigma, params.current.strike)
            renderer.current = real
          } catch {
            fail('error')
          }
        })
        .catch(() => fail('load'))
      const wrap: Renderer = {
        frame: (t, dt) => {
          if (broken) return null
          if (!real) return false
          try {
            return real.frame(t, dt)
          } catch {
            fail('error')
            return null
          }
        },
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
        refresh: (s) => {
          interval = s
          real?.refresh?.(s)
        },
        calm: () => !!real?.calm?.(),
        dispose: () => {
          gone = true
          window.clearTimeout(slow)
          real?.dispose()
          renderer.current = null
        },
      }
      return wrap
    },
    [onStats, onTick, onSequenceFrame, release],
  )

  // The quality waits to climb until the story is told, as the IV figure's does: the burst never sharpens mid-moment.
  // And while the camera moves (the swing into depth after the story, a flight and its return): the step's long frame
  // landed in the middle of the swing, a hitch in the one move the reader is watching; at rest the drift is slow.
  const [stageOpts] = useState(() => ({
    ...STAGE_OPTS,
    hold: () => seqRef.current === 'pending' || seqRef.current === 'playing' || ['settle', 'flight', 'return'].includes(labels.current?.dataset.camera ?? ''),
  }))
  const { box, canvas, live, eligible, reduced, fps, quality, tier } = useStage(create, stageOpts)

  // One market, checked here: once the figure runs live, this browser builds the same seeded market in a worker
  // (lib/market/market.worker.ts, /market's own) to the moment the volatility is read at, and marks what it got
  // beside what the server did, for ?debug=1 and the specs. The figure prices at the server's; by the market's
  // determinism the two are one number (tests/futures.test.ts, tests/e2e/hero.spec.ts).
  const browserSigma = useRef<number | null>(null)
  const sigmaChecked = useRef(false)
  // It waits out the opening sequence: its script is fetched and started only once the story is over (or was never to
  // play), so none of it lands on the one moment of the visit.
  const storyQuiet = seq !== 'pending' && seq !== 'playing'
  useEffect(() => {
    if (!live || !storyQuiet || sigmaChecked.current) return
    let w: Worker | null = null
    try {
      w = new Worker(new URL('../../../lib/market/market.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      return
    }
    w.onmessage = (e: MessageEvent<{ kind: string; sigma?: number }>) => {
      if (e.data?.kind !== 'ready' || typeof e.data.sigma !== 'number') return
      const got = e.data.sigma
      // Checked once it has answered: one stopped before then (the story replayed) starts again when it is quiet.
      sigmaChecked.current = true
      browserSigma.current = got
      const el = box.current
      if (el) {
        el.dataset.sigmaMarket = String(got)
        el.dataset.sigmaBrowser = String(Math.round(got * 100) / 100)
      }
      w?.terminate()
    }
    w.onerror = (ev) => {
      ev.preventDefault()
      w?.terminate()
    }
    w.postMessage({ kind: 'start', seed: market.seed, t: market.t })
    return () => w?.terminate()
  }, [live, storyQuiet, market.seed, market.t, box])
  // The kit reports live once the renderer draws; from then the GPU owns the counter.
  useEffect(() => {
    liveRef.current = live
  }, [live])

  // A phone's tilt leans the view: at once where the browser allows it, after the first tap where it asks (iOS).
  useEffect(() => {
    if (!live || reduced || typeof DeviceOrientationEvent === 'undefined' || !window.matchMedia('(pointer: coarse)').matches) return
    const D = DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> }
    if (typeof D.requestPermission === 'function' && permission !== 'granted') return
    const onTilt = (e: DeviceOrientationEvent) => {
      if (pausedRef.current) return
      lean.current = tilt.current.read(e.beta, e.gamma, screen.orientation?.angle ?? 0, e.timeStamp)
      leanFrom.current = 'tilt'
    }
    addEventListener('deviceorientation', onTilt)
    return () => removeEventListener('deviceorientation', onTilt)
  }, [live, reduced, permission])
  useEffect(() => {
    if (declined || (mounted && (!eligible || reduced))) release()
  }, [declined, eligible, reduced, mounted, release])

  // A lost context, before or after the first frame, puts the finished poster
  // back with its own numbers; the CPU reprices it if the inputs have moved.
  useEffect(() => {
    const cv = canvas.current
    if (!cv) return
    const onLost = () => {
      setDeclined('lost')
      release()
      const f = frameRef.current
      setShown({ ...f.stats, rate: 0, mode: 'server', done: true })
    }
    // Given back, the stage builds the renderer again; the still frame gives way when it draws.
    const onRestored = () => setDeclined(null)
    cv.addEventListener('webglcontextlost', onLost)
    cv.addEventListener('webglcontextrestored', onRestored)
    return () => {
      cv.removeEventListener('webglcontextlost', onLost)
      cv.removeEventListener('webglcontextrestored', onRestored)
    }
  }, [canvas, release])

  // The sequence starts once the reader can see enough of the stage: a third
  // of it (on a laptop's first screen, most of it is), or a fifth held for
  // 1.2s — a short window, a zoomed page — so nobody is left looking at an
  // empty frame waiting for a scroll.
  useEffect(() => {
    const el = box.current
    if (!el) return
    let wait = 0
    const go = () => {
      if (armed.current && !timeline.current.started) timeline.current.start()
    }
    const io = new IntersectionObserver(
      (es) => {
        // The latest entry: one element is watched, and a batch can hold several of its crossings, the first stale.
        const e = es[es.length - 1]
        const seen = e?.isIntersecting ? e.intersectionRatio : 0
        if (seen >= 0.35 || seen < 0.2) {
          clearTimeout(wait)
          wait = 0
          if (seen >= 0.35) go()
        } else if (!wait)
          wait = window.setTimeout(() => {
            wait = 0
            go()
          }, 1200)
      },
      { threshold: [0, 0.2, 0.35] },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      clearTimeout(wait)
    }
  }, [box])

  // A click or a key finishes the sequence; Escape also ends a flight. A return
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
      if (e.persisted && armed.current) timeline.current.finish()
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
      setTable({ sigma, strike, ...f.stats, counts: f.counts, payoff: f.payoff })
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

  // Printed while live, the poster is what goes on paper (a canvas is the screen's): at that moment it is priced for the
  // reader's own volatility and strike, on the CPU as the still frame is, so the sheet's call price is theirs. (While
  // live the poster is not repriced as the inputs move: that would be CPU work under a running figure, for a picture
  // no one sees on screen.)
  useEffect(() => {
    if (!live) return
    const priceForPaper = () => {
      if (sigma === MODEL.sigma && strike === MODEL.strike) return
      let e = ens.current
      if (!e || e.sigma !== sigma || e.n < POSTER_PATHS) {
        const t0 = performance.now()
        e = { sigma, t: new Float32Array(POSTER_PATHS), n: POSTER_PATHS, ms: 0 }
        fill(e.t, sigma, 0, POSTER_PATHS)
        e.ms = performance.now() - t0
        ens.current = e
      }
      const f = summarize(e.t, strike)
      flushSync(() => setFrame(f))
    }
    const print = matchMedia('print')
    const onMedia = () => print.matches && priceForPaper()
    addEventListener('beforeprint', priceForPaper)
    print.addEventListener('change', onMedia)
    return () => {
      removeEventListener('beforeprint', priceForPaper)
      print.removeEventListener('change', onMedia)
    }
  }, [live, sigma, strike])

  // Changing an input is using the figure: the sequence ends, the run starts
  // again and the convergence plot with it. Changes made on the canvas, not on
  // a slider, are also spoken: the slider speaks for itself through its value text.
  const said = useRef(0)
  const commit = useCallback((s: number, k: number, fromCanvas = false) => {
    timeline.current.finish()
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
    timeline.current.finish()
    flight.current.start()
    setFlying(true)
  }
  const togglePause = () => {
    const next = !pausedRef.current
    pausedRef.current = next
    setPaused(next)
    try {
      sessionStorage.setItem(PAUSED, next ? '1' : '0')
    } catch {}
  }
  const replay = () => {
    const r = renderer.current
    if (!r) return
    stopFlight()
    // Replay asks to see it play: a paused figure resumes (held, the rail kept its last numbers over an emptied strip).
    if (pausedRef.current) togglePause()
    armed.current = true
    r.rewind(() => {
      timeline.current.replay()
      timeline.current.start()
      setHistory([])
    })
  }

  // Pointer: drag sideways for volatility, point to preview a strike, click or
  // tap to set it. While the sequence plays the stage only skips it.
  const drag = useRef<{ id: number; x: number; y: number; s: number; moved: boolean; touch: boolean } | null>(null)
  const kAt = (x: number, y: number) => {
    const p = renderer.current?.priceAt(x, y)
    return p == null ? null : Math.round(Math.min(MODEL.strikeMax, Math.max(MODEL.strikeMin, p)))
  }
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!live || drag.current || playing()) return
    // Touching the figure mid-flight brings the camera home instead.
    if (flight.current.flying) return stopFlight()
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, s: sigma, moved: false, touch: e.pointerType === 'touch' }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!live) return
    // A pointer that can hover leans the view toward itself.
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      const r = e.currentTarget.getBoundingClientRect()
      const c = (v: number) => Math.max(-1, Math.min(1, v))
      lean.current = { x: c((e.clientX - r.left - r.width / 2) / (r.width / 2)), y: c(-(e.clientY - r.top - r.height / 2) / (r.height / 2)) }
      leanFrom.current = 'pointer'
    }
    const d = drag.current
    if (d && d.id === e.pointerId) {
      const dx = e.clientX - d.x
      // A finger's drag is a drag only when it is plainly sideways: a thumb scrolling past the figure, a little off
      // vertical, is a scroll, and moves nothing.
      if (d.touch ? Math.abs(dx) > 10 && Math.abs(dx) > 1.5 * Math.abs(e.clientY - d.y) : Math.abs(dx) > 4) d.moved = true
      if (!d.moved) return
      const w = e.currentTarget.getBoundingClientRect().width
      const s = Math.round(Math.min(MODEL.sigmaMax, Math.max(MODEL.sigmaMin, d.s + (dx / w) * 0.9)) * 100) / 100
      if (s !== sigma) commit(s, strike, true)
    } else if (!d && e.pointerType === 'mouse' && !flight.current.flying && !playing()) renderer.current?.preview(kAt(e.clientX, e.clientY))
  }
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (d.moved) return
    const k = kAt(e.clientX, e.clientY)
    renderer.current?.preview(null)
    if (k != null && k !== strike) commit(sigma, k, true)
  }
  // A cancelled pointer (the page took the gesture: a scroll, a pinch) sets nothing: what its first moves changed goes
  // back to where the gesture found it.
  const onCancel = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (d?.id !== e.pointerId) return
    drag.current = null
    if (d.moved && d.s !== sigma) commit(d.s, strike)
  }
  const onLeave = () => {
    renderer.current?.preview(null)
    if (leanFrom.current === 'pointer') lean.current = { x: 0, y: 0 }
  }
  // iOS asks before a page may read the tilt, and only from a tap: the first tap on the figure asks.
  const onTap = () => {
    if (permission !== 'unasked' || !live || reduced || !window.matchMedia('(pointer: coarse)').matches) return
    const D = (typeof DeviceOrientationEvent === 'undefined' ? undefined : DeviceOrientationEvent) as
      | (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> })
      | undefined
    if (typeof D?.requestPermission !== 'function') return
    setPermission('denied')
    D.requestPermission()
      .then((r) => setPermission(r === 'granted' ? 'granted' : 'denied'))
      .catch(() => setPermission('denied'))
  }

  // Drawn whenever the live figure is not: from the table's numbers, which always match its inputs, again on a resize
  // or a change of theme.
  const stillMode = mounted && !live && (reduced || declined !== null || !eligible || timedOut)
  useEffect(() => {
    if (!stillMode) return
    const cv = stillCanvas.current, lb = stillLabels.current
    if (!cv || !lb) return
    let cancel: (() => void) | null = null
    let gone = false
    import('./still')
      .then((m) => {
        if (gone) return
        cancel = m.drawStill(cv, lb, { sigma: table.sigma, strike: table.strike, counts: table.counts, payoff: table.payoff, price: table.mean }, () =>
          setStillReady(true),
        )
      })
      .catch(() => {})
    return () => {
      gone = true
      cancel?.()
    }
  }, [stillMode, table, scheme, stillKey])
  useEffect(() => {
    const el = box.current
    if (!stillMode || !el) return
    const size = () => `${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`
    let last = size()
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const k = size()
        if (k === last) return
        last = k
        setStillKey((x) => x + 1)
      })
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [stillMode, box])
  const stillShown = stillMode && stillReady
  // Whether the reader has seen the still frame (the resting view): a live figure that then takes over opens there.
  useEffect(() => {
    if (stillShown) stillWasShown.current = true
  }, [stillShown])

  const exact = useMemo(() => bs(sigma, strike), [sigma, strike])
  const posterStrands = useMemo(() => strands(sigma, strike), [sigma, strike])
  const diff = Math.abs(shown.mean - exact)
  const hasMean = shown.n > 1 && Number.isFinite(shown.mean)
  const fresh = shown.mode === 'gpu' || shown.mode === 'cpu' || (sigma === MODEL.sigma && strike === MODEL.strike)
  const priced = hasMean && fresh
  // The estimate held while a new option's run starts is the old option's: its gap to the new formula means nothing.
  const sameOption = !shown.for || (shown.for.sigma === sigma && shown.for.strike === strike)
  // Far out of the money at a low volatility no simulated path pays: every payoff is 0, the standard error with them,
  // and the gap has no standard errors to be counted in.
  const gapText = !(priced && sameOption) ? '…' : shown.se > 0 ? `${(diff / shown.se).toFixed(1)} SE` : 'no path pays'
  const paperEstimate = priced && sameOption ? shown.mean : null
  useEffect(() => {
    paperRef.current = paperEstimate
  }, [paperEstimate])
  useEffect(() => {
    const on = () => flushSync(() => setPaperPrice(paperRef.current))
    const off = () => setPaperPrice(null)
    const print = matchMedia('print')
    const onMedia = () => (print.matches ? on() : off())
    addEventListener('beforeprint', on)
    addEventListener('afterprint', off)
    print.addEventListener('change', onMedia)
    return () => {
      removeEventListener('beforeprint', on)
      removeEventListener('afterprint', off)
      print.removeEventListener('change', onMedia)
    }
  }, [])
  const changed = sigma !== MODEL.sigma || strike !== MODEL.strike

  const running = shown.mode === 'gpu' || shown.mode === 'cpu'
  const starting = mounted && eligible && !reduced && !declined
  const speed = running ? (shown.rate > 0 ? `${fmtRate(shown.rate)} paths/s` : 'measuring…') : starting ? 'starting…' : 'at build time'
  const coarse = mounted && window.matchMedia('(pointer: coarse)').matches
  // Said only once the browser has answered; the server cannot know.
  const why = !mounted
    ? null
    : reduced
      ? 'Still frame: your system asks for reduced motion.'
      : declined === 'software'
        ? 'Still frame: this browser draws WebGL in software.'
        : declined === 'targets'
          ? 'Still frame: this browser cannot render to a target the live figure needs.'
          : declined === 'lost'
            ? 'Still frame: the graphics context was lost.'
            : declined === 'load' || declined === 'error'
              ? 'Still frame: the live figure could not start here. Reloading the page may bring it.'
              : !eligible
                ? saveData()
                  ? 'Still frame: your browser asks to save data.'
                  : supportsWebGL2()
                    ? 'Still frame.'
                    : 'Still frame: this browser has no WebGL2.'
                : null
  const hint = why ?? `${coarse ? 'Tap' : 'Click'} a price at expiry to set the strike · drag sideways for volatility.`

  const mc = priced ? withError(shown.mean, shown.se) : '…'
  const paths = fresh ? fmtInt(shown.n) : '…'
  const speedLabel = shown.mode === 'cpu' ? 'On this CPU' : running || starting ? 'On this GPU' : 'Priced'
  const years = MODEL.T === 1 ? 'one year' : `${MODEL.T} years`

  useEffect(() => {
    debugInfo.current = () => {
      const st = box.current?.getBoundingClientRect()
      const cv = canvas.current
      return {
        state: live ? 'live' : why ? 'declined' : mounted ? 'starting' : 'server',
        reason: why,
        tier,
        quality,
        fps,
        dpr: window.devicePixelRatio,
        stage: [st?.width ?? 0, st?.height ?? 0],
        canvas: live && cv ? [cv.width, cv.height] : null,
        seq: flying ? `${seq} · flying` : seq,
        reduced,
        saveData: saveData(),
        ua: navigator.userAgent,
        renderer: renderer.current
          ? {
              ...renderer.current.debug(),
              'σ, this browser’s market':
                browserSigma.current === null
                  ? 'computing…'
                  : `${(browserSigma.current * 100).toFixed(2)}% → ${pct(Math.round(browserSigma.current * 100) / 100)} · ${Math.round(browserSigma.current * 100) / 100 === MODEL.sigma ? 'the same as the server’s' : `not the server’s (${pct(MODEL.sigma)})`}`,
              motion: `${pausedRef.current ? 'paused' : 'moving'} · lean from ${leanFrom.current} ${lean.current.x.toFixed(2)}, ${lean.current.y.toFixed(2)}`,
              tilt: !window.matchMedia('(pointer: coarse)').matches
                ? 'not used (fine pointer)'
                : typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown })?.requestPermission === 'function'
                  ? `permission ${permission}`
                  : 'no permission needed',
            }
          : null,
      }
    }
  })

  const rail = (
    <div className="text-meta font-mono lg:text-right">
      {/* The price, then the machine: two groups, one hairline apart. */}
      <dl className="grid grid-cols-1 gap-y-px [&_dd]:mb-2">
        <dt className="text-graphite">Simulated price ± 2 SE</dt>
        <dd className="tabular text-indigo" data-mc-price={priced ? shown.mean : ''} data-mc-se={priced ? shown.se : ''}>
          <Steady text={mc} ch={16} />
        </dd>
        <dt className="text-graphite">Black–Scholes formula</dt>
        <dd className="tabular text-ink" data-bs-price={exact}>
          {exact.toFixed(4)}
        </dd>
        <dt className="text-graphite">Gap to the formula</dt>
        <dd className="tabular text-ink">
          <Steady text={gapText} ch={12} />
        </dd>
      </dl>
      <dl className="mt-1 grid grid-cols-1 gap-y-px border-t border-rule pt-3 [&_dd]:mb-2">
        <dt className="text-graphite">
          <Steady text={shown.mode === 'gpu' && shown.done ? 'Paths · complete' : 'Paths simulated'} ch={16} />
        </dt>
        <dd className="tabular text-ink" data-paths={fresh ? shown.n : 0}>
          <Steady text={paths} ch={11} />
        </dd>
        <dt className="text-graphite">{speedLabel}</dt>
        <dd className="tabular text-ink" data-speed={shown.mode}>
          <Steady text={speed} ch={13} />
        </dd>
      </dl>
      {/* Its room is kept from the first paint, and it fades in with the canvas it reports on. */}
      <div aria-hidden="true" style={fade(live)}>
        <Convergence points={history} exact={exact} />
      </div>
    </div>
  )

  const tableView = (
    <table>
      <caption>
        {`Where ${fmtInt(table.n)} simulated paths of a $${MODEL.s0} stock end after ${years} at ${pct(table.sigma)} volatility, and what a call struck at $${table.strike} pays there. Priced by simulation at ${withError(table.mean, table.se)}; the Black–Scholes formula gives ${bs(table.sigma, table.strike).toFixed(4)}.`}
      </caption>
      <thead>
        <tr>
          <th scope="col">Price at expiry</th>
          <th scope="col">Share of paths</th>
          <th scope="col">Average payoff there</th>
        </tr>
      </thead>
      <tbody>
        {bands(table).map((b) => (
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
    <>
      <FigureFrame
        id="fig-futures"
        number="Fig. 1"
        className="mt-10 mb-12 lg:mt-6 lg:mb-16"
        title={`Every line is one possible year for a $${MODEL.s0} stock; together they price a call.`}
        subtitle={`Simulated · geometric Brownian motion · σ\u00a0${pct(sigma)}${sigma === MODEL.sigma ? ', the simulated market’s realised\u00a0vol' : ''} · r ${pct(MODEL.r)} · ${MODEL.steps} steps · not market data`}
        subtitleRoom={`Simulated · geometric Brownian motion · σ\u00a0${pct(MODEL.sigma)}, the simulated market’s realised\u00a0vol · r ${pct(MODEL.r)} · ${MODEL.steps} steps · not market data`}
        rail={rail}
        railBelow={false}
        // Room kept for the longest of its hints (a still frame's longest reason, and the live figure's), in one cell with
        // the one shown, so keeping a still frame after all moves nothing under the figure, whatever the fonts' widths.
        hint={
          <span className="grid">
            <span aria-hidden className="invisible [grid-area:1/1]" data-room="Still frame: the live figure could not start here. Reloading the page may bring it." />
            <span aria-hidden className="invisible [grid-area:1/1]" data-room={`${coarse ? 'Tap' : 'Click'} a price at expiry to set the strike · drag sideways for volatility.`} />
            <span className="[grid-area:1/1]">
              <Items items={hint} />
            </span>
          </span>
        }
        caption={
          <>
            Each line is a path of geometric Brownian motion, stepped exactly in log space; its random numbers come from a
            counter-based hash, so any path can be regenerated on the CPU, where the tests check the estimator against
            Black–Scholes. A call pays whatever the stock finishes above the strike, and its price is that payoff averaged
            over every path and discounted to today: the indigo bars, what each ending pays weighted by how often it
            happens, add up to it. The readouts show the estimate closing in on the formula as the paths pile up. The
            volatility starts at the simulated market&rsquo;s own realised volatility,{' '}
            {(market.sigma * 100).toFixed(1)}% (to the slider&rsquo;s 1% step), computed again by your browser.
          </>
        }
        table={tableView}
      >
        <div
          ref={box}
          data-sigma-server={MODEL.sigma}
          data-seq={seq}
          data-fps={fps}
          data-quality={quality}
          data-tier={tier ?? ''}
          className={`relative -mx-6 h-[clamp(26rem,70svh,38rem)] overflow-hidden sm:mx-0 sm:h-[clamp(min(28rem,88svh),62svh,38rem)] lg:h-[clamp(30rem,64svh,40rem)] ${live ? 'cursor-crosshair touch-pan-y touch-pinch-zoom select-none' : ''}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onCancel}
          onPointerLeave={onLeave}
          onClick={onTap}
        >
          <div data-futures-poster="" className="absolute inset-0" style={underlay(live || stillShown)}>
            <Poster strands={posterStrands} payBars={frame.payBars} outline={frame.outline} strike={strike} price={paperPrice ?? frame.stats.mean} />
          </div>
          {/* It arrives over a flat poster framed differently, so a 2px blur bridges the two pictures while it fades in. */}
          <canvas
            ref={stillCanvas}
            data-still-canvas=""
            aria-hidden="true"
            className="absolute inset-0 size-full"
            style={{
              ...fade(stillShown),
              filter: stillShown ? 'none' : 'blur(2px)',
              transition: `${fade(stillShown).transition}, filter 240ms ${EASE_OUT_CSS}`,
            }}
          />
          <div ref={stillLabels} aria-hidden="true" className="pointer-events-none absolute inset-0" style={fade(stillShown)} />
          <canvas ref={canvas} data-live-canvas="" aria-hidden="true" className="absolute inset-0 size-full" style={fade(live)} />
          <div ref={labels} aria-hidden="true" className="pointer-events-none absolute inset-0" style={fade(live)} />
        </div>
        {/* The key sits under the plot, as a paper's does: no projected label can land on it, at any pose of the flight. */}
        <p aria-hidden="true" className="text-meta mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-graphite">
          <span>
            <span className="mr-1.5 inline-block h-[3px] w-4 rounded-full bg-indigo align-middle" />
            paths ending above the strike
          </span>
          <span>
            <span className="mr-1.5 inline-block w-4 border-t-[1.5px] border-dashed border-ink align-middle" />
            the strike
          </span>
        </p>

        {/* A phone gets the margin's numbers too, in pairs: the estimate against the formula, how far apart they are
            and on how many paths (what the caption says the readouts show), and the machine. */}
        <dl className="text-meta mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-rule pt-3 font-mono lg:hidden">
          <div className="min-w-0">
            <dt className="text-graphite">Simulated ± 2 SE</dt>
            <dd className="tabular text-indigo">{mc}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-graphite">Black–Scholes</dt>
            <dd className="tabular text-ink">{exact.toFixed(4)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-graphite">Gap to the formula</dt>
            <dd className="tabular text-ink">{gapText}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-graphite">{shown.mode === 'gpu' && shown.done ? 'Paths · complete' : 'Paths simulated'}</dt>
            <dd className="tabular text-ink">{paths}</dd>
          </div>
          <div className="col-span-2 min-w-0">
            <dt className="text-graphite">{speedLabel}</dt>
            <dd className="tabular text-ink">{speed}</dd>
          </div>
        </dl>

        <div className="mt-4 grid grid-cols-2 gap-x-6">
          <label className="block">
            <span className="text-meta font-mono text-graphite">
              Volatility{' '}
              <span aria-hidden="true" className="tabular text-ink">
                {pct(sigma)}
              </span>
            </span>
            <input
              ref={sigmaInput}
              type="range"
              min={MODEL.sigmaMin * 100}
              max={MODEL.sigmaMax * 100}
              step={1}
              value={Math.round(sigma * 100)}
              aria-valuetext={`${pct(sigma)} a year`}
              onChange={(e) => commit(Number(e.currentTarget.value) / 100, strike)}
              className="mt-0.5 block h-6 w-full pointer-coarse:-mb-2.5 pointer-coarse:mt-[calc(0.125rem-10px)] pointer-coarse:h-11"
              style={rangeFill(Math.round(sigma * 100), MODEL.sigmaMin * 100, MODEL.sigmaMax * 100)}
            />
          </label>
          <label className="block">
            <span className="text-meta font-mono text-graphite">
              Strike{' '}
              <span aria-hidden="true" className="tabular text-ink">
                ${strike}
              </span>
            </span>
            <input
              type="range"
              min={MODEL.strikeMin}
              max={MODEL.strikeMax}
              step={1}
              value={strike}
              aria-valuetext={`$${strike}`}
              onChange={(e) => commit(sigma, Number(e.currentTarget.value))}
              className="mt-0.5 block h-6 w-full pointer-coarse:-mb-2.5 pointer-coarse:mt-[calc(0.125rem-10px)] pointer-coarse:h-11"
              style={rangeFill(strike, MODEL.strikeMin, MODEL.strikeMax)}
            />
          </label>
        </div>
        {/* Room for the live controls is kept from the first paint, so nothing moves when the figure goes live;
            where it never will (reduced motion, no WebGL2), the pre-paint script collapses it. */}
        {/* On a 360px phone the four buttons at full padding took a second line when Reset came, moving the caption 40px
            under the reader's thumb: there they close up (8px padding, 6px gaps), and the row keeps its one line. */}
        <div data-futures-controls="" className="mt-3 flex min-h-8 flex-wrap gap-2 max-sm:gap-1.5 max-sm:[&>button]:px-2 pointer-coarse:gap-y-3.5">
          {live && (
            <>
              <button type="button" onClick={togglePause} className={`${CONTROL} min-w-[4.5rem] max-sm:min-w-[4.125rem]`}>
                {paused ? 'Resume' : 'Pause'}
              </button>
              <button type="button" onClick={toggleFlight} className={`${CONTROL} min-w-[6.75rem] max-sm:min-w-[6.5rem]`}>
                {flying ? 'Stop' : 'Fly through'}
              </button>
              <button type="button" data-replay="" onClick={replay} className={CONTROL}>
                Replay
              </button>
            </>
          )}
          {changed && (
            <button
              type="button"
              data-reset=""
              onClick={() => {
                commit(MODEL.sigma, MODEL.strike)
                // Reset takes itself away (nothing is left to reset): focus goes to the first input, not to the page.
                sigmaInput.current?.focus()
              }}
              className={CONTROL}
            >
              Reset
            </button>
          )}
        </div>
        <p className="sr-only" aria-live="polite">
          {spoken}
        </p>
      </FigureFrame>
      <DebugSlot title="Fig. 1" read={readDebug} />
    </>
  )
}
