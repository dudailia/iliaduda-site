import { Sequence } from '../stage/sequence'

/**
 * The order book's signature moment: the terrain rising out of the page as
 * the order flow starts. It opens on the flat plane of the page, seen almost
 * edge-on; the walls rise in a wave from now back into the past, each row on
 * the burst's quintic ease-out; the price river draws in behind the wave; the
 * camera lifts into its resting view; the labels come last. The market runs
 * live from the first frame, so the rows arriving at the front are real flow.
 */

export const RISE_MS = 3200

export const orderBookSequence = () =>
  new Sequence(RISE_MS, {
    rise: [0, 0.72],
    river: [0.1, 0.5],
    settle: [0.3, 0.9],
    labels: [0.8, 1],
  })

/** Of the rise phase, the share the wave takes to sweep from now to the oldest row, and the share each row takes. */
const SWEEP = 0.6
const EACH = 0.4

/** How far row `age` (0 = now) of `rows` has risen, `rise` (0…1) into the rise phase. */
export function rowRise(rise: number, age: number, rows: number): number {
  const start = (Math.min(age, rows - 1) / Math.max(1, rows - 1)) * SWEEP
  const u = Math.min(1, Math.max(0, (rise - start) / EACH))
  return 1 - (1 - u) ** 5
}
