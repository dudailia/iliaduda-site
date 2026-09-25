'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FigureFrame, Readouts } from '@/components/FigureFrame'
import { useOnceSeen, useReducedMotion } from '../surface/env'

/**
 * A held-out match, replayed ball by ball: the model's calibrated probability
 * that the side batting first wins, with the match state at the playhead in
 * the margin.
 *
 * The line draws itself once, the first time the figure is properly on screen:
 * a replay, so it runs at constant speed — linear is right for time passing —
 * and any scrub, key or button press takes over from wherever it is. Reduced
 * motion: the whole match is simply there, playhead at the end.
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

const pct = (p: number) => (p >= 0.9995 ? '> 99.9%' : p <= 0.0005 ? '< 0.1%' : `${(p * 100).toFixed(1)}%`)

export function CricketLive({ balls, maxBalls, first, second, result, caption, table, description }: Props) {
  const n = balls.length
  const box = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [at, setAt] = useState(n - 1)
  const [playing, setPlaying] = useState(false)
  const raf = useRef(0)
  const start = useRef(0)
  const from = useRef(0)

  // Where the innings changes, and the x of every ball.
  const breakAt = balls.findIndex((b) => b[0] === 2)
  const x = (i: number) => (i / (n - 1)) * W
  const y = (p: number) => (1 - p) * H
  const path = balls.map((b, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(b[9]).toFixed(1)}`).join('')

  const stop = () => {
    cancelAnimationFrame(raf.current)
    setPlaying(false)
  }

  const play = (fromIndex: number) => {
    cancelAnimationFrame(raf.current)
    from.current = fromIndex
    start.current = 0
    setPlaying(true)
    const tick = (t: number) => {
      if (!start.current) start.current = t
      const remaining = n - 1 - from.current
      const i = Math.min(n - 1, from.current + Math.floor(((t - start.current) / REPLAY_MS) * (n - 1)))
      setAt(i)
      if (i < n - 1 && remaining > 0) raf.current = requestAnimationFrame(tick)
      else setPlaying(false)
    }
    raf.current = requestAnimationFrame(tick)
  }

  // The one self-drawing replay, once, when the figure is actually seen — and
  // not if the reader has already taken the scrubber.
  useOnceSeen(box, 0.35, () => {
    if (reduced || box.current?.contains(document.activeElement)) return
    setAt(0)
    play(0)
  })
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

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
      subtitle="T20 win probability for the side batting first · B3 gradient boosting · isotonic, fit on validation · held-out test match"
      rail={<Readouts rows={rows} />}
      caption={caption}
      table={table}
      hint="Scrub or use the arrow keys to move ball by ball · Home and End jump · the line is the model’s output before each ball"
    >
      <div ref={box} className="relative">
        <div className="flex">
          <div aria-hidden className="text-meta relative w-9 shrink-0 font-mono text-graphite">
            {[1, 0.75, 0.5, 0.25, 0].map((v) => (
              <span key={v} className="absolute right-2 -translate-y-1/2" style={{ top: `${(1 - v) * 100}%` }}>
                {v * 100}%
              </span>
            ))}
          </div>
          <div className="relative aspect-[5/3] min-w-0 flex-1 sm:aspect-[16/7]">
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
                {[0.25, 0.75].map((v) => (
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
              <path d={path} fill="none" stroke="var(--color-indigo)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" clipPath="url(#replay-clip)" />
              {balls.map((bb, i) =>
                bb[8] ? <line key={i} x1={x(i)} x2={x(i)} y1={H} y2={H - 45} stroke="var(--color-ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" /> : null,
              )}
              <line x1={x(at)} x2={x(at)} y1={0} y2={H} stroke="var(--color-indigo)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            </svg>
            <span
              aria-hidden
              className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-indigo"
              style={{ left: `${(x(at) / W) * 100}%`, top: `${(y(p) / H) * 100}%` }}
            />
          </div>
        </div>

        {/* Innings, named under the axis rather than over the curve. */}
        <div aria-hidden className="text-meta relative mt-1.5 ml-9 h-5 font-mono text-graphite">
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(x(breakAt) / W) * 50}%` }}>
            {first} batting
          </span>
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${(x(breakAt) / W) * 100 + (100 - (x(breakAt) / W) * 100) / 2}%` }}
          >
            {second} chasing
          </span>
        </div>

        <div className="mt-3 flex items-center gap-3 pl-9">
          <button
            type="button"
            onClick={() => (playing ? stop() : play(at >= n - 1 ? 0 : at))}
            className="text-meta w-[4.5rem] shrink-0 rounded-sm border border-rule px-2 py-1.5 font-mono transition-colors duration-150 ease-out hover:border-graphite"
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
              stop()
              setAt(Number(e.currentTarget.value))
            }}
            onKeyDown={() => playing && stop()}
            className="w-full accent-[var(--color-indigo)]"
          />
        </div>
        <p className="sr-only" aria-live="polite">
          {playing ? '' : valueText}
        </p>
      </div>
    </FigureFrame>
  )
}
