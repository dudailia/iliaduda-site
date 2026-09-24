'use client'

import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react'

/**
 * What a live figure needs to know about where it is running, and nothing
 * else. Reusable by any figure that upgrades from a static poster.
 */

const subscribeMedia = (query: string) => (cb: () => void) => {
  const m = window.matchMedia(query)
  m.addEventListener('change', cb)
  return () => m.removeEventListener('change', cb)
}

/** The reader's reduced-motion setting, live. Server render assumes reduced,
 *  so nothing that moves is ever in the HTML. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMedia('(prefers-reduced-motion: reduce)'),
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => true,
  )
}

/** Changes whenever the reader's colour scheme does, for canvas colours. */
export function useColorScheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    subscribeMedia('(prefers-color-scheme: dark)'),
    () => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    () => 'light',
  )
}

/** Whether the element is on screen, with a margin so work starts just
 *  before it is needed. */
export function useInView(ref: RefObject<Element | null>, rootMargin = '200px'): boolean {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), { rootMargin })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, rootMargin])
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

/** Run once the browser is idle, or after a short timeout where it cannot say. */
export function whenIdle(fn: () => void): () => void {
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
