import { saveData, whenIdle } from '@/components/stage/env'
import { MiniClock } from '@/lib/minis/clock'
import { palette, type Mini, type MiniPalette } from './paint'
import { MINIS } from './registry'

/**
 * The Contents' thumbnails come alive: each, once half of it is on screen and the page is idle, loads its paper's
 * miniature (./minis/), which draws the thumbnail's own picture on a canvas over it and then moves as its figure does,
 * the canvas crossfading in over 180ms on the ease-out. One clock for all of them (lib/minis/clock.ts): at most thirty
 * frames a second, only those on screen, none while the page is hidden. Reduced motion or save-data: the thumbnails
 * stay the build's pictures. Returns the stop.
 */
export function start(): () => void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || saveData()) return () => {}
  const clock = new MiniClock()
  const live = new Map<string, { mini: Mini; cv: HTMLCanvasElement; g: CanvasRenderingContext2D; shown: boolean; frames: number }>()
  let pal: MiniPalette = palette()
  let raf = 0
  let gone = false
  const cancels: (() => void)[] = []

  const frame = (now: number) => {
    raf = 0
    for (const f of clock.tick(now)) {
      const l = live.get(f.id)
      if (!l) continue
      const r = l.cv.getBoundingClientRect()
      // At the screen's own density (to 3): a thumbnail is small, and a resampled one reads soft beside its text.
      const dpr = Math.min(3, devicePixelRatio || 1)
      const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr)
      if (l.cv.width !== W || l.cv.height !== H) {
        l.cv.width = W
        l.cv.height = H
      }
      l.g.setTransform(dpr, 0, 0, dpr, 0, 0)
      l.mini.draw(l.g, r.width, r.height, f.t, f.dt, pal)
      // For the specs: frames drawn.
      l.cv.dataset.frames = String(++l.frames)
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
            cv.className = 'pointer-events-none absolute inset-1.5 h-[calc(100%-0.75rem)] w-[calc(100%-0.75rem)] opacity-0 transition-opacity duration-[180ms] ease-out'
            const g = cv.getContext('2d')
            if (!g) return
            a.append(cv)
            live.set(slug, { mini: make(svg), cv, g, shown: false, frames: 0 })
            run()
          },
          () => {},
        )
      }),
    )
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const a = e.target as HTMLElement
        const slug = a.dataset.vtThumb?.replace(/^fig-/, '') ?? ''
        const on = e.isIntersecting && e.intersectionRatio >= 0.5
        clock.add(slug)
        clock.show(slug, on)
        if (on && !a.dataset.miniLoading) {
          a.dataset.miniLoading = '1'
          start(a, slug)
        }
      }
      run()
    },
    { threshold: [0, 0.5] },
  )
  document.querySelectorAll<HTMLElement>('[data-vt-contents] [data-vt-thumb]').forEach((a) => io.observe(a))
  const onVis = () => {
    clock.hide(document.hidden)
    run()
  }
  document.addEventListener('visibilitychange', onVis)
  const scheme = matchMedia('(prefers-color-scheme: dark)')
  const onScheme = () => (pal = palette())
  scheme.addEventListener('change', onScheme)
  return () => {
    gone = true
    cancelAnimationFrame(raf)
    io.disconnect()
    cancels.forEach((c) => c())
    document.removeEventListener('visibilitychange', onVis)
    scheme.removeEventListener('change', onScheme)
    for (const l of live.values()) l.cv.remove()
  }
}
