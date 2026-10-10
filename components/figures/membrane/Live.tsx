'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { FigureFrame, Readouts } from '@/components/FigureFrame'
import { CONTROL, option } from '@/components/stage/controls'
import { DebugSlot } from '@/components/stage/DebugSlot'
import { DECLINED_TEXT, SLOW_TEXT, useFallback } from '@/components/stage/useFallback'
import { saveData, supportsWebGL2 } from '@/components/stage/env'
import { useRadios, type ChoiceBy } from '@/components/stage/radios'
import { useLean } from '@/components/stage/useLean'
import { useSignature } from '@/components/stage/useSignature'
import { fade, underlay, useStage, type Create } from '@/components/stage/useStage'
import { rangeFill } from '@/components/stage/range'
import type { LiveInfo } from '@/lib/stage/debug'
import { Sequence } from '@/lib/stage/sequence'
import { energy, expand, relativeError, SHAPES, type Shape } from '@/lib/membrane/expand'
import { MODES_EXERCISE, MODES_MAX, MODES_START, table as tabulate, wire } from '@/lib/membrane/view'
import type { MembraneRenderer } from './renderer'
import { Poster, PH, PW } from './Poster'

/**
 * Fig. 1 of /membrane, live: a circular drum ringing in its Fourier–Bessel modes. The reader picks the initial shape
 * (the directed study's exercises) and how many modes to keep; the drum is the sum of exactly those modes, each at its
 * own frequency. On a first visit the flat page rises into the shape and is released; after that it rings on,
 * drifting slowly, until the reader pauses it. Where the live drum does not run, the still frame is the same drum
 * drawn, and every control redraws it.
 */

const PAUSED = 'membrane-paused'
const noop = () => () => {}

const num = (x: number, d = 4) => (Math.abs(x) < 0.5 * 10 ** -d ? (0).toFixed(d) : x.toFixed(d)).replace('-', '−')

/** The two families of shapes, each its own group: the membrane's own exercises, and the line's profiles struck. */
const GROUPS = [
  { from: '5.5.2', label: 'The drums of the exercises' },
  { from: '3.3', label: 'The Bessel-series profiles, struck as drums' },
] as const

/** The still frame shows the drum at the moment it is most itself: a displacement at once, a velocity a quarter-period on. */
const stillTime = (s: Shape, lambda: number) => (s.field === 'f' ? 0 : Math.PI / (2 * lambda))

