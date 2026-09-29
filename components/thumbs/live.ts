import { saveData, whenIdle } from '@/components/stage/env'
import { MiniClock } from '@/lib/minis/clock'
import { handOff } from '@/lib/minis/handoff'
import { palette, type Mini, type MiniPalette } from './paint'
import { MINIS } from './registry'

/**
 * The Contents' thumbnails come alive: each, once half of it is on screen and the page is idle, loads its paper's
 * miniature (./minis/), which draws the thumbnail's own picture on a canvas over it and then moves as its figure does,
 * the canvas crossfading in over 180ms on the ease-out. One clock for all of them (lib/minis/clock.ts): at most thirty
 * frames a second, only those on screen, none while the page is hidden. Reduced motion or save-data: the thumbnails
 * stay the build's pictures. Returns the stop.
 */
/** The thumbnail's padding (p-1.5), CSS pixels: where its picture starts inside the canvas. */
const PAD = 6

export interface Minis {
  stop(): void
  /** Hold every miniature where it is (Pause, WCAG 2.2.2), or let them go on. */
  pause(on: boolean): void
}

/** Starts the miniatures, or returns null where they do not run (reduced motion, save-data). */
export function start(paused: boolean): Minis | null {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || saveData()) return null
  const clock = new MiniClock()
  const live = new Map<string, { mini: Mini; cv: HTMLCanvasElement; g: CanvasRenderingContext2D; shown: boolean; frames: number; device: [number, number] | null }>()
  let pal: MiniPalette = palette()
  let raf = 0
  let gone = false
  const cancels: (() => void)[] = []

  const frame = (now: number) => {
    raf = 0
    // Every box measured first, then every canvas drawn: no layout read between two writes.
    const todo = clock.tick(now).flatMap((f) => {
      const l = live.get(f.id)
      return l ? [{ f, l, r: l.cv.getBoundingClientRect() }] : []
    })
    for (const { f, l, r } of todo) {
      // A backing store of the box's own device pixels, so the canvas is never resampled and draws as crisp as the SVG
      // under it; where the browser cannot say (Safari), the box times the screen's density (to 3), rounded.
      const dpr = Math.min(3, devicePixelRatio || 1)
      const [W, H] = l.device ?? [Math.round(r.width * dpr), Math.round(r.height * dpr)]
      if (l.cv.width !== W || l.cv.height !== H) {
        l.cv.width = W
        l.cv.height = H
      }
      // The canvas covers the thumbnail's padding too, so a dot at the picture's edge is whole; the picture itself is
      // drawn inset by the padding (6px), where the SVG's is, scaled by the backing store's own rounding so the first
      // frame registers with the thumbnail to the device pixel.
      l.g.setTransform(1, 0, 0, 1, 0, 0)
      l.g.clearRect(0, 0, W, H)
      l.g.setTransform(W / r.width, 0, 0, H / r.height, 0, 0)
      l.g.translate(PAD, PAD)
      l.mini.draw(l.g, r.width - 2 * PAD, r.height - 2 * PAD, f.t, f.dt, pal)
      // For the specs: frames drawn, and an engine mini's simulated time.
      l.cv.dataset.frames = String(++l.frames)
      const at = l.mini.time?.()
      if (at !== undefined) l.cv.dataset.t = at.toFixed(3)
      if (!l.shown && l.mini.ready()) {
        // Drawn its first frame, the thumbnail's own: now it shows.
        l.shown = true
        l.cv.style.opacity = '1'
        l.cv.dataset.shown = '1'
      }
    }
    run()
  }
  const run = () => {
    if (!raf && !gone && !clock.idle) raf = requestAnimationFrame(frame)
  }

  const start = (a: HTMLElement, slug: string) => {
    const svg = a.querySelector('svg')
    const load = MINIS[slug]
    if (!svg || !load) return
    cancels.push(
      whenIdle(() => {
        void load().then(
          ({ make }) => {
            if (gone) return
            const cv = document.createElement('canvas')
            cv.setAttribute('aria-hidden', 'true')
            cv.className = 'pointer-events-none absolute inset-0 print:hidden h-full w-full opacity-0 transition-opacity duration-[180ms] ease-out'
            const g = cv.getContext('2d')
            if (!g) return
            a.append(cv)
            const l = { mini: make(svg), cv, g, shown: false, frames: 0, device: null as [number, number] | null }
            live.set(slug, l)
            try {
              const ro = new ResizeObserver(([e]) => {
                const d = e?.devicePixelContentBoxSize?.[0]
                if (d) l.device = [d.inlineSize, d.blockSize]
              })
              ro.observe(cv, { box: 'device-pixel-content-box' })
              cancels.push(() => ro.disconnect())
            } catch {}
            choose()
            run()
          },
          () => {},
        )
      }),
    )
  }

  // One moves at a time, so the Contents stays calm: the entry under the pointer or the keyboard's focus, or else the
  // one on screen nearest its middle; the others hold the frame they were at.
  const onScreen = new Map<string, HTMLElement>()
  let pointed: string | null = null
  let active: string | null = null
  const choose = () => {
    // Only a miniature whose code is here runs its clock: its first frame is then its time zero, the thumbnail's.
    let next = pointed && onScreen.has(pointed) && live.has(pointed) ? pointed : null
    if (!next) {
      let best = Infinity
      for (const [slug, a] of onScreen) {
        if (!live.has(slug)) continue
        const r = a.getBoundingClientRect()
        const d = Math.abs(r.top + r.height / 2 - innerHeight / 2)
        if (d < best) {
          best = d
          next = slug
        }
      }
    }
    if (next === active) return
    if (active) clock.show(active, false)
    active = next
    if (active) clock.show(active, true)
    run()
  }
  let chooseQueued = false
  const onScroll = () => {
    if (chooseQueued) return
    chooseQueued = true
    requestAnimationFrame(() => {
      chooseQueued = false
      choose()
    })
  }
  const slugOf = (el: Element | null) =>
    el?.closest('[data-vt-contents] li')?.querySelector<HTMLElement>('[data-vt-thumb]')?.dataset.vtThumb?.replace(/^fig-/, '') ?? null
  const onPoint = (e: Event) => {
    pointed = slugOf(e.target as Element | null)
    choose()
  }
  const list = document.querySelector('[data-vt-contents]')
  // An entry the reader was already at when the miniatures started (focus, or a pointer resting on it).
  pointed = slugOf(document.activeElement) ?? slugOf(list?.querySelector('li:hover') ?? null)

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const a = e.target as HTMLElement
        const slug = a.dataset.vtThumb?.replace(/^fig-/, '') ?? ''
        clock.add(slug)
        if (e.isIntersecting) onScreen.set(slug, a)
        else onScreen.delete(slug)
        // Loaded once half of it is on screen.
        if (e.isIntersecting && e.intersectionRatio >= 0.5 && !a.dataset.miniLoading) {
          a.dataset.miniLoading = '1'
          start(a, slug)
        }
      }
      choose()
    },
    { threshold: [0, 0.5] },
  )
  document.querySelectorAll<HTMLElement>('[data-vt-contents] [data-vt-thumb]').forEach((a) => io.observe(a))
  addEventListener('scroll', onScroll, { passive: true })
  list?.addEventListener('pointerover', onPoint)
  list?.addEventListener('focusin', onPoint)
  list?.addEventListener('pointerleave', onPoint)
  let held = paused
  const onVis = () => {
    clock.hide(document.hidden || held)
    run()
  }
  clock.hide(held)
  document.addEventListener('visibilitychange', onVis)
  // Opening a paper from the Contents hands its miniature's market to the paper's figure (lib/minis/handoff.ts).
  const onClick = (e: MouseEvent) => {
    // As the morph's own click handler: a click that opens a new tab or window hands nothing to this one.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = (e.target as Element | null)?.closest?.('[data-vt-contents] a[href]')
    const slug = a?.closest('li')?.querySelector<HTMLElement>('[data-vt-thumb]')?.dataset.vtThumb?.replace(/^fig-/, '')
    const l = slug ? live.get(slug) : undefined
    const at = l?.shown ? l.mini.time?.() : undefined
    if (slug && at !== undefined) handOff(slug, at)
  }
  document.addEventListener('click', onClick, true)
  // Reduced motion asked for mid-visit: the miniatures stop, and the thumbnails are the build's pictures again.
  const still = matchMedia('(prefers-reduced-motion: reduce)')
  const onStill = () => {
    if (still.matches) stop()
  }
  still.addEventListener('change', onStill)
  const scheme = matchMedia('(prefers-color-scheme: dark)')
  // A new colour scheme: every canvas steps back to the thumbnail under it (which follows the page's colours at once)
  // and crossfades in again on its next frame, drawn in the new palette.
  const onScheme = () => {
    pal = palette()
    for (const l of live.values()) {
      l.shown = false
      l.cv.style.transition = 'none'
      l.cv.style.opacity = '0'
      delete l.cv.dataset.shown
      requestAnimationFrame(() => (l.cv.style.transition = ''))
    }
    run()
  }
  scheme.addEventListener('change', onScheme)
  const stop = () => {
    gone = true
    cancelAnimationFrame(raf)
    io.disconnect()
    cancels.forEach((c) => c())
    document.removeEventListener('visibilitychange', onVis)
    document.removeEventListener('click', onClick, true)
    removeEventListener('scroll', onScroll)
    list?.removeEventListener('pointerover', onPoint)
    list?.removeEventListener('focusin', onPoint)
    list?.removeEventListener('pointerleave', onPoint)
    scheme.removeEventListener('change', onScheme)
    still.removeEventListener('change', onStill)
    for (const l of live.values()) l.cv.remove()
  }
  return {
    stop,
    pause(on) {
      held = on
      onVis()
    },
  }
}
