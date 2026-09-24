'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { syntheticValue as value } from '@/content/synthetic'
import { PROBE_START, STEP, announce, clampProbe, cssPct, readout, type Probe } from '@/lib/surfaceView'
import { cssColor, saveData, supportsWebGL2, useColorScheme, useInView, useReducedMotion, whenIdle } from './surface/env'
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
  const [mode, setMode] = useState<'map' | 'gl'>('map')
  const [spoken, setSpoken] = useState('')

  const reduced = useReducedMotion()
  const scheme = useColorScheme()
  const inView = useInView(box)
  const shown = hover ?? pinned
  const rows = useMemo(() => readout(shown), [shown])

  // Upgrade to WebGL once, when everything allows it.
  useEffect(() => {
    if (!inView || reduced || renderer.current || !supportsWebGL2() || saveData()) return
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
          onReady: () => setMode('gl'),
          onLost: () => {
            renderer.current = null
            setMode('map')
          },
        })
      })
    })
    return () => {
      cancelled = true
      cancelIdle()
    }
  }, [inView, reduced, p.entrance])

  // Reduced motion switched on mid-visit: back to the still figure.
  useEffect(() => {
    if (reduced && renderer.current) {
      renderer.current.destroy()
      renderer.current = null
      setMode('map')
    }
  }, [reduced])

  useEffect(() => () => renderer.current?.destroy(), [])
  useEffect(() => renderer.current?.setProbe(shown), [shown, mode])
  useEffect(() => renderer.current?.setVisible(inView), [inView, mode])
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

          <div className="mt-5 flex">
            <div className={`flex-none ${gl ? 'invisible' : ''}`}>{p.expiryAxis}</div>
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
                <div className="absolute inset-0 transition-opacity duration-200 ease-out" style={{ opacity: gl ? 0 : 1 }}>
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
                  className="absolute inset-0 h-full w-full transition-[opacity,filter] duration-[240ms] ease-[cubic-bezier(0.23,1,0.32,1)]"
                  style={{ opacity: gl ? 1 : 0, filter: gl ? 'none' : 'blur(3px)', pointerEvents: gl ? 'auto' : 'none', touchAction: 'pan-y' }}
                />
                <div ref={labels} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" />
              </div>
              <div className={gl ? 'invisible' : ''}>{p.strikeAxis}</div>
            </div>
          </div>

          {readouts('text-meta mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono lg:hidden')}

          <p className="text-meta mt-4 font-mono text-graphite">
            {gl
              ? 'Drag to turn · hover or tap to read a point · arrow keys move the probe · [ ] turn'
              : 'Hover or tap to read a point · arrow keys move the probe'}
            {` · F = ${value('ivForward')}, rates at zero`}
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
