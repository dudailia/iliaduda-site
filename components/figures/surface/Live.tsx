'use client'

import { EASE_OUT_CSS } from '@/lib/ease'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { FigureFrame } from '@/components/FigureFrame'
import { CONTROL } from '@/components/stage/controls'
import { DebugSlot } from '@/components/stage/DebugSlot'
import { FocusRing } from '@/components/stage/FocusRing'
import { Items } from '@/components/Layout'
import { DECLINED_TEXT, useFallback } from '@/components/stage/useFallback'
import { saveData, supportsWebGL2, useColorScheme, whenIdle } from '@/components/stage/env'
import { useLean } from '@/components/stage/useLean'
import { useSignature } from '@/components/stage/useSignature'
import { fade, underlay, useStage, type Create } from '@/components/stage/useStage'
import type { LiveInfo } from '@/lib/stage/debug'
import { numbers, pointRows, text as format } from '@/lib/surface/readouts'
import { amplitudeOf, shownAmplitude, surfaceSequence, type SurfacePhase } from '@/lib/surface/sequence'
import { params, PHASE_TEXT, SIZE_MAX, type Phase } from '@/lib/surface/shock'
import { check, DOMAIN, iv, type Check, type Params } from '@/lib/surface/ssvi'
import type { Sequence } from '@/lib/stage/sequence'
import { invert } from '@/lib/m4'
import { apply, camera, fu, fv, kOfU, LABELS, mvp, NOTES, pickSurface, tOfV, WIDE_QUERY, wx, wy, wz, type FrameKind } from '@/lib/surface/view'
import { AxisLabel, Frame, FRAME_ASPECT, NoteMark, noteRise, setNoteRise } from './marks'
import type { Probe, Sim, SurfaceRenderer } from './renderer'
import { rangeFill } from '@/components/stage/range'

/**
 * Fig. 1 of the IV paper, live: the SSVI surface in 3D. The poster (server)
 * is the figure until the renderer draws its first frame, from the poster's
 * camera; then the two crossfade. On a first visit the surface forms out of
 * the page and takes one volatility shock (lib/surface/sequence.ts); then it
 * rests at calm, drifting and leaning with the reader, until the reader
 * pauses it, and the shock is the reader's, on the slider. Readouts are
 * written straight into the DOM from the frame that drew them, never through
 * React state, so they cannot lag the picture. Where the live figure does not
 * run, the slider redraws the still frame instead.
 */

const PROBE_START: Probe = { k: 0, T: 0.25 }
const STEP_U = 1 / 28
const STEP_V = 1 / 20
const PAUSED = 'surface-paused'
const noop = () => () => {}

/**
 * The reading point's tag: up and to the right of the dot, in the axis labels' type, on a paper fill. Near the right
 * edge it moves to the dot's left, gliding there (120ms, the ease-out) rather than jumping across it.
 */
const TAG =
  'text-meta absolute bottom-2 left-2.5 rounded-sm bg-paper/90 px-1 py-px font-mono leading-none whitespace-nowrap text-ink transition-transform duration-[120ms] ease-out motion-reduce:transition-none'

const clampProbe = (p: Probe): Probe => ({
  k: Math.min(DOMAIN.kMax, Math.max(DOMAIN.kMin, p.k)),
  T: Math.min(DOMAIN.tMax, Math.max(DOMAIN.tMin, p.T)),
})

/**
 * What the surface is doing, in words: from the signature while it plays, else from the shock the reader has set,
 * and the shock drawn. A skipped story only drains, so while the skip plays it is relaxing, never shocked; and a shock
 * still on screen above the reader's level (Replay drains it into the page) is relaxing too.
 */
function phaseOf(story: Sequence<SurfacePhase> | null, level: number, drawn = level, draining = false): Phase {
  if (draining) return drawn > 0.04 ? 'relax' : 'calm'
  if (!story) return level > 0.04 ? 'shock' : 'calm'
  if (story.skipping()) return shownAmplitude(story) > 0.04 ? 'relax' : 'calm'
  const ph = story.phases()
  if (ph.shock > 0 && ph.relax < 0.12) return 'shock'
  return amplitudeOf(ph) > 0.04 ? 'relax' : 'calm'
}

const HEADLINE = [
  ['atm', '1-month vol, at the money'],
  ['premium', 'Crash premium, 80% strike'],
  ['put', '1-month put, 10% down'],
] as const

