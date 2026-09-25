'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { amplitude, LOOP, params, PEAK, phase, PHASE_TEXT, SIZE_MAX, SIZE_MIN, type Phase } from '@/lib/lab/c/shock'
import { all, numbers, probeText, text as format } from '@/lib/lab/c/readouts'
import { check, DOMAIN, iv, type Check, type Params } from '@/lib/lab/c/ssvi'
import { apply, camera, fu, fv, kOfU, LABELS, mvp, NOTES, tOfV, WIDE_QUERY, wx, wy, wz, type FrameKind } from '@/lib/lab/c/view'
import { fade, useStage, type Create, type Renderer } from '../useStage'
import { AxisLabel, Frame, NoteMark } from './marks'
import type { Probe, Sim } from './renderer'

/**
 * Prototype C, live. The poster (server) is the hero until the renderer draws
 * its first frame, which is the poster's moment from the poster's camera; then
 * the two crossfade and the shock plays on from its peak. The readouts are
 * written straight into the DOM from the frame that drew them, never through
 * React state, so they cannot lag the picture.
 */

const PROBE_START: Probe = { k: 0, T: 0.25 }
const STEP_U = 1 / 28
const STEP_V = 1 / 20

/** Phase boundaries along the loop, for the timeline under the caption. */
const SEGMENTS = (() => {
  const out: { phase: Phase; from: number; to: number }[] = []
  const N = 400
  for (let i = 0; i < N; i++) {
    const t = (i / N) * LOOP
    const ph = phase(t)
    const last = out[out.length - 1]
    if (last && last.phase === ph) last.to = (i + 1) / N
    else out.push({ phase: ph, from: i / N, to: (i + 1) / N })
  }
  return out
})()

const clampProbe = (p: Probe): Probe => ({
  k: Math.min(DOMAIN.kMax, Math.max(DOMAIN.kMin, p.k)),
  T: Math.min(DOMAIN.tMax, Math.max(DOMAIN.tMin, p.T)),
})

const PEAK_PARAMS = params(amplitude(PEAK))
/** What the readouts say before the first live frame: the poster's moment, computed once. */
const initial = all(PEAK_PARAMS)
const initialProbe = probeText(PEAK_PARAMS, PROBE_START.k, PROBE_START.T)

