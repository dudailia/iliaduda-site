'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
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
import { PROTOCOL } from '@/lib/market/protocol'
import { handedTo, spend } from '@/lib/minis/handoff'
import type { LiveInfo } from '@/lib/stage/debug'
import { EASE_OUT, EASE_OUT_CSS } from '@/lib/ease'
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

type Story = 'calm' | 'shock' | 'topped' | 'recovering' | 'running' | 'paused' | 'still-calm' | 'still-shock'
/**
 * What the line between the views says: the story while it plays; then the market's own state — a shock for three and a
 * half seconds after any lands, recovering until its stress is back under 0.05, then running (paused before any of
 * them); where the market does not run, which still frame is shown. `short` is a phone's.
 */
const STORY: Record<Story, { name: string; text: string; short: string }> = {
  calm: { name: 'Calm', text: 'One market, drawn three ways as it runs.', short: 'One market, three views.' },
  shock: { name: 'A liquidity shock', text: 'A sell takes every bid within twenty ticks, and sellers pile in.', short: 'The bids are swept.' },
  topped: { name: 'Another shock', text: 'The market was still absorbing the last: this one tops it back up to one.', short: 'Topped back up to one.' },
  recovering: { name: 'Recovering', text: 'The book refills in seconds, the volatility and the surface in minutes.', short: 'The book refills in seconds.' },
  running: { name: 'Running', text: 'Live, at real time.', short: 'Live, at real time.' },
  paused: { name: 'Paused', text: 'The market holds where it is.', short: 'Held where it is.' },
  'still-calm': { name: 'Still frame', text: 'The market calm, at the moment the live figure opens on.', short: 'The market calm.' },
  'still-shock': { name: 'Still frame', text: 'The same market a second after a liquidity shock.', short: 'A second after a shock.' },
}
/** The turns that cut in rather than dip: a shock's words arrive with the shock. */
const CUT = new Set<Story>(['shock', 'topped'])
/** The turns said aloud, once each: the story's, not the reader's own presses of Pause. */
const SPOKEN = new Set<Story>(['calm', 'shock', 'topped', 'recovering'])

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
/** How far a blow has the camera in (0 to 1 of the punch's depth), `u` seconds after it landed, from where the last left it. */
function struck(b: { k: number; from: number }, u: number): number {
  const a = MARKET_SEQ.punch.in
  if (!(u > 0)) return b.from
  if (u < a) return b.from + (b.k - b.from) * EASE_OUT(u / a)
  return b.k * punch(u)
}

type Mod = typeof import('../surface/renderer')

type Posters = { book: ReactNode; fan: ReactNode }
/** The calm frame has the surface's picture too; a shocked surface is drawn on the page (../surface/still.ts). */
type CalmPosters = Posters & { surface: ReactNode }

