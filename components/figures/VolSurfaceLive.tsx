'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { syntheticValue as value } from '@/content/synthetic'
import { PROBE_START, STEP, announce, clampProbe, cssPct, readout, type Probe } from '@/lib/surfaceView'
import { vtStyle } from '@/components/FigureFrame'
import { cssColor, saveData, supportsWebGL2, useColorScheme, useInView, useReducedMotion, whenIdle } from '@/components/stage/env'
import { fromFraction, fx, fy } from './surface/frames'
import type { Colors, Renderer } from './surface/gl'

/**
 * The hero figure, live. It starts as the server-rendered contour map, which
 * already reads and probes, and upgrades to the WebGL surface only when all of
 * these hold: it is on screen, the browser is idle, WebGL2 exists, the reader
 * has not asked for reduced motion, and has not asked to save data. Any of
 * those false and the map is the figure, fully operable, with the same numbers.
 *
 * The margin reads the point under the probe: implied and local volatility,
 * and a call priced there with its Greeks. Hovering reads without committing;
 * a click, a tap or the arrow keys move the probe itself.
 */

const SEEN = 'fig-surface-entrance'

/** The one crossfade: map to canvas, 240ms on a strong ease-out, with a 3px
 *  blur so the flat map and the overhead render read as one object. The 2D
 *  axes leave on the same clock instead of vanishing. */
const FADE = 'transition-[opacity,filter] duration-[240ms] ease-[cubic-bezier(0.23,1,0.32,1)]'
/** The 2D axes fade out with the canvas and are then hidden outright: text at
 *  opacity 0 is still in the accessibility tree and still fails contrast.
 *  visibility is discrete, so it waits out the fade before it flips. */
const axisFade = (gone: boolean) => ({
  opacity: gone ? 0 : 1,
  visibility: gone ? ('hidden' as const) : ('visible' as const),
  transition: `opacity 240ms cubic-bezier(0.23, 1, 0.32, 1), visibility 0s linear ${gone ? '240ms' : '0s'}`,
})

interface Props {
  id: string
  number: string
  title: string
  subtitle: string
  caption: ReactNode
  /** The contour map, rendered on the server. */
  poster: ReactNode
  strikeAxis: ReactNode
  expiryAxis: ReactNode
  table: ReactNode
  descId: string
  /** Play the one entrance on this page (home), or never (the paper). */
  entrance: boolean
  /** View-transition name, on the paper page only: the contents thumbnail grows into this. */
  vt?: string
}

function colors(): Colors {
  return {
    paper: cssColor('--color-paper'),
    ink: cssColor('--color-ink'),
    graphite: cssColor('--color-graphite'),
    rule: cssColor('--color-rule'),
    indigo: cssColor('--color-indigo'),
    wash: cssColor('--color-indigo-wash'),
  }
}

