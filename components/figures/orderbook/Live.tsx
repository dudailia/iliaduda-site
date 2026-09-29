'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { FigureFrame } from '@/components/FigureFrame'
import { CONTROL } from '@/components/stage/controls'
import { saveData, supportsWebGL2 } from '@/components/stage/env'
import { DebugSlot } from '@/components/stage/DebugSlot'
import { FocusRing } from '@/components/stage/FocusRing'
import { DECLINED_TEXT, useFallback } from '@/components/stage/useFallback'
import { useLean } from '@/components/stage/useLean'
import { useSignature } from '@/components/stage/useSignature'
import { fade, underlay, useStage, type Create, type Palette } from '@/components/stage/useStage'
import { Flow, POSTER_T, type Stats } from '@/lib/market/flow'
import { advanceInSlices } from '@/lib/market/slices'
import { orderBookSequence } from '@/lib/orderbook/sequence'
import { fmt, readAt, sentence, type Reading } from '@/lib/orderbook/read'
import type { LiveInfo } from '@/lib/stage/debug'
import { market } from './market'
import type { BookRenderer, KeyProbe, Shared } from './renderer'

/**
 * Fig. 1 of /order-book, live: a synthetic limit order book as terrain.
 *
 * The poster is the server's frame of the seeded market; the renderer and a
 * fresh copy of the same market load only when the stage goes live, so the
 * canvas's first frame is the poster's moment. On a first visit the terrain
 * rises out of the page as the flow starts (lib/orderbook/sequence.ts), once;
 * then it runs at real time, drifting and leaning with the reader, until the
 * reader pauses it.
 *
 * Readouts are written straight into the DOM from the frame loop, not through
 * React state: they change every frame, and a re-render per frame would be the
 * most expensive thing on the page. The probe works on the poster too: with
 * reduced motion the arrow keys read the frozen snapshot.
 */

export interface Initial {
  rate: number
  trades: number
  shares: number
  mid: number
  spread: number
  rho: number
  expected: number
}

const PROBE_START: KeyProbe = { dp: 4, age: 12 }
const MAX_DP = 60
const STAGE_OPTS = { maxQ: { mid: 3 } } as const

type Mod = typeof import('./renderer')
const noop = () => () => {}
/** Which poster the screen shows (./Poster.tsx): the narrow one on a phone held upright. */
const posterVariant = (): 'wide' | 'narrow' => (matchMedia('(width < 40rem) and (orientation: portrait)').matches ? 'narrow' : 'wide')

