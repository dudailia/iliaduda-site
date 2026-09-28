'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react'
import { FigureFrame } from '@/components/FigureFrame'
import { DebugSlot } from '@/components/stage/DebugSlot'
import { FocusRing } from '@/components/stage/FocusRing'
import { DECLINED_TEXT, useFallback } from '@/components/stage/useFallback'
import { saveData, supportsWebGL2 } from '@/components/stage/env'
import { useLean } from '@/components/stage/useLean'
import { useSignature } from '@/components/stage/useSignature'
import { fade, underlay, useStage, type Create } from '@/components/stage/useStage'
import type { LiveInfo } from '@/lib/stage/debug'
import { numbers, pointRows, text as format } from '@/lib/surface/readouts'
import { amplitudeOf, shownAmplitude, surfaceSequence, type SurfacePhase } from '@/lib/surface/sequence'
import { params, PHASE_TEXT, SIZE_MAX, type Phase } from '@/lib/surface/shock'
import { check, DOMAIN, iv, type Check, type Params } from '@/lib/surface/ssvi'
import type { Sequence } from '@/lib/stage/sequence'
import { apply, camera, fu, fv, kOfU, LABELS, mvp, NOTES, tOfV, WIDE_QUERY, wx, wy, wz, type FrameKind } from '@/lib/surface/view'
import { AxisLabel, Frame, NoteMark } from './marks'
import type { Probe, Sim, SurfaceRenderer } from './renderer'

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
const CONTROL =
  'text-meta min-h-8 rounded-sm border border-graphite px-2.5 py-1.5 font-mono text-ink transition-[border-color,scale] duration-150 ease-out hover:border-ink active:scale-[0.97]'