export function SurfaceHero({ poster, lede, intro, introShort, desc }: { poster: ReactNode; lede: ReactNode; intro: ReactNode; introShort: ReactNode; desc: string }) {
  const sim = useRef<Sim>({ clock: PEAK, playing: true, size: 1, probe: PROBE_START, hover: null, dirty: true })
  const kindRef = useRef<FrameKind>('wide')
  const labelEls = useRef<(HTMLElement | null)[]>([])
  const noteEls = useRef<(HTMLElement | null)[]>([])
  const dotEl = useRef<HTMLElement | null>(null)
  // DOM nodes the frame loop writes into.
  const atmEl = useRef<HTMLElement>(null)
  const premiumEl = useRef<HTMLElement>(null)
  const putEl = useRef<HTMLElement>(null)
  const arbEl = useRef<HTMLSpanElement>(null)
  const arbDetailEl = useRef<HTMLSpanElement>(null)
  const whereEl = useRef<HTMLSpanElement>(null)
  const volEl = useRef<HTMLSpanElement>(null)
  const markerEls = useRef<(HTMLSpanElement | null)[]>([])
  const checked = useRef<{ at: number; size: number; c: Check | null }>({ at: -1, size: -1, c: null })

  const [playing, setPlaying] = useState(true)
  const [size, setSize] = useState(1)
  const [ph, setPh] = useState<Phase>(phase(PEAK))
  /** The phase line fades between phases, never on arrival: the first paint is the text, at full opacity. */
  const [phMoved, setPhMoved] = useState(false)
  const phRef = useRef<Phase>(phase(PEAK))
  const [probe, setProbe] = useState<Probe>(PROBE_START)
  const [spoken, setSpoken] = useState('')
  const [kind, setKind] = useState<FrameKind>('wide')
  /** Software tier: the renderer waits for Play. */
  const [waiting, setWaiting] = useState(false)
  const armed = useRef(false)

  const write = useCallback((el: HTMLElement | null, value: string) => {
    if (el && el.textContent !== value) el.textContent = value
  }, [])

  /** Everything the readouts say, from the parameters of the frame just drawn. */
  const sync = useCallback(
    (p: Params, clock: number) => {
      const s = sim.current
      // The arbitrage check is a few thousand closed-form evaluations; four times a second of loop time is plenty.
      const c = checked.current
      if (!c.c || Math.abs(clock - c.at) >= 0.25 || c.size !== s.size) {
        c.c = check(p)
        c.at = clock
        c.size = s.size
      }
      const t = format(numbers(p), c.c)
      write(atmEl.current, t.atm)
      write(premiumEl.current, t.premium)
      write(putEl.current, t.put)
      write(arbEl.current, t.arb)
      write(arbDetailEl.current, t.arbDetail)
      const pr = s.hover ?? s.probe
      const pt = probeText(p, pr.k, pr.T)
      write(whereEl.current, pt.where)
      write(volEl.current, pt.vol)
      for (const m of markerEls.current) if (m) m.style.transform = `translateX(${((((clock % LOOP) + LOOP) % LOOP) / LOOP) * 100}%)`
      const next = phase(clock)
      if (next !== phRef.current) {
        phRef.current = next
        setPh(next)
        setPhMoved(true)
      }
    },
    [write],
  )

  const create = useCallback<Create>(
    (env) => {
      let inner: Renderer | null = null
      let pending: { w: number; h: number; cw: number; ch: number } | null = null
      let q: number | null = null
      let pal = env.palette
      let dead = false
      let loading = false
      const load = () => {
        loading = true
        void import('./renderer').then(({ make }) => {
        if (dead) return
        try {
          inner = make(env, {
            sim: sim.current,
            labels: () => labelEls.current,
            notes: () => noteEls.current,
            dot: () => dotEl.current,
            sync,
          })
        } catch (e) {
          console.warn('lab c renderer failed', e)
          return
        }
        if (q !== null) inner.setQuality?.(q)
        if (pending) inner.resize(pending.w, pending.h, pending.cw, pending.ch)
        inner.setPalette?.(pal)
        })
      }
      // A software rasteriser compiles and draws this scene on the main
      // thread, for hundreds of milliseconds. There, the poster stays the
      // figure until the reader presses Play.
      const waits = env.tier === 'software'
      if (waits) queueMicrotask(() => setWaiting(true))
      else load()
      return {
        frame(t, dt) {
          if (!inner) {
            if (!loading && armed.current) load()
            return false
          }
          return inner.frame(t, dt)
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
          inner?.dispose()
        },
      }
    },
    [sync],
  )

  const { box, canvas, live, eligible, reduced, fps, quality, tier } = useStage(create)

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

  // The pinned point, read out and announced; the live frame redraws it.
  useEffect(() => {
    sim.current.probe = probe
    sim.current.dirty = true
    const p = params(amplitude(sim.current.clock), sim.current.size)
    const pt = probeText(p, probe.k, probe.T)
    write(whereEl.current, pt.where)
    write(volEl.current, pt.vol)
    const id = setTimeout(() => setSpoken(`Strike ${pt.where.replace('strike ', '')}: implied volatility ${pt.vol}.`), 350)
    return () => clearTimeout(id)
  }, [probe, write])

  const togglePlay = () => {
    if (waiting && !armed.current) {
      armed.current = true
      sim.current.playing = true
      setPlaying(true)
      return
    }
    const next = !sim.current.playing
    sim.current.playing = next
    sim.current.dirty = true
    setPlaying(next)
  }

  const onSize = (v: number) => {
    sim.current.size = v
    sim.current.dirty = true
    setSize(v)
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const big = e.shiftKey ? 4 : 1
    const move = (du: number, dv: number) => {
      e.preventDefault()
      sim.current.hover = null
      setProbe((p) => clampProbe({ k: kOfU(fu(p.k) + du * STEP_U * big), T: tOfV(Math.max(0, Math.min(1, fv(p.T) + dv * STEP_V * big))) }))
    }
    switch (e.key) {
      case 'ArrowLeft': return move(-1, 0)
      case 'ArrowRight': return move(1, 0)
      case 'ArrowUp': return move(0, -1)
      case 'ArrowDown': return move(0, 1)
      case 'Home':
        e.preventDefault()
        return setProbe(PROBE_START)
    }
  }

  // The poster's own reading point: projected with the poster's camera, drawn until the canvas takes over.
  const posterDot = (() => {
    const m = mvp(camera(0))
    const c = apply(m, wx(probe.k), wy(iv(PEAK_PARAMS, probe.k, probe.T)), wz(probe.T))
    return { left: `${((c[0] / c[3]) * 0.5 + 0.5) * 100}%`, top: `${(1 - ((c[1] / c[3]) * 0.5 + 0.5)) * 100}%` }
  })()

  const pctSize = size.toFixed(2)
  const peakAtm = Math.round(iv(params(1, size), 0, 1 / 12) * 100)
  const controlsOn = eligible && live
  /** What the shock is doing, in words, and where it is in its loop. Under the surface on phones, beside the controls from lg. */
  const phaseBlock = (n: number, className: string) => (
    <div className={`items-end gap-x-10 gap-y-2 lg:grid-cols-[minmax(0,1fr)_17rem] ${className}`}>
      <p className="min-h-[4.5em] text-note text-ink sm:min-h-[3em]">
        <span key={ph} className={`block ${phMoved ? 'transition-[opacity,filter] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] starting:opacity-0 starting:blur-[2px]' : ''}`}>
          <span className="font-semibold">{PHASE_TEXT[ph].name}.</span> {PHASE_TEXT[ph].line}
        </span>
      </p>
      <div aria-hidden className="relative mb-1">
        <div className="flex font-mono text-meta leading-none text-graphite">
          {SEGMENTS.map((sg) => (
            <span key={sg.phase + sg.from} className={`truncate border-t pt-1.5 pr-1 ${sg.phase === ph ? 'border-ink text-ink' : 'border-rule'}`} style={{ width: `${(sg.to - sg.from) * 100}%` }}>
              {PHASE_TEXT[sg.phase].name.toLowerCase()}
            </span>
          ))}
        </div>
        <span
          ref={(el) => {
            markerEls.current[n] = el
          }}
          className="absolute inset-x-0 -top-1 h-2" style={{ transform: `translateX(${(PEAK / LOOP) * 100}%)` }}>
          <span className="absolute top-0 left-0 h-2 w-px bg-ink" />
        </span>
      </div>
    </div>
  )
  const canStart = eligible && waiting && !live

  return (
    <section aria-labelledby="lab-c-lede" data-fps={fps} data-quality={quality} data-tier={tier ?? undefined} data-live={live} className="lab-c relative flex min-h-[max(560px,88svh)] flex-col overflow-x-clip border-b border-rule">
      <div className="mx-auto w-full max-w-[calc(var(--rail)+var(--gutter)+var(--measure))] px-6 pt-6 sm:px-8 lg:pt-8">
        <p id="lab-c-lede" className="max-w-[44rem] text-h3 font-semibold tracking-[-0.015em] text-balance text-ink sm:text-h2 lg:max-w-none">
          {lede}
        </p>
        <p className="mt-2 max-w-[42rem] text-note text-graphite">
          <span className="sm:hidden">{introShort}</span>
          <span className="hidden sm:inline">{intro}</span>
        </p>
        <p className="mt-1 font-mono text-meta text-graphite">SSVI surface · synthetic parameters, set by hand · not market data</p>
      </div>

      <div className="flex flex-1 flex-col lg:flex-row">
        <div className="order-3 mx-auto mt-4 w-full max-w-[calc(var(--rail)+var(--gutter)+var(--measure))] px-6 sm:px-8 lg:order-1 lg:mx-0 lg:mt-0 lg:ml-[calc(max(0px,(100%-var(--rail)-var(--gutter)-var(--measure))/2)+2rem)] lg:w-(--rail) lg:max-w-none lg:shrink-0 lg:self-center lg:px-0">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-rule pt-3 font-mono text-meta sm:grid-cols-3 lg:flex lg:flex-col lg:gap-y-4 lg:border-0 lg:pt-0 lg:text-right">
            <div>
              <dt className="text-graphite">1-month vol, at the money</dt>
              <dd ref={atmEl} data-testid="atm" className="tabular mt-0.5 text-ink">{initial.atm}</dd>
            </div>
            <div>
              <dt className="text-graphite">Crash premium, 80% strike</dt>
              <dd ref={premiumEl} className="tabular mt-0.5 text-ink">{initial.premium}</dd>
            </div>
            <div>
              <dt className="text-graphite">1-month put, 10% down</dt>
              <dd ref={putEl} className="tabular mt-0.5 text-ink">{initial.put}</dd>
            </div>
            <div>
              <dt className="text-graphite">No-arbitrage check</dt>
              <dd className="tabular mt-0.5 text-ink">
                <span ref={arbEl} data-testid="arb">{initial.arb}</span>
                <span ref={arbDetailEl} className="block text-graphite">{initial.arbDetail}</span>
              </dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-graphite">Point read</dt>
              <dd className="tabular mt-0.5 text-ink">
                <span ref={volEl} data-testid="probe-vol">{initialProbe.vol}</span>
                <span ref={whereEl} data-testid="probe-where" className="block text-graphite">{initialProbe.where}</span>
              </dd>
            </div>
          </dl>
        </div>
      <div
        ref={box}
        role="group"
        aria-roledescription="interactive figure"
        aria-label="Implied volatility surface. Arrow keys move the reading point; Home resets it."
        aria-describedby="lab-c-desc"
        tabIndex={0}
        onKeyDown={onKey}
        className="relative order-1 my-3 aspect-[1.35] w-full flex-none cursor-crosshair touch-pan-y select-none sm:my-2 sm:aspect-auto sm:min-h-[320px] sm:w-auto sm:flex-1 lg:order-2 lg:ml-(--gutter)"
      >
        <div className="absolute inset-0" style={fade(!live)}>
          {poster}
          <Frame>
            <span
              aria-hidden
              className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-ink"
              style={posterDot}
            />
          </Frame>
        </div>
        <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full" style={{ ...fade(live), touchAction: 'pan-y' }} />
        <div aria-hidden className="pointer-events-none absolute inset-0" style={fade(live)}>
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
          {NOTES.map((n, i) => n.offset[kind] && (
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
          ))}
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
        <div className="order-2 mx-auto w-full max-w-[calc(var(--rail)+var(--gutter)+var(--measure))] px-6 sm:px-8 lg:hidden">
          {phaseBlock(0, 'grid')}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[calc(var(--rail)+var(--gutter)+var(--measure))] px-6 pb-6 sm:px-8">
        {phaseBlock(1, 'mt-4 hidden lg:mt-0 lg:grid')}


        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 font-mono text-meta">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!controlsOn && !canStart}
            className="min-h-9 rounded-sm border border-graphite bg-paper px-3 text-ink transition-[border-color,transform] duration-150 ease-out hover:border-ink active:scale-[0.97] disabled:opacity-50"
          >
            {canStart ? 'Play' : playing ? 'Pause' : 'Play'}
          </button>
          <label className="flex items-center gap-3 text-graphite">
            <span>Shock size</span>
            <input
              type="range"
              min={SIZE_MIN}
              max={SIZE_MAX}
              step={0.05}
              value={size}
              disabled={!controlsOn}
              onChange={(e) => onSize(Number(e.target.value))}
              aria-valuetext={`${pctSize} times; at its peak, 1-month at-the-money volatility reaches ${peakAtm}%`}
              className="h-6 w-32 accent-indigo disabled:opacity-50 sm:w-40"
            />
            <output className="tabular w-[2.75rem] text-ink">{pctSize}×</output>
          </label>
          <p className="text-graphite lg:ml-auto">
            {controlsOn
              ? 'Drag to turn · hover or tap to read a point · arrow keys move it'
              : canStart
                ? 'This browser draws 3D in software, so the shock waits for Play'
                : reduced
                  ? 'Reduced motion is on: the shock is shown at its peak, still · arrow keys move the reading point'
                  : 'Arrow keys move the reading point'}
          </p>
        </div>
      </div>
      <p id="lab-c-desc" className="sr-only">{desc}</p>
      <p className="sr-only" aria-live="polite">{spoken}</p>
    </section>
  )
}
