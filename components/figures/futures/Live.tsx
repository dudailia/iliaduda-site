'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react'
import { FigureFrame } from '@/components/FigureFrame'
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
const CONTROL =
  'text-meta min-h-8 rounded-sm border border-graphite px-2.5 py-1.5 font-mono text-ink transition-[border-color,scale] duration-150 ease-out hover:border-ink active:scale-[0.97]'

type Mode = 'server' | 'cpu' | 'gpu'
type Seq = 'off' | 'pending' | 'playing' | 'done'
type Declined = 'software' | 'targets' | 'load' | 'error' | 'lost' | null
interface Shown {
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

export function FuturesLive({ initial }: { initial: PosterFrame }) {
  const [sigma, setSigma] = useState<number>(MODEL.sigma)
  const [strike, setStrike] = useState<number>(MODEL.strike)
  const [shown, setShown] = useState<Shown>({ ...initial.stats, rate: 0, mode: 'server', done: true })
  const [frame, setFrame] = useState<PosterFrame>(initial)
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
    setShown({ n: s.n, mean: s.mean, se: s.se, rate: s.rate, mode: 'gpu', done: s.done })
    if (s.hist) {
      const { sigma: sg, strike: k } = params.current
      setTable({ sigma: sg, strike: k, n: s.n, mean: s.mean, se: s.se, counts: s.hist.counts, payoff: s.hist.payoff })
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
      if (!labels.current) return null
      let real: FuturesRenderer | null = null
      let size: [number, number, number, number] | null = null
      let quality = 2
      let palette = env.palette
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
              },
            )
            real.setQuality!(quality)
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
          if (!real || broken) return false
          try {
            return real.frame(t, dt)
          } catch {
            fail('error')
            return false
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

  const { box, canvas, live, eligible, reduced, fps, quality, tier } = useStage(create, STAGE_OPTS)
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
      lean.current = tilt.current.read(e.beta, e.gamma, screen.orientation?.angle ?? 0)
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
      ([e]) => {
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
    armed.current = true
    r.rewind(() => {
      timeline.current.replay()
      timeline.current.start()
      setHistory([])
    })
  }

  // Pointer: drag sideways for volatility, point to preview a strike, click or
  // tap to set it. While the sequence plays the stage only skips it.
  const drag = useRef<{ id: number; x: number; s: number; moved: boolean } | null>(null)
  const kAt = (x: number, y: number) => {
    const p = renderer.current?.priceAt(x, y)
    return p == null ? null : Math.round(Math.min(MODEL.strikeMax, Math.max(MODEL.strikeMin, p)))
  }
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!live || drag.current || playing()) return
    // Touching the figure mid-flight brings the camera home instead.
    if (flight.current.flying) return stopFlight()
    drag.current = { id: e.pointerId, x: e.clientX, s: sigma, moved: false }
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
      if (Math.abs(dx) > 4) d.moved = true
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
  // A cancelled pointer (the page took the gesture: a scroll) sets nothing.
  const onCancel = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null
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

