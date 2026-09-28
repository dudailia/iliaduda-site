'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import type { GL } from '@/lib/gl'
import { deviceTier, type Tier } from '@/lib/tier'
import { cssColor, saveData, supportsWebGL2, useColorScheme, useReducedMotion, whenIdle } from './env'

/**
 * The life cycle every lab hero shares.
 *
 * The page arrives with a poster: a real frame of the same computation,
 * rendered on the server, so first paint is the hero and LCP never waits on
 * WebGL. The live renderer is created only when all of these hold: the reader
 * has not asked for reduced motion or to save data, WebGL2 exists, the page
 * has gone idle, and the stage is at least a fifth on screen. Once running,
 * the loop stops whenever the stage leaves the screen or the tab is hidden,
 * and a frame-time governor moves the quality level up or down so a phone
 * holds its frame rate and a laptop gets the full scene.
 *
 * The poster stays until the renderer reports its first real frame; then the
 * two crossfade (240ms, strong ease-out). A lost context puts the poster back.
 */

export type RGB = readonly [number, number, number]

export interface Palette {
  paper: RGB
  ink: RGB
  graphite: RGB
  rule: RGB
  indigo: RGB
  wash: RGB
  dark: boolean
}

export interface StageEnv {
  gl: GL
  canvas: HTMLCanvasElement
  palette: Palette
  tier: Tier
}

export interface Renderer {
  /**
   * Draw one frame. `t` in seconds since start, `dt` since the last frame. Return false until the first real frame is
   * on screen; 'idle' for a frame that drew nothing because nothing moved (the governor leaves it out); null if it will
   * never draw again (it broke), which stops the loop.
   */
  frame(t: number, dt: number): boolean | void | 'idle' | null
  /** Backing-store size in device pixels, and the CSS size. */
  resize(w: number, h: number, cssW: number, cssH: number): void
  /** 0 (lightest) … 3 (full). Called by the governor. */
  setQuality?(q: number): void
  setPalette?(p: Palette): void
  dispose(): void
}

export type Create = (env: StageEnv) => Renderer | null

/**
 * Contexts this kit gave up itself (the figure stopped for reduced motion, or unmounted): a canvas that stays on the
 * page keeps its lost context, so going live again means asking for it back.
 */
const given = new WeakMap<HTMLCanvasElement, WEBGL_lose_context>()

const MAX_Q: Record<Tier, number> = { software: 0, low: 1, mid: 2, high: 3 }
const DPR_CAP = [1, 1.25, 1.5, 2] as const

/** The page's colour tokens as a renderer takes them: for a figure's 2D views drawn beside a live stage. */
export function palette(dark: boolean): Palette {
  return {
    paper: cssColor('--color-paper'),
    ink: cssColor('--color-ink'),
    graphite: cssColor('--color-graphite'),
    rule: cssColor('--color-rule'),
    indigo: cssColor('--color-indigo'),
    wash: cssColor('--color-indigo-wash'),
    dark,
  }
}

export interface Stage {
  box: RefObject<HTMLDivElement | null>
  canvas: RefObject<HTMLCanvasElement | null>
  /** The renderer has drawn its first frame: show the canvas, fade the poster. */
  live: boolean
  /** Whether this stage will ever go live (false under reduced motion, no WebGL2, save-data). */
  eligible: boolean
  reduced: boolean
  /** Current quality level and measured frames per second, for readouts that report what this device does. */
  quality: number
  fps: number
  tier: Tier | null
}

