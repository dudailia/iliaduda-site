'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { FigureFrame, Readouts } from '@/components/FigureFrame'
import { marketRates } from '@/components/market/stats'
import { useMarket } from '@/components/market/useMarket'
import { CONTROL } from '@/components/stage/controls'
import { saveData, supportsWebGL2, useColorScheme } from '@/components/stage/env'
import { DebugSlot } from '@/components/stage/DebugSlot'
import { FocusRing } from '@/components/stage/FocusRing'
import { DECLINED_TEXT, useFallback } from '@/components/stage/useFallback'
import { useLean } from '@/components/stage/useLean'
import { useSignature } from '@/components/stage/useSignature'
import { fade, palette as stagePalette, underlay, useStage, type Create, type Palette } from '@/components/stage/useStage'
import { syntheticValue } from '@/content/synthetic'
import type { Mirror } from '@/lib/market/mirror'
import type { LiveInfo } from '@/lib/stage/debug'
import { MARKET_SEQ, marketSequence, punch, storyOf } from '@/lib/market/sequence'
import { FAN_RANGE, logTicks, priceTicks, SPAN, WINDOW } from '@/lib/market/views'
import { params } from '@/lib/surface/shock'
import { iv, type Params } from '@/lib/surface/ssvi'
import { LABELS, WIDE_QUERY, type FrameKind } from '@/lib/surface/view'
import { AxisLabel } from '../surface/marks'
import type { Hooks, SurfaceRenderer } from '../surface/renderer'
import type { BookView, FanView, Landing } from './draw'

/** The flat views' drawers load with the market, never before it runs (./draw.ts). */
type Draw = typeof import('./draw')

/**
 * /market's Fig. 1, live: one simulated market drawn three ways in the same frame — its vol surface in 3D (the IV
 * paper's renderer, its shock set by the market's stress), its order book as a heat strip of the last twenty seconds,
 * and a year of futures from its price. The market runs in a worker (components/market/useMarket.ts); every view
 * draws from the page's copy of it, and a liquidity shock lands in all three in the frame it arrives.
 *
 * Until the market's first frame the posters stand, the server's frames of the same seeded market at the same moment;
 * then each view crossfades to its canvas. Readouts are written straight into the DOM, a few times a second.
 *
 * On a first visit the page tells the shock once (lib/market/sequence.ts): 2.5 seconds of calm, the three views live
 * and linked; then it presses Liquidity shock itself, and the shock lands in all three in the frame it arrives —
 * the book's sweep run down the levels it took, the fan's paths lit, the surface struck, its one-month smile lit —
 * and the model's own recovery follows, told in a line on the stage.
 */

type Story = 'calm' | 'shock' | 'recovery' | 'running' | 'paused' | 'absorbing'
/** What the line between the views says: the story while it plays, then the market's state. `short` is a phone's. */
const STORY: Record<Story, { name: string; text: string; short: string }> = {
  calm: { name: 'Calm', text: 'One market, drawn three ways as it runs.', short: 'One market, three views.' },
  shock: { name: 'A liquidity shock', text: 'A sell takes every bid within twenty ticks, and sellers pile in.', short: 'The bids are swept.' },
  recovery: { name: 'Recovery', text: 'The model’s own: the book refills in seconds, the volatility in minutes.', short: 'The model’s own.' },
  running: { name: 'Running', text: 'Live, at real time.', short: 'Live.' },
  paused: { name: 'Paused', text: 'The market holds where it is.', short: 'Held.' },
  absorbing: { name: 'Absorbing a shock', text: 'A press now tops it up to one whole shock.', short: 'A press tops it up.' },
}

export interface MarketInitial {
  t: number
  mid: number
  spread: number
  sigma: number
  stress: number
  rate: number
  expected: number
  lo: number
  hi: number
}

const TICK = syntheticValue('mkTick')
const usd = (ticks: number) => `$${(ticks * TICK).toFixed(2)}`
const dollars = (x: number) => `$${x < 10 ? x.toFixed(2) : Math.round(x).toLocaleString('en-US')}`
const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const atmOf = (s: number) => iv(params(Math.min(1, Math.max(0, s))), 0, 1 / 12)
const STAGE_OPTS = { maxQ: { mid: 3 } } as const
/** Pause is remembered for the visit, as every figure's is. */
const PAUSED = 'market-paused'
const noop = () => () => {}

type Mod = typeof import('../surface/renderer')

type Posters = { surface: ReactNode; book: ReactNode; fan: ReactNode }

