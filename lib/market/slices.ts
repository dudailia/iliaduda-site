import type { Flow } from './flow'

/** Quanta run between looks at the clock: one simulated second, well under a millisecond of work on a laptop. */
const PIECE = 60

/**
 * Runs a market to `tEnd` in slices of about `budgetMs` of work each, handing
 * control back between them through `yieldTo` (a browser passes a zero-delay
 * timeout), so building one never holds a phone's page for a long task. The
 * market moves only in whole quanta, in the same order however they are
 * grouped, so the result is the market one straight run makes.
 */
export function advanceInSlices(f: Flow, tEnd: number, budgetMs: number, now: () => number, yieldTo: (next: () => void) => void): Promise<Flow> {
  return new Promise((done) => {
    const slice = () => {
      const until = now() + budgetMs
      while (!f.advanceFor(tEnd, PIECE)) if (now() >= until) return yieldTo(slice)
      done(f)
    }
    slice()
  })
}