  const exact = useMemo(() => bs(sigma, strike), [sigma, strike])
  const posterStrands = useMemo(() => strands(sigma, strike), [sigma, strike])
  const diff = Math.abs(shown.mean - exact)
  const hasMean = shown.n > 1 && Number.isFinite(shown.mean)
  const fresh = shown.mode === 'gpu' || shown.mode === 'cpu' || (sigma === MODEL.sigma && strike === MODEL.strike)
  const priced = hasMean && fresh
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
              ? 'Still frame: the live figure could not start here.'
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
          {mc}
        </dd>
        <dt className="text-graphite">Black–Scholes formula</dt>
        <dd className="tabular text-ink" data-bs-price={exact}>
          {exact.toFixed(4)}
        </dd>
        <dt className="text-graphite">Gap to the formula</dt>
        <dd className="tabular text-ink">{priced ? `${(diff / shown.se).toFixed(1)} SE` : '…'}</dd>
      </dl>
      <dl className="mt-1 grid grid-cols-1 gap-y-px border-t border-rule pt-3 [&_dd]:mb-2">
        <dt className="text-graphite">{shown.mode === 'gpu' && shown.done ? 'Paths · complete' : 'Paths simulated'}</dt>
        <dd className="tabular text-ink" data-paths={fresh ? shown.n : 0}>
          {paths}
        </dd>
        <dt className="text-graphite">{speedLabel}</dt>
        <dd className="tabular text-ink" data-speed={shown.mode}>
          {speed}
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
        subtitle={`Simulated · geometric Brownian motion · σ ${pct(sigma)} · r ${pct(MODEL.r)} · ${MODEL.steps} steps · not market data`}
        rail={rail}
        railBelow={false}
        hint={hint}
        caption={
          <>
            Each line is a path of geometric Brownian motion, stepped exactly in log space; its random numbers come from a
            counter-based hash, so any path can be regenerated on the CPU, where the tests check the estimator against
            Black–Scholes. A call pays whatever the stock finishes above the strike, and its price is that payoff averaged
            over every path and discounted to today: the indigo bars, what each ending pays weighted by how often it
            happens, add up to it. The margin shows the estimate closing in on the formula as the paths pile up.
          </>
        }
        table={tableView}
      >
        <div
          ref={box}
          data-seq={seq}
          data-fps={fps}
          data-quality={quality}
          data-tier={tier ?? ''}
          className={`relative -mx-6 h-[clamp(26rem,70svh,38rem)] overflow-hidden sm:mx-0 sm:h-[clamp(28rem,62svh,38rem)] lg:h-[clamp(30rem,64svh,40rem)] ${live ? 'cursor-crosshair touch-pan-y select-none' : ''}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onCancel}
          onPointerLeave={onLeave}
          onClick={onTap}
        >
          <div data-futures-poster="" className="absolute inset-0" style={underlay(live || stillShown)}>
            <Poster strands={posterStrands} payBars={frame.payBars} outline={frame.outline} strike={strike} price={frame.stats.mean} />
          </div>
          {/* It arrives over a flat poster framed differently, so a 2px blur bridges the two pictures while it fades in. */}
          <canvas
            ref={stillCanvas}
            data-still-canvas=""
            aria-hidden="true"
            className="absolute inset-0 size-full"
            style={{
              ...fade(stillShown),
              filter: stillShown ? 'blur(0)' : 'blur(2px)',
              transition: `${fade(stillShown).transition}, filter 240ms cubic-bezier(0.23, 1, 0.32, 1)`,
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

        {/* A phone gets the numbers that tell the story; the margin has the rest. */}
        <dl className="text-meta mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-rule pt-3 font-mono lg:hidden">
          <div className="min-w-0">
            <dt className="text-graphite">Simulated ± 2 SE</dt>
            <dd className="tabular text-indigo">{mc}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-graphite">Black–Scholes</dt>
            <dd className="tabular text-ink">{exact.toFixed(4)}</dd>
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
              className="mt-0.5 block h-6 w-full accent-[var(--color-indigo)]"
            />
          </label>
        </div>
        {/* Room for the live controls is kept from the first paint, so nothing moves when the figure goes live;
            where it never will (reduced motion, no WebGL2), the pre-paint script collapses it. */}
        <div data-futures-controls="" className="mt-3 flex min-h-8 flex-wrap gap-2">
          {live && (
            <>
              <button type="button" onClick={togglePause} className={`${CONTROL} min-w-[4.5rem]`}>
                {paused ? 'Resume' : 'Pause'}
              </button>
              <button type="button" onClick={toggleFlight} className={`${CONTROL} min-w-[6.75rem]`}>
                {flying ? 'Stop' : 'Fly through'}
              </button>
              <button type="button" data-replay="" onClick={replay} className={CONTROL}>
                Replay
              </button>
            </>
          )}
          {changed && (
            <button type="button" data-reset="" onClick={() => commit(MODEL.sigma, MODEL.strike)} className={CONTROL}>
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
