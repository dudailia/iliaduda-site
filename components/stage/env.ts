'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'

/**
 * What a live figure needs to know about where it is running, and nothing
 * else. Reusable by any figure that upgrades from a static poster.
 */

const subscribeMedia = (query: string) => (cb: () => void) => {
  const m = window.matchMedia(query)
  m.addEventListener('change', cb)
  return () => m.removeEventListener('change', cb)
}

// Made once, not each render: a new subscribe function is a new subscription to useSyncExternalStore.
const onReducedMotion = subscribeMedia('(prefers-reduced-motion: reduce)')
const onColorScheme = subscribeMedia('(prefers-color-scheme: dark)')

/** The reader's reduced-motion setting, live. Server render assumes reduced,
 *  so nothing that moves is ever in the HTML. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    onReducedMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => true,
  )
}

/** Changes whenever the reader's colour scheme does, for canvas colours. */
export function useColorScheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    onColorScheme,
    () => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    () => 'light',
  )
}

/** Whether the element is on screen — with a margin, so work can start just
 *  before it is needed, or a threshold, so motion waits until it is seen. */
export function useInView(ref: RefObject<Element | null>, rootMargin = '200px', threshold = 0): boolean {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => setInView(!!e && e.isIntersecting && e.intersectionRatio >= threshold),
      { rootMargin, threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, rootMargin, threshold])
  return inView
}

let webgl2: boolean | undefined
export function supportsWebGL2(): boolean {
  if (webgl2 === undefined) {
    try {
      const c = document.createElement('canvas')
      const gl = c.getContext('webgl2')
      webgl2 = !!gl
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    } catch {
      webgl2 = false
    }
  }
  return webgl2
}

/** The reader asked their browser to use less data. */
export function saveData(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  return !!c?.saveData
}

/**
 * Run once the browser is idle, or after a short timeout where it cannot say; and never while a view transition is
 * still playing (the morph a paper arrives by, marked by app/(pages)/layout.tsx), so a figure's start never stutters it.
 */
export function whenIdle(fn: () => void): () => void {
  if (document.documentElement.dataset.vtRunning) {
    let cancel = () => {}
    const id = setTimeout(() => (cancel = whenIdle(fn)), 100)
    return () => {
      clearTimeout(id)
      cancel()
    }
  }
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(fn, { timeout: 1500 })
    return () => window.cancelIdleCallback(id)
  }
  const id = setTimeout(fn, 300)
  return () => clearTimeout(id)
}

/** A CSS colour custom property as 0–1 sRGB. The tokens are #rrggbb. */
export function cssColor(name: string): [number, number, number] {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v)
  if (!m) return [0.5, 0.5, 0.5]
  return [Number.parseInt(m[1]!, 16) / 255, Number.parseInt(m[2]!, 16) / 255, Number.parseInt(m[3]!, 16) / 255]
}

/**
 * Call `fn` once, the first time the element is at least `threshold` visible,
 * or `hold` of it has stayed visible for 1.2s (the signatures' rule: a tall
 * figure whose top is on a short laptop's first screen starts there, rather
 * than waiting under the fold for a scroll). The call comes from the observer
 * itself, or its timer — an external event — so a figure can start its
 * one-time motion there without setting state in an effect.
 */
export function useOnceSeen(ref: RefObject<Element | null>, threshold: number, fn: () => void, hold?: number): void {
  const cb = useRef(fn)
  useEffect(() => {
    cb.current = fn
  })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let timer = 0
    const go = () => {
      clearTimeout(timer)
      io.disconnect()
      cb.current()
    }
    const io = new IntersectionObserver(
      ([e]) => {
        const r = e && e.isIntersecting ? e.intersectionRatio : 0
        if (r >= threshold) return go()
        if (hold !== undefined && r >= hold) {
          if (!timer) timer = window.setTimeout(go, 1200)
        } else {
          clearTimeout(timer)
          timer = 0
        }
      },
      { threshold: hold !== undefined ? [hold, threshold] : threshold },
    )
    io.observe(el)
    return () => {
      clearTimeout(timer)
      io.disconnect()
    }
  }, [ref, threshold, hold])
}

/**
 * Calls `fn` whenever the device pixel ratio changes, with no change of CSS size: a window moved to a screen of another
 * density, or a zoom. A canvas listening redraws at its new screen's own pixels. Returns the unsubscribe.
 */
export function onDprChange(fn: () => void): () => void {
  let mq: MediaQueryList | null = null
  const arm = () => {
    mq?.removeEventListener('change', fire)
    mq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
    mq.addEventListener('change', fire)
  }
  const fire = () => {
    arm()
    fn()
  }
  arm()
  return () => mq?.removeEventListener('change', fire)
}