export function MarketLive({
  posters: stills,
  initial: initials,
  stillAfter,
  hashes,
  seed,
  t0,
  title,
  subtitle,
  caption,
  table,
}: {
  /** The still frames: calm, where the live figure starts, and `stillAfter` seconds after a shock. */
  posters: { calm: Posters; shock: Posters }
  initial: { calm: MarketInitial; shock: MarketInitial }
  stillAfter: number
  /** The market's hash where the figure opens, and after the shock ?debug=1 checks (lib/market/host.ts), from Node. */
  hashes: { start: string; shocked: string }
  seed: number
  t0: number
  title: string
  subtitle: string
  caption: ReactNode
  table: ReactNode
}) {
  const stage = useRef<HTMLDivElement>(null)
  // Where the market does not run live, Liquidity shock swaps the calm still frames for the shocked ones, and back.
  const [still, setStill] = useState<'calm' | 'shock'>('calm')
  const posters = stills[still]
  const initial = initials[still]
  const bookCv = useRef<HTMLCanvasElement>(null)
  const fanCv = useRef<HTMLCanvasElement>(null)
  const views = useRef<{ book: BookView; fan: FanView } | null>(null)
  const drawMod = useRef<Promise<Draw> | null>(null)
  const out = useRef<Record<string, HTMLElement | null>>({})
  const priceEls = useRef<(HTMLElement | null)[]>([])
  const fanEls = useRef<(HTMLElement | null)[]>([])
  const labelEls = useRef<(HTMLElement | null)[]>([])
  const labelLayer = useRef<HTMLDivElement>(null)
  const hoverEl = useRef<HTMLSpanElement>(null)
  const landing = useRef<Landing | null>(null)
  const seenLanding = useRef(-1)
  /** A landed shock's blow for the surface, and when it landed: taken if drawn within a quarter second, else let go. */
  const impact = useRef({ k: 0, at: 0 })
  const lastLoad = useRef(0)
  const [paused, setPaused] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && sessionStorage.getItem(PAUSED) === '1'
    } catch {
      return false
    }
  })
  const pausedRef = useRef(paused)
  const [flat, setFlat] = useState(false)
  // Live once both flat views have drawn a frame, so no view's words arrive before its picture.
  const drewOnce = useRef({ book: false, fan: false })
  // The book's picture as it was when the market started over, fading out over the new one.
  const ghostCv = useRef<HTMLCanvasElement>(null)
  const lastQuanta = useRef(0)
  const mirrorRef = useRef<Mirror | null>(null)
  /** The moment the reader points at in the book, in simulated seconds, and what the market was then. */
  const pointed = useRef<{ t: number; stress: number; sigma: number; mid: number } | null>(null)
  // The signature: the story's clock, whether it has pressed its shock, and the camera's blow.
  const seq = useRef(marketSequence())
  const storyPressed = useRef(false)
  const marketRef = useRef<{ act(a: 'shock'): void } | null>(null)
  const blow = useRef({ at: -Infinity, k: 0 })
  const allLive = useRef(false)
  /** The next drawn frame is the landing's: the flat views stamp it, for the specs (the surface stamps its own). */
  const stampLanding = useRef(false)
  const storyRef = useRef<Story | null>(null)
  const [story, setStory] = useState<Story | null>(null)
  const [said, setSaid] = useState<Story | null>(null)
  const [going, setGoing] = useState(false)
  if (story !== said && !going) {
    if (said && story) setGoing(true)
    else setSaid(story)
  }
  useEffect(() => {
    if (!going) return
    const t = setTimeout(() => {
      setSaid(storyRef.current)
      setGoing(false)
    }, 120)
    return () => clearTimeout(t)
  }, [going])
  const scheme = useColorScheme()
  const pal = useRef<Palette | null>(null)
  useEffect(() => {
    pal.current = stagePalette(scheme === 'dark')
  }, [scheme])
  const kind = useSyncExternalStore(
    (cb) => {
      const q = matchMedia(WIDE_QUERY)
      q.addEventListener('change', cb)
      return () => q.removeEventListener('change', cb)
    },
    (): FrameKind => (matchMedia(WIDE_QUERY).matches ? 'wide' : 'tall'),
    (): FrameKind => 'wide',
  )
  const kindRef = useRef(kind)
  useEffect(() => {
    kindRef.current = kind
  }, [kind])

  const write = useCallback((id: string, text: string) => {
    for (const k of [id, `${id}-m`]) {
      const el = out.current[k]
      if (el && el.textContent !== text) el.textContent = text
    }
  }, [])

  // ── the surface: the IV paper's renderer, its shock the market's stress ────────────────────────────────────────
  const leanApi = useRef<{ lean: { current: { x: number; y: number } } } | null>(null)
  const fallbackApi = useRef<{ fail(why: 'load' | 'error'): void; watch(): () => void } | null>(null)
  const create: Create = useCallback((env) => {
    let mod: Mod | null = null
    let inner: SurfaceRenderer | null = null
    let size: [number, number, number, number] | null = null
    let q = 2
    let p: Palette = env.palette
    let dead = false
    let broken = false
    const fail = (why: 'load' | 'error') => {
      if (dead || broken) return
      broken = true
      fallbackApi.current?.fail(why)
    }
    const unwatch = fallbackApi.current?.watch()
    void import('../surface/renderer').then(
      (m) => (mod = m),
      () => fail('load'),
    )
    const hooks: Hooks = {
      sim: { probe: { k: 0, T: 0.25 }, hover: null, dirty: true },
      frame: () => kindRef.current,
      sequence: () => null,
      playing: () => false,
      shown: () => 0,
      tick: () => {},
      // The stress now, or at the moment the reader points at in the book.
      level: () => Math.min(1, Math.max(0, pointed.current?.stress ?? mirrorRef.current?.h.stress ?? 0)),
      paused: () => pausedRef.current,
      lean: () => leanApi.current?.lean.current ?? { x: 0, y: 0 },
      onPin: () => {},
      labels: () => labelEls.current,
      labelLayer: () => labelLayer.current,
      notes: () => [],
      dot: () => null,
      tag: () => null,
      pinned: () => false,
      sync: (_p: Params, shown: number) => {
        void shown
      },
      // A blow the surface was not drawn in time to take (it was off screen) is let go, never struck late.
      impact: () => {
        const { k, at } = impact.current
        impact.current = { k: 0, at: 0 }
        return k > 0 && performance.now() - at < 250 ? k : 0
      },
      reading: () => false,
      zoom: () => 1 - MARKET_SEQ.punch.depth * blow.current.k * punch((performance.now() - blow.current.at) / 1000),
    }
    return {
      frame(t, dt) {
        if (broken) return null
        if (dead) return false
        try {
          // The surface waits for the market: its first frame is the market's.
          if (!inner) {
            if (!mod || !mirrorRef.current?.frames) return false
            inner = mod.make({ ...env, palette: p }, hooks)
            if (size) inner.resize(...size)
            inner.setQuality?.(q)
          }
          return inner.frame(t, dt)
        } catch (e) {
          console.warn('the surface stopped', e)
          fail('error')
          return null
        }
      },
      resize(...a) {
        size = a
        inner?.resize(...a)
      },
      setQuality(l) {
        q = l
        inner?.setQuality?.(l)
      },
      setPalette(np) {
        p = np
        inner?.setPalette?.(np)
      },
      dispose() {
        dead = true
        unwatch?.()
        inner?.dispose()
      },
    }
  }, [])

  const { box, canvas, live: surfaceLive, eligible, reduced, tier, quality, fps } = useStage(create, STAGE_OPTS)
  // The story waits for most of the stage to be in view, so the shock lands where all three views can be seen.
  const sig = useSignature('market', stage, seq, { start: 0.75, hold: 0.5 })
  const sigRef = useRef(sig)
  const lean = useLean(surfaceLive, reduced, pausedRef)
  const fallback = useFallback(canvas, surfaceLive, () => {})
  useEffect(() => {
    leanApi.current = lean
    fallbackApi.current = fallback
    sigRef.current = sig
  })
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  // The market runs wherever the surface will not be drawn by a CPU (the software tier, as Lighthouse runs, keeps the
  // still frames), and where there is no WebGL2 at all, for the flat views.
  const allowed = mounted && !saveData() && (tier !== null ? tier !== 'software' : !supportsWebGL2())

  // ── the flat views, drawn in the market's own frame ────────────────────────────────────────────────────────────
  const lastDraw = useRef(0)
  const lastText = useRef(0)
  const framesAt = useRef({ at: 0, n: 0, rate: 0 })
  const draw = useCallback(
    (m: Mirror, now: number) => {
      mirrorRef.current = m
      const p = pal.current
      if (!p) return
      // The drawers arrive with the market's first frames; until they are here the still frames stand.
      if (!views.current) {
        const bc = bookCv.current, fc = fanCv.current
        if (bc && fc && !drawMod.current)
          drawMod.current = import('./draw').then((d) => {
            views.current = { book: new d.BookView(bc), fan: new d.FanView(fc) }
            return d
          })
        return
      }
      const v = views.current
      // On a phone the flat views run to the screen's edges, and their words keep the page's margin (1.5rem).
      v.book.inset = v.fan.inset = kindRef.current === 'tall' ? 24 : 0
      const dt = lastDraw.current ? Math.min(0.1, (now - lastDraw.current) / 1000) : 1 / 60
      lastDraw.current = now
      const stateOf = (mm: Mirror): Story => (mm.h.absorbing ? 'absorbing' : pausedRef.current ? 'paused' : 'running')
      const tell = (next: Story) => {
        if (next === storyRef.current) return
        storyRef.current = next
        setStory(next)
      }

      if (stampLanding.current) {
        stampLanding.current = false
        const at = String(document.timeline?.currentTime ?? now)
        if (bookCv.current) bookCv.current.dataset.landed = at
        if (fanCv.current) fanCv.current.dataset.landed = at
      }

      // The story, on the frames all three views draw; held while the market is.
      const sg = sigRef.current
      if (sg.armed.current && allLive.current) {
        if (!pausedRef.current) seq.current.advance(dt * 1000)
        sg.onFrame()
        const ph = seq.current.phases()
        if (ph.land > 0 && !storyPressed.current) {
          storyPressed.current = true
          marketRef.current?.act('shock')
        }
        if (seq.current.started && !seq.current.done) tell(storyOf(ph))
        else tell(stateOf(m))
      } else tell(stateOf(m))

      // The market started over (Reset): the new strip opens under the old, which fades (240ms, the ease-out).
      if (m.h.quanta < lastQuanta.current) {
        v.book.restart()
        const g = ghostCv.current
        if (g) {
          g.style.transition = 'none'
          g.style.opacity = '1'
          requestAnimationFrame(() => {
            g.style.transition = 'opacity 240ms var(--ease-out)'
            g.style.opacity = '0'
          })
        }
      }
      lastQuanta.current = m.h.quanta
      v.fan.as = pointed.current?.sigma ?? null
      if (v.book.draw(m, p, now, landing.current, dt)) drewOnce.current.book = true
      if (v.fan.draw(m, p, now, landing.current, dt)) drewOnce.current.fan = true
      if (!flat && drewOnce.current.book && drewOnce.current.fan) setFlat(true)

      // The book's words: prices up its side, where the window has them now.
      const lay = v.book.layout()
      const ticks = priceTicks(lay.centre - WINDOW.half, lay.centre + WINDOW.half)
      priceEls.current.forEach((el, i) => {
        if (!el) return
        const p0 = ticks[i]
        if (p0 === undefined) {
          el.style.opacity = '0'
          return
        }
        const y = lay.y(p0)
        // A label that would hang off the strip's edge is not shown.
        if (y < 8 || y > lay.h - 8) {
          el.style.opacity = '0'
          return
        }
        const text = usd(p0)
        if (el.textContent !== text) el.textContent = text
        el.style.opacity = '1'
        el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) translateY(-50%)`
      })
      // The fan's: a year's prices at halvings and doublings of $100, where they fall from the price now.
      const mid$ = m.h.mid * TICK
      const fl = v.fan.layout()
      const marks = logTicks(mid$, FAN_RANGE.lo, FAN_RANGE.hi)
      fanEls.current.forEach((el, i) => {
        if (!el) return
        const d = marks[i]
        if (d === undefined) {
          el.style.opacity = '0'
          return
        }
        const text = dollars(d)
        if (el.textContent !== text) el.textContent = text
        el.style.opacity = '1'
        el.style.transform = `translate3d(0, ${fl.y(d / mid$).toFixed(1)}px, 0) translateY(-50%)`
      })

      // Readouts, ten times a second.
      if (now - lastText.current > 100) {
        lastText.current = now
        const h = m.h
        write('time', clock(h.t))
        write('mid', usd(h.mid))
        write('spread', `${h.spread} ${h.spread === 1 ? 'tick' : 'ticks'}`)
        write('sigma', pct(h.sigma))
        write('stress', h.stress.toFixed(2))
        write('atm', pct(atmOf(h.stress)))
        write('range', `${dollars(v.fan.band(0, 64) * mid$)}–${dollars(v.fan.band(4, 64) * mid$)}`)
        write('rate', `${h.rate.toFixed(1)} a second`)
        write('paths', h.paths > 0 ? `${Math.round(h.paths / 1000).toLocaleString('en-US')},000 a second` : '—')
        write('headroom', h.busy > 0 ? `×${Math.round(1 / h.busy).toLocaleString('en-US')} real time` : '—')
        write('state', h.absorbing ? 'absorbing a shock' : h.paused ? 'paused' : 'running')
        // For the specs: the market's own clock.
        if (stage.current) {
          stage.current.dataset.marketT = h.t.toFixed(3)
          stage.current.dataset.marketHeld = h.held.toFixed(3)
        }
        // Frames taken from the worker in the last wall second, for Fig. 2.
        const fa = framesAt.current
        if (now - fa.at >= 1000) {
          fa.rate = fa.at ? ((m.frames - fa.n) * 1000) / (now - fa.at) : 0
          fa.at = now
          fa.n = m.frames
        }
        marketRates.set({ rate: h.rate, expected: h.expected, frames: fa.rate, paths: h.paths, busy: h.busy, held: h.held })
      }
    },
    [flat, write],
  )

  // A shock has landed in the frame just taken: every view takes it in the next animation frame, whichever of their
  // loops runs first in it (the surface's own, or the market's), since each reads it there.
  const onTake = useCallback((m: Mirror) => {
    mirrorRef.current = m
    if (m.landedSeq !== seenLanding.current && m.landedSeq >= 0) {
      seenLanding.current = m.landedSeq
      let hi = -Infinity, lo = Infinity
      for (let a = 0; a < m.tradeCount; a++) {
        const tr = m.trade(a)
        if (tr.t < m.landedT) break
        if (tr.t === m.landedT) {
          hi = Math.max(hi, tr.price)
          lo = Math.min(lo, tr.price)
        }
      }
      const at = performance.now()
      if (hi >= lo) landing.current = { at, t: m.landedT, hi, lo }
      const k = Math.min(1, Math.max(0.25, m.h.load - lastLoad.current * 0.9))
      impact.current = { k, at }
      blow.current = { at, k }
      stampLanding.current = true
    }
    lastLoad.current = m.h.load
  }, [])
  // The market runs while Fig. 1 or Fig. 2, which reports on it, is on screen.
  const follow = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    follow.current = document.querySelector<HTMLElement>('[data-market-follow]')
  }, [])
  const market = useMarket([stage, follow], { seed, t: t0, allowed, draw, onTake })
  useEffect(() => {
    marketRef.current = market
    allLive.current = market.live && flat && (surfaceLive || !eligible)
  })

  // Readouts start as the posters' frame: the same numbers, computed on the server.
  useEffect(() => {
    write('time', clock(initial.t))
    write('mid', usd(initial.mid))
    write('spread', `${initial.spread} ${initial.spread === 1 ? 'tick' : 'ticks'}`)
    write('sigma', pct(initial.sigma))
    write('stress', initial.stress.toFixed(2))
    write('atm', pct(atmOf(initial.stress)))
    write('range', `${dollars(initial.lo)}–${dollars(initial.hi)}`)
    write('rate', `${initial.rate.toFixed(1)} a second`)
    write('paths', '—')
    write('headroom', '—')
    write('state', 'still')
  }, [initial, write])

  // ── the reader: pointing at a moment in the book shows the market as it was then ───────────────────────────────
  const onBookMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const v = views.current, m = mirrorRef.current
    if (!v || !m || e.pointerType === 'touch') return
    const r = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - r.left
    const lay = v.book.layout()
    if (x >= lay.x1 || !m.history.length) return onBookLeave()
    const t = m.h.t - ((lay.x1 - x) / lay.x1) * SPAN
    const hist = m.history
    let k = hist.length - 1
    while (k > 0 && hist.t(k) > t) k--
    pointed.current = { t, stress: hist.stress(k), sigma: hist.sigma(k), mid: hist.mid(k) }
    v.book.hover = x
    if (hoverEl.current) {
      hoverEl.current.textContent = `${(m.h.t - t).toFixed(1)} s ago · realised vol ${pct(hist.sigma(k))} · stress ${hist.stress(k).toFixed(2)}`
      hoverEl.current.style.opacity = '1'
    }
  }
  const onBookLeave = () => {
    pointed.current = null
    if (views.current) views.current.book.hover = null
    if (hoverEl.current) hoverEl.current.style.opacity = '0'
  }

  const setPause = (next: boolean) => {
    pausedRef.current = next
    setPaused(next)
    if (next) market.pause()
    else market.resume()
    try {
      sessionStorage.setItem(PAUSED, next ? '1' : '0')
    } catch {}
  }
  const togglePause = () => setPause(!pausedRef.current)
  // A market paused on an earlier page of the visit opens paused.
  const pauseOnce = useRef(false)
  useEffect(() => {
    if (pauseOnce.current) return
    pauseOnce.current = true
    if (pausedRef.current) market.pause()
  }, [market])

  // The reader's shock. Pressed while the story is still calm, it is the story's shock: the story does not press again.
  // Pressed while paused, the market goes on, so the shock lands where it can be seen.
  const shockNow = () => {
    if (!storyPressed.current) {
      storyPressed.current = true
      if (sig.armed.current && !seq.current.done) seq.current.finish()
    }
    if (pausedRef.current) setPause(false)
    market.act('shock')
  }
  const resetNow = () => {
    if (sig.armed.current) sig.release()
    storyPressed.current = true
    // The book's picture now, to fade out over the new market's first.
    const g = ghostCv.current, b = bookCv.current
    if (g && b) {
      g.width = b.width
      g.height = b.height
      g.getContext('2d')?.drawImage(b, 0, 0)
      g.style.transition = 'none'
      g.style.opacity = '1'
    }
    market.reset()
  }

  // The still frames' shock: its pictures fetched on the reader's approach (hover or focus), and swapped in only once
  // they can be drawn, so the figure never shows bare paper between the two.
  const shockStills = useRef<Promise<unknown> | null>(null)
  const fetchShock = () =>
    (shockStills.current ??= Promise.all(
      ['book', 'ladder', 'fan', matchMedia(WIDE_QUERY).matches ? 'surface' : 'surface-tall'].map((f) => {
        const img = new Image()
        img.src = `/market/${f}-shock.svg`
        return img.decode().catch(() => {})
      }),
    ))
  const toggleStill = () => {
    if (still === 'shock') return setStill('calm')
    void fetchShock().then(() => setStill('shock'))
  }

  const why = !mounted
    ? null
    : reduced
      ? 'Still frames: your system asks for reduced motion.'
      : fallback.declined
        ? DECLINED_TEXT[fallback.declined]
        : market.declined === 'save-data' || saveData()
          ? 'Still frames: your browser asks to save data.'
          : tier === 'software'
            ? 'Still frames: this device draws with its processor, not a graphics chip, so the market is not run here.'
            : !eligible && !supportsWebGL2()
              ? 'This browser has no WebGL2: the book and the futures are live, the surface a still frame.'
              : null
  const live = market.live && flat

  // ?debug=1 (DebugSlot): the shared report, and whether this browser runs the market Node does — where the figure
  // opens, and after a shock — worked out once, the first time the panel reads, in a worker of its own (the market's
  // own script), so it is checked in any browser, whether or not the figure runs live there.
  const checked = useRef<{ start: string | null; shocked: string | null }>({ start: null, shocked: null })
  const checking = useRef(false)
  const debugInfo = useRef<() => LiveInfo>(null)
  useEffect(() => {
    debugInfo.current = () => {
      if (!checking.current) {
        checking.current = true
        try {
          const w = new Worker(new URL('../../../lib/market/market.worker.ts', import.meta.url), { type: 'module' })
          w.onmessage = (e: MessageEvent<{ kind: string; hash?: string }>) => {
            if (e.data?.kind === 'ready') {
              checked.current.start = e.data.hash ?? null
              w.postMessage({ kind: 'check', seed, t: t0 })
            } else if (e.data?.kind === 'check') {
              checked.current.shocked = e.data.hash ?? null
              w.terminate()
            }
          }
          w.onerror = (ev) => {
            ev.preventDefault()
            w.terminate()
          }
          w.postMessage({ kind: 'start', seed, t: t0 })
        } catch {}
      }
      const st = stage.current?.getBoundingClientRect()
      const cv = canvas.current
      const same = (got: string | null, want: string) => (got === null ? 'computing…' : got === want ? `same as Node · ${got}` : `not the same as Node (${want}) · ${got}`)
      const m = mirrorRef.current
      return {
        state: live ? 'live' : why ? 'declined' : mounted ? 'starting' : 'server',
        reason: why,
        tier,
        quality,
        fps,
        dpr: window.devicePixelRatio,
        stage: [st?.width ?? 0, st?.height ?? 0],
        canvas: surfaceLive && cv ? [cv.width, cv.height] : null,
        seq: paused ? `${sig.state} · paused` : sig.state,
        reduced,
        saveData: saveData(),
        ua: navigator.userAgent,
        renderer: {
          market: same(checked.current.start, hashes.start),
          'shocked market': same(checked.current.shocked, hashes.shocked),
          ...(m ? { 'simulated time': `${m.h.t.toFixed(1)} s · ${m.frames} frames · held ${m.h.held.toFixed(1)} s` } : {}),
        },
      }
    }
  })
  const readDebug = useCallback((): LiveInfo => debugInfo.current!(), [])
  // A figure that will not go live here shows its still frames at once, and spends no story.
  const release = sig.release
  useEffect(() => {
    if (why) release()
  }, [why, release])

  const rows = [
    { label: 'Simulated time', value: <span ref={(el) => void (out.current.time = el)} /> },
    { label: 'Price', value: <span ref={(el) => void (out.current.mid = el)} /> },
    { label: 'Spread', value: <span ref={(el) => void (out.current.spread = el)} /> },
    { label: 'Realised volatility', value: <span ref={(el) => void (out.current.sigma = el)} /> },
    { label: 'Stress, 0 to 1', value: <span ref={(el) => void (out.current.stress = el)} /> },
    { label: '1-month vol, at the money', value: <span ref={(el) => void (out.current.atm = el)} /> },
    { label: 'A year out, 5% to 95%', value: <span ref={(el) => void (out.current.range = el)} /> },
    { label: 'Events', value: <span ref={(el) => void (out.current.rate = el)} /> },
    { label: 'Futures drawn', value: <span ref={(el) => void (out.current.paths = el)} /> },
    { label: 'Headroom', value: <span ref={(el) => void (out.current.headroom = el)} /> },
  ]
  // Below the stage on a phone: the seven that tell the story, in labels short enough for two columns.
  const SHORT: Record<string, string> = { sigma: 'Realised vol', atm: 'ATM vol, 1 month', range: 'In a year, 5–95%' }
  const rowsBelow = (['time', 'mid', 'spread', 'sigma', 'stress', 'atm', 'range'] as const).map((id, i) => ({
    label: SHORT[id] ?? rows[i]!.label,
    value: <span ref={(el) => void (out.current[`${id}-m`] = el)} />,
  }))

  return (
    <FigureFrame
      id="fig-1"
      number="Fig. 1"
      title={title}
      subtitle={subtitle}
      vt="market"
      railBelow={false}
      rail={<Readouts rows={rows} />}
      hint={
        <>
          {why
            ? `${why} Liquidity shock shows the same market ${stillAfter === 1 ? 'a second' : `${stillAfter} seconds`} after one.`
            : 'Press Liquidity shock to hit the market; point at a moment in the book to see the market as it was then.'}{' '}
          <span className="sr-only" aria-live="polite" ref={(el) => void (out.current.state = el)} />
        </>
      }
      caption={caption}
      table={table}
    >
      <div ref={stage} className="relative" data-market-stage="" data-market-live={live ? '1' : '0'}>
        {/* The surface: the market's stress sets its shock. */}
        <div className="-mx-6 sm:mx-0">
          {/* The surface leans with the reader, as every 3D figure does: toward a fine pointer, with a phone's tilt (iOS
              asks on the first tap). */}
          <div
            ref={box}
            className="relative aspect-[1.1] w-full overflow-hidden bg-paper sm:aspect-[1.62]"
            data-market-surface=""
            onPointerMove={lean.onPointerMove}
            onPointerLeave={lean.onPointerLeave}
            onClick={() => lean.onTap()}
          >
            <div style={underlay(surfaceLive)}>{posters.surface}</div>
            <canvas ref={canvas} data-live-canvas="" className="absolute inset-0 h-full w-full" style={fade(surfaceLive)} aria-hidden="true" />
            {/* The axes' words, placed by the renderer each frame with its own projection (the IV figure's). */}
            <div aria-hidden className="pointer-events-none absolute inset-0" style={fade(surfaceLive)}>
              <div ref={labelLayer}>
                {LABELS.map((l, i) => (
                  <AxisLabel
                    key={l.id}
                    ref={(el) => {
                      labelEls.current[i] = el
                    }}
                    text={l.text}
                    align={l.align}
                    kind={l.kind}
                    {...(l.only && l.only !== kind ? { style: { display: 'none' } } : {})}
                  />
                ))}
              </div>
            </div>
            <span className="text-meta pointer-events-none absolute top-2 left-6 font-mono text-graphite sm:left-2">Vol surface</span>
            <FocusRing />
          </div>
        </div>

        {/* One line between the views: the story while it plays, then the market's state. Its room is kept, so what it
            says never moves the page; each turn dips to nothing and back (120ms, a 2px blur). */}
        <p aria-hidden data-market-story={said ?? ''} className="text-note mt-2 min-h-[1lh] leading-snug text-ink">
          {said && live ? (
            <span
              key={said}
              className={`inline-block transition-[opacity,filter] duration-[120ms] ease-out starting:opacity-0 starting:blur-[2px] motion-reduce:transition-none ${going ? 'opacity-0 blur-[2px]' : ''}`}
            >
              <span className="font-semibold">{STORY[said].name}.</span> <span className="hidden sm:inline">{STORY[said].text}</span>
              <span className="sm:hidden">{STORY[said].short}</span>
            </span>
          ) : null}
        </p>

        <div className="mt-3 grid grid-cols-1 gap-y-3 sm:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] sm:gap-x-3 sm:gap-y-4">
          {/* The book: the last twenty seconds, and the book at now. */}
          <div className="-mx-6 sm:mx-0">
            <p className="text-meta mb-1.5 px-6 font-mono text-graphite sm:px-0">Order book, the last 20 seconds</p>
            <div className="relative h-24 overflow-hidden bg-paper sm:h-44" onPointerMove={onBookMove} onPointerLeave={onBookLeave} data-market-book="">
              <div style={underlay(live)}>{posters.book}</div>
              <canvas ref={bookCv} className="absolute inset-0 h-full w-full" style={fade(live)} aria-hidden="true" />
              <canvas ref={ghostCv} data-ghost="" className="pointer-events-none absolute inset-0 h-full w-full opacity-0" aria-hidden="true" />
              <div className="pointer-events-none absolute inset-0" style={fade(live)} aria-hidden="true">
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i} ref={(el) => void (priceEls.current[i] = el)} className="text-meta absolute top-0 left-6 rounded-sm bg-paper/85 px-0.5 font-mono leading-none text-graphite sm:left-1" />
                ))}
              </div>
              <span ref={hoverEl} className="text-meta pointer-events-none absolute top-1 right-[3.75rem] rounded-sm bg-paper/90 px-1 font-mono text-ink" style={{ opacity: 0 }} />
            </div>
            <div className="text-meta relative mt-1 flex justify-between pr-20 pl-6 font-mono text-graphite sm:pr-14 sm:pl-0" aria-hidden="true">
              <span>20 s ago</span>
              <span>now</span>
            </div>
          </div>
          {/* The futures: a year from the price now. */}
          <div className="-mx-6 sm:mx-0">
            <p className="text-meta mb-1.5 px-6 font-mono text-graphite sm:px-0">Futures, the next year</p>
            <div className="relative h-[6.5rem] overflow-hidden bg-paper sm:h-44" data-market-fan="">
              <div style={underlay(live)}>{posters.fan}</div>
              <canvas ref={fanCv} className="absolute inset-0 h-full w-full" style={fade(live)} aria-hidden="true" />
              <div className="pointer-events-none absolute inset-0" style={fade(live)} aria-hidden="true">
                {Array.from({ length: 4 }, (_, i) => (
                  <span key={i} ref={(el) => void (fanEls.current[i] = el)} className="text-meta absolute top-0 right-7 font-mono leading-none text-graphite sm:right-1" />
                ))}
              </div>
            </div>
            <div className="text-meta mt-1 flex justify-between pr-[4.25rem] pl-8 font-mono text-graphite sm:pr-11 sm:pl-2" aria-hidden="true">
              <span>now</span>
              <span>a year</span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex min-h-8 flex-wrap items-center gap-2" data-market-controls="">
          {mounted && why && !live ? (
            <button type="button" className={CONTROL} onClick={toggleStill} onPointerEnter={() => void fetchShock()} onFocus={() => void fetchShock()} data-market-still-shock="">
              {still === 'calm' ? 'Liquidity shock' : 'Back to calm'}
            </button>
          ) : null}
          {live ? (
            <>
              <button type="button" className={CONTROL} onClick={shockNow} data-market-shock="">
                Liquidity shock
              </button>
              <button type="button" className={`${CONTROL} min-w-[4.5rem]`} onClick={togglePause}>
                {paused ? 'Resume' : 'Pause'}
              </button>
              <button type="button" className={CONTROL} onClick={resetNow}>
                Reset
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div className="mt-4 lg:hidden">
        <Readouts rows={rowsBelow} across />
      </div>
      <DebugSlot title="Fig. 1" read={readDebug} />
    </FigureFrame>
  )
}