export function SurfaceLive({ poster, title, subtitle, caption, table }: { poster: ReactNode; title: string; subtitle: string; caption: ReactNode; table: ReactNode }) {
  const sim = useRef<Sim>({ probe: PROBE_START, hover: null, dirty: true })
  const out = useRef<Record<string, HTMLElement | null>>({})
  const labelEls = useRef<(HTMLElement | null)[]>([])
  const labelLayer = useRef<HTMLDivElement>(null)
  const noteEls = useRef<(HTMLElement | null)[]>([])
  const dotEl = useRef<HTMLElement | null>(null)
  const tagEl = useRef<HTMLSpanElement>(null)
  /** The reader has set the reading point: its tag, beside the dot, stays up from then on. */
  const [read, setRead] = useState(false)
  const readRef = useRef(false)
  const readHere = () => {
    if (readRef.current) return
    readRef.current = true
    setRead(true)
  }
  const seq = useRef(surfaceSequence())
  const checked = useRef<{ key: string; c: Check | null; at: number; pending: Params | null; timer: number }>({ key: '', c: null, at: 0, pending: null, timer: 0 })
  const level = useRef(0)
  /** The live renderer, for Replay: the sheet sinks back into the page before the story plays again. */
  const surface = useRef<SurfaceRenderer | null>(null)
  /** Replay is draining what was on screen into the page. */
  const draining = useRef(false)
  const [shock, setShock] = useState(0)
  const [probe, setProbe] = useState<Probe>(PROBE_START)
  const [phase, setPhase] = useState<Phase>('calm')
  const phaseRef = useRef<Phase>('calm')
  const [phaseMoved, setPhaseMoved] = useState(false)
  /**
   * The words the narration says, and whether they are on their way out: a turn of the story blurs out and the next
   * blurs in (120ms each way, 3px), at full opacity, so one sentence never cuts or smears into the next and every frame
   * of it keeps the text's contrast; a change the reader made on the slider is simply there.
   */
  const [said, setSaid] = useState<Phase>('calm')
  const [going, setGoing] = useState(false)
  if (phase !== said && !going) {
    if (phaseMoved) setGoing(true)
    else setSaid(phase)
  }
  useEffect(() => {
    if (!going) return
    const t = setTimeout(() => {
      setSaid(phaseRef.current)
      setGoing(false)
    }, 120)
    return () => clearTimeout(t)
  }, [going])
  /** The narration under the stage, and whether all of it is on screen. */
  const phaseLine = useRef<HTMLParagraphElement>(null)
  const [lineSeen, setLineSeen] = useState(true)
  const [spoken, setSpoken] = useState('')
  const [kind, setKind] = useState<FrameKind>('wide')
  const kindRef = useRef<FrameKind>('wide')
  const [software, setSoftware] = useState(false)
  const [paused, setPaused] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && sessionStorage.getItem(PAUSED) === '1'
    } catch {
      return false
    }
  })
  const pausedRef = useRef(paused)
  // The signature and the lean, read by the renderer through these (they are made after the stage that makes it).
  const sigApi = useRef<{ armed: { current: boolean }; onFrame(): void } | null>(null)
  const fallbackApi = useRef<{ fail(why: 'load' | 'error'): void; watch(): () => void } | null>(null)
  const leanApi = useRef<{ lean: { current: { x: number; y: number } } } | null>(null)

  const write = useCallback((id: string, value: string) => {
    for (const k of [id, `${id}-m`]) {
      const el = out.current[k]
      if (el && el.textContent !== value) el.textContent = value
    }
  }, [])
  const ref = (id: string) => (el: HTMLElement | null) => {
    out.current[id] = el
  }

  /** Everything the readouts say, from the parameters of the frame just drawn. */
  const sync = useCallback(
    (p: Params, drawn?: number) => {
      // The arbitrage check is a few thousand closed-form evaluations: for a surface that is new, at most every 150ms
      // while it moves, and once more for the surface it comes to rest on (every surface on the way passes: the shock
      // family is tested free of static arbitrage).
      const key = `${p.s0.toFixed(4)},${p.rho.toFixed(4)}`
      const c = checked.current
      const now = performance.now()
      if (!c.c || (c.key !== key && now - c.at >= 150)) {
        c.c = check(p)
        c.key = key
        c.at = now
      } else if (c.key !== key) {
        c.pending = p
        if (!c.timer)
          c.timer = window.setTimeout(() => {
            c.timer = 0
            const q = c.pending
            if (!q) return
            c.pending = null
            const k = `${q.s0.toFixed(4)},${q.rho.toFixed(4)}`
            if (k === c.key) return
            c.c = check(q)
            c.key = k
            c.at = performance.now()
            const u = format(numbers(q), c.c)
            write('arb', u.arb)
            write('arb-detail', u.arbDetail)
          }, 160)
      }
      const t = format(numbers(p), c.c!)
      write('atm', t.atm)
      write('premium', t.premium)
      write('put', t.put)
      write('arb', t.arb)
      write('arb-detail', t.arbDetail)
      const s = sim.current
      for (const r of pointRows(p, s.hover ?? s.probe)) write(r.id, r.value)
      const story = sigApi.current?.armed.current && !seq.current.done ? seq.current : null
      const next = phaseOf(story, level.current, drawn, draining.current)
      if (next !== phaseRef.current) {
        phaseRef.current = next
        setPhase(next)
        // The story's turns cross-fade, and so does Replay's drain; a change the reader made on the slider is simply
        // there, as they made it.
        setPhaseMoved(story !== null || draining.current)
      }
    },
    [write],
  )

  const create = useCallback<Create>(
    (env) => {
      // A software rasteriser would compile and draw this scene on the main thread for hundreds of milliseconds:
      // there the poster stays the figure, and says why.
      if (env.tier === 'software') {
        queueMicrotask(() => setSoftware(true))
        return null
      }
      let inner: SurfaceRenderer | null = null
      let pending: { w: number; h: number; cw: number; ch: number } | null = null
      let q: number | null = null
      let pal = env.palette
      let dead = false
      let broken = false
      // Whatever becomes of it (a failed load, a shader that will not link, a renderer that throws), the reader is
      // left with the finished poster, never an empty stage.
      const fail = (why: 'load' | 'error') => {
        if (dead || broken) return
        broken = true
        fallbackApi.current?.fail(why)
      }
      const unwatch = fallbackApi.current?.watch()
      void import('./renderer').then(({ make }) => {
        if (dead) return
        try {
          inner = make(env, {
            sim: sim.current,
            frame: () => kindRef.current,
            sequence: () => (sigApi.current?.armed.current && !seq.current.done ? seq.current.phases() : null),
            shown: () => shownAmplitude(seq.current),
            playing: () => !!sigApi.current?.armed.current && seq.current.started && !seq.current.done,
            // The paper's own surface, alone on its stage: at rest the kit may halve its rate on a 120 Hz display.
            halveAtRest: true,
            tick: (dtMs) => {
              seq.current.advance(dtMs)
              sigApi.current?.onFrame()
            },
            level: () => level.current,
            paused: () => pausedRef.current,
            lean: () => leanApi.current?.lean.current ?? { x: 0, y: 0 },
            onPin: (p) => {
              setProbe(p)
              readHere()
            },
            labels: () => labelEls.current,
            labelLayer: () => labelLayer.current,
            notes: () => noteEls.current,
            dot: () => dotEl.current,
            tag: () => tagEl.current,
            pinned: () => readRef.current,
            sync,
          })
        } catch {
          fail('error')
          return
        }
        surface.current = inner
        if (q !== null) inner.setQuality?.(q)
        if (pending) inner.resize(pending.w, pending.h, pending.cw, pending.ch)
        inner.setPalette?.(pal)
      }, () => fail('load'))
      return {
        frame(t, dt) {
          if (broken) return null
          if (dead || !inner) return false
          try {
            return inner.frame(t, dt)
          } catch {
            fail('error')
            return null
          }
        },
        resize(w, h, cw, ch) {
          pending = { w, h, cw, ch }
          inner?.resize(w, h, cw, ch)
        },
        setQuality(level) {
          q = level
          inner?.setQuality?.(level)
        },
        calm: () => !!inner?.calm?.(),
        setPalette(p) {
          pal = p
          inner?.setPalette?.(p)
        },
        dispose() {
          dead = true
          unwatch?.()
          if (surface.current === inner) surface.current = null
          inner?.dispose()
        },
      }
    },
    [sync],
  )

  // The quality waits to climb until the story is told: the forming and the shock never sharpen mid-moment.
  const [stageOpts] = useState(() => ({ hold: () => seq.current.started && !seq.current.done }))
  const { box, canvas, live, eligible, reduced, fps, quality, tier } = useStage(create, stageOpts)
  // The surface forms and takes its shock across the whole stage: the story waits for most of it on screen (60%, or
  // 45% held for a moment), as the order book's does, so on a tall phone it never plays below the fold unseen.
  const sig = useSignature('surface', box, seq, { start: 0.6, hold: 0.45 })
  const lean = useLean(live, reduced, pausedRef)
  const fallback = useFallback(canvas, live, sig.release)
  const declined = fallback.declined
  useEffect(() => {
    sigApi.current = sig
    leanApi.current = lean
    fallbackApi.current = fallback
  })
  // A figure that will not go live here shows the finished picture at once. Hydration reads reduced motion as on
  // (the server cannot know), so this waits for the browser's own answer.
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  const release = sig.release
  useEffect(() => {
    if (mounted && (!eligible || reduced || software)) release()
  }, [mounted, eligible, reduced, software, release])

  // Which framing: the same breakpoint the poster's CSS uses.
  useEffect(() => {
    const mq = matchMedia(WIDE_QUERY)
    const on = () => {
      kindRef.current = mq.matches ? 'wide' : 'tall'
      setKind(kindRef.current)
      sim.current.dirty = true
    }
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // The pinned point, read out and announced; the live frame redraws it, the still frame's readouts follow here.
  // The page's own starting point is read out but not announced: a live region speaks for the reader's changes only.
  const announced = useRef(false)
  useEffect(() => {
    sim.current.probe = probe
    sim.current.dirty = true
    const p = params(level.current)
    for (const r of pointRows(p, probe)) write(r.id, r.value)
    if (!announced.current) {
      announced.current = true
      return
    }
    const K = Math.round(Math.exp(probe.k) * 100)
    const id = setTimeout(() => setSpoken(`Strike ${K}%, ${expiryWords(probe.T)}: implied volatility ${(iv(p, probe.k, probe.T) * 100).toFixed(1)}%.`), 350)
    return () => clearTimeout(id)
  }, [probe, write])

  // Where the live figure does not run, the still frame is redrawn for the shock the reader sets.
  const still = useRef<{ sheet: typeof import('./still') } | null>(null)
  const stillWant = useRef(0)
  const stillFrame = useRef(0)
  const redrawStill = useCallback(
    (x: number) => {
      const el = box.current
      const run = () => {
        const s = still.current
        if (!s || !el) return
        const kind = kindRef.current
        // The first redraw puts the still frame in place of the poster's picture (./still.ts, smoothStill).
        const d = s.sheet.smoothStill(el, params(x), kind)
        for (const n of d.notes) {
          const at = el.querySelector<HTMLElement>(`[data-iv-poster] [data-note="${n.id}"]`)
          if (at) {
            at.style.left = `${(n.x * 100).toFixed(2)}%`
            at.style.top = `${(n.y * 100).toFixed(2)}%`
            // At a large shock the peak rises: the words stay inside the stage, as the live figure's do.
            const frame = at.parentElement, words = at.querySelector<HTMLElement>('[data-note-words]')
            if (frame && words) setNoteRise(at, noteRise(n.y * frame.offsetHeight, n.dy, words.offsetHeight), n.align)
          }
        }
        sync(params(x), x)
      }
      // One redraw a frame, for the latest shock, however fast the slider moves: the mesh is re-serialised whole.
      stillWant.current = x
      if (stillFrame.current) return
      stillFrame.current = requestAnimationFrame(() => {
        stillFrame.current = 0
        const go = () => {
          x = stillWant.current
          run()
        }
        if (still.current) return go()
        void import('./still').then((sheet) => {
          still.current = { sheet }
          go()
        })
      })
    },
    [box, sync],
  )

  const onShock = (x: number) => {
    level.current = x
    setShock(x)
    sim.current.dirty = true
    // Using the figure itself ends its story at once.
    if (sig.armed.current) seq.current.finish()
    if (!live) redrawStill(x)
    else if (pausedRef.current) sync(params(x))
  }

  /** Replay starts the story over from where a first visit starts it, and it ends where the reader takes over: calm. */
  const replay = () => {
    level.current = 0
    setShock(0)
    sim.current.dirty = true
    if (surface.current) {
      draining.current = true
      surface.current.sink(() => {
        draining.current = false
        sig.replay()
      })
    } else sig.replay()
  }

  const togglePause = () => {
    const next = !pausedRef.current
    pausedRef.current = next
    sim.current.dirty = true
    setPaused(next)
    try {
      sessionStorage.setItem(PAUSED, next ? '1' : '0')
    } catch {}
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const big = e.shiftKey ? 4 : 1
    const move = (du: number, dv: number) => {
      e.preventDefault()
      readHere()
      sim.current.hover = null
      setProbe((p) => clampProbe({ k: kOfU(fu(p.k) + du * STEP_U * big), T: tOfV(Math.max(0, Math.min(1, fv(p.T) + dv * STEP_V * big))) }))
    }
    switch (e.key) {
      case 'ArrowLeft':
        return move(-1, 0)
      case 'ArrowRight':
        return move(1, 0)
      case 'ArrowUp':
        return move(0, -1)
      case 'ArrowDown':
        return move(0, 1)
      case 'Home':
        e.preventDefault()
        readHere()
        return setProbe(PROBE_START)
      case ' ':
        if (!live) return
        e.preventDefault()
        // The keyboard's Pause, like the button (a click), first finishes a story that is playing.
        if (sig.armed.current) seq.current.skip()
        return togglePause()
    }
  }

  // The still frame's reading point, one for each framing: projected with that framing's poster camera, drawn until
  // the canvas takes over. Both are drawn, each shown at its own breakpoint, so the server's first paint has it right.
  const posterDot = (k: FrameKind) => {
    const m = mvp(k, camera(k))
    const c = apply(m, wx(probe.k), wy(iv(params(shock), probe.k, probe.T)), wz(probe.T))
    return { left: `${((c[0] / c[3]) * 0.5 + 0.5) * 100}%`, top: `${(1 - ((c[1] / c[3]) * 0.5 + 0.5)) * 100}%` }
  }

  // On the still frame a click or tap reads the point under it, as on the live figure: through the poster's camera for
  // this framing (lib/surface/view.ts, pickSurface).
  const onStillPick = (e: MouseEvent<HTMLDivElement>) => {
    if (live) return
    const r = e.currentTarget.getBoundingClientRect()
    const k = kindRef.current
    const inv = invert(mvp(k, camera(k), r.width / r.height))
    const hit = inv && pickSurface(inv, ((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2, params(level.current))
    if (!hit) return
    setProbe(clampProbe(hit))
    readHere()
  }

  // While the story plays, its narration has to be where the reader is looking: on a laptop's first screen the line
  // under the stage is below the fold, so the stage carries its first sentence until the story is over.
  useEffect(() => {
    const el = phaseLine.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setLineSeen(e!.intersectionRatio > 0.9), { threshold: [0, 0.9, 1] })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const onStage = sig.state === 'playing' && !lineSeen


  // Said only once the browser has answered; the server cannot know.
  const why = !mounted
    ? null
    : reduced
      ? 'Still frame: your system asks for reduced motion.'
      : software
        ? 'Still frame: this browser draws WebGL in software.'
        : declined
          ? DECLINED_TEXT[declined]
          : !eligible
          ? saveData()
            ? 'Still frame: your browser asks to save data.'
            : supportsWebGL2()
              ? 'Still frame: the live figure could not start here. Reloading the page may bring it.'
              : 'Still frame: this browser has no WebGL2.'
          : null

  // A figure that will not go live keeps a still frame worth keeping: its sheet painted smooth (./still.ts), drawn again
  // for a new framing (a phone turned to landscape, or back) and for the other colour scheme.
  const scheme = useColorScheme()
  const stillFor = mounted && !live && why !== null
  // The build's picture is the first frame; the smooth one, and its code, wait until the page has loaded and gone
  // idle, so nothing the first frame does not need is fetched with it. Once drawn, it is redrawn at once.
  const [stillReady, setStillReady] = useState(false)
  useEffect(() => {
    if (!stillFor || stillReady) return
    let cancel = () => {}
    const go = () => (cancel = whenIdle(() => setStillReady(true)))
    if (document.readyState === 'complete') go()
    else addEventListener('load', go, { once: true })
    return () => {
      removeEventListener('load', go)
      cancel()
    }
  }, [stillFor, stillReady])
  useEffect(() => {
    if (stillFor && stillReady) redrawStill(level.current)
  }, [stillFor, stillReady, kind, scheme, redrawStill])

  const debugInfo = useRef<() => LiveInfo>(null)
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
        seq: paused ? `${sig.state} · paused` : sig.state,
        reduced,
        saveData: saveData(),
        ua: navigator.userAgent,
        renderer: { shock: `${level.current.toFixed(2)}× · ${phaseRef.current}`, probe: `k ${sim.current.probe.k.toFixed(3)} · T ${sim.current.probe.T.toFixed(3)}` },
      }
    }
  })
  const readDebug = useCallback((): LiveInfo => debugInfo.current!(), [])

  // The calm surface's readouts are the same every render: worked out once (a re-render comes twice a second, for the
  // stage's frame rate).
  const initial = useMemo(() => format(numbers(params(0)), check(params(0))), [])
  const initialRows = useMemo(() => pointRows(params(0), PROBE_START), [])
  const peakAtm = (iv(params(shock), 0, 1 / 12) * 100).toFixed(1)
  // Said for the pointer this reader has: a phone's finger taps to read and drags sideways to turn (vertical drags
  // scroll the page); a mouse points. A still frame keeps its instructions after its reason.
  const coarse = mounted && matchMedia('(pointer: coarse)').matches
  const readHow = `${coarse ? 'Tap' : 'Click'} or tab to the surface to read a point; the shock slider still redraws it.`
  const hint = why
    ? `${why} ${readHow}`
    : live
      ? coarse
        ? 'Tap to read a point · drag sideways to turn · the shock slider applies the shock'
        : 'Point to read a point · drag to turn · arrow keys move the point · Space pauses'
      : coarse
        ? 'Tap or tab to the surface to read a point'
        : 'Tab to the figure and use the arrow keys to read a point'

  const rail = <Margin initial={initial} rows={initialRows} set={ref} suffix="" />

  return (
    <FigureFrame
      id="fig-iv-surface"
      number="Fig. 1"
      title={title}
      subtitle={subtitle}
      rail={rail}
      railBelow={false}
      vt="iv-surface"
      // Room kept for the longest hint (a still frame's longest reason and its instructions), in one cell with the one
      // shown, so neither going live nor keeping a still frame after all moves the page below, at any width.
      hint={
        <span className="grid">
          <span aria-hidden className="invisible [grid-area:1/1]" data-room={`${DECLINED_TEXT.load} ${readHow}`} />
          <span className="[grid-area:1/1]">
            <Items items={hint} />
          </span>
        </span>
      }
      caption={caption}
      table={table}
    >
      <div className="relative -mx-6 sm:mx-0">
        <div
          ref={box}
          role="group"
          aria-roledescription="interactive figure"
          aria-label="Implied volatility surface. Arrow keys move the reading point; Home resets it; Space pauses."
          aria-describedby="fig-iv-surface-point"
          tabIndex={0}
          data-seq={sig.state}
          onKeyDown={onKey}
          onPointerMove={lean.onPointerMove}
          onPointerLeave={lean.onPointerLeave}
          onClick={(e) => {
            lean.onTap()
            onStillPick(e)
          }}
          className={`iv-fig peer relative ${FRAME_ASPECT} cursor-crosshair sm:max-w-[calc(88svh*1.62)] touch-pan-y touch-pinch-zoom overflow-x-clip select-none focus-visible:outline-none`}
        >
          <div data-surface-poster="" className="absolute inset-0" style={underlay(live)}>
            {poster}
            <Frame>
              {(['wide', 'tall'] as const).map((k) => (
                <span key={k} aria-hidden data-fill="" className={`absolute ${k === 'wide' ? 'hidden sm:block' : 'sm:hidden'}`} style={posterDot(k)}>
                  <span data-still-dot="" className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-ink" />
                  {read && (
                    // Near the right edge it stands on the dot's left, as the live tag does.
                    <span data-probe-tag="" className={TAG} style={parseFloat(posterDot(k).left) > 80 ? { transform: 'translateX(calc(-100% - 1.25rem))' } : undefined}>
                      vol {(iv(params(shock), probe.k, probe.T) * 100).toFixed(1)}%
                    </span>
                  )}
                </span>
              ))}
            </Frame>
          </div>
          <canvas ref={canvas} data-live-canvas="" aria-hidden className="absolute inset-0 h-full w-full" style={{ ...fade(live), touchAction: 'pan-y pinch-zoom' }} />
          {/* The story's narration, on the stage while the line under it is out of view (the line is the one read aloud). */}
          <p
            aria-hidden
            data-phase-caption=""
            className="text-note pointer-events-none absolute top-3 right-3 w-[min(42%,17rem)] text-right leading-snug text-ink transition-opacity duration-200 ease-out"
            style={{ opacity: onStage ? 1 : 0 }}
          >
            {/* The plate stays crisp; only its words blur through a turn of the story, as the line below does (a reader's
                own change on the slider is simply there). */}
            <span className="inline-block rounded-sm bg-paper/90 px-1.5 py-0.5">
              <span
                key={said}
                className={`inline-block ${phaseMoved ? 'transition-[filter] duration-[120ms] ease-out starting:blur-[3px]' : ''} ${going ? 'blur-[3px]' : ''}`}
              >
                <span className="font-semibold">{PHASE_TEXT[said].name}.</span> {PHASE_TEXT[said].short}
              </span>
            </span>
          </p>
          <div aria-hidden className="pointer-events-none absolute inset-0" style={fade(live)}>
            <div ref={labelLayer}>
              {LABELS.map((l, i) => (
                <AxisLabel
                  key={l.id}
                  ref={(el) => {
                    labelEls.current[i] = el
                  }}
                  moving
                  text={l.text}
                  align={l.align}
                  kind={l.kind}
                  {...(l.only && l.only !== kind ? { style: { display: 'none' } } : {})}
                />
              ))}
              {NOTES.map(
                (n, i) =>
                  n.offset[kind] && (
                    <NoteMark
                      key={n.id}
                      moving
                      ref={(el) => {
                        noteEls.current[i] = el
                      }}
                      lead={n.lead}
                      text={n.text}
                      dx={n.offset[kind]![0]}
                      dy={n.offset[kind]![1]}
                      align={n.offset[kind]![2]}
                    />
                  ),
              )}
            </div>
            <span
              ref={(el) => {
                dotEl.current = el
              }}
              className="absolute top-0 left-0"
            >
              <span className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-ink" />
              <span ref={tagEl} data-probe-tag="" className={TAG} style={{ opacity: 0 }} />
            </span>
          </div>
        </div>
        <FocusRing />
      </div>

      {/* What the shock is doing, in words; the room is kept, so a change never moves the page. */}
      <p ref={phaseLine} data-phase-line="" className="text-note mt-3 min-h-[4.5em] text-ink sm:min-h-[3em]" aria-live="off">
        <span
          key={said}
          className={`block ${phaseMoved ? 'transition-[filter] duration-[120ms] ease-out starting:blur-[3px]' : ''} ${going ? 'blur-[3px]' : ''}`}
        >
          <span className="font-semibold">{PHASE_TEXT[said].name}.</span> {PHASE_TEXT[said].line}
        </span>
      </p>

      {/* The slider first: it is there in every mode, so the buttons a live figure adds arrive after it, moving nothing. */}
      <div data-surface-controls="" className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-3">
        <label className="text-meta flex items-center gap-3 font-mono text-graphite">
          {/* The reader's own shock: while the story plays its shock, this one still reads 0.00×, and says whose it is. */}
          <span>Your shock</span>
          <input
            type="range"
            min={0}
            max={SIZE_MAX}
            step={0.05}
            list="iv-shock-ticks"
            value={shock}
            onChange={(e) => onShock(Number(e.target.value))}
            aria-valuetext={shock < 0.025 ? 'calm' : `${shock.toFixed(2)} times a full shock; 1-month at-the-money volatility ${peakAtm}%`}
            className="h-6 w-32 sm:w-40"
            style={rangeFill(shock, 0, SIZE_MAX)}
          />
          {/* The mark at 1: the size of the story's own shock. */}
          <datalist id="iv-shock-ticks">
            <option value="0" />
            <option value="1" label="the story’s shock" />
          </datalist>
          <output aria-hidden className="tabular w-[2.75rem] text-ink">
            {shock.toFixed(2)}×
          </output>
        </label>
        {/* Pause and Replay's place, kept from the first paint as wide as they are, so on a phone the row they wrap onto
            is there before they are and going live moves nothing under the figure; they arrive in it, rising (the
            stylesheet). Reduced motion keeps no room for them (it is known at first paint); a figure that turns out not to
            go live keeps the room, empty, so its still frame moves nothing either. */}
        <div data-live-buttons="" className="flex min-h-8 min-w-[9.5rem] gap-2 motion-reduce:hidden" style={why !== null ? { visibility: 'hidden' } : undefined}>
          {live ? (
            <>
              <button type="button" onClick={togglePause} className={`${CONTROL} min-w-[4.5rem]`}>
                {paused ? 'Resume' : 'Pause'}
              </button>
              <button type="button" data-replay="" onClick={replay} className={CONTROL}>
                Replay
              </button>
            </>
          ) : null}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {spoken}
      </p>
      <div className="mt-4 lg:hidden">
        <Margin initial={initial} rows={initialRows} set={ref} suffix="-m" across />
      </div>
      <DebugSlot title="IV surface, Fig. 1" read={readDebug} />
    </FigureFrame>
  )
}

