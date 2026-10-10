import { steadyAt } from './governor'

/**
 * The display's clock, read once a visit from bare animation frames (nothing drawn), from the moment the page's first
 * figure mounts: sixteen intervals at a time, up to four times, until they read steady. A figure's own frames before its
 * first drawn one said it too, but the home and IV figures draw almost at once, so in Low Power Mode (30 Hz, each stamp
 * 0–22ms late) their stories' frames read as slow work: the governor starved frames to read the clock mid-story, and
 * stepped quality down in one story in five. Each figure's governor is seeded with it, when it starts or, if it has
 * started already, when it arrives.
 */
let sample: readonly number[] | null = null
let running = false
const waiting = new Set<(v: readonly number[]) => void>()

/** Calls `fn` with the page's clock sample once there is one; returns a function that stops waiting. */
export function onPageClock(fn: (v: readonly number[]) => void): () => void {
  if (sample) {
    fn(sample)
    return () => {}
  }
  waiting.add(fn)
  read()
  return () => void waiting.delete(fn)
}

/** Starts reading the clock (once a visit), so that it has been read by the time a figure starts. */
export function readPageClock() {
  read()
}

function read() {
  if (running || typeof requestAnimationFrame !== 'function') return
  running = true
  const seen: number[] = []
  let last = 0
  let tries = 0
  const step = (now: number) => {
    if (last) seen.push(now - last)
    last = now
    if (seen.length < 16) return void requestAnimationFrame(step)
    if (steadyAt(seen) !== null) {
      sample = seen.slice()
      for (const f of waiting) f(sample)
      waiting.clear()
      return
    }
    // Unsteady (the page still loading, a long task): read again, four times at most.
    if (++tries >= 4) return
    seen.length = 0
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

/** Tests only: forgets the sample. */
export function resetPageClock() {
  sample = null
  running = false
  waiting.clear()
}
