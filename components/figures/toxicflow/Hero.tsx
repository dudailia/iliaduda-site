'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cssColor, useColorScheme, useInView, useReducedMotion, whenIdle } from '@/components/stage/env'
import { book, height, type Book } from '@/lib/toxicflow/hero'
import type { ReplayData } from '@/lib/toxicflow/replayShape'

/**
 * Behind the title: the replayed minute's book, quietly, one bar a level at its price, bids in the buy colour to the
 * mid's left and asks in the sell colour to its right, breathing from step to step, and each print a small ring at its
 * price as it trades. Played at a quarter of real time, so a step takes 400ms and the book swells and settles rather
 * than flickers, and looped. The minute loads once the page is idle (the chunk Fig. 1 loads too), and the canvas fades
 * in (240ms); the title never waits for it. It runs only while on screen, and Pause holds it for the rest of the visit
 * (WCAG 2.2.2). Under reduced motion it is one still frame, the minute's first step; with save-data it is not drawn.
 * Everything it draws is the minute's own data.
 */

const SPEED = 0.25
const PULSE_MS = 900
/** Frames at most a second: the backdrop breathes, it does not need the display's full rate. */
const FPS = 30

export function HeroBook({ label, still, children }: { label: string; still: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  const scheme = useColorScheme()
  const seen = useInView(box, '0px')
  const [data, setData] = useState<{ d: ReplayData; book: Book } | null>(null)
  const [live, setLive] = useState(false)
  const [paused, setPaused] = useState(false)
  const save = typeof navigator !== 'undefined' && (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true

  useEffect(() => {
    if (save) return
    let on = true
    const stop = whenIdle(() => {
      import('@/lib/toxicflow/replay')
        .then(({ replayData }) => {
          if (!on) return
          const d = replayData()
          setData({ d, book: book(d) })
        })
        .catch(() => {})
    })
    return () => {
      on = false
      stop()
    }
  }, [save])

  const clock = useRef(0)
  const run = !!data && seen && !paused && !reduced
  useEffect(() => {
    const c = canvas.current
    const el = box.current
    if (!data || !c || !el) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const { d, book: bk } = data
    const rgb = (name: string) => cssColor(name).map((v) => Math.round(v * 255)).join(',')
    const tone = { buy: rgb('--color-buy'), sell: rgb('--color-sell'), graphite: rgb('--color-graphite') }
    const rgba = (name: keyof typeof tone, a: number) => `rgba(${tone[name]},${a.toFixed(3)})`
    const dark = scheme === 'dark'
    const col = {
      buyFill: rgba('buy', dark ? 0.2 : 0.12),
      sellFill: rgba('sell', dark ? 0.2 : 0.12),
      buyLine: rgba('buy', dark ? 0.6 : 0.45),
      sellLine: rgba('sell', dark ? 0.6 : 0.45),
      mid: rgba('graphite', 0.35),
    }
    const qMax = Math.max(...d.trades.map((t) => t[2]))
    let w = 0
    let h = 0
    let base = 0
    let tall = 0
    let cx = 0
    let half = 0
    const size = () => {
      const r = el.getBoundingClientRect()
      const h1 = el.querySelector('h1')?.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = r.width
      h = r.height
      // The bars stand on a line just under the title and rise behind it.
      base = h1 ? h1.bottom - r.top + 4 : h * 0.6
      tall = h1 ? h1.height * 0.92 : base * 0.8
      // Centred under the title, as wide as its column.
      cx = h1 ? h1.left - r.left + h1.width / 2 : r.width / 2
      half = h1 ? h1.width / 2 + 24 : r.width / 2
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    size()
    const ro = new ResizeObserver(size)
    ro.observe(el)

    // A level's size at a price, by step: two steps blend by price, so a level that moves fades out where it was and in
    // where it goes, and one that stays grows or shrinks.
    const at = (levels: readonly (readonly [number, number])[], p: number) => levels.find((l) => l[0] === p)?.[1] ?? 0
    const draw = (ms: number) => {
      ctx.clearRect(0, 0, w, h)
      const t = ms % d.span
      let i = 0
      while (i + 1 < d.t.length && d.t[i + 1]! <= t) i++
      const j = Math.min(i + 1, d.t.length - 1)
      const span = (d.t[j] ?? d.span) - d.t[i]! || 1
      const raw = Math.min(1, Math.max(0, (t - d.t[i]!) / span))
      // Smoothstep: each step eases into the next.
      const f = raw * raw * (3 - 2 * raw)
      const mid = bk.mids[i]! + (bk.mids[j]! - bk.mids[i]!) * f
      const scale = (half / bk.reach) * 0.94
      const bar = Math.max(2, Math.min(scale * 0.62, 26))
      for (const [side, a, b] of [
        ['buy', d.bids[i]!, d.bids[j]!],
        ['sell', d.asks[i]!, d.asks[j]!],
      ] as const) {
        const prices = new Set([...a.map((l) => l[0]), ...b.map((l) => l[0])])
        for (const p of prices) {
          const q = at(a, p) + (at(b, p) - at(a, p)) * f
          const y = tall * height(q, bk)
          if (y < 0.5) continue
          const x = cx + (p - mid) * scale - bar / 2
          ctx.fillStyle = side === 'buy' ? col.buyFill : col.sellFill
          ctx.fillRect(x, base - y, bar, y)
          ctx.fillStyle = side === 'buy' ? col.buyLine : col.sellLine
          ctx.fillRect(x, base - y, bar, 1)
        }
      }
      ctx.fillStyle = col.mid
      ctx.fillRect(cx - 0.5, base - tall, 1, tall)
      // The prints of the last moment, each a ring growing from its price on the baseline as it fades.
      for (const [tt, p, q, side] of d.trades) {
        const age = (t - tt) / SPEED
        if (age < 0 || age > PULSE_MS) continue
        const k = age / PULSE_MS
        const x = cx + (p - mid) * scale
        const r = 2 + (4 + 10 * Math.sqrt(q / qMax)) * (1 - (1 - k) * (1 - k))
        ctx.beginPath()
        ctx.arc(x, base, r, 0, Math.PI * 2)
        ctx.strokeStyle = rgba(side > 0 ? 'buy' : 'sell', 0.6 * (1 - k))
        ctx.lineWidth = 1.25
        ctx.stroke()
      }
    }

    let raf = 0
    let last = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (now - last < 1000 / FPS - 2) return
      const dt = last ? Math.min(now - last, 100) : 0
      last = now
      clock.current += dt * SPEED
      draw(clock.current)
      if (!live) setLive(true)
    }
    if (run) raf = requestAnimationFrame(tick)
    else {
      draw(clock.current)
      // The still frame is on the canvas: show it, a frame later.
      if (reduced) raf = requestAnimationFrame(() => setLive(true))
    }
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
    // `live` only turns on once; leaving it out keeps the loop from restarting for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, run, reduced, scheme])

  return (
    <div ref={box} className="relative isolate">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <canvas ref={canvas} className="absolute inset-0 h-full w-full transition-opacity duration-[240ms] ease-out" style={{ opacity: live ? 1 : 0 }} />
      </div>
      <p className="text-meta absolute top-3 right-0 z-10 flex items-center gap-3 font-mono text-graphite lg:top-4">
        {save ? null : <span>{reduced ? still : label}</span>}
        {!reduced && !save ? (
          <button
            type="button"
            className="relative underline decoration-1 underline-offset-[0.22em] pointer-coarse:before:absolute pointer-coarse:before:-inset-3 pointer-coarse:before:content-['']"
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? 'Play' : 'Pause'}
          </button>
        ) : null}
      </p>
      {children}
    </div>
  )
}