export function MarketLive({
  posters: stills,
  initial: initials,
  stillAfter,
  hashes,
  stillSurface,
  seed,
  t0,
  title,
  subtitle,
  caption,
  table,
}: {
  /** The still frames: calm, where the live figure starts, and `stillAfter` seconds after a shock. */
  posters: { calm: CalmPosters; shock: Posters }
  initial: { calm: MarketInitial; shock: MarketInitial }
  stillAfter: number
  /** The market's hash where the figure opens, and after the shock ?debug=1 checks (lib/market/host.ts), from Node. */
  hashes: { start: string; shocked: string }
  /** The surface at each still frame's moment, for the smooth still frame drawn where the surface is not live. */
  stillSurface: { calm: Params; shock: Params }
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
  // The surface's picture stays the calm one in the tree, and its smooth still frame (below) is drawn for whichever
  // moment is shown, since that frame replaces the picture outside React.
  // Once the shocked frames have been fetched and decoded they stay in the page over the calm ones, and the two
  // crossfade (240ms, the ease-out), so no view steps from one moment to the other; under reduced motion, at once.
  const [shockReady, setShockReady] = useState(false)
  const [shockBlur, setShockBlur] = useState(false)
  const stillsOf = (view: 'book' | 'fan') => (
    <>
      {stills.calm[view]}
      {shockReady ? (
        // The two pictures cross through the site's 2px blur (at the midpoint, as the morph's do), not a plain double
        // exposure: 240ms on the ease-out.
        <div
          className={`absolute inset-0 bg-paper transition-[opacity,filter] duration-[240ms] ease-out motion-reduce:transition-none ${shockBlur ? 'blur-[2px]' : ''}`}
          style={{ opacity: still === 'shock' ? 1 : 0 }}
          data-market-shocked={still === 'shock' ? '1' : '0'}
        >
          {stills.shock[view]}
        </div>
      ) : null}
    </>
  )
  const initial = initials[still]
  const bookCv = useRef<HTMLCanvasElement>(null)
  const fanCv = useRef<HTMLCanvasElement>(null)
  const views = useRef<{ book: BookView; fan: FanView } | null>(null)
  const drawMod = useRef<Promise<Draw | null> | null>(null)
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
  const wasAbsorbing = useRef(false)
  const [paused, setPaused] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && sessionStorage.getItem(PAUSED) === '1'
    } catch {
      return false
    }
  })
  const pausedRef = useRef(paused)
  /** How fast the fan follows the market, 0 to 1, coasting with it on Pause. */
  const fanRate = useRef(paused ? 0 : 1)
  const [flat, setFlat] = useState(false)
  // Live once both flat views have drawn a frame, so no view's words arrive before its picture.
  const drewOnce = useRef({ book: false, fan: false })
  // The book's picture as it was when the market started over, fading out over the new one.
  const ghostCv = useRef<HTMLCanvasElement>(null)
  const lastResets = useRef(0)
  const mirrorRef = useRef<Mirror | null>(null)
  /** The moment the reader points at in the book, in simulated seconds, and what the market was then. */
  const pointed = useRef<{ t: number; stress: number; sigma: number; mid: number; spread: number } | null>(null)
  /** The reading, in seconds before now, taken again every frame (null: none); and the reader, set below. */
  const readingAgo = useRef<number | null>(null)
  const readRef = useRef<((ago: number | null, input?: boolean) => void) | null>(null)
  /** Where the keyboard has turned the surface to (radians); zero is home. */
  const aim = useRef({ yaw: 0, pitch: 0 })
  /** The book's reading from the keyboard: seconds before now, or null. */
  const keyAgo = useRef<number | null>(null)
  const bookEl = useRef<HTMLDivElement>(null)
  /** The three views together: the surface, the line between them, the book and the futures. */
  const viewsBox = useRef<HTMLDivElement>(null)
  // The signature: the story's clock, whether it has pressed its shock, and the camera's blow.
  const seq = useRef(marketSequence())
  const storyPressed = useRef(false)
  const marketRef = useRef<{ act(a: 'shock'): void } | null>(null)
  const blow = useRef({ at: -Infinity, k: 0, from: 0 })
  /** The latest landing, on the page's clock, and whether it topped up a shock still in the market. */
  const landedAt = useRef({ at: -Infinity, topped: false })
  const allLive = useRef(false)
  /** Where only the surface is still, its smooth still frame follows the market (set below). */
  const stillTick = useRef<((m: Mirror, now: number) => void) | null>(null)
  /** The next drawn frame is the landing's: the flat views stamp it, for the specs (the surface stamps its own). */
  const stampLanding = useRef(false)
  const storyRef = useRef<Story | null>(null)
  const [story, setStory] = useState<Story | null>(null)
  const [said, setSaid] = useState<Story | null>(null)
  const [going, setGoing] = useState(false)
  if (story !== said && !going) {
    if (said && story && !CUT.has(story)) setGoing(true)
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
  const coarse = useSyncExternalStore(
    (cb) => {
      const q = matchMedia('(pointer: coarse)')
      q.addEventListener('change', cb)
      return () => q.removeEventListener('change', cb)
    },
    () => matchMedia('(pointer: coarse)').matches,
    () => false,
  )
  const kindRef = useRef(kind)
  useEffect(() => {
    kindRef.current = kind
  }, [kind])

  /** On paper: the readouts hold the printed still frames' numbers, and the live market's writes wait. */
  const onPaper = useRef(false)
  const put = useCallback((id: string, text: string) => {
    for (const k of [id, `${id}-m`]) {
      const el = out.current[k]
      if (el && el.textContent !== text) el.textContent = text
    }
  }, [])
  const write = useCallback((id: string, text: string) => void (onPaper.current || put(id, text)), [put])

  // ── the surface: the IV paper's renderer, its shock the market's stress ────────────────────────────────────────
  const leanApi = useRef<{ lean: { current: { x: number; y: number } } } | null>(null)
  const fallbackApi = useRef<{ fail(why: 'load' | 'error'): void; watch(): () => void } | null>(null)
  const create: Create = useCallback((env) => {
    // In software the market is not run (below), so the surface would wait for it forever, a frame at a time: it
    // is not made, nor its renderer fetched.
    if (env.tier === 'software') return null
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
      aim: () => aim.current,
      zoom: () => 1 - MARKET_SEQ.punch.depth * struck(blow.current, (performance.now() - blow.current.at) / 1000),
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

  // The surface's quality waits to climb until the story is told: the lead-in and the shock never sharpen mid-moment.
  const [stageOpts] = useState(() => ({ ...STAGE_OPTS, hold: () => seq.current.started && !seq.current.done }))
  const { box, canvas, live: surfaceLive, eligible, reduced, tier, quality, fps } = useStage(create, stageOpts)
  // The story waits until all three views are wholly in view (on a laptop and a phone turned sideways they sit side by
  // side, one screen tall at most: app/globals.css), so the shock lands where all three can be seen; never on a partial
  // view held for a moment. On a phone in portrait the three stacked views are taller than the screen: then as much of
  // them as the screen holds (fit).
  const sig = useSignature('market', viewsBox, seq, { start: 0.98, hold: 0.98, fit: true })
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
  // The market runs where its surface can: a browser with no WebGL2 (a blocklisted GPU, or a headless audit, which
  // Chrome no longer lends a software one) or a software rasteriser keeps the still frames, which Liquidity shock swaps.
  const allowed = mounted && !saveData() && tier !== null && tier !== 'software'

  // ── the flat views, drawn in the market's own frame ────────────────────────────────────────────────────────────
  const lastDraw = useRef(0)
  const lastText = useRef(0)
  const framesAt = useRef({ at: 0, n: 0, rate: 0 })
  const draw = useCallback(
    (m: Mirror, now: number) => {
      mirrorRef.current = m
      const p = pal.current
      // Nothing before the market's first frame: its readouts would be zeros.
      if (!p || !m.frames) return
      // The drawers arrive with the market's first frames; until they are here the still frames stand.
      if (!views.current) {
        const bc = bookCv.current, fc = fanCv.current
        if (bc && fc && !drawMod.current)
          drawMod.current = import('./draw').then(
            (d) => {
              views.current = { book: new d.BookView(bc), fan: new d.FanView(fc) }
              return d
            },
            // The flat views' drawers did not load: the still frames stay, with the reason.
            () => {
              fallbackApi.current?.fail('load')
              return null
            },
          )
        return
      }
      const v = views.current
      // The landing is stamped on the message's clock and drawn on the frame's, which can run a few ms behind it: the
      // first frame to draw it is its first, so the streak has its front from that frame.
      if (landing.current && landing.current.at > now) landing.current.at = now
      // The flat views sit inside the column at every width (on a phone side by side, under the surface,
      // app/globals.css): no edge inset to keep for the page's margin.
      v.book.inset = v.fan.inset = 0
      const dt = lastDraw.current ? Math.min(0.1, (now - lastDraw.current) / 1000) : 1 / 60
      lastDraw.current = now
      // Paused, a landing's envelopes stand still: their start moves on with every paused frame, so they pick up on
      // Resume where they were (Pause holds everything, WCAG 2.2.2).
      if (pausedRef.current) {
        if (landing.current) landing.current.at += dt * 1000
        blow.current.at += dt * 1000
        // The story line's clock too, so what it says after a long pause is what it said before it.
        landedAt.current.at += dt * 1000
      }
      const stateOf = (mm: Mirror): Story => {
        if (pausedRef.current) return 'paused'
        const since = performance.now() - landedAt.current.at
        if (since < MARKET_SEQ.told) return landedAt.current.topped ? 'topped' : 'shock'
        return mm.h.stress >= 0.05 ? 'recovering' : 'running'
      }
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
        if (seq.current.started && !seq.current.done) {
          // Paused, the story holds where it is, and the line says so.
          const turn = storyOf(ph)
          tell(pausedRef.current ? 'paused' : turn === 'recovery' ? 'recovering' : turn)
        } else if (!seq.current.started) {
          // Waiting for the book and the futures to be on screen: the line already says the story's first words.
          tell(pausedRef.current ? 'paused' : 'calm')
        } else tell(stateOf(m))
      } else if (sg.armed.current && !seq.current.done) {
        // Armed, before all three views draw: the line says the story's first words already, so going live is one
        // blur in ("Calm"), never "Running" swapped for "Calm" a moment later.
        tell(pausedRef.current ? 'paused' : 'calm')
      } else tell(stateOf(m))

      // The market started over (Reset): the new strip opens under the old, which fades (240ms, the ease-out).
      if (m.h.resets !== lastResets.current) {
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
      lastResets.current = m.h.resets
      if (readingAgo.current !== null) readRef.current?.(readingAgo.current, false)
      v.fan.as = pointed.current?.sigma ?? null
      stillTick.current?.(m, now)
      // Drawn while Fig. 1 is on screen; with only Fig. 2 in view the market runs on for its rates, and nothing here
      // is drawn that no one sees.
      if (stageOn.current && v.book.draw(m, p, now, landing.current, dt)) drewOnce.current.book = true
      // The fan's breathing toward the market's volatility coasts to rest with the market on Pause (240ms) and picks up
      // with it on Resume (400ms): Pause holds every view. A moment the reader points at is answered at once, paused or not.
      fanRate.current = pausedRef.current ? Math.max(0, fanRate.current - dt / 0.24) : Math.min(1, fanRate.current + dt / 0.4)
      if (stageOn.current && v.fan.draw(m, p, now, landing.current, dt, fanRate.current)) drewOnce.current.fan = true
      if (!flat && drewOnce.current.book && drewOnce.current.fan) setFlat(true)

      // The book's words: prices up its side, where the window has them now.
      const lay = v.book.layout()
      // A pane under 90px (the book at 1280×800) marks two or three prices, so their labels never crowd.
      const ticks = priceTicks(lay.centre - WINDOW.half, lay.centre + WINDOW.half, lay.h < 90 ? 3 : 5)
      priceEls.current.forEach((el, i) => {
        if (!el) return
        const p0 = ticks[i]
        if (p0 === undefined) {
          el.style.opacity = '0'
          return
        }
        const y = lay.y(p0)
        // A label near the strip's edge is shown or not, never held half faded (the window stands still whenever the
        // price does, paused or running, and a half-faded label would be half legible for as long as it stood): it
        // eases to shown or hidden over 150ms as the window carries it past the edge, so none pops.
        const edge = Math.min(1, Math.max(0, (Math.min(y, lay.h - y) - 8) / 12))
        const o = edge >= 0.5 ? 1 : 0
        const ease = `opacity 150ms ${EASE_OUT_CSS}`
        if (el.style.transition !== ease) el.style.transition = ease
        if (o === 0) {
          el.style.opacity = '0'
          return
        }
        const text = usd(p0)
        if (el.textContent !== text) el.textContent = text
        el.style.opacity = o.toFixed(3)
        el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) translateY(-50%)`
      })
      // The fan's: a year's prices at halvings and doublings of $100, where they fall from its root, the price now, or
      // the price then while the reader points at a moment (the fan is drawn from there, at the volatility then).
      const root$ = (pointed.current?.mid ?? m.h.mid) * TICK
      const fl = v.fan.layout()
      const marks = logTicks(root$, FAN_RANGE.lo, FAN_RANGE.hi)
      fanEls.current.forEach((el, i) => {
        if (!el) return
        const d = marks[i]
        if (d === undefined) {
          el.style.opacity = '0'
          return
        }
        const text = dollars(d)
        if (el.textContent !== text) el.textContent = text
        const fy = fl.y(d / root$)
        el.style.opacity = Math.min(1, Math.max(0, (Math.min(fy, v.fan.box.h - fy) - 4) / 12)).toFixed(3)
        el.style.transform = `translate3d(0, ${fy.toFixed(1)}px, 0) translateY(-50%)`
      })

      // Readouts, ten times a second.
      // The rail's numbers change with the picture: not before both flat views have drawn.
      // While a moment is pointed at, every frame: the book's label is written each frame, and the readouts, at ten a
      // second, could show the moment a frame before it (the moment is so many seconds before a now that moves).
      if (flat && (pointed.current || now - lastText.current > 100)) {
        lastText.current = now
        const h = m.h
        // While a past moment is pointed at, every readout is that moment's, as the book's label and the fan are: one
        // moment across the page, never the book at one time and the numbers at another.
        const p = pointed.current
        const r = p ? { t: p.t, mid: p.mid, spread: p.spread, sigma: p.sigma, stress: p.stress } : h
        write('time', clock(r.t))
        write('mid', usd(r.mid))
        write('spread', `${r.spread} ${r.spread === 1 ? 'tick' : 'ticks'}`)
        write('sigma', pct(r.sigma))
        write('stress', r.stress.toFixed(2))
        write('atm', pct(atmOf(r.stress)))
        // The year's range once the fan has been drawn (the pointed moment's fan, while one is); until then the still
        // frame's own, never a range of nothing.
        if (v.fan.band(4, 64) > 0) write('range', `${dollars(v.fan.band(0, 64) * root$)}–${dollars(v.fan.band(4, 64) * root$)}`)
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
        marketRates.set({ rate: h.rate, expected: h.expected, frames: fa.rate, paths: h.paths, busy: h.busy, held: h.held, paused: pausedRef.current })
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
      const k = Math.min(1, Math.max(0.25, m.h.load - lastLoad.current * 0.9))
      // Another shock: one pressed while the market was still absorbing the last, as the engine counts it.
      landedAt.current = { at, topped: wasAbsorbing.current }
      // Only a shock that swept levels strikes: a press that took nothing leaves the camera and the views alone.
      if (hi >= lo) {
        landing.current = { at, t: m.landedT, hi, lo }
        impact.current = { k, at }
        // A blow during the last one picks up from where the camera is: it never backs out first.
        const now = struck(blow.current, (at - blow.current.at) / 1000)
        blow.current = { at, k: Math.max(k, now), from: now }
        stampLanding.current = true
      }
    }
    lastLoad.current = m.h.load
    wasAbsorbing.current = m.h.absorbing
  }, [])
  // Whether Fig. 1's stage is on screen at all (its flat views draw only then).
  const stageOn = useRef(true)
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => void (stageOn.current = !!e?.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])
  // The market runs while Fig. 1 or Fig. 2, which reports on it, is on screen.
  const follow = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    follow.current = document.querySelector<HTMLElement>('[data-market-follow]')
  }, [])
  // The market opens at the figure's own moment, or where its Contents miniature was if the reader came from it
  // (lib/minis/handoff.ts): the same seeded market, carried on.
  const [from] = useState(() => (typeof window === 'undefined' ? t0 : (handedTo('market', t0) ?? t0)))
  useEffect(() => spend(), [])
  const market = useMarket([stage, follow], { seed, t: from, allowed, draw, onTake })
  useEffect(() => {
    marketRef.current = market
    allLive.current = market.live && flat && (surfaceLive || !eligible)
  })

  // Readouts start as the posters' frame: the same numbers, computed on the server.
  const putInitial = useCallback(
    (to: (id: string, text: string) => void) => {
      to('time', clock(initial.t))
      to('mid', usd(initial.mid))
      to('spread', `${initial.spread} ${initial.spread === 1 ? 'tick' : 'ticks'}`)
      to('sigma', pct(initial.sigma))
      to('stress', initial.stress.toFixed(2))
      to('atm', pct(atmOf(initial.stress)))
      to('range', `${dollars(initial.lo)}–${dollars(initial.hi)}`)
    },
    [initial],
  )
  useEffect(() => putInitial(write), [putInitial, write])
  // On paper the still frames stand in for the live views (a canvas is the screen's), so the readouts print the still
  // frames' moment, not the live market's: a 70% realised volatility never prints beside a calm fan. Live writing
  // resumes after.
  useEffect(() => {
    const toPaper = () => {
      onPaper.current = false
      putInitial(put)
      onPaper.current = true
    }
    const back = () => {
      onPaper.current = false
    }
    const print = matchMedia('print')
    const onMedia = () => (print.matches ? toPaper() : back())
    addEventListener('beforeprint', toPaper)
    addEventListener('afterprint', back)
    print.addEventListener('change', onMedia)
    return () => {
      removeEventListener('beforeprint', toPaper)
      removeEventListener('afterprint', back)
      print.removeEventListener('change', onMedia)
    }
  }, [putInitial, put])

  // ── the reader: a moment in the book shows the market as it was then, by pointer, finger or keys ─────────────────
  /**
   * Read the market `ago` seconds before now (0 to 20), or stop reading (null). The reading is kept as seconds before
   * now and taken again every drawn frame (`input` false), so the moment under a still pointer stays the one under it
   * as the strip scrolls; only the reader's own moves update what the slider says.
   */
  const readAt = (ago: number | null, input = true) => {
    const v = views.current, m = mirrorRef.current, el = bookEl.current
    readingAgo.current = ago
    if (ago === null || !v || !m || !m.rows) {
      pointed.current = null
      if (v) v.book.hover = null
      if (hoverEl.current) {
        hoverEl.current.textContent = 'Order book, the last 20 seconds'
        hoverEl.current.classList.remove('text-ink')
      }
      if (el?.hasAttribute('aria-valuenow')) {
        el.setAttribute('aria-valuenow', '0')
        el.setAttribute('aria-valuetext', 'now')
      }
      return
    }
    const a = Math.min(SPAN, Math.max(0, ago))
    const t = m.h.t - a
    // The row written at that moment (twelve a second): the market as the book shows it there.
    const age = Math.min(m.rows - 1, Math.max(0, Math.round((m.time(m.row(0)) - t) * PROTOCOL.hz)))
    const i = m.row(age)
    pointed.current = { t, stress: m.stress(i), sigma: m.sigma(i), mid: m.mid(i), spread: Math.max(1, Math.round(m.ask(i) - m.bid(i))) }
    const lay = v.book.layout()
    v.book.hover = lay.x1 - (a / SPAN) * lay.x1
    const text = `${a.toFixed(1)} s ago · vol ${pct(m.sigma(i))} · stress ${m.stress(i).toFixed(2)}`
    // On screen each item is whole and the dot stays with the item before it (a phone's pane wrapped "· stress" onto a
    // line of its own); what is read aloud keeps plain spaces.
    const shown = text.split(' · ').map((item) => item.replace(/ /g, '\u00a0')).join('\u00a0· ')
    const h = hoverEl.current
    if (h && h.textContent !== shown) {
      h.textContent = shown
      h.classList.add('text-ink')
    }
    if (!input || !el?.hasAttribute('aria-valuenow')) return
    el.setAttribute('aria-valuenow', (a ? -a : 0).toFixed(1))
    el.setAttribute('aria-valuetext', text)
  }
  useEffect(() => {
    readRef.current = readAt
  })
  const agoAt = (clientX: number, box: DOMRect) => {
    const v = views.current
    if (!v) return null
    const lay = v.book.layout()
    const x = clientX - box.left
    return x >= lay.x1 ? null : ((lay.x1 - x) / lay.x1) * SPAN
  }
  // A mouse reads as it moves; a finger reads while it drags sideways (the page keeps vertical swipes) and leaves the
  // reading where it lifts, until the next tap.
  const touching = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
  /** Where the last tap read, so a tap there again lets the reading go and a tap elsewhere moves it. */
  const tappedAt = useRef<number | null>(null)
  const onBookMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') {
      const t = touching.current
      if (!t || t.id !== e.pointerId) return
      if (Math.abs(e.clientX - t.x) > 6) t.moved = true
      if (t.moved) readAt(agoAt(e.clientX, e.currentTarget.getBoundingClientRect()))
      return
    }
    keyAgo.current = null
    readAt(agoAt(e.clientX, e.currentTarget.getBoundingClientRect()))
  }
  const onBookDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch') return
    touching.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
  }
  const onBookUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const t = touching.current
    if (!t || t.id !== e.pointerId) return
    touching.current = null
    // A finger that travelled was a drag or a swipe of the page, not a tap.
    if (t.moved || Math.abs(e.clientY - t.y) > 6) return
    // A tap reads the moment under it, as the other figures' taps do (no drag needed: WCAG 2.5.7), and a later tap
    // moves the reading there; a tap on the moment already read lets it go.
    const again = readingAgo.current !== null && tappedAt.current !== null && Math.abs(e.clientX - tappedAt.current) < 16
    tappedAt.current = again ? null : e.clientX
    readAt(again ? null : agoAt(e.clientX, e.currentTarget.getBoundingClientRect()))
  }
  // The browser has taken the finger for a scroll of the page (or lost it): nothing was tapped, and nothing is read.
  const onBookCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (touching.current?.id === e.pointerId) touching.current = null
  }
  const onBookLeave = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' || keyAgo.current !== null) return
    readAt(null)
  }
  // The slider's value is the moment's time against now (−20 to 0 seconds), so the keys go the way a slider's do:
  // Right and Up towards now, Left and Down back, Page Up and Page Down by five seconds, Home to the oldest, End to now.
  const onBookKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 2 : 0.5
    let next: number | null | undefined
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = (keyAgo.current ?? 0) + step
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = (keyAgo.current ?? 0) - step
    else if (e.key === 'PageDown') next = (keyAgo.current ?? 0) + 5
    else if (e.key === 'PageUp') next = (keyAgo.current ?? 0) - 5
    else if (e.key === 'Home') next = SPAN
    else if (e.key === 'End' || e.key === 'Escape') next = null
    if (next === undefined) return
    e.preventDefault()
    keyAgo.current = next === null || next <= 0 ? null : Math.min(SPAN, next)
    readAt(keyAgo.current)
  }
  // The keyboard on the surface: the arrows turn it within the drag's limits, Space pauses, Home or Escape bring it
  // back; leaving it brings it back too.
  const onSurfaceKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const a = aim.current
    if (e.key === 'ArrowLeft') a.yaw += 0.12
    else if (e.key === 'ArrowRight') a.yaw -= 0.12
    else if (e.key === 'ArrowUp') a.pitch -= 0.08
    else if (e.key === 'ArrowDown') a.pitch += 0.08
    else if (e.key === 'Home' || e.key === 'Escape') aim.current = { yaw: 0, pitch: 0 }
    else if (e.key === ' ') togglePause()
    else return
    e.preventDefault()
    a.yaw = Math.max(-1.5, Math.min(1.5, a.yaw))
    a.pitch = Math.max(-0.9, Math.min(0.9, a.pitch))
  }

  const setPause = (next: boolean) => {
    pausedRef.current = next
    setPaused(next)
    const r = marketRates.get()
    if (r) marketRates.set({ ...r, paused: next })
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
  const replayNow = () => {
    // The market back to its opening moment, and the story told again from its calm, paused or not.
    storyPressed.current = false
    landedAt.current = { at: -Infinity, topped: false }
    if (pausedRef.current) setPause(false)
    sig.replay()
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
      ['book', 'ladder', 'fan'].map((f) => {
        const img = new Image()
        img.src = `/market/${f}-shock.svg`
        return img.decode().catch(() => {})
      }),
    ))
  // The stills' crossfade blurs for its first half (the 240ms filter transition then carries it back to sharp).
  const blurTimer = useRef(0)
  useEffect(() => () => clearTimeout(blurTimer.current), [])
  const crossBlur = () => {
    setShockBlur(true)
    clearTimeout(blurTimer.current)
    blurTimer.current = window.setTimeout(() => setShockBlur(false), 120)
  }
  const toggleStill = () => {
    if (still === 'shock') {
      crossBlur()
      return setStill('calm')
    }
    void fetchShock().then(() => {
      setShockReady(true)
      crossBlur()
      setStill('shock')
    })
  }

  const why = !mounted
    ? null
    : reduced
      ? 'Still frames: your system asks for reduced motion.'
      : fallback.declined
        ? DECLINED_TEXT[fallback.declined]
        : market.declined === 'save-data' || saveData()
          ? 'Still frames: your browser asks to save data.'
          : market.declined
            ? 'Still frames: the market could not start in this browser.'
          : tier === 'software'
            ? 'Still frames: this device draws with its processor, not a graphics chip, so the market is not run here.'
            : !eligible && !supportsWebGL2()
              ? 'Still frames: this browser has no WebGL2, so the market is not run here.'
              : null
  const live = market.live && flat && !market.declined
  // Arrived from the Contents' miniature: the still frames waited for the handed moment (lib/minis/handoff.ts); live
  // at it now, or not to be, they need not wait any longer.
  useEffect(() => {
    if (live || why) delete document.documentElement.dataset.marketHandoff
  }, [live, why])
  // The line says the story and the market's state while it runs; where it does not, which still frame it shows.
  const line: Story | null = live ? said : why ? (still === 'shock' ? 'still-shock' : 'still-calm') : null

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
  // Where the surface is not live, its still frame is drawn smooth (../surface/still.ts, the IV figure's): for the still
  // frame shown, or, where the surface was lost while the market runs, at the market's stress once a second.
  const stillMod = useRef<typeof import('../surface/still') | null>(null)
  useEffect(() => {
    if (!mounted || surfaceLive || !box.current) return
    // Only where the still frames stand.
    if (!why) return
    let gone = false
    // If the smooth frame does not load, the build's still frame of the surface stands.
    void import('../surface/still').then(
      (m) => {
        stillMod.current = m
        if (!gone && box.current) m.smoothStill(box.current, stillSurface[still], kindRef.current)
      },
      () => {},
    )
    return () => {
      gone = true
    }
  }, [mounted, surfaceLive, why, still, scheme, kind, stillSurface, box])
  const lastStill = useRef(0)
  useEffect(() => {
    stillTick.current = (m: Mirror, now: number) => {
      if (surfaceLive || !stillMod.current || !box.current || now - lastStill.current < 1000) return
      lastStill.current = now
      stillMod.current.smoothStill(box.current, params(Math.min(1, Math.max(0, m.h.stress))), kindRef.current)
    }
  })
  // A figure that will not go live here shows its still frames at once, and spends no story.
  const release = sig.release
  useEffect(() => {
    if (why) release()
  }, [why, release])

  // The market's seven, in the rail and below the stage on a phone, under the same names (the engine's own rates are
  // Fig. 2's).
  const READOUTS = [
    ['time', 'Simulated time'],
    ['mid', 'Price'],
    ['spread', 'Spread'],
    ['sigma', 'Realised vol'],
    ['stress', 'Stress, 0 to 1'],
    ['atm', '1-month ATM vol'],
    // The fan is drawn at the realised vol of the moment, and says so: it is not the surface's one-year implied.
    ['range', 'A year out at realised vol, 5–95%'],
  ] as const
  // Rendered with the still frame's numbers on the server, so the rail arrives full and nothing below it moves.
  const first: Record<(typeof READOUTS)[number][0], string> = {
    time: clock(initial.t),
    mid: usd(initial.mid),
    spread: `${initial.spread} ${initial.spread === 1 ? 'tick' : 'ticks'}`,
    sigma: pct(initial.sigma),
    stress: initial.stress.toFixed(2),
    atm: pct(atmOf(initial.stress)),
    range: `${dollars(initial.lo)}–${dollars(initial.hi)}`,
  }
  const rowsBelow = READOUTS.map(([id, label]) => ({ label, value: <span ref={(el) => void (out.current[`${id}-m`] = el)} data-market-value="">{first[id]}</span> }))

  return (
    <FigureFrame
      id="fig-1"
      // On paper the stage may break: its poster keeps itself whole (app/globals.css, print).
      breakable
      number="Fig. 1"
      title={title}
      subtitle={subtitle}
      vt="market"
      span
      railBelow={false}
      hint={
        <>
          {/* Room kept for the longest wording, so the right one arriving moves nothing. */}
          <span className="block min-h-[3lh] sm:min-h-[2lh] print:hidden">
            {why
              ? `${why} Liquidity shock shows the same market ${stillAfter === 1 ? 'a second' : `${stillAfter} seconds`} after one.`
              : coarse
                ? 'Press Liquidity shock to hit the market; drag across the book to see the market as it was then, or across the surface to turn it.'
                : 'Press Liquidity shock to hit the market; point at a moment in the book to see the market as it was then, or drag the surface to turn it.'}
          </span>
          <span className="sr-only" aria-live="polite">
            {said && SPOKEN.has(said) ? `${STORY[said].name}. ${STORY[said].text}` : ''}
          </span>
        </>
      }
      caption={caption}
      table={table}
    >
      <div ref={stage} className="relative" data-market-stage="" data-market-live={live ? '1' : '0'}>
        <div ref={viewsBox} data-market-views="">
        {/* The surface: the market's stress sets its shock. */}
        <div className="relative -mx-6 sm:mx-0" data-market-surface-box="">
          {/* The surface leans with the reader, as every 3D figure does: toward a fine pointer, with a phone's tilt (iOS
              asks on the first tap); a drag, or the arrow keys, turn it. */}
          <div
            ref={box}
            {...(surfaceLive
              ? { role: 'group', tabIndex: 0, 'aria-label': 'Vol surface. The arrow keys turn it; Space pauses the market; Home turns it back.', onKeyDown: onSurfaceKey }
              : {})}
            // iv-fig: the IV figure's colour ramp (STAGE_CSS, RAMP_CSS) is scoped to it, and the still surface draws with it.
            className="iv-fig peer relative aspect-[1.1] w-full cursor-grab overflow-hidden bg-paper select-none focus-visible:outline-none sm:aspect-[1.62] sm:max-w-[calc(88svh*1.62)]"
            data-market-surface=""
            data-hold=""
            onPointerMove={lean.onPointerMove}
            onPointerLeave={lean.onPointerLeave}
            onClick={() => lean.onTap()}
            onBlur={() => (aim.current = { yaw: 0, pitch: 0 })}
          >
            {/* The three views arrive in one frame (the surface waits for the book and the fan): one market, drawn once. */}
            <div data-market-still="" style={underlay(surfaceLive && live)}>{stills.calm.surface}</div>
            <canvas ref={canvas} data-live-canvas="" className="absolute inset-0 h-full w-full" style={{ ...fade(surfaceLive && live), touchAction: 'pan-y pinch-zoom' }} aria-hidden="true" />
            {/* The axes' words, placed by the renderer each frame with its own projection (the IV figure's). */}
            <div aria-hidden data-market-words="" className="pointer-events-none absolute inset-0" style={fade(surfaceLive && live)}>
              <div ref={labelLayer}>
                {LABELS.map((l, i) => (
                  <AxisLabel
                    key={l.id}
                    ref={(el) => {
                      labelEls.current[i] = el
                    }}
                    moving
                    text={l.text}
                    align={l.align}
                    kind={l.kind}
                    {...(l.only && l.only !== kind ? { style: { display: 'none' } } : {})}
                  />
                ))}
              </div>
            </div>
            <span className="text-meta pointer-events-none absolute top-2 left-6 font-mono text-graphite sm:top-0 sm:left-0">Vol surface</span>
          </div>
          <FocusRing />
        </div>

        {/* One line between the views: the story while it plays, then the market's state. Its room is kept, so what it
            says never moves the page; each turn blurs out and the next blurs in (120ms each way, 3px), at full opacity, so
            every frame keeps the text's contrast. */}
        {/* One line kept for it, two where its longest turns wrap (from sm to md: at lg and on a phone they fit one). */}
        <p aria-hidden data-market-story={line ?? ''} className="text-note mt-2 min-h-[1lh] leading-snug text-ink sm:max-md:min-h-[2lh] print:hidden">
          {line ? (
            <span
              key={line}
              // The shock's words cut in with the shock, in its frame (DESIGN.md); the others arrive through the 3px blur.
              className={`inline-block transition-[filter] duration-[120ms] ease-out motion-reduce:transition-none ${line === 'shock' ? '' : 'starting:blur-[3px]'} ${going && live ? 'blur-[3px]' : ''}`}
            >
              <span className="font-semibold">{STORY[line].name}.</span> <span className="hidden sm:inline">{STORY[line].text}</span>
              <span className="sm:hidden">{STORY[line].short}</span>
            </span>
          ) : null}
        </p>

        <div data-market-lower="" className="mt-3 grid grid-cols-1 gap-y-3 sm:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] sm:gap-x-3 sm:gap-y-4">
          {/* The book: the last twenty seconds, and the book at now. */}
          <div className="-mx-6 sm:mx-0">
            <p className="text-meta mb-1.5 px-6 font-mono text-graphite sm:px-0" data-market-book-title="">
              <span ref={hoverEl}>Order book, the last 20 seconds</span>
            </p>
            {/* The slider's description only (hidden, so it is never read as the page's text); there is none to
                describe on a still frame. */}
            {live ? (
              <span id="market-book-keys" hidden>
                A moment to read the market at. The arrow keys move it, Page Up and Page Down by five seconds; End returns to now.
              </span>
            ) : null}
            <div className="relative">
              <div
                ref={bookEl}
                // A moment to read the market at, while it runs; a still frame has none to read, so it takes no focus.
                {...(live
                  ? {
                      role: 'slider',
                      tabIndex: 0,
                      // Named by its visible title (WCAG 2.5.3); how to move it is its description.
                      'aria-label': 'Order book, the last 20 seconds',
                      'aria-describedby': 'market-book-keys',
                      'aria-valuemin': -SPAN,
                      'aria-valuemax': 0,
                      'aria-valuenow': 0,
                      'aria-valuetext': 'now',
                      onKeyDown: onBookKey,
                      onBlur: () => {
                        keyAgo.current = null
                        readAt(null)
                      },
                    }
                  : {})}
                data-market-pane=""
                className="peer relative h-28 overflow-hidden bg-paper focus-visible:outline-none sm:h-52"
                style={{ touchAction: 'pan-y pinch-zoom' }}
                onPointerMove={onBookMove}
                onPointerDown={onBookDown}
                onPointerUp={onBookUp}
                onPointerCancel={onBookCancel}
                onPointerLeave={onBookLeave}
                data-market-book=""
                data-hold=""
              >
                <div data-market-still="" style={underlay(live)}>{stillsOf('book')}</div>
                <canvas ref={bookCv} className="absolute inset-0 h-full w-full" style={fade(live)} aria-hidden="true" />
                <div data-market-words="" className="pointer-events-none absolute inset-0" style={fade(live)} aria-hidden="true">
                  {/* On paper plates at every width: the price line runs through this column, and a halo alone left it
                      striking through the words on a phone. */}
                  {Array.from({ length: 6 }, (_, i) => (
                    <span key={i} ref={(el) => void (priceEls.current[i] = el)} className="text-meta absolute top-0 left-1 rounded-sm bg-paper/90 px-0.5 font-mono leading-none text-graphite" />
                  ))}
                </div>
                {/* Over the words too, so the old market's prices fade with its picture and the new ones are revealed under it. */}
                <canvas ref={ghostCv} data-ghost="" className="pointer-events-none absolute inset-0 h-full w-full opacity-0" aria-hidden="true" />
              </div>
              <FocusRing />
            </div>
            <div className="text-meta relative mt-1 flex justify-between pr-14 pl-0 font-mono whitespace-nowrap text-graphite" aria-hidden="true">
              {/* At 360px "ago" would run into "now". */}
              <span>
                20 s<span className="max-[379px]:hidden"> ago</span>
              </span>
              <span>now</span>
            </div>
          </div>
          {/* The futures: a year from the price now. */}
          <div className="-mx-6 sm:mx-0">
            <p className="text-meta mb-1.5 px-6 font-mono text-graphite sm:px-0">Futures, the next year</p>
            <div className="relative h-28 overflow-hidden bg-paper sm:h-52" data-market-fan="" data-market-pane="">
              <div data-market-still="" style={underlay(live)}>{stillsOf('fan')}</div>
              <canvas ref={fanCv} className="absolute inset-0 h-full w-full" style={fade(live)} aria-hidden="true" />
              <div data-market-words="" className="pointer-events-none absolute inset-0" style={fade(live)} aria-hidden="true">
                {Array.from({ length: 4 }, (_, i) => (
                  <span key={i} ref={(el) => void (fanEls.current[i] = el)} className="text-meta absolute top-0 right-1 font-mono leading-none text-graphite" />
                ))}
              </div>
            </div>
            <div className="text-meta mt-1 flex justify-between gap-x-3 pr-11 pl-2 font-mono whitespace-nowrap text-graphite" aria-hidden="true">
              <span>now</span>
              <span>a year</span>
            </div>
          </div>
        </div>

        </div>

        <div className="mt-3 flex min-h-8 flex-wrap items-center gap-2 print:hidden" data-market-controls="">
          {mounted && why && !live ? (
            <button type="button" className={`${CONTROL} min-w-[8.75rem]`} onClick={toggleStill} onPointerEnter={() => void fetchShock()} onFocus={() => void fetchShock()} data-market-still-shock="">
              {still === 'calm' ? 'Liquidity shock' : 'Back to calm'}
            </button>
          ) : null}
          {live ? (
            <>
              <button type="button" className={CONTROL} onClick={shockNow} data-market-shock="">
                Liquidity shock
              </button>
              <button type="button" className={`${CONTROL} min-w-[4.5rem]`} onClick={togglePause} data-hold="">
                {paused ? 'Resume' : 'Pause'}
              </button>
              <button type="button" className={CONTROL} onClick={replayNow} data-replay="">
                Replay
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div className="mt-4">
        <Readouts rows={rowsBelow} across />
      </div>
      <DebugSlot title="Fig. 1" read={readDebug} />
    </FigureFrame>
  )
}