export function useStage(create: Create, opts: { threshold?: number; maxQ?: Partial<Record<Tier, number>> } = {}): Stage {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  const scheme = useColorScheme()
  const [live, setLive] = useState(false)
  const [eligible, setEligible] = useState(true)
  const [quality, setQuality] = useState(0)
  const [fps, setFps] = useState(0)
  const [tier, setTier] = useState<Tier | null>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const createRef = useRef(create)
  useEffect(() => {
    createRef.current = create
  })
  const threshold = opts.threshold ?? 0.2
  // A figure may let a tier go higher than the kit's default: the home figure lets a phone draw at two device pixels.
  const tierMax = useRef(opts.maxQ)

  useEffect(() => {
    if (reduced) return
    if (!supportsWebGL2() || saveData()) {
      queueMicrotask(() => setEligible(false))
      return
    }
    const el = box.current
    const cv = canvas.current
    if (!el || !cv) return

    let visible = false
    let started = false
    let raf = 0
    let disposed = false
    let cancelIdle: (() => void) | null = null
    let renderer: Renderer | null = null
    let gl: GL | null = null
    let q = 0
    let maxQ = 0
    let t0 = 0
    let last = 0
    let ema = 16.7
    let vsync = 16.7
    let slow = 0
    let fast = 0
    let frames = 0
    let fpsAt = 0
    let first = false
    const failures: number[] = []
    const blockedUntil: number[] = []

    // Setting a canvas's size clears its drawing buffer, and with alpha off a
    // cleared buffer is black. So a resize — a window change, or the governor
    // stepping quality after this tick's frame was already drawn — redraws in
    // the same task (dt 0: the scene holds, nothing advances). Without it,
    // every MacBook visit flashed one black frame about three seconds in, at
    // the first step up.
    const size = () => {
      if (!renderer) return
      const r = cv.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP[q]!)
      const w = Math.max(1, Math.round(r.width * dpr))
      const h = Math.max(1, Math.round(r.height * dpr))
      const changed = cv.width !== w || cv.height !== h
      if (changed) {
        cv.width = w
        cv.height = h
      }
      renderer.resize(w, h, r.width, r.height)
      if (changed && first && t0) renderer.frame((last - t0) / 1000, 0)
    }

    const tick = (now: number) => {
      raf = 0
      if (!renderer || !visible || document.hidden) return
      if (!t0) t0 = now
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60
      last = now
      const drawn = renderer.frame((now - t0) / 1000, dt)
      // A renderer that has broken will not draw again: the loop stops, and the figure's still frame stands.
      if (drawn === null) return
      if (drawn !== false && !first) {
        first = true
        setLive(true)
      }
      // A frame that drew nothing says nothing about what this device can hold: paused, every frame would read as
      // spare time, and the quality would climb to a level Resume then could not hold.
      if (drawn === 'idle') {
        raf = requestAnimationFrame(tick)
        return
      }
      // The governor, against this display's own refresh: `vsync` tracks the
      // shortest smoothed frame interval seen (8.3ms at 120Hz, 16.7ms at
      // 60Hz). A second below ~50fps steps down; three seconds at the refresh
      // rate step back up, never past the device tier. A fixed "under 13ms"
      // could never be met at 60Hz, so quality once lowered stayed low.
      ema = ema * 0.9 + dt * 1000 * 0.1
      vsync = Math.min(vsync * 1.0005, ema)
      if (ema > Math.max(vsync * 1.35, 20)) slow += dt
      else slow = 0
      if (ema < vsync * 1.15) fast += dt
      else fast = 0
      // Hysteresis: a level the device has just failed to hold is off limits
      // for 30s, doubling each time it fails again, so a marginal phone does
      // not climb and fall every four seconds.
      if (slow > 1 && q > 0) {
        failures[q] = (failures[q] ?? 0) + 1
        blockedUntil[q] = now + 30000 * 2 ** (failures[q]! - 1)
        q--
        slow = 0
        renderer.setQuality?.(q)
        size()
        setQuality(q)
      } else if (fast > 3 && q < maxQ && now >= (blockedUntil[q + 1] ?? 0)) {
        q++
        fast = 0
        renderer.setQuality?.(q)
        size()
        setQuality(q)
      }
      frames++
      if (now - fpsAt > 500) {
        setFps(Math.round((frames * 1000) / (now - fpsAt)))
        frames = 0
        fpsAt = now
      }
      raf = requestAnimationFrame(tick)
    }

    const run = () => {
      if (!raf && renderer && visible && !document.hidden) {
        last = 0
        raf = requestAnimationFrame(tick)
      }
    }

    const start = () => {
      if (started || disposed) return
      started = true
      gl = cv.getContext('webgl2', { antialias: true, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' })
      if (!gl) {
        setEligible(false)
        return
      }
      // The context this canvas had when motion was last turned off: ask for it back, and start again once it is
      // (onRestored below).
      const mine = given.get(cv)
      if (gl.isContextLost() && mine) {
        given.delete(cv)
        started = false
        mine.restoreContext()
        return
      }
      const t = deviceTier(gl)
      maxQ = tierMax.current?.[t] ?? MAX_Q[t]
      q = Math.min(maxQ, 2)
      setTier(t)
      setQuality(q)
      try {
        renderer = createRef.current({ gl, canvas: cv, palette: palette(matchMedia('(prefers-color-scheme: dark)').matches), tier: t })
      } catch (e) {
        console.warn('figure renderer failed', e)
        renderer = null
      }
      if (!renderer) {
        setEligible(false)
        return
      }
      rendererRef.current = renderer
      renderer.setQuality?.(q)
      size()
      fpsAt = performance.now()
      run()
    }

    const io = new IntersectionObserver(
      ([e]) => {
        // A fifth of the stage to start it; once it has started, it runs while any of it shows, so the strip still
        // on screen as the reader scrolls past does not freeze mid-motion.
        visible = !!e && e.isIntersecting && (started ? e.intersectionRatio > 0 : e.intersectionRatio >= threshold)
        if (visible && !started && !cancelIdle) cancelIdle = whenIdle(start)
        run()
      },
      { threshold: [0, 0.01, threshold] },
    )
    io.observe(el)
    const ro = new ResizeObserver(size)
    ro.observe(cv)
    const onVis = () => run()
    document.addEventListener('visibilitychange', onVis)
    const onLost = (e: Event) => {
      e.preventDefault()
      cancelAnimationFrame(raf)
      raf = 0
      // Its listeners and labels go with it (GL calls on a lost context do nothing): the restored context gets a
      // renderer of its own, and nothing of the old one is left on the page.
      try {
        renderer?.dispose()
      } catch {}
      renderer = null
      rendererRef.current = null
      setLive(false)
    }
    cv.addEventListener('webglcontextlost', onLost)
    // The browser gave the context back (iOS Safari does after an app switch, or once memory is freed): build the
    // renderer again on it, and go live again from its first frame.
    const onRestored = () => {
      if (disposed) return
      started = false
      first = false
      t0 = 0
      last = 0
      start()
    }
    cv.addEventListener('webglcontextrestored', onRestored)

    return () => {
      disposed = true
      cancelIdle?.()
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      cv.removeEventListener('webglcontextlost', onLost)
      cv.removeEventListener('webglcontextrestored', onRestored)
      renderer?.dispose()
      rendererRef.current = null
      // The figure is no longer live: its poster (or still frame) shows until a renderer draws again.
      setLive(false)
      const lose = gl?.getExtension('WEBGL_lose_context')
      if (lose) {
        given.set(cv, lose)
        // A context may only be given back if its loss was prevented; the kit's own listener is gone by now.
        cv.addEventListener('webglcontextlost', (e) => e.preventDefault(), { once: true })
        lose.loseContext()
      }
    }
  }, [reduced, threshold])

  // Theme changes reach a running renderer without a restart.
  useEffect(() => {
    rendererRef.current?.setPalette?.(palette(scheme === 'dark'))
  }, [scheme])

  return { box, canvas, live: live && !reduced, eligible: eligible && !reduced, reduced, quality, fps, tier }
}

/**
 * The crossfade, as styles. The canvas fades in over the poster; the poster
 * stays fully opaque underneath and is hidden only once the canvas is solid.
 * Fading both at once dipped the picture's contrast by a quarter mid-fade,
 * because two matching images each at half opacity do not add up to one.
 */
export const FADE_MS = 240
/** The site's ease-out, as the theme defines it (app/globals.css, --ease-out). */
export const EASE_OUT = 'var(--ease-out)'
export function underlay(covered: boolean) {
  return {
    visibility: covered ? ('hidden' as const) : ('visible' as const),
    transition: `visibility 0s linear ${covered ? `${FADE_MS}ms` : '0s'}`,
  }
}
export function fade(show: boolean) {
  return {
    opacity: show ? 1 : 0,
    visibility: show ? ('visible' as const) : ('hidden' as const),
    transition: `opacity ${FADE_MS}ms ${EASE_OUT}, visibility 0s linear ${show ? '0s' : `${FADE_MS}ms`}`,
  }
}
