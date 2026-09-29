'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FigureFrame, Readouts } from '@/components/FigureFrame'
import { arrivedByMorph } from '@/lib/arrival'
import { useOnceSeen, useReducedMotion } from '@/components/stage/env'
import { CONTROL } from '@/components/stage/controls'

/**
 * A held-out match, replayed ball by ball: the model's calibrated probability
 * that the side batting first wins, with the match state at the playhead in
 * the margin.
 *
 * The line draws itself once a visit, the first time the figure is properly
 * on screen: a replay, so it runs at constant speed (linear is right for time
 * passing), on the frames the figure is seen for (off screen, or in a hidden
 * tab, it waits), and any scrub, key or button press takes over from wherever
 * it is. On that first look the line is still to be drawn from first paint (the
 * pre-paint mark), so the replay never wipes a finished figure the reader has
 * already read. Reduced motion, a visit that has seen it, or an arrival
 * through the contents morph: the whole match is simply there, playhead at the
 * end.
 */

/** [innings, over, ball, runs, wickets, legalBalls, target|0, runsOffBall, wicketsOffBall, p] */
export type Ball = readonly [number, number, number, number, number, number, number, number, number, number]

const REPLAY_MS = 4200
const W = 1000
const H = 1000

interface Props {
  balls: readonly Ball[]
  maxBalls: number
  first: string
  second: string
  result: string
  caption: ReactNode
  table: ReactNode
  description: string
}

/**
 * The vertical axis is log-odds. Win probability spends most of a one-sided
 * match above 97%, where a linear axis flattens it into the frame; on
 * log-odds, the distance from 99% to 99.9% is the same as from 50% to 90%,
 * which is how a model's confidence should be read.
 */
const CLAMP = 0.9995
const logit = (p: number) => Math.log(p / (1 - p))
const L = logit(CLAMP)
const TICKS = [0.01, 0.1, 0.5, 0.9, 0.99, 0.999] as const
const tickLabel = (t: number) => `${(t * 100).toFixed(t < 0.01 || t > 0.99 ? 1 : 0)}%`

const pct = (p: number) => (p >= 0.9995 ? '> 99.9%' : p <= 0.0005 ? '< 0.1%' : `${(p * 100).toFixed(1)}%`)