export function VolSurfaceLive(p: Props) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const labels = useRef<HTMLDivElement>(null)
  const renderer = useRef<Renderer | null>(null)

  const [pinned, setPinned] = useState<Probe>(PROBE_START)
  const [hover, setHover] = useState<Probe | null>(null)
  const [ready, setReady] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [spoken, setSpoken] = useState('')

  const reduced = useReducedMotion()
  const scheme = useColorScheme()
  // Two thresholds: start loading just before the figure arrives, but only
  // count it as seen — and let the entrance play — once a third of it is on
  // screen. One margin for both played the one moment below the fold.
  const near = useInView(box, '200px')
  const seen = useInView(box, '0px', 0.35)
  // Latches: once seen, the surface stays the figure. Derived during render
  // rather than in an effect, which would paint one frame of the old state.
  if (seen && !revealed) setRevealed(true)
  // The map stays the figure until the surface can actually be looked at: a
  // canvas that crossfaded in below the fold would swap a labelled map for an
  // unlabelled overhead render and leave it there.
  const mode: 'map' | 'gl' = ready && revealed ? 'gl' : 'map'
  const shown = hover ?? pinned
  const rows = useMemo(() => readout(shown), [shown])

  // Upgrade to WebGL once, when everything allows it.
  useEffect(() => {
    if (!near || reduced || renderer.current || !supportsWebGL2() || saveData()) return
    let cancelled = false
    const cancelIdle = whenIdle(() => {
      void import('./surface/gl').then(({ createRenderer }) => {
        if (cancelled || !canvas.current || !labels.current) return
        let first = false
        try {
          first = p.entrance && sessionStorage.getItem(SEEN) !== '1'
          if (p.entrance) sessionStorage.setItem(SEEN, '1')
        } catch {
          first = false
        }
        renderer.current = createRenderer({
          canvas: canvas.current,
          labels: labels.current,
          colors: colors(),
          entrance: first,
          onHover: setHover,
          onPick: (q) => {
            setHover(null)
            setPinned(q)
          },
          onReady: () => setReady(true),
          onLost: () => {
            renderer.current = null
            setReady(false)
          },
        })
      })
    })
    return () => {
      cancelled = true
      cancelIdle()
    }
  }, [near, reduced, p.entrance])

  // Reduced motion switched on mid-visit: back to the still figure.
  useEffect(() => {
    if (reduced && renderer.current) {
      renderer.current.destroy()
      renderer.current = null
      setReady(false)
    }
  }, [reduced])

  useEffect(() => () => renderer.current?.destroy(), [])
  useEffect(() => renderer.current?.setProbe(shown), [shown, mode])
  useEffect(() => renderer.current?.setVisible(seen), [seen, mode])
  useEffect(() => renderer.current?.setColors(colors()), [scheme, mode])

  // Announce the committed probe, not every hover, and not on every keypress.
  useEffect(() => {
    const t = setTimeout(() => setSpoken(announce(pinned)), 350)
    return () => clearTimeout(t)
  }, [pinned])

  const fromPointer = useCallback((e: PointerEvent<HTMLDivElement>): Probe | null => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    if (x < 0 || x > 1 || y < 0 || y > 1) return null
    return clampProbe(fromFraction(x, y))
  }, [])

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const big = e.shiftKey ? 5 : 1
    const move = (dk: number, dT: number) => {
      e.preventDefault()
      setHover(null)
      setPinned((q) => clampProbe({ k: q.k + dk * STEP.k * big, T: q.T + dT * STEP.T * big }))
    }
    switch (e.key) {
      case 'ArrowLeft': return move(-1, 0)
      case 'ArrowRight': return move(1, 0)
      case 'ArrowUp': return move(0, -1)
      case 'ArrowDown': return move(0, 1)
      case '[': e.preventDefault(); return renderer.current?.turn(-1)
      case ']': e.preventDefault(); return renderer.current?.turn(1)
      case 'Home':
      case '0':
        e.preventDefault()
        setHover(null)
        setPinned(PROBE_START)
        renderer.current?.reset()
        return
      case 'Escape':
        return setHover(null)
    }
  }

  const gl = mode === 'gl'
  const readouts = (className: string) => (
    <dl className={className}>
      {rows.map((r) => (
        <div key={r.id} className="contents">
          <dt className="text-graphite">{r.label}</dt>
          <dd className="tabular text-ink">{r.value}</dd>
        </div>
      ))}
    </dl>
  )

  return (
    <figure id={p.id} className="my-12 lg:my-16" aria-labelledby={`${p.id}-title`}>
      <div className="grid grid-cols-1 gap-y-2 lg:grid-cols-[var(--rail)_minmax(0,var(--measure))] lg:gap-x-(--gutter) lg:gap-y-0">
        <div className="text-meta font-mono text-graphite lg:pt-1 lg:text-right">
          <span>{p.number}</span>
          {readouts('mt-[4.75rem] hidden gap-y-px lg:grid [&_dd]:mb-2')}
        </div>

        <div className="min-w-0">
          <div className="text-note border-b border-rule pb-2">
            <span id={`${p.id}-title`} className="block text-ink">
              {p.title}
            </span>
            <span className="text-meta block pt-px font-mono text-graphite">{p.subtitle}</span>
          </div>

          <div className="mt-5 flex" style={p.vt ? vtStyle(p.vt) : undefined}>
            <div className="flex-none" style={axisFade(gl)}>
              {p.expiryAxis}
            </div>
            <div className="min-w-0 flex-1">
              <div
                ref={box}
                role="group"
                aria-roledescription="interactive figure"
                aria-label="Implied volatility surface. Arrow keys move the probe; square brackets turn the view; Home resets."
                aria-describedby={p.descId}
                tabIndex={0}
                onKeyDown={onKey}
                onPointerMove={(e) => !gl && e.pointerType === 'mouse' && setHover(fromPointer(e))}
                onPointerLeave={() => !gl && setHover(null)}
                onPointerUp={(e) => {
                  if (gl) return
                  const q = fromPointer(e)
                  if (q) {
                    setHover(null)
                    setPinned(q)
                  }
                }}
                className="relative aspect-[5/4] cursor-crosshair touch-pan-y select-none sm:aspect-[16/10]"
              >
                {/* The poster never fades: the canvas is opaque and fades in over
                    it, so there is one crossfade, not two with different clocks
                    and a dip between them. */}
                <div className="absolute inset-0">
                  {p.poster}
                  <svg aria-hidden viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
                    <line x1={fx(shown.k)} x2={fx(shown.k)} y1={0} y2={1} stroke="var(--color-indigo)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                    <line x1={0} x2={1} y1={fy(shown.T)} y2={fy(shown.T)} stroke="var(--color-indigo)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                  </svg>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-indigo"
                    style={{ left: cssPct(fx(shown.k)), top: cssPct(fy(shown.T)) }}
                  />
                </div>
                <canvas
                  ref={canvas}
                  aria-hidden
                  className={`absolute inset-0 h-full w-full ${FADE}`}
                  style={{ opacity: gl ? 1 : 0, filter: gl ? 'none' : 'blur(3px)', pointerEvents: gl ? 'auto' : 'none', touchAction: 'pan-y' }}
                />
                <div ref={labels} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" />
              </div>
              <div style={axisFade(gl)}>
                {p.strikeAxis}
              </div>
            </div>
          </div>

          {readouts('text-meta mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono lg:hidden')}

          <p className="text-meta mt-4 max-w-[36rem] font-mono text-graphite">
            {gl
              ? 'Drag to turn · hover or tap to read a point · arrow keys move the probe · [ ] turn'
              : 'Hover or tap to read a point · arrow keys move the probe'}
            {` · F = ${value('ivForward')}, rates at zero`}
            {gl ? (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={() => {
                    renderer.current?.reset()
                    setHover(null)
                    setPinned(PROBE_START)
                  }}
                  className="underline decoration-rule underline-offset-2 hover:decoration-ink"
                >
                  reset view
                </button>
              </>
            ) : null}
          </p>

          <figcaption className="text-note mt-4 max-w-[39.2rem] text-graphite">{p.caption}</figcaption>
          <p className="sr-only" aria-live="polite">
            {spoken}
          </p>
          <div className="sr-only">{p.table}</div>
        </div>
      </div>
    </figure>
  )
}