export function MembraneLive({ poster, caption, table }: { poster: ReactNode; caption: ReactNode; table: ReactNode }) {
  const [shapeId, setShapeId] = useState(SHAPES[0]!.id)
  const [modes, setModes] = useState(MODES_START)
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  // The signature: the flat page rises into the shape (1.1 s), holds it, and lets it go.
  const seq = useRef(new Sequence<'rise' | 'release'>(2400, { rise: [0, 0.46], release: [0.72, 1] }))
  const renderer = useRef<MembraneRenderer | null>(null)
  useEffect(() => {
    try {
      if (sessionStorage.getItem(PAUSED) === '1') {
        pausedRef.current = true
        // Paused earlier in the visit: the drum opens on its shape, held, rather than on a story held at its start.
        seq.current.finish()
        queueMicrotask(() => setPaused(true))
      }
    } catch {}
  }, [])

  const shape = SHAPES.find((s) => s.id === shapeId)!
  const e = useMemo(() => expand(shape, modes), [shape, modes])
  const tb = useMemo(() => tabulate(e), [e])
  const tbRef = useRef(tb)
  useEffect(() => {
    tbRef.current = tb
    renderer.current?.poke()
  }, [tb])
  const E = useMemo(() => energy(e), [e])
  const err = useMemo(() => relativeError(shape, modes), [shape, modes])
  const changedRef = useRef(false)

  const sigRef = useRef<ReturnType<typeof useSignature> | null>(null)
  // The lean hook's own ref, read at every frame: the value in it is replaced on every pointer move.
  const leanApi = useRef<{ lean: { current: { x: number; y: number } } } | null>(null)
  const stageEl = useRef<HTMLElement | null>(null)

  const create: Create = useCallback((env) => {
    let made: MembraneRenderer | null = null
    void import('./renderer').then(({ createMembrane }) => {
      made = createMembrane(env, {
        table: () => tbRef.current,
        sequence: () => {
          const st = sigRef.current?.stateRef.current
          if (st !== 'pending' && st !== 'playing') return null
          if (!seq.current.started) return { rise: 0, released: false }
          const p = seq.current.phases()
          return { rise: p.rise, released: p.release > 0 }
        },
        tick: (ms) => {
          seq.current.advance(ms)
          sigRef.current?.onFrame()
        },
        paused: () => pausedRef.current,
        lean: () => leanApi.current?.lean.current ?? { x: 0, y: 0 },
        // Every copy of the readout (the margin's and, on a phone, the one under the figure).
        drawn: (t) => {
          const text = `${t.toFixed(1)}`
          stageEl.current?.closest('figure')?.querySelectorAll<HTMLElement>('[data-membrane-time]').forEach((el) => {
            if (el.textContent !== text) el.textContent = text
          })
        },
        dirty: () => {
          const c = changedRef.current
          changedRef.current = false
          return c
        },
      })
      // The kit sized the stage and set its palette before this code arrived: hand both over.
      if (size) made?.resize(...size)
      if (pal) made?.setPalette?.(pal)
      renderer.current = made
    })
    // The kit takes a renderer synchronously: this one forwards to the drum once its code has arrived, keeping what it
    // was told in the meantime (a size dropped here left a phone's drum drawn into one pixel).
    let size: [number, number, number, number] | null = null
    let pal: Parameters<NonNullable<MembraneRenderer['setPalette']>>[0] | null = null
    return {
      frame: (t, dt) => (made ? made.frame(t, dt) : false),
      resize: (bw, bh, cw, ch) => {
        size = [bw, bh, cw, ch]
        made?.resize(bw, bh, cw, ch)
      },
      setPalette: (p) => {
        pal = p
        made?.setPalette?.(p)
      },
      dispose: () => made?.dispose(),
    }
  }, [])
  // The quality waits until the drum is let go, as the order book's does: a 30 Hz clock stepped it 2 to 0 mid-story.
  const [stageOpts] = useState(() => ({ hold: () => seq.current.started && !seq.current.done }))
  const { box, canvas, live, eligible, slow, reduced, fps, quality, tier } = useStage(create, stageOpts)
  // At 0.3 held, a tall phone's first screen (35–43% of the stage at its foot) played the drum's rise under the fold while
  // the reader was still on the title; at 0.6, the drum's foot (78px of it) was still under the fold as it rose, its key
  // moment. Of what the screen can show at once (a phone turned sideways holds less than the stage).
  const sig = useSignature('membrane', box, seq, { start: 0.85, hold: 0.6, fit: true })
  useEffect(() => {
    sigRef.current = sig
    stageEl.current = box.current
  })
  const lean = useLean(live, reduced, pausedRef)
  useEffect(() => {
    leanApi.current = lean
  })
  const fallback = useFallback(canvas, live, sig.release)
  // A figure that will not go live here shows the finished drawing at once. Hydration reads reduced motion as on (the
  // server cannot know), so this waits for the browser's own answer.
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  const release = sig.release
  useEffect(() => {
    if (mounted && (!eligible || reduced)) release()
  }, [mounted, eligible, reduced, release])

  const togglePause = () => {
    const next = !pausedRef.current
    pausedRef.current = next
    setPaused(next)
    try {
      sessionStorage.setItem(PAUSED, next ? '1' : '0')
    } catch {}
    renderer.current?.poke()
  }
  const replay = () => {
    if (pausedRef.current) togglePause()
    // The drum is lowered into the page first, its clock set back to 0, and the story plays from there.
    const again = () => sigRef.current?.replay()
    if (renderer.current) renderer.current.sink(again)
    else again()
  }
  const choose = (id: string, by: ChoiceBy) => {
    if (id === shapeId) return
    // Using the figure ends its story at once; the new drum starts from its shape, eased into from the old one
    // (a keyboard's step cuts: keyboard steps are never animated).
    seq.current.finish()
    renderer.current?.restart(by === 'pointer')
    setShapeId(id)
    changedRef.current = true
  }
  const radio = useRadios(shapeId, choose)

  const still = useMemo(() => wire(tb, stillTime(shape, e.lambda[0]!), 1, PW, PH), [tb, shape, e])
  const declined = fallback.declined
  // Said only once the browser has answered; the server cannot know. Reduced motion is the reader's own choice, and the
  // still frame needs no explanation then.
  const why = !mounted || reduced
    ? null
    : declined
      ? DECLINED_TEXT[declined]
      : !eligible
        ? saveData()
          ? 'Still frame: your browser asks to save data.'
          : supportsWebGL2()
            ? slow
                  ? SLOW_TEXT
                  : 'Still frame: the live figure could not start here. Reloading the page may bring it.'
            : 'Still frame: this browser has no WebGL2.'
        : null

  // Each clause whole ("f = 2 sin 2θ," then "g = 0"): at 360px the line broke inside the last, leaving "0" alone.
  const clauses = (formula: string) =>
    formula.split(', ').map((c, i, all) => (
      <Fragment key={i}>
        <span className="whitespace-nowrap">{i < all.length - 1 ? `${c},` : c}</span>
        {i < all.length - 1 ? ' ' : null}
      </Fragment>
    ))
  const rows = [
    // Every shape's formula laid in one cell, the others unseen, so the room is the longest one's: a press on
    // "f = 3, then 1" wrapped it onto a third line and moved everything under the figure by 19px.
    {
      label: 'Initial shape',
      // The row's whole width: in a third of it the longest formula took two lines, and laid under the one shown, it
      // held this cell a line higher than its neighbours (the cells meet at their foot).
      span: true,
      value: (
        <span className="grid">
          {SHAPES.map((x) => (
            <span key={x.id} aria-hidden={x.id !== shape.id || undefined} className={`[grid-area:1/1] ${x.id === shape.id ? '' : 'invisible'}`}>
              {clauses(x.formula)}
            </span>
          ))}
        </span>
      ),
    },
    { label: 'Modes kept', value: `${modes}, in Bessel J${e.order}` },
    { label: 'Energy, conserved', value: num(E, 3) },
    { label: 'Error (L²,\u00a0relative)', value: `${(100 * err).toFixed(1)}%` },
    { label: 'Model time', value: <span data-membrane-time="">0.0</span> },
  ]
  const kind = shape.field === 'f' ? 'cos λt' : 'sin λt'
  const modeList = (
    <ol className="text-meta mt-3 grid list-none gap-y-0.5 border-t border-rule pt-3 font-mono tabular" aria-label={`The modes: each zero λ, and its coefficient of ${kind}`}>
      <li aria-hidden className="flex justify-between gap-3 text-graphite">
        <span>zero λ</span>
        <span>{`coefficient of ${kind}`}</span>
      </li>
      {e.lambda.slice(0, 6).map((l, m) => (
        <li key={m} className="flex justify-between gap-3">
          <span className="text-graphite">
            λ<sub>{`${e.order},${m + 1}`}</sub> {num(l)}
          </span>
          <span className={m < MODES_EXERCISE ? 'text-indigo' : 'text-ink'}>{num(shape.field === 'f' ? e.A[m]! : e.B[m]!)}</span>
        </li>
      ))}
      {modes > 6 ? <li className="text-graphite">{`and ${modes - 6} more`}</li> : null}
      {/* The list's room is its longest (six modes and the line for more), held as the slider runs: it grew 21px a step
          under the reader's drag, and moved the caption and the page under it. */}
      {Array.from({ length: 6 - Math.min(6, modes) + (modes > 6 ? 0 : 1) }, (_, i) => (
        <li key={`room${i}`} aria-hidden className="invisible">
          λ
        </li>
      ))}
    </ol>
  )

  const debugInfo = useRef<() => LiveInfo>(null)
  useEffect(() => {
    debugInfo.current = () => {
      const st = box.current?.getBoundingClientRect()
      const cv = canvas.current
      return {
        state: live ? 'live' : why ? 'declined' : 'starting',
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
        renderer: { shape: shape.id, modes: String(modes), ...renderer.current?.debug() },
      }
    }
  })
  const readDebug = useCallback((): LiveInfo => debugInfo.current!(), [])

  return (
    <FigureFrame
      id="fig-membrane"
      vt="membrane"
      number="Fig. 1"
      title="A circular drum, ringing in the modes its shape is made of."
      subtitle={`Fourier–Bessel series · radius 1 · wave speed 1 · ${modes} mode${modes === 1 ? '' : 's'} · the exercises' shapes`}
      // Room kept for its longest (two digits, the plural): at 1↔2 and 9↔10 modes the line wrapped and moved the slider
      // under the reader's thumb.
      subtitleRoom={`Fourier–Bessel series · radius 1 · wave speed 1 · ${MODES_MAX} modes · the exercises' shapes`}
      rail={
        <>
          {/* Under the figure on a phone, label over value in two columns, so a formula is not broken across lines
              beside a long label; in the margin, the margin's list. */}
          <div className="lg:hidden">
            <Readouts rows={rows} across />
          </div>
          <div className="hidden lg:block">
            <Readouts rows={rows} />
          </div>
          {modeList}
        </>
      }
      hint={why ? `${why} Pick a shape and the modes; the still frame redraws.` : 'Pick a shape and how many modes to keep: the drum is their sum, each mode ringing at its own frequency.'}
      caption={caption}
      table={table}
    >
      {/* Sideways on a phone the shapes, the modes and the buttons stand beside the drum, as the home figure's controls do:
          under it, a shape and the drum it sets never shared a 343px screen. */}
      {/* 17rem: in 15 the shapes wrapped to three rows and the column ran 391px down a 380px screen. */}
      <div className="short:grid short:grid-cols-[minmax(0,1fr)_17rem] short:items-start short:gap-x-6">
      {/* Edge to edge on a phone, as the other Fig. 1s: inside the column the drum stood a third of the screen tall. */}
      <div
        ref={box}
        data-membrane-stage=""
        data-seq={sig.state}
        role="group"
        aria-label={`A circular drum, initial shape ${shape.formula}, in ${modes} modes`}
        className="relative -mx-6 aspect-[1000/620] w-[calc(100%+3rem)] touch-manipulation sm:mx-auto sm:w-full sm:max-w-[calc(88svh*1000/620)] short:mx-auto short:w-full short:max-w-[calc(88svh*1000/620)]"
        onPointerMove={lean.onPointerMove}
        onPointerLeave={lean.onPointerLeave}
        onClick={lean.onTap}
      >
        <div data-membrane-poster="" className="absolute inset-0" style={underlay(live)}>
          {eligible && !reduced && !declined ? poster : <Poster w={still} />}
        </div>
        <canvas ref={canvas} data-live-canvas="" className="absolute inset-0 h-full w-full" style={fade(live)} />
      </div>

      <div data-membrane-controls="" className="mt-3 grid gap-y-3 short:mt-0 short:gap-y-2">
        {/* One choice of shape, in two groups: a radio group each, the arrow keys moving within it. */}
        {GROUPS.map((g) => {
          const ids = SHAPES.filter((x) => x.from === g.from)
          return (
            <div key={g.from}>
              <p id={`membrane-shapes-${g.from}`} className="text-meta font-mono text-graphite">
                {g.label}
              </p>
              <div role="radiogroup" aria-labelledby={`membrane-shapes-${g.from}`} className="mt-1 flex flex-wrap gap-2 pointer-coarse:gap-y-3.5 short:pointer-coarse:gap-y-3">
                {ids.map((x) => (
                  <button key={x.id} {...radio(x.id, ids.map((y) => y.id))} className={option(x.id === shapeId)}>
                    {x.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
        {/* Sideways on a phone the buttons and the modes come first in the column, the shapes under them: last, Pause and
            the slider sat below a 326–352px screen while the drum rang on it. The keys keep the reading order. */}
        <label className="block max-w-[28rem] short:order-[-1]">
          <span className="text-meta font-mono text-graphite">
            Modes <span className="tabular text-ink">{modes}</span>
            <span className="ml-2">(the exercises: {MODES_EXERCISE})</span>
          </span>
          <input
            type="range"
            min={1}
            max={MODES_MAX}
            step={1}
            value={modes}
            aria-valuetext={`${modes} modes`}
            onChange={(ev) => {
              seq.current.finish()
              setModes(Number(ev.currentTarget.value))
              changedRef.current = true
            }}
            className="mt-0.5 block h-6 w-full pointer-coarse:-mb-2.5 pointer-coarse:mt-[calc(0.125rem-10px)] pointer-coarse:h-11"
            style={rangeFill(modes, 1, MODES_MAX)}
          />
        </label>
        <div data-live-buttons="" className="flex min-h-8 gap-2 short:order-[-2]">
          {live ? (
            <>
              <button type="button" onClick={togglePause} className={`${CONTROL} [--min:4.5rem]`} data-hold="">
                {paused ? 'Resume' : 'Pause'}
              </button>
              <button type="button" data-replay="" onClick={replay} className={CONTROL}>
                Replay
              </button>
            </>
          ) : null}
        </div>
      </div>
      </div>
      <DebugSlot title="Membrane, Fig. 1" read={readDebug} />
    </FigureFrame>
  )
}