export function OrderBookLive({
  poster,
  initial,
  title,
  subtitle,
  caption,
  table,
}: {
  poster: ReactNode
  initial: Initial
  title: string
  subtitle: string
  caption: ReactNode
  table: ReactNode
}) {
  const labels = useRef<HTMLDivElement>(null)
  const out = useRef<Record<string, HTMLElement | null>>({})
  const shared = useRef<Shared | null>(null)
  const key = useRef<KeyProbe | null>(null)
  const last = useRef<Reading | null>(null)
  const seq = useRef(orderBookSequence())
  const [spoken, setSpoken] = useState('')
  const [probing, setProbing] = useState(false)
  // Pause is the page market's, shared with Fig. 2 (./market.ts), and kept for the visit.
  const paused = useSyncExternalStore(market.subscribe, market.getPaused, () => false)
  const pausedRef = useRef(paused)
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  const write = useCallback((id: string, text: string) => {
    for (const k of [id, `${id}-m`]) {
      const el = out.current[k]
      if (el && el.textContent !== text) el.textContent = text
    }
  }, [])

  // The rail's numbers change four times a second at most, as Fig. 2's do: a readout that can be read.
  const statsAt = useRef(-Infinity)
  const writeStats = useCallback(
    (s: Pick<Stats, 'rate' | 'trades' | 'shares' | 'mid' | 'spread'>) => {
      const now = performance.now()
      if (now - statsAt.current < 250) return
      statsAt.current = now
      write('rate', `${s.rate.toFixed(1)} a second`)
      write('mid', fmt.mid(s.mid))
      write('spread', fmt.spread(s.spread))
      write('trades', `${s.trades} · ${fmt.shares(s.shares)}`)
    },
    [write],
  )

  const writeProbe = useCallback(
    (r: Reading | null) => {
      last.current = r
      if (!r) {
        write('p-price', '—')
        write('p-side', 'point at the terrain')
        write('p-queue', '—')
        write('p-cum', '')
        write('p-ago', '—')
        return
      }
      write('p-price', fmt.usd(r.price))
      write('p-side', fmt.side(r))
      write('p-queue', r.side === 'spread' ? 'no queue' : `${fmt.shares(r.queue)} at this price`)
      write('p-cum', r.side === 'spread' ? `· mid ${fmt.mid(r.mid)}` : `· ${Math.round(r.cum).toLocaleString('en-US')} to the ${r.side === 'bid' ? 'best bid' : 'best ask'}`)
      write('p-ago', fmt.ago(r.ago))
    },
    [write],
  )

  // The stage, and the reader's lean on it; both are read by the renderer through `shared`.
  const liveRef = useRef(false)
  const leanApi = useRef<{ lean: { current: { x: number; y: number } } } | null>(null)
  const sigApi = useRef<{ armed: { current: boolean }; onFrame(): void } | null>(null)
  const fallbackApi = useRef<{ fail(why: 'load' | 'error'): void; watch(): () => void } | null>(null)
  const pinApi = useRef<(k: KeyProbe) => void>(() => {})
  /** The live renderer, for Replay: the terrain sinks back into the page before the story plays again. */
  const book = useRef<BookRenderer | null>(null)

  const create: Create = useCallback(
    (env) => {
      let mod: Mod | null = null
      let inner: BookRenderer | null = null
      let size: [number, number, number, number] | null = null
      let q = 2
      let pal: Palette = env.palette
      let dead = false
      let broken = false
      // Whatever becomes of it (a failed load, a shader that will not link, a renderer that throws), the reader is
      // left with the finished poster, never an empty stage.
      const fail = (why: 'load' | 'error') => {
        if (dead || broken) return
        broken = true
        fallbackApi.current?.fail(why)
      }
      const unwatch = fallbackApi.current?.watch()
      void import('./renderer').then(
        (m) => (mod = m),
        () => fail('load'),
      )
      // The market is built in slices before the renderer is made (./market.ts); until then the poster stays.
      void market.prepare().then((sim) => {
        if (dead) return
        shared.current = {
          sim,
          labels: labels.current!,
          key: key.current,
          get paused() {
            return market.paused
          },
          advance: () => {
            market.tick()
          },
          highlight: () => market.highlight,
          sequence: () => (sigApi.current?.armed.current && !seq.current.done ? seq.current.phases() : null),
          lean: () => leanApi.current?.lean.current ?? { x: 0, y: 0 },
          tick: (dtMs) => {
            // Paused, the rise holds where it is, as everything does (WCAG 2.2.2).
            if (!market.paused) seq.current.advance(dtMs)
            sigApi.current?.onFrame()
          },
          onFrame: (stats, reading) => {
            writeStats(stats)
            writeProbe(reading)
          },
          onPin: (k) => pinApi.current(k),
        }
      })
      return {
        frame(t, dt) {
          if (broken) return null
          if (dead) return false
          try {
            if (!inner) {
              if (!mod || !shared.current) return false
              inner = mod.createBookRenderer({ ...env, palette: pal }, shared.current)
              book.current = inner
              if (size) inner.resize(...size)
              inner.setQuality?.(q)
            }
            return inner.frame(t, dt)
          } catch {
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
        setPalette(p) {
          pal = p
          inner?.setPalette?.(p)
        },
        dispose() {
          dead = true
          unwatch?.()
          if (book.current === inner) book.current = null
          inner?.dispose()
          shared.current = null
        },
      }
    },
    [writeProbe, writeStats],
  )

  const { box, canvas, live, eligible, reduced, quality, fps, tier } = useStage(create, STAGE_OPTS)
  // The terrain rises in the middle and bottom of its stage: the story waits for most of it to be in view (on a
  // laptop's first screen only the empty top of the stage shows), or nearly half held for a moment.
  const sig = useSignature('orderbook', box, seq, { start: 0.6, hold: 0.45 })
  const lean = useLean(live, reduced, pausedRef)
  const fallback = useFallback(canvas, live, sig.release)
  const declined = fallback.declined
  useEffect(() => {
    sigApi.current = sig
    leanApi.current = lean
    fallbackApi.current = fallback
    liveRef.current = live
  })
  // A figure that will not go live here shows the finished picture at once. Hydration reads reduced motion as on
  // (the server cannot know), so this waits for the browser's own answer.
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  const release = sig.release
  useEffect(() => {
    if (mounted && (!eligible || reduced)) release()
  }, [mounted, eligible, reduced, release])

  // Said only once the browser has answered; the server cannot know.
  const why = !mounted
    ? null
    : reduced
      ? 'Still frame: your system asks for reduced motion.'
      : declined
        ? DECLINED_TEXT[declined]
        : !eligible
        ? saveData()
          ? 'Still frame: your browser asks to save data.'
          : supportsWebGL2()
            ? 'Still frame: the live figure could not start here. Reloading the page may bring it.'
            : 'Still frame: this browser has no WebGL2.'
        : null

  // Where Fig. 1 keeps its still frame, Fig. 2 draws that same moment, still (./market.ts).
  useEffect(() => {
    market.setStill(why !== null)
  }, [why])

  // ?debug=1 (DebugSlot): the shared report, the market's own facts, and whether this browser computes the market
  // Node does: twenty simulated seconds past the still frame, fingerprinted against the one pinned in the tests. It
  // is worked out once, after the panel's first read, so opening the panel never waits on it.
  const marketCheck = useRef<string | null>(null)
  const checking = useRef(false)
  const checkMarket = useCallback(() => {
    if (checking.current) return
    checking.current = true
    void import('@/lib/market/fingerprint').then(async ({ GOLDEN, fingerprint }) => {
      const f = await advanceInSlices(new Flow(undefined, undefined, false), POSTER_T + 20, 6, () => performance.now(), (next) => setTimeout(next, 0))
      const got = fingerprint(f)
      marketCheck.current = `${got === GOLDEN ? 'same as Node' : `not the same as Node (${GOLDEN})`} · ${got}`
    })
  }, [])
  const debugInfo = useRef<() => LiveInfo>(null)
  useEffect(() => {
    debugInfo.current = () => {
      const st = box.current?.getBoundingClientRect()
      const cv = canvas.current
      const s = shared.current
      const events = s ? s.sim.hawkes.counts.reduce((a, b) => a + b, 0) : 0
      checkMarket()
      return {
        state: live ? 'live' : why ? 'declined' : mounted ? 'starting' : 'server',
        reason: why,
        tier,
        quality,
        fps,
        dpr: window.devicePixelRatio,
        stage: [st?.width ?? 0, st?.height ?? 0],
        canvas: live && cv ? [cv.width, cv.height] : null,
        seq: paused ? `${sig.state} · paused` : sig.state,
        reduced,
        saveData: saveData(),
        ua: navigator.userAgent,
        renderer: {
          market: marketCheck.current ?? 'computing…',
          ...(s ? { 'simulated time': `${s.sim.t.toFixed(1)} s · ${events} events`, draws: labels.current?.dataset.draws ?? '0' } : {}),
        },
      }
    }
  })
  const readDebug = useCallback((): LiveInfo => debugInfo.current!(), [])

  // Readouts start as the poster's frame: the same numbers, computed on the server.
  useEffect(() => {
    writeStats(initial)
    writeProbe(null)
  }, [initial, writeStats, writeProbe])

  // Announce a probe the reader moved, once it settles — never the stream.
  const announce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settle = () => {
    if (announce.current) clearTimeout(announce.current)
    announce.current = setTimeout(() => {
      const r = last.current
      if (r) setSpoken(sentence(r))
    }, 400)
  }
  useEffect(
    () => () => {
      if (announce.current) clearTimeout(announce.current)
    },
    [],
  )

  // The still frame's reading point, marked on the poster where it is drawn, in the poster's own pixels.
  const [stillMark, setStillMark] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const setKey = (k: KeyProbe | null) => {
    key.current = k
    if (shared.current) shared.current.key = k
    if (!live) {
      // The still frame: read the market where it stands (at the poster's moment, unless it ran before), once built,
      // and mark the point on the poster.
      if (!k) {
        setStillMark(null)
        return writeProbe(null)
      }
      void Promise.all([market.prepare(), import('@/lib/orderbook/poster')]).then(([s, P]) => {
        if (key.current !== k) return
        writeProbe(readAt(s, Math.round(s.mids[s.row(0)]!) + k.dp, k.age))
        const variant = posterVariant()
        const at = P.posterPoint(s, variant, k)
        const p = P.POSTERS.find((q) => q.variant === variant)!
        setStillMark(at ? { x: at[0], y: at[1], w: p.w, h: p.h } : null)
      })
    }
  }

  // On the still frame a click or tap reads the level under it, as it does on the live terrain: through the poster's
  // own camera (lib/orderbook/poster.ts, posterPick), from where the picture is drawn in the stage.
  const onStillPick = (e: MouseEvent<HTMLDivElement>) => {
    if (live) return
    const r = e.currentTarget.getBoundingClientRect()
    const cx = e.clientX - r.left, cy = e.clientY - r.top
    void Promise.all([market.prepare(), import('@/lib/orderbook/poster')]).then(([s, P]) => {
      const variant = posterVariant()
      const p = P.POSTERS.find((q) => q.variant === variant)!
      const scale = Math.min(r.width / p.w, r.height / p.h)
      const hit = P.posterPick(s, variant, (cx - (r.width - p.w * scale) / 2) / scale, (cy - (r.height - p.h * scale) / 2) / scale)
      if (!hit) return
      setKey(hit)
      setProbing(true)
      settle()
    })
  }

  const togglePause = () => market.setPaused(!market.paused)
  // A click or tap on the terrain pins the probe: the page's probe follows it, so the arrow keys step on from there.
  useEffect(() => {
    pinApi.current = (k) => {
      setKey(k)
      setProbing(true)
      settle()
    }
  })

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = key.current ?? shared.current?.key ?? null
    const big = e.shiftKey
    const move = (ddp: number, dage: number) => {
      e.preventDefault()
      const cur = k ?? PROBE_START
      const next = k
        ? { dp: Math.max(-MAX_DP, Math.min(MAX_DP, cur.dp + ddp * (big ? 10 : 1))), age: Math.max(0, Math.min(240, cur.age + dage * (big ? 60 : 12))) }
        : cur
      setKey(next)
      setProbing(true)
      settle()
    }
    switch (e.key) {
      case 'ArrowLeft':
        return move(-1, 0)
      case 'ArrowRight':
        return move(1, 0)
      case 'ArrowUp':
        return move(0, 1)
      case 'ArrowDown':
        return move(0, -1)
      case 'Home':
        e.preventDefault()
        setKey(PROBE_START)
        setProbing(true)
        settle()
        return
      case 'Escape':
        setKey(null)
        setProbing(false)
        return
      case ' ':
        if (!live) return
        e.preventDefault()
        togglePause()
        return
    }
  }

  const ref = (id: string) => (el: HTMLElement | null) => {
    out.current[id] = el
  }
  // Arrived from the Contents' miniature: the still frame waited for the handed moment (lib/minis/handoff.ts); live at
  // it now, or not to be, it need not wait any longer.
  useEffect(() => {
    if (live || why) delete document.documentElement.dataset.orderbookHandoff
  }, [live, why])
  // The hand-off, taken as the page opens, so it never outlives this visit to the page.
  useEffect(() => void market.claim(), [])

  const rail = <Readouts initial={initial} set={ref} />

  return (
    <FigureFrame
      id="fig-order-book"
      number="Fig. 1"
      title={title}
      subtitle={subtitle}
      rail={rail}
      railBelow={false}
      vt="order-book"
      hint={
        // Room kept for the longest hint (the live figure's), so going live never moves the page below.
        <span className="block min-h-[3lh] sm:min-h-[2lh]">
          {/* Said for the pointer this reader has: a finger taps, and has no keys to name. */}
          {mounted && matchMedia('(pointer: coarse)').matches
            ? live
              ? 'Tap the terrain to read a price level; drag sideways to turn it.'
              : `${why ? `${why} ` : ''}Tap the terrain to read a price level.`
            : live
              ? 'Point at the terrain, or tab to it and use the arrow keys, to read a price level. Drag to turn it; Space pauses.'
              : `${why ? `${why} ` : ''}Click the terrain, or tab to it and use the arrow keys, to read a price level.`}
        </span>
      }
      caption={caption}
      table={table}
    >
      <div className="relative -mx-6 sm:mx-0">
        <div
          ref={box}
          data-seq={sig.state}
          role="group"
          tabIndex={0}
          aria-roledescription="interactive figure"
          aria-label="Synthetic order book as terrain. Arrow keys move the probe across price and back in time; Home resets; Escape clears; Space pauses."
          aria-describedby="fig-order-book-probe"
          onKeyDown={onKey}
          onFocus={() => {
            if (!key.current) {
              setKey(PROBE_START)
              setProbing(true)
            }
          }}
          onPointerMove={lean.onPointerMove}
          onPointerLeave={lean.onPointerLeave}
          onClick={(e) => {
            lean.onTap()
            onStillPick(e)
          }}
          className="peer relative h-[clamp(26rem,70svh,38rem)] cursor-crosshair touch-pan-y overflow-hidden select-none focus-visible:outline-none sm:h-[clamp(28rem,62svh,38rem)] lg:h-[clamp(26rem,56svh,36rem)]"
        >
          <div data-orderbook-poster="" className="absolute inset-0" style={underlay(live)}>
            {poster}
            {stillMark && !live && (
              <svg
                aria-hidden
                data-still-mark=""
                viewBox={`0 0 ${stillMark.w} ${stillMark.h}`}
                preserveAspectRatio="xMidYMid meet"
                className="pointer-events-none absolute inset-0 size-full"
              >
                <circle cx={stillMark.x} cy={stillMark.y} r={6} fill="var(--color-ink)" stroke="var(--color-paper)" strokeWidth={2} />
              </svg>
            )}
          </div>
          <canvas ref={canvas} aria-hidden className="absolute inset-0 size-full" style={fade(live)} />
          <div ref={labels} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={fade(live)} />
        </div>
        <FocusRing />
      </div>

      {/* The reading takes the row's width and the controls keep their own place, so a reading never moves them. */}
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
        {/* On a phone the reading wraps rather than lose its end, in room kept for its longest (four lines). */}
        <dl id="fig-order-book-probe" className="text-meta grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] content-start gap-x-3 font-mono max-sm:min-h-[4lh] max-sm:[&_dd]:whitespace-normal" aria-label="Probe reading">
          <dt className="text-graphite">Probe</dt>
          <dd className="text-ink sm:truncate">
            <span ref={ref('p-price')} className="tabular">
              —
            </span>{' '}
            <span ref={ref('p-side')} className="text-graphite">
              point at the terrain
            </span>
          </dd>
          <dt className="text-graphite">Queue</dt>
          <dd className="text-ink sm:truncate">
            <span ref={ref('p-queue')} className="tabular">
              —
            </span>{' '}
            <span ref={ref('p-cum')} className="text-graphite" />
          </dd>
          <dt className="text-graphite">When</dt>
          <dd ref={ref('p-ago')} className="tabular text-ink sm:truncate">
            —
          </dd>
        </dl>
        <div data-orderbook-controls="" className="flex min-h-8 shrink-0 gap-2">
          {live ? (
            <>
              <button type="button" onClick={togglePause} className={`${CONTROL} min-w-[4.5rem]`} data-hold="">
                {paused ? 'Resume' : 'Pause'}
              </button>
              <button
                type="button"
                data-replay=""
                // Replay tells the story again, so the market goes on: a paused figure's story would hold where it is.
                onClick={() => {
                  if (market.paused) market.setPaused(false)
                  if (book.current) book.current.sink(() => sig.replay())
                  else sig.replay()
                }}
                className={CONTROL}
              >
                Replay
              </button>
            </>
          ) : null}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {probing ? spoken : ''}
      </p>
      <div className="mt-4 lg:hidden">
        <Readouts initial={initial} set={ref} suffix="-m" across />
      </div>
      <DebugSlot title="Order book, Fig. 1" read={readDebug} />
    </FigureFrame>
  )
}

function Readouts({ initial, set, suffix = '', across = false }: { initial: Initial; set: (id: string) => (el: HTMLElement | null) => void; suffix?: string; across?: boolean }) {
  const rows: [string, string, string][] = [
    ['mid', 'Mid', fmt.mid(initial.mid)],
    ['spread', 'Spread', fmt.spread(initial.spread)],
    ['trades', 'Trades, 10 s', `${initial.trades} · ${fmt.shares(initial.shares)}`],
    ['rate', 'Events, 10 s', `${initial.rate.toFixed(1)} a second`],
    ['expected', 'Stationary rate', `${initial.expected.toFixed(1)} a second`],
    ['rho', 'Branching ratio', initial.rho.toFixed(2)],
  ]
  return (
    <dl
      className={
        across
          ? 'text-meta grid grid-cols-2 gap-x-6 gap-y-3 border-t border-rule pt-3 font-mono sm:grid-cols-3'
          : 'text-meta grid grid-cols-1 gap-y-px font-mono lg:text-right [&_dd]:mb-2'
      }
    >
      {rows.map(([id, label, value]) => {
        // The model's own constants, set after a hairline in graphite: they never change as the market runs.
        const fixed = id === 'expected' || id === 'rho'
        return (
          <div key={id} className={`min-w-0 ${id === 'expected' && !across ? 'mt-1 border-t border-rule pt-3' : ''}`}>
            <dt className="text-graphite">{label}</dt>
            <dd ref={fixed ? undefined : set(id + suffix)} data-orderbook-value={fixed ? undefined : ''} className={`tabular ${fixed ? 'text-graphite' : 'text-ink'}`}>
              {value}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