function expiryWords(T: number): string {
  const m = T * 12
  return m < 11.5 ? `${m.toFixed(m < 3 ? 1 : 0)} months` : `${T.toFixed(1)} years`
}

/**
 * The margin: the shock's story at one month (at-the-money volatility, the crash premium, the put, and whether the
 * surface is still free of static arbitrage), then everything about the point the reader is reading.
 */
function Margin({
  initial,
  rows,
  set,
  suffix,
  across = false,
}: {
  initial: ReturnType<typeof format>
  rows: ReturnType<typeof pointRows>
  set: (id: string) => (el: HTMLElement | null) => void
  suffix: string
  across?: boolean
}) {
  const dl = across ? 'text-meta grid grid-cols-2 gap-x-6 gap-y-3 border-t border-rule pt-3 font-mono sm:grid-cols-3' : 'text-meta grid grid-cols-1 gap-y-px font-mono lg:text-right [&_dd]:mb-2'
  const row = (id: string) => rows.find((r) => r.id === id)!
  return (
    <div className={across ? 'grid gap-y-4' : ''}>
      <dl className={dl}>
        {HEADLINE.map(([id, label]) => (
          <div key={id} className="min-w-0">
            <dt className="text-graphite">{label}</dt>
            <dd ref={set(id + suffix)} className="tabular text-ink">
              {initial[id]}
            </dd>
          </div>
        ))}
        <div className="min-w-0">
          <dt className="text-graphite">No static arbitrage</dt>
          <dd className="tabular text-ink">
            <span ref={set(`arb${suffix}`)}>{initial.arb}</span>
            <span ref={set(`arb-detail${suffix}`)} className="block text-graphite">
              {initial.arbDetail}
            </span>
          </dd>
        </div>
      </dl>
      <dl id={suffix ? undefined : 'fig-iv-surface-point'} aria-label="At the point" className={`${dl} ${across ? '' : 'mt-4 border-t border-rule pt-3'}`}>
        {POINT.map((id) => (
          <div key={id} className="min-w-0">
            <dt className="text-graphite">{row(id).label}</dt>
            <dd ref={set(id + suffix)} className="tabular text-ink">
              {row(id).value}
            </dd>
          </div>
        ))}
        {/* The two volatilities side by side: the comparison is the point (local runs above implied on the downside). */}
        <div className="min-w-0">
          <dt className="text-graphite">Implied · local vol</dt>
          <dd className="tabular text-ink">
            <span ref={set(`iv${suffix}`)}>{row('iv').value}</span> · <span ref={set(`lv${suffix}`)}>{row('lv').value}</span>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-graphite">{row('call').label}</dt>
          <dd ref={set(`call${suffix}`)} className="tabular text-ink">
            {row('call').value}
          </dd>
        </div>
      </dl>
      {/* The Greeks, one step away: the margin leads with what the figure shows. */}
      <details className={`text-meta font-mono ${across ? '' : 'mt-2 lg:text-right'}`}>
        <summary onClick={glideDetails} className="cursor-pointer py-1 text-graphite marker:text-graphite hover:text-ink">
          Greeks at the point
        </summary>
        <dl className={`${dl} mt-2 ${across ? 'border-t-0 pt-0' : ''}`}>
          {GREEKS.map((id) => (
            <div key={id} className="min-w-0">
              <dt className="text-graphite">{row(id).label}</dt>
              <dd ref={set(id + suffix)} className="tabular text-ink">
                {row(id).value}
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  )
}

/**
 * The Greeks open and close with a short glide rather than a jump: their rows grow into place (200ms) and go first
 * when closed (150ms, exits faster), on the site's ease-out; everything under them moves with the rows, not at once.
 * A click during either glide turns it back from where it is. A keyboard's Enter or Space opens them at once, as a
 * disclosure opened from the keyboard does not animate on this site (chrome; a figure's own explanation, such as the
 * ranking's rows moving on an arrow key, still moves), and so does reduced motion, which is static on this site.
 */
const gliding = new WeakMap<HTMLDetailsElement, { anim: Animation; opening: boolean }>()
function glideDetails(e: MouseEvent<HTMLElement>) {
  const details = e.currentTarget.parentElement as HTMLDetailsElement | null
  const rows = details?.querySelector<HTMLElement>(':scope > dl')
  if (!details || !rows || e.detail === 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  e.preventDefault()
  const run = gliding.get(details)
  const opening = run ? !run.opening : !details.open
  // Where the rows are now, the glide under way included, before it is let go.
  const from = details.open ? rows.offsetHeight : 0
  const seen = details.open ? Number(getComputedStyle(rows).opacity) : 0
  run?.anim.cancel()
  const ease = EASE_OUT_CSS
  const clip = { overflow: 'clip' }
  let anim: Animation
  if (opening) {
    details.open = true
    const to = rows.offsetHeight
    // The rows' top margin (mt-2) glides with them: left out, the text under them jumped 8px before the glide began.
    anim = rows.animate([{ height: `${from}px`, marginTop: from ? '0.5rem' : '0px', opacity: seen, ...clip }, { height: `${to}px`, marginTop: '0.5rem', opacity: 1, ...clip }], { duration: 200, easing: ease })
  } else {
    anim = rows.animate([{ height: `${from}px`, marginTop: '0.5rem', opacity: seen, ...clip }, { height: '0px', marginTop: '0px', opacity: 0, ...clip }], { duration: 150, easing: ease })
    anim.onfinish = () => {
      details.open = false
    }
  }
  gliding.set(details, { anim, opening })
  anim.addEventListener('finish', () => {
    if (gliding.get(details)?.anim === anim) gliding.delete(details)
  })
}

/** The point's rows as the margin shows them: where it is, then (after its volatilities and price) its Greeks. */
const POINT = ['strike', 'expiry'] as const
const GREEKS = ['delta', 'gamma', 'vega', 'theta'] as const