export function CricketLive({ balls, maxBalls, first, second, result, caption, table, description }: Props) {
  const n = balls.length
  const box = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [at, setAt] = useState(n - 1)
  const [playing, setPlaying] = useState(false)
  /** Said only for what the reader did not do on the control itself: the replay coming to its end. */
  const [said, setSaid] = useState('')
  const raf = useRef(0)
  const from = useRef(0)
  const elapsed = useRef(0)
  const seen = useRef(true)
  /** A replay waiting off screen: how to carry on when the figure is back. */
  const parked = useRef<(() => void) | null>(null)
  /** This visit's replay is still to come: the pre-paint mark hides the drawn line until it starts. */
  const armed = useRef(false)

  // Where the innings changes, and the x of every ball.
  const breakAt = balls.findIndex((b) => b[0] === 2)
  const x = (i: number) => (i / (n - 1)) * W
  const y = (p: number) => ((L - logit(Math.min(CLAMP, Math.max(1 - CLAMP, p)))) / (2 * L)) * H
  // Built once: the line does not change, only how much of it is drawn.
  const path = useMemo(() => balls.map((b, i) => `${i ? 'L' : 'M'}${((i / (n - 1)) * W).toFixed(1)} ${(((L - logit(Math.min(CLAMP, Math.max(1 - CLAMP, b[9])))) / (2 * L)) * H).toFixed(1)}`).join(''), [balls, n])
  const wickets = useMemo(
    () => balls.map((bb, i) => (bb[8] ? <line key={i} x1={(i / (n - 1)) * W} x2={(i / (n - 1)) * W} y1={H} y2={H - 45} stroke="var(--color-ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" /> : null)),
    [balls, n],
  )

  /**
   * This visit's replay is spent: it starts now, or it will not come (the reader took the figure first, or it is not to
   * play). `show` drops the mark at once; a replay that starts drops it once it has drawn its first frame at ball 1.
   */
  const release = (show = true) => {
    armed.current = false
    if (show) delete document.documentElement.dataset.cricketSeq
    try {
      sessionStorage.setItem('cricket-seq', '1')
    } catch {}
  }
  useEffect(() => {
    if (playing) delete document.documentElement.dataset.cricketSeq
  }, [playing])

  // Replay from the end lets the drawn match go first (150ms on the ease-out), as every re-run on the site does, then
  // plays it again from the first ball; a press while it lets go does nothing more. The opacity is set only while it
  // lets go, so the first visit's pre-paint hide still holds.
  const letting = useRef(false)
  const letTimer = useRef(0)
  useEffect(() => () => clearTimeout(letTimer.current), [])
  const replay = () => {
    const parts = [...(box.current?.querySelectorAll<SVGElement>('[data-played]') ?? [])]
    if (reduced || !parts.length) return play(0)
    if (letting.current) return
    letting.current = true
    for (const el of parts) {
      el.style.transition = 'opacity 150ms var(--ease-out)'
      el.style.opacity = '0'
    }
    letTimer.current = window.setTimeout(() => {
      letting.current = false
      setAt(0)
      play(0)
      requestAnimationFrame(() => {
        for (const el of parts) {
          el.style.transition = ''
          el.style.opacity = ''
        }
      })
    }, 150)
  }

  const stop = () => {
    cancelAnimationFrame(raf.current)
    parked.current = null
    setPlaying(false)
  }

  const play = (fromIndex: number) => {
    cancelAnimationFrame(raf.current)
    parked.current = null
    // Reduced motion (the browser's own answer): the replay's end at once, the whole match, said as it would be.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setAt(n - 1)
      setPlaying(false)
      setSaid(`Replayed to the end: ${result}.`)
      return
    }
    from.current = fromIndex
    elapsed.current = 0
    setPlaying(true)
    let last = 0
    // Time passes on the frames the figure is seen for: off screen or in a hidden tab the playhead waits.
    const tick = (t: number) => {
      // Off screen the replay waits, asking for no frames: it picks up where it was as the figure comes back.
      if (!seen.current) {
        parked.current = () => {
          last = 0
          raf.current = requestAnimationFrame(tick)
        }
        return
      }
      const dt = last ? Math.min(100, t - last) : 0
      last = t
      if (!document.hidden) elapsed.current += dt
      const i = Math.min(n - 1, from.current + Math.floor((elapsed.current / REPLAY_MS) * (n - 1)))
      setAt(i)
      if (i < n - 1) raf.current = requestAnimationFrame(tick)
      else {
        setPlaying(false)
        setSaid(`Replayed to the end: ${result}.`)
      }
    }
    raf.current = requestAnimationFrame(tick)
  }

  useEffect(() => {
    const d = document.documentElement
    d.dataset.cricketLive = '1'
    armed.current = d.dataset.cricketSeq === '1'
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        seen.current = !!e?.isIntersecting
        const go = parked.current
        if (seen.current && go) {
          parked.current = null
          go()
        }
      },
      { threshold: 0 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf.current)
      parked.current = null
    }
  }, [])

  // The one self-drawing replay, once a visit, when the figure is actually seen, and not if the reader has already
  // taken the scrubber.
  useOnceSeen(box, 0.6, () => {
    // The browser's own answer (hydration reads reduced motion as on: the server cannot know).
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!armed.current || still || arrivedByMorph() || box.current?.contains(document.activeElement)) return release()
    release(false)
    setAt(0)
    play(0)
  })

  // Reduced motion asked for while it plays: the whole match, at once. (The browser's own answer: hydration reads
  // reduced motion as on, which is not the reader asking.)
  useEffect(() => {
    if (!reduced || !matchMedia('(prefers-reduced-motion: reduce)').matches) return
    cancelAnimationFrame(raf.current)
    parked.current = null
    queueMicrotask(() => {
      setPlaying(false)
      setAt(n - 1)
    })
    if (armed.current) release()
  }, [reduced, n])

  const b = balls[at]!
  const [inn, over, ball, runs, wkts, legal, target, offRuns, offWkts, p] = b
  const batting = inn === 1 ? first : second
  const left = maxBalls - legal
  const need = target ? target - runs : 0
  const thisBall = offWkts ? (offWkts > 1 ? `${offWkts} wickets` : 'wicket') : `${offRuns} run${offRuns === 1 ? '' : 's'}`
  const done = at === n - 1 && !playing

  const rows = [
    { label: 'Innings', value: inn === 1 ? `1 · ${first} batting` : `2 · ${second} chasing` },
    { label: 'Before ball', value: `over ${over}.${ball}` },
    { label: 'Score', value: `${batting} ${runs}/${wkts}` },
    // Every row is always present, so the margin never changes height while
    // the replay runs — a row appearing mid-replay was a layout shift.
    { label: 'Chase', value: target ? `${need} from ${left} balls` : '—' },
    { label: `P(${first} win)`, value: pct(p) },
    { label: 'This ball', value: thisBall },
    { label: 'Result', value: done ? result : '—' },
  ]

  const valueText = `${batting} ${runs} for ${wkts}, over ${over}.${ball}; probability ${first} wins ${pct(p)}`

  return (
    <FigureFrame
      id="fig-replay"
      number="Fig. 1"
      vt="cricstate"
      title={`${first} v ${second}, replayed ball by ball`}
      subtitle="probability the side batting first wins · gradient boosting on match state · calibrated on the season before · a match it never saw · log-odds scale"
      rail={
        <div data-played-rail="">
          <Readouts rows={rows} />
        </div>
      }
      caption={caption}
      table={table}
      hint="Scrub or use the arrow keys to move ball by ball · Home and End jump · the line is the model’s output before each ball"
    >
      <div ref={box} className="relative">
        <div className="flex">
          <div aria-hidden className="text-meta relative w-11 shrink-0 font-mono text-graphite">
            {TICKS.map((v) => (
              <span key={v} className="absolute right-2 -translate-y-1/2" style={{ top: `${(y(v) / H) * 100}%` }}>
                {tickLabel(v)}
              </span>
            ))}
          </div>
          <div className="relative aspect-[5/3] min-w-0 flex-1 [container-type:size] sm:aspect-[16/7]">
            <svg
              role="img"
              aria-labelledby="fig-replay-svg-title"
              aria-describedby="fig-replay-desc"
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full overflow-visible"
            >
              <title id="fig-replay-svg-title">{`Probability ${first} wins, before each ball`}</title>
              <desc id="fig-replay-desc">{description}</desc>
              <g stroke="var(--color-rule)" strokeWidth={1} fill="none">
                {TICKS.filter((v) => v !== 0.5).map((v) => (
                  <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
              <line x1={0} x2={W} y1={y(0.5)} y2={y(0.5)} stroke="var(--color-graphite)" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
              <rect x={0} y={0} width={W} height={H} fill="none" stroke="var(--color-graphite)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <line x1={x(breakAt)} x2={x(breakAt)} y1={0} y2={H} stroke="var(--color-ink)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              {/* The whole match, faint, so the replay always has its context. */}
              <path d={path} fill="none" stroke="var(--color-indigo-wash)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              {/* Played so far: clipped at the playhead. */}
              <clipPath id="replay-clip">
                <rect x={0} y={-20} width={x(at) + 0.5} height={H + 40} />
              </clipPath>
              <path data-played="" d={path} fill="none" stroke="var(--color-indigo)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" clipPath="url(#replay-clip)" />
              {wickets}
              <line data-played="" x1={x(at)} x2={x(at)} y1={0} y2={H} stroke="var(--color-indigo)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            </svg>
            {/* Moved by transform, in the plot's own units (a size container), never by left and top. */}
            <span
              aria-hidden
              data-played=""
              className="pointer-events-none absolute top-0 left-0 size-2.5 rounded-full border-2 border-paper bg-indigo"
              style={{ transform: `translate(calc(${Math.min(99, (x(at) / W) * 100).toFixed(2)}cqw - 50%), calc(${((y(p) / H) * 100).toFixed(2)}cqh - 50%))` }}
            />
          </div>
        </div>

        {/* Innings, named under the axis rather than over the curve: each name centred under its own innings and kept
            to its width, so on a narrow screen it wraps rather than running into the other. */}
        <div aria-hidden className="text-meta mt-1.5 ml-11 flex font-mono text-graphite">
          <span className="px-1 text-center text-balance" style={{ width: `${(x(breakAt) / W) * 100}%` }}>
            {first} batting
          </span>
          <span className="px-1 text-center text-balance" style={{ width: `${100 - (x(breakAt) / W) * 100}%` }}>
            {second} chasing
          </span>
        </div>

        <p aria-hidden className="text-meta mt-1 ml-11 font-mono text-graphite">
          <span className="mr-1 inline-block h-2.5 w-px translate-y-0.5 bg-ink" /> a wicket falls
        </p>

        <div className="mt-3 flex items-center gap-3 pl-11">
          <button
            type="button"
            onClick={() => {
              if (armed.current) release()
              if (playing) stop()
              else if (at >= n - 1) replay()
              else play(at)
            }}
            className={`${CONTROL} w-[4.5rem] shrink-0`}
          >
            {playing ? 'Pause' : at >= n - 1 ? 'Replay' : 'Play'}
          </button>
          <input
            type="range"
            min={0}
            max={n - 1}
            step={1}
            value={at}
            aria-label="Ball"
            aria-valuetext={valueText}
            onChange={(e) => {
              if (armed.current) release()
              stop()
              setAt(Number(e.currentTarget.value))
            }}
            onKeyDown={() => {
              if (armed.current) release()
              if (playing) stop()
            }}
            className="h-6 w-full accent-[var(--color-indigo)]"
          />
        </div>
        {/* The slider speaks for itself (aria-valuetext); this says only what the reader did not do there. */}
        <p className="sr-only" aria-live="polite">
          {said}
        </p>
      </div>
    </FigureFrame>
  )
}
