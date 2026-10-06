'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { saveData, useReducedMotion, whenIdle } from '@/components/stage/env'
import { Mirror } from '@/lib/market/mirror'
import { FRAME_BYTES, readFrame, type Act, type FromWorker, type ToWorker } from '@/lib/market/protocol'

/**
 * /market's market on the page: the worker that runs it (lib/market/market.worker.ts), and the mirror every view
 * draws from (lib/market/mirror.ts).
 *
 * The worker starts once one of the figures it drives is a fifth on screen and the page has gone idle, and never
 * under reduced motion, save-data, or when the page says it may not (`allowed`: the software tier, as Lighthouse
 * runs, keeps its still frames). It then runs while any of them shows and the tab is visible, one frame asked for
 * at a time with the page's own frame clock: the worker moves the market on by the time since the last, at most a
 * tenth of a second, so a hidden tab comes back to the market it left. Each answer is taken into the mirror when it
 * lands, before the next animation frame, where `draw` is called; every view drawing in that frame — this one or
 * another loop's, like the surface's own — draws the same market.
 */
export interface LiveMarket {
  mirror: Mirror
  /** The first frame is in. */
  live: boolean
  /** Why the market will not run here, when it will not. */
  declined: string | null
  /** The market's hash (lib/market/engine.ts) as the worker built it, for ?debug=1 and the engines test. */
  hash: string | null
  /** An action now, or at simulated time `at` (lib/market/host.ts). */
  act(a: Act, at?: number): void
  /** Drop an action waiting for its time. */
  unschedule(): void
  pause(): void
  resume(): void
  reset(): void
}

