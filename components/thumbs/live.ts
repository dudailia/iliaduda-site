import { saveData, whenIdle } from '@/components/stage/env'
import { MiniClock } from '@/lib/minis/clock'
import { handOff } from '@/lib/minis/handoff'
import { palette, type Mini, type MiniPalette } from './paint'
import { MINIS } from './registry'

/**
 * The Contents' thumbnails come alive: each, once half of it is on screen and the page is idle, loads its paper's
 * miniature (./minis/), which draws the thumbnail's own picture on a canvas over it and then moves as its figure does,
 * the canvas crossfading in over 180ms on the ease-out. One moves at a time (the entry under the pointer or focus, else
 * the one nearest the screen's middle), on one clock (lib/minis/clock.ts): at most thirty frames a second, none while
 * the page is hidden. Reduced motion or save-data: the thumbnails
 * stay the build's pictures. Returns the stop.
 */
export interface Minis {
  stop(): void
  /** Hold every miniature where it is (Pause, WCAG 2.2.2), or let them go on. */
  pause(on: boolean): void
}

/** Starts the miniatures, or returns null where they do not run (reduced motion, save-data). */
export function start(paused: boolean, onStop: () => void = () => {}): Minis | null {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || saveData()) return null
  const clock = new MiniClock()
  type Live = { mini: Mini; cv: HTMLCanvasElement; g: CanvasRenderingContext2D; shown: boolean; frames: number; pad: number; ox: number; oy: number }
  const live = new Map<string, Live>()
  let pal: MiniPalette = palette()
  let raf = 0
  let gone = false
  const cancels: (() => void)[] = []

  /** The thumbnail's padding box (inside its 1px border), in CSS pixels: where the canvas and its picture go. */
  const boxOf = (l: Live) => {
    const a = l.cv.parentElement!
    const r = a.getBoundingClientRect()
    const bx = a.clientLeft, by = a.clientTop
    return { left: r.left + bx, top: r.top + by, width: r.width - 2 * bx, height: r.height - 2 * by }
  }
  /**
   * Draws a miniature at its time `t`. The canvas is laid on the device's own pixel grid (moved back by its box's
   * fraction of a device pixel, and sized in whole device pixels), so its bitmap is never resampled and draws as crisp
   * as the SVG under it; the picture is drawn where the SVG's is, inset by the thumbnail's padding and that fraction.
   */
  const drawAt = (l: Live, box: ReturnType<typeof boxOf>, t: number, dt: number) => {
    const dpr = Math.min(3, devicePixelRatio || 1)
    const ox = ((box.left * dpr) % 1) / dpr, oy = ((box.top * dpr) % 1) / dpr
    const W = Math.ceil((box.width + ox) * dpr), H = Math.ceil((box.height + oy) * dpr)
    if (l.cv.width !== W || l.cv.height !== H || l.ox !== ox || l.oy !== oy) {
      l.cv.width = W
      l.cv.height = H
      l.cv.style.width = `${W / dpr}px`
      l.cv.style.height = `${H / dpr}px`
      l.cv.style.transform = `translate(${-ox}px, ${-oy}px)`
      l.ox = ox
      l.oy = oy
    }
    l.g.setTransform(1, 0, 0, 1, 0, 0)
    l.g.clearRect(0, 0, W, H)
    l.g.setTransform(dpr, 0, 0, dpr, 0, 0)
    // The padding box painted paper (the canvas's sliver past it left clear, over the border).
    l.g.fillStyle = pal.paper
    l.g.fillRect(ox, oy, box.width, box.height)
    l.g.translate(ox + l.pad, oy + l.pad)
    l.mini.draw(l.g, box.width - 2 * l.pad, box.height - 2 * l.pad, t, dt, pal)
  }

  const frame = (now: number) => {
    raf = 0
    for (const [id, until] of leaving) {
      const l = live.get(id)
      if (!l || now > until || l.mini.atRest?.(clock.timeOf(id)) !== false) {
        clock.show(id, false)
        leaving.delete(id)
      }
    }
    // Every box measured first, then every canvas drawn: no layout read between two writes.
    const todo = clock.tick(now).flatMap((f) => {
      const l = live.get(f.id)
      return l ? [{ f, l, box: boxOf(l) }] : []
    })
    for (const { f, l, box } of todo) {
      drawAt(l, box, f.t, f.dt)
      // For the specs: frames drawn, and an engine mini's simulated time.
      l.cv.dataset.frames = String(++l.frames)
      const at = l.mini.time?.()
      if (at !== undefined) l.cv.dataset.t = at.toFixed(3)
      // Shown once its first frame is drawn: the thumbnail's own.
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
            // No size until its first frame lays it on the box: a canvas's own default (300 × 150) would stand past a
            // thumbnail that never became the one moving, and widen the page.
            cv.width = 0
            cv.height = 0
            cv.setAttribute('aria-hidden', 'true')
            cv.className = 'pointer-events-none absolute top-0 left-0 print:hidden opacity-0 transition-opacity duration-[180ms] ease-out'
            const g = cv.getContext('2d')
            if (!g) return
            a.append(cv)
            // The thumbnail's own padding (p-1.5, so it follows the reader's font size): where its picture starts.
            const pad = Number.parseFloat(getComputedStyle(a).paddingLeft) || 6
            const l: Live = { mini: make(svg), cv, g, shown: false, frames: 0, pad, ox: -1, oy: -1 }
            live.set(slug, l)
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
  /** Miniatures that lost their turn mid-glide, playing on to their next rest, with when they must stop by. */
  const leaving = new Map<string, number>()
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
    if (active) {
      // One caught mid-glide plays on to its next rest (600ms at most) rather than freezing half-way.
      const was = live.get(active)
      if (was?.mini.atRest && !was.mini.atRest(clock.timeOf(active))) leaving.set(active, performance.now() + 600)
      else clock.show(active, false)
    }
    active = next
    if (active) {
      leaving.delete(active)
      clock.show(active, true)
    }
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
    // Pointed at or focused; the pointer leaving the list, or the focus leaving it, hands back to whatever is still
    // there: the keyboard's focus keeps priority over a pointer gone, and a pointer over the list over focus gone.
    if (e.type === 'pointerleave') pointed = slugOf(list?.contains(document.activeElement) ? document.activeElement : null)
    else if (e.type === 'focusout') pointed = slugOf((e as FocusEvent).relatedTarget as Element | null) ?? slugOf(list?.querySelector('li:hover') ?? null)
    else pointed = slugOf(e.target as Element | null)
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
  list?.addEventListener('focusout', onPoint)
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
  // Leaving through the morph: a miniature that hands no moment to its paper steps back to its thumbnail at once (the
  // build's own picture, which the paper's figure opens on), so the morph never crosses a drum mid-swing, or a surface
  // mid-shock, into the same figure at rest. pageswap comes before the old page's picture is taken.
  const onSwap = (e: Event) => {
    if (!(e as Event & { viewTransition?: unknown }).viewTransition) return
    for (const l of live.values()) {
      if (!l.shown || l.mini.time || !l.cv.parentElement?.style.viewTransitionName) continue
      l.cv.style.transition = 'none'
      l.cv.style.opacity = '0'
    }
  }
  // Back to this page from the back-forward cache: the miniatures are where they were.
  const onShow = (e: PageTransitionEvent) => {
    if (!e.persisted) return
    for (const l of live.values())
      if (l.shown) {
        l.cv.style.opacity = '1'
        l.cv.style.transition = ''
      }
  }
  addEventListener('pageswap', onSwap)
  addEventListener('pageshow', onShow)
  // Reduced motion asked for mid-visit: the miniatures stop, and the thumbnails are the build's pictures again.
  const still = matchMedia('(prefers-reduced-motion: reduce)')
  const onStill = () => {
    if (still.matches) stop()
  }
  still.addEventListener('change', onStill)
  const scheme = matchMedia('(prefers-color-scheme: dark)')
  // A new colour scheme: every canvas steps back to the thumbnail under it (which follows the page's colours at once)
  // and crossfades in again on its next frame, drawn in the new palette.
  // A new colour scheme: every shown canvas is drawn again at once, where it was (its own time, no time passing), in
  // the new palette, so one held or paused keeps its frame and none shows the old scheme's paper.
  const onScheme = () => {
    pal = palette()
    for (const [id, l] of live) if (l.shown) drawAt(l, boxOf(l), clock.timeOf(id), 0)
    run()
  }
  scheme.addEventListener('change', onScheme)
  const stop = () => {
    if (gone) return
    gone = true
    onStop()
    cancelAnimationFrame(raf)
    io.disconnect()
    cancels.forEach((c) => c())
    document.removeEventListener('visibilitychange', onVis)
    document.removeEventListener('click', onClick, true)
    removeEventListener('pageswap', onSwap)
    removeEventListener('pageshow', onShow)
    removeEventListener('scroll', onScroll)
    list?.removeEventListener('pointerover', onPoint)
    list?.removeEventListener('focusin', onPoint)
    list?.removeEventListener('pointerleave', onPoint)
    list?.removeEventListener('focusout', onPoint)
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