const noop = () => () => {}

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
  const [spoken, setSpoken] = useState('')
  const [kind, setKind] = useState<FrameKind>('wide')
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
            sequence: () => (sigApi.current?.armed.current && !seq.current.done ? seq.current.phases() : null),
            shown: () => shownAmplitude(seq.current),
            playing: () => !!sigApi.current?.armed.current && seq.current.started && !seq.current.done,
            tick: (dtMs) => {
              seq.current.advance(dtMs)
              sigApi.current?.onFrame()
            },
            level: () => level.current,
            paused: () => pausedRef.current,
            lean: () => leanApi.current?.lean.current ?? { x: 0, y: 0 },
            onPin: (p) => setProbe(p),
            labels: () => labelEls.current,
            labelLayer: () => labelLayer.current,
            notes: () => noteEls.current,
            dot: () => dotEl.current,
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
          if (dead || broken || !inner) return false
          try {
            return inner.frame(t, dt)
          } catch {
            fail('error')
            return false
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

  const { box, canvas, live, eligible, reduced, fps, quality, tier } = useStage(create)
  const sig = useSignature('surface', box, seq)
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
      setKind(mq.matches ? 'wide' : 'tall')
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
  const still = useRef<{ poster: typeof import('@/lib/surface/poster'); markup: typeof import('@/lib/surface/posterMarkup') } | null>(null)
  const stillWant = useRef(0)
  const stillFrame = useRef(0)
  const redrawStill = useCallback(
    (x: number) => {
      const el = box.current
      const run = () => {
        const s = still.current
        if (!s || !el) return
        const d = s.poster.poster(params(x))
        // The first redraw puts the mesh inline in place of the poster's image, with its style beside it.
        let mesh = el.querySelector('[data-iv-poster] [data-mesh]')
        if (mesh && mesh.tagName.toLowerCase() === 'img') {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
          svg.setAttribute('viewBox', `0 0 ${d.width} ${s.poster.FRAME_H}`)
          svg.setAttribute('class', 'absolute inset-0 h-full w-full overflow-visible')
          svg.setAttribute('aria-hidden', 'true')
          svg.setAttribute('data-fill', '')
          svg.setAttribute('data-mesh', '')
          mesh.replaceWith(svg)
          mesh = svg
          const style = document.createElement('style')
          style.setAttribute('data-mesh-css', '')
          el.querySelector('[data-iv-poster]')?.prepend(style)
        }
        if (mesh) mesh.innerHTML = s.markup.meshMarkup(d)
        const style = el.querySelector('[data-iv-poster] style[data-mesh-css]')
        if (style) style.textContent = s.markup.MESH_CSS + s.poster.RAMP_CSS + d.css
        for (const n of d.notes) {
          const at = el.querySelector<HTMLElement>(`[data-iv-poster] [data-note="${n.id}"]`)
          if (at) {
            at.style.left = `${(n.x * 100).toFixed(2)}%`
            at.style.top = `${(n.y * 100).toFixed(2)}%`
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
        void Promise.all([import('@/lib/surface/poster'), import('@/lib/surface/posterMarkup')]).then(([poster, markup]) => {
          still.current = { poster, markup }
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
        return setProbe(PROBE_START)
      case ' ':
        if (!live) return
        e.preventDefault()
        // The keyboard's Pause, like the button (a click), first finishes a story that is playing.
        if (sig.armed.current) seq.current.skip()
        return togglePause()
    }
  }

  // The still frame's reading point: projected with the poster's camera, drawn until the canvas takes over.
  const posterDot = (() => {
    const m = mvp(camera(0))
    const c = apply(m, wx(probe.k), wy(iv(params(shock), probe.k, probe.T)), wz(probe.T))
    return { left: `${((c[0] / c[3]) * 0.5 + 0.5) * 100}%`, top: `${(1 - ((c[1] / c[3]) * 0.5 + 0.5)) * 100}%` }
  })()

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
              ? 'Still frame: the live figure could not start here.'
              : 'Still frame: this browser has no WebGL2.'
          : null

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

  const initial = format(numbers(params(0)), check(params(0)))
  const initialRows = pointRows(params(0), PROBE_START)
  const peakAtm = (iv(params(shock), 0, 1 / 12) * 100).toFixed(1)
  // Said for the pointer this reader has: a phone's finger taps to read and drags sideways to turn (vertical drags
  // scroll the page); a mouse points. A still frame keeps its instructions after its reason.
  const coarse = mounted && matchMedia('(pointer: coarse)').matches
  const hint = why
    ? `${why} Tab to the figure and use the arrow keys to read a point; the Shock slider still redraws it.`
    : live
      ? coarse
        ? 'Tap to read a point · drag sideways to turn · the Shock slider applies the shock'
        : 'Point to read a point · drag to turn · arrow keys move the point · Space pauses'
      : 'Tab to the figure and use the arrow keys to read a point'

  const rail = <Margin initial={initial} rows={initialRows} set={ref} suffix="" />

  return (
    <FigureFrame id="fig-iv-surface" number="Fig. 1" title={title} subtitle={subtitle} rail={rail} railBelow={false} vt="iv-surface" hint={hint} caption={caption} table={table}>
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
          onClick={lean.onTap}
          className="iv-fig peer relative aspect-[1.35] cursor-crosshair touch-pan-y overflow-x-clip select-none focus-visible:outline-none sm:aspect-[1.62]"
        >
          <div className="absolute inset-0" style={underlay(live)}>
            {poster}
            <Frame>
              <span aria-hidden data-fill="" className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-ink" style={posterDot} />
            </Frame>
          </div>
          <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full" style={{ ...fade(live), touchAction: 'pan-y' }} />
          <div aria-hidden className="pointer-events-none absolute inset-0" style={fade(live)}>
            <div ref={labelLayer}>
              {LABELS.map((l, i) => (
                <AxisLabel
                  key={l.id}
                  ref={(el) => {
                    labelEls.current[i] = el
                  }}
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
            </span>
          </div>
        </div>
        <FocusRing />
      </div>

      {/* What the shock is doing, in words; the room is kept, so a change never moves the page. */}
      <p className="text-note mt-3 min-h-[4.5em] text-ink sm:min-h-[3em]" aria-live="off">
        <span key={phase} className={`block ${phaseMoved ? 'transition-[opacity,filter] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] starting:opacity-0 starting:blur-[2px]' : ''}`}>
          <span className="font-semibold">{PHASE_TEXT[phase].name}.</span> {PHASE_TEXT[phase].line}
        </span>
      </p>

      {/* The slider first: it is there in every mode, so the buttons a live figure adds arrive after it, moving nothing. */}
      <div data-surface-controls="" className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-3">
        <label className="text-meta flex items-center gap-3 font-mono text-graphite">
          <span>Shock</span>
          <input
            type="range"
            min={0}
            max={SIZE_MAX}
            step={0.05}
            list="iv-shock-ticks"
            value={shock}
            onChange={(e) => onShock(Number(e.target.value))}
            aria-valuetext={shock < 0.025 ? 'calm' : `${shock.toFixed(2)} times a full shock; 1-month at-the-money volatility ${peakAtm}%`}
            className="h-6 w-32 accent-indigo sm:w-40"
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
        {live ? (
          <>
            <button type="button" onClick={togglePause} aria-pressed={paused} className={`${CONTROL} min-w-[4.5rem]`}>
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button type="button" data-replay="" onClick={replay} className={CONTROL}>
              Replay
            </button>
          </>
        ) : null}
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
        <summary className="cursor-pointer text-graphite marker:text-graphite hover:text-ink">Greeks at the point</summary>
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

/** The point's rows as the margin shows them: where it is, then (after its volatilities and price) its Greeks. */
const POINT = ['strike', 'expiry'] as const
const GREEKS = ['delta', 'gamma', 'vega', 'theta'] as const
