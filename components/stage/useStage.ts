'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import type { GL } from '@/lib/gl'
import { Governor } from '@/lib/stage/governor'
import { deviceTier, type Tier } from '@/lib/tier'
import { cssColor, onDprChange, saveData, supportsWebGL2, useColorScheme, useReducedMotion, whenIdle } from './env'

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
  /** The display's refresh interval as the governor has learned it, in seconds (1/60, 1/120, 1/30 in Low Power Mode). */
  refresh?(interval: number): void
  /**
   * The last frame moved only by itself, at rest: its drift or its stream, no story, flight, drag, spring or input. On a
   * 120 Hz display the kit then draws every other frame, as smooth to the eye at half the heat; any of those brings
   * every frame back.
   */
  calm?(): boolean
  dispose(): void
}

export type Create = (env: StageEnv) => Renderer | null

/**
 * Contexts this kit gave up itself (the figure stopped for reduced motion, or unmounted): a canvas that stays on the
 * page keeps its lost context, so going live again means asking for it back.
 */
const given = new WeakMap<HTMLCanvasElement, WEBGL_lose_context>()

const MAX_Q: Record<Tier, number> = { software: 0, low: 1, mid: 2, high: 3 }
/**
 * Resolution is not a quality level. Every stage draws at the screen's own device pixels, a 3× phone's at most (and
 * within what its GPU can hold), from its first frame: quality steps trade paths, glow and effects, never sharpness.
 * Tied to the level (1, 1.25, 1.5, 2 device pixels a CSS pixel), every figure opened at 1.5 and drew its whole
 * signature soft, a 3× iPhone never got past 2, and the IV surface stayed at 1.5 on a phone for good.
 */
const DPR_MAX = 3
/**
 * The one exception, a last resort: a low-tier device (a coarse pointer with few cores, never an iPhone or a laptop)
 * that cannot hold its frames at the lightest effects gets a level below them, drawn at three-quarters of its pixels.
 */
const LAST_RESORT = 0.75

/** The page's color tokens as a renderer takes them: for a figure's 2D views drawn beside a live stage. */
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