export function useMarket(
  boxes: readonly RefObject<HTMLElement | null>[],
  opts: {
    seed: number
    t: number
    allowed: boolean
    draw?: (m: Mirror, now: number) => void
    /** Called as each frame is taken in, before the next animation frame: where a page notices what the frame brought. */
    onTake?: (m: Mirror) => void
  },
): LiveMarket {
  const reduced = useReducedMotion()
  const [mirror] = useState(() => new Mirror())
  const [live, setLive] = useState(false)
  const [declined, setDeclined] = useState<string | null>(null)
  const [hash, setHash] = useState<string | null>(null)
  const worker = useRef<Worker | null>(null)
  const paused = useRef(false)
  /** When Pause was pressed (performance.now()), for the frames asked for while the market coasts to rest. */
  const pausedAtRef = useRef(-Infinity)
  const draw = useRef(opts.draw)
  const onTake = useRef(opts.onTake)
  useEffect(() => {
    draw.current = opts.draw
    onTake.current = opts.onTake
  })
  const refs = useRef(boxes)
  const { seed, t, allowed } = opts

  useEffect(() => {
    if (reduced || !allowed) return
    if (saveData()) {
      queueMicrotask(() => setDeclined('save-data'))
      return
    }
    const els = refs.current.map((r) => r.current).filter((e): e is HTMLElement => !!e)
    if (!els.length) return

    let w: Worker | null = null
    let disposed = false
    let cancelIdle: (() => void) | null = null
    let ready = false
    let inFlight = false
    let raf = 0
    // Frames this run of the worker has sent: the figure goes live on each run's first, and a run's market is its own.
    let got = 0
    let stopped = false
    mirror.restart()
    // One buffer: one frame is ever in flight, and it comes back with the next.
    const pool: ArrayBuffer[] = [new ArrayBuffer(FRAME_BYTES)]
    const seen = new Map<Element, number>()
    const visible = () => [...seen.values()].some((r) => r > 0)

    const post = (m: ToWorker, transfer?: Transferable[]) => w?.postMessage(m, transfer ?? [])

    const tick = (now: number) => {
      raf = 0
      if (!ready || stopped || !visible() || document.hidden) return
      // Paused, it asks for nothing more once it has the frame it opens on and that frame's fan (a market paused on an
      // earlier page of the visit still goes live, all its views drawn, to be resumed); the held market draws the fan
      // on, and nothing else moves.
      // A Pause just pressed: frames go on being asked for while the market coasts to rest (240ms, and a little).
      const coasting = paused.current && now - pausedAtRef.current < 300
      if (!inFlight && (!paused.current || coasting || got === 0 || !mirror.fan) && pool.length) {
        const buf = pool.pop()!
        inFlight = true
        post({ kind: 'frame', at: now, buf }, [buf])
      }
      draw.current?.(mirror, now)
      raf = requestAnimationFrame(tick)
    }
    // Arrived by a paper's morph, the market's catch-up runs in its worker under the morph (off the main thread), and
    // its frames are asked for and drawn from the frame the morph lands: drawing during it would stutter the morph.
    const morphing = () => !!document.documentElement.dataset.vtRunning
    let afterMorph: (() => void) | null = null
    const run = () => {
      if (raf || !ready || stopped || !visible() || document.hidden) return
      if (morphing()) {
        afterMorph ??= whenIdle(() => {
          afterMorph = null
          run()
        })
        return
      }
      raf = requestAnimationFrame(tick)
    }
    // The market failed: the loop stops and the worker goes, and the figure keeps its still frames with the reason.
    const stop = (why: string) => {
      stopped = true
      cancelAnimationFrame(raf)
      raf = 0
      w?.terminate()
      worker.current = null
      setLive(false)
      setDeclined(why)
    }

    const start = () => {
      if (w || disposed) return
      try {
        w = new Worker(new URL('../../lib/market/market.worker.ts', import.meta.url), { type: 'module' })
      } catch (e) {
        console.warn('the market could not start', e)
        setDeclined('no worker')
        return
      }
      worker.current = w
      w.onmessage = (e: MessageEvent<FromWorker>) => {
        const msg = e.data
        switch (msg.kind) {
          case 'ready':
            ready = true
            setHash(msg.hash)
            run()
            break
          case 'frame':
            inFlight = false
            mirror.take(readFrame(msg.buf))
            pool.push(msg.buf)
            onTake.current?.(mirror)
            if (++got === 1) setLive(true)
            break
          case 'fan':
            mirror.takeFan(msg)
            break
          case 'error':
            console.warn('the market stopped:', msg.message)
            stop('error')
            break
        }
      }
      w.onerror = (e) => {
        e.preventDefault()
        console.warn('the market could not start:', e.message)
        stop('no worker')
      }
      post({ kind: 'start', seed, t })
      if (paused.current) post({ kind: 'pause' })
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target, e.isIntersecting ? e.intersectionRatio : 0)
        if (!w && !cancelIdle && [...seen.values()].some((r) => r >= 0.2)) {
          // Under a morph the worker starts now (the stage stood empty a quarter of a second after the morph while it
          // was fetched and caught up); otherwise, at the next idle moment.
          if (morphing()) {
            start()
            cancelIdle = () => {}
          } else cancelIdle = whenIdle(start)
        }
        run()
      },
      { threshold: [0, 0.01, 0.2] },
    )
    for (const el of els) io.observe(el)
    const onVis = () => run()
    document.addEventListener('visibilitychange', onVis)

    return () => {
      disposed = true
      cancelIdle?.()
      afterMorph?.()
      cancelAnimationFrame(raf)
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      w?.terminate()
      worker.current = null
      setLive(false)
    }
  }, [reduced, allowed, mirror, seed, t])

  const send = (m: ToWorker) => worker.current?.postMessage(m)
  return {
    mirror,
    live: live && !reduced,
    declined,
    hash,
    act: (a, at) => send(at === undefined ? { kind: 'act', act: a } : { kind: 'act', act: a, at }),
    unschedule: () => send({ kind: 'unschedule' }),
    pause: () => {
      paused.current = true
      pausedAtRef.current = performance.now()
      send({ kind: 'pause' })
    },
    resume: () => {
      paused.current = false
      send({ kind: 'resume' })
    },
    reset: () => send({ kind: 'reset' }),
  }
}