export function useStage(
  create: Create,
  opts: { threshold?: number; maxQ?: Partial<Record<Tier, number>>; hold?: () => boolean } = {},
): Stage {
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
  // A figure may let a tier go higher than the kit's default: the home figure lets a phone have its full effects.
  const tierMax = useRef(opts.maxQ)
  // A figure may hold the quality from climbing while its signature plays, so its effects never change mid-moment; a step down
  // is never held.
  const hold = useRef(opts.hold)
  useEffect(() => {
    hold.current = opts.hold
  })

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
    /** The largest canvas side this GPU takes (texture, renderbuffer and viewport limits). */
    let maxSide = 4096
    /** The canvas's content box in device pixels, exactly, where the browser reports it (no rounding to resample). */
    let devW = 0
    let devH = 0
    let gov = new Governor(0, 0)
    /** The refresh the renderer was last told, in ms. */
    let told = 1000 / 60
    let t0 = 0
    let last = 0
    let frames = 0
    let fpsAt = 0
    let first = false

    // Setting a canvas's size clears its drawing buffer, and with alpha off a
    // cleared buffer is black. So a resize — a window change, a move to another
    // screen, a zoom, or the last-resort step after this tick's frame was
    // already drawn — redraws in the same task (dt 0: the scene holds, nothing
    // advances).
    const size = () => {
      if (!renderer) return
      const r = cv.getBoundingClientRect()
      const native = window.devicePixelRatio || 1
      const scale = q < 0 ? LAST_RESORT : 1
      // The browser's own device-pixel box where it gives one and the screen is within the cap: the canvas then maps
      // one to one onto the screen's pixels. Otherwise the CSS box at the capped ratio, rounded. Taken only when it
      // agrees with the CSS box at that ratio (within two pixels): an emulated density reports CSS pixels there.
      const exact =
        devW > 0 && native <= DPR_MAX && scale === 1 && Math.abs(devW - r.width * native) < 2 && Math.abs(devH - r.height * native) < 2
      const dpr = Math.min(native, DPR_MAX) * scale
      let w = Math.max(1, exact ? devW : Math.round(r.width * dpr))
      let h = Math.max(1, exact ? devH : Math.round(r.height * dpr))
      if (w > maxSide || h > maxSide) {
        const k = maxSide / Math.max(w, h)
        w = Math.max(1, Math.floor(w * k))
        h = Math.max(1, Math.floor(h * k))
      }
      const changed = cv.width !== w || cv.height !== h
      if (changed) {
        cv.width = w
        cv.height = h
      }
      renderer.resize(w, h, r.width, r.height)
      if (changed && first && t0) renderer.frame((last - t0) / 1000, 0)
    }

    let skip = false
    let calmFor = 0
    /** The light frames' intervals before the first drawn one, ms: the display's clock, for the governor. */
    const light: number[] = []
    /** The last frame drew nothing (or nothing costly): the next interval is the clock's. */
    let prevLight = true
    /** The drawn frames' smoothed interval, ms, and how long it has crawled at the lightest quality, ms. */
    let crawlEma = 1000 / 60
    let crawlFor = 0
    let heldUntil = 0
    // Leaving the page, the loop stops: the way back to the Contents takes the old page's picture after pageswap, and
    // a live canvas drawing on into it was caught blank about half the time (a paused one, drawing nothing, never was).
    // A page the back-forward cache restores runs again.
    let gone = false
    const tick = (now: number) => {
      raf = 0
      if (!renderer || !visible || document.hidden || gone) return
      // Calm on a 120 Hz display, a dozen drawn frames running: every other frame (see Renderer.calm). Any input ends
      // it on the next frame; the run keeps a figure that is calm only now and then from alternating 8 and 16ms frames.
      calmFor = renderer.calm?.() ? calmFor + 1 : 0
      const halve = gov.refresh < 12 && calmFor > 12
      skip = halve && !skip
      if (skip) {
        // The interval across a skipped frame spans two of the display's: it says nothing about the clock.
        prevLight = false
        raf = requestAnimationFrame(tick)
        return
      }
      if (!t0) t0 = now
      // The interval after a light frame (nothing drawn, or skipped) is the clock's; after a heavy one, the work's.
      if (last && prevLight) gov.observe(now - last)
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60
      const raw = last ? now - last : 0
      last = now
      const drawn = renderer.frame((now - t0) / 1000, dt)
      // A renderer that has broken will not draw again: the loop stops, and the figure's still frame stands.
      if (drawn === null) return
      // The frames before the first drawn one cost nothing (the renderer is loading): their intervals are the clock's.
      if (drawn === false && dt > 0 && last && light.length < 12) light.push(dt * 1000)
      if (drawn !== false && !first) {
        first = true
        gov.seed(light.slice(1))
        setLive(true)
      }
      prevLight = drawn === false || drawn === 'idle'
      // At its lightest and still under 13 frames a second for six seconds of the reader's time (a phone whose GPU cannot
      // draw it: measured at 2–12), the figure gives way to its still frame, as it does where WebGL runs in software:
      // a picture that crawls reads worse than the finished one, blocks the page's taps and costs the battery. Judged on
      // the drawn frames' real intervals, smoothed over half a second (one quick frame between slow ones, as a GPU's
      // pipeline gives, does not start the count again); a gap over half a second is the loop starting again.
      if (drawn === true && raw > 0 && raw <= 500) {
        crawlEma += (raw - crawlEma) * (1 - Math.exp(-raw / 500))
        if (gov.q <= gov.minQ && crawlEma > 1000 / 13) crawlFor += raw
        else if (crawlEma < 1000 / 15 || gov.q > gov.minQ) crawlFor = 0
        if (crawlFor > 6000) {
          renderer.dispose()
          renderer = null
          rendererRef.current = null
          setLive(false)
          setEligible(false)
          return
        }
      }
      // A frame that drew nothing says nothing about what this device can hold: paused, every frame would read as
      // spare time, and the quality would climb to a level Resume then could not hold.
      if (drawn === 'idle') {
        raf = requestAnimationFrame(tick)
        return
      }
      // The governor (lib/stage/governor.ts), against this display's own refresh, which it learns: 120 Hz, 60 Hz, or a
      // 30 Hz clock (Low Power Mode) that no lighter quality would speed up. The renderer is told the refresh too, so
      // its own pacing (the home figure's pricing) judges its frames by the same clock.
      // Halved, a frame spans two of the display's: the governor judges each against the display's own interval.
      // The hold outlasts the story by a second and a half: released on its last frame, the step up it had held back
      // landed there, one long frame where the story ends.
      if (hold.current?.()) heldUntil = now + 1500
      if (gov.frame(halve ? dt / 2 : dt, now, now < heldUntil)) {
        const was = q
        q = gov.q
        // A step trades effects only: the canvas keeps its size (no buffers reallocated, no long frame), except into or
        // out of the last resort.
        renderer.setQuality?.(Math.max(0, q))
        if (was < 0 !== q < 0) size()
        setQuality(Math.max(0, q))
      }
      // Told only when it has really moved (3%): the refresh relaxes a little every frame.
      if (Math.abs(gov.refresh - told) > told * 0.03) {
        told = gov.refresh
        renderer.refresh?.(told / 1000)
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
      if (!raf && renderer && visible && !document.hidden && !gone) {
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
      const vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array | null
      maxSide = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number, vp?.[0] ?? 4096, vp?.[1] ?? 4096) || 4096
      gov = new Governor(q, maxQ, t === 'low' ? -1 : 0)
      told = gov.refresh
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
      (es) => {
        // The latest entry: one element is watched, and a batch can hold several of its crossings, the first stale.
        const e = es[es.length - 1]
        // A fifth of the stage to start it; once it has started, it runs while any of it shows, so the strip still
        // on screen as the reader scrolls past does not freeze mid-motion.
        visible = !!e && e.isIntersecting && (started ? e.intersectionRatio > 0 : e.intersectionRatio >= threshold)
        if (visible && !started && !cancelIdle) cancelIdle = whenIdle(start)
        run()
      },
      { threshold: [0, 0.01, threshold] },
    )
    io.observe(el)
    const ro = new ResizeObserver((es) => {
      const d = es[es.length - 1]?.devicePixelContentBoxSize?.[0]
      if (d) {
        devW = Math.round(d.inlineSize)
        devH = Math.round(d.blockSize)
      }
      size()
    })
    try {
      ro.observe(cv, { box: 'device-pixel-content-box' })
    } catch {
      ro.observe(cv)
    }
    // A move to a screen of another density, or a zoom: redrawn at the new screen's pixels (the observer above reports
    // it too, where it can).
    const unDpr = onDprChange(size)
    const onVis = () => run()
    document.addEventListener('visibilitychange', onVis)
    // The old page's picture is taken after pageswap, from what the compositor holds, and a WebGL canvas's buffer was
    // still caught empty now and then (the IV surface, about 1 in 7). So the last frame is drawn once more and copied
    // into a plain 2D canvas laid over the live one: the picture the morph takes is that copy, whatever the GL buffer
    // holds by then. A page the back-forward cache restores takes the copy away and runs again.
    let snap: HTMLCanvasElement | null = null
    const onSwap = () => {
      gone = true
      cancelAnimationFrame(raf)
      raf = 0
      if (!renderer || !first || !t0) return
      try {
        const r = cv.getBoundingClientRect()
        // Marked as changed (a resize at the same size), so even a paused, idle renderer draws this frame.
        renderer.resize(cv.width, cv.height, r.width, r.height)
        renderer.frame((last - t0) / 1000, 0)
        const copy = document.createElement('canvas')
        copy.width = cv.width
        copy.height = cv.height
        copy.getContext('2d')?.drawImage(cv, 0, 0)
        copy.className = cv.className
        copy.style.cssText = cv.style.cssText
        copy.setAttribute('aria-hidden', 'true')
        copy.dataset.swapCopy = ''
        cv.after(copy)
        snap = copy
      } catch {}
    }
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return
      snap?.remove()
      snap = null
      gone = false
      run()
    }
    addEventListener('pageswap', onSwap)
    addEventListener('pageshow', onShow)
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
      unDpr()
      document.removeEventListener('visibilitychange', onVis)
      removeEventListener('pageswap', onSwap)
      removeEventListener('pageshow', onShow)
      snap?.remove()
      cv.removeEventListener('webglcontextlost', onLost)
      cv.removeEventListener('webglcontextrestored', onRestored)
      renderer?.dispose()
      rendererRef.current = null
      // The figure is no longer live: its poster (or still frame) shows until a renderer draws again.
      setLive(false)
      const lose = gl?.getExtension('WEBGL_lose_context')
      // A context the browser has already taken (iOS on an app switch, memory pressure) is not given up again: WebKit
      // logs "loseContext: context already lost" as an error.
      if (lose && !gl?.isContextLost()) {
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
