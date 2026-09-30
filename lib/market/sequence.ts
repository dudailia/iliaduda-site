import { EASE_IN_OUT_QUAD, EASE_OUT } from '../ease'
import { Sequence } from '../stage/sequence'

/**
 * /market's signature moment: the liquidity shock hitting all three views at once. The market runs calm for 2.5
 * seconds, long enough to see its three views move together; then the page presses Liquidity shock, and the shock
 * (lib/market/shock.ts) lands in all three in the frame it arrives; then six seconds of the model's own recovery,
 * told in a line. The rules are every signature's (lib/stage/sequence.ts): the clock moves only on drawn frames, a
 * click or key in the calm lands it at once, a scroll does not.
 *
 * The camera takes the shock as a blow: in by 3% of its distance on the strong ease-out (450ms), held while the
 * surface lifts (1.2 s), and out on the in-out for long camera moves (2.4 s); 3%, so the surface at a full shock
 * stays inside the margins its framing is fitted with (lib/surface/view.ts, fitDistance). A reader's own shocks strike
 * it too, as hard as the shock they deliver.
 */
export const MARKET_SEQ = {
  calm: 2500,
  recovery: 6000,
  /** Of the recovery, how long the shock's words stay before the recovery's, ms. */
  told: 3500,
  /** The camera's blow, seconds, and how far in, as a share of its distance. */
  punch: { in: 0.45, hold: 1.2, out: 2.4, depth: 0.03 },
} as const

const TOTAL = MARKET_SEQ.calm + MARKET_SEQ.recovery
const LAND = MARKET_SEQ.calm / TOTAL

export type MarketPhase = 'calm' | 'land' | 'recovery'

export const marketSequence = () =>
  new Sequence<MarketPhase>(TOTAL, {
    calm: [0, LAND],
    // A step: nothing, then, a millisecond after the calm, the shock.
    land: [LAND, LAND + 1 / TOTAL],
    recovery: [LAND, 1],
  })

/** What the page says of the story at these phases. */
export function storyOf(ph: Record<MarketPhase, number>): 'calm' | 'shock' | 'recovery' {
  if (ph.land <= 0) return 'calm'
  return ph.recovery * MARKET_SEQ.recovery < MARKET_SEQ.told ? 'shock' : 'recovery'
}

/** How far the camera is struck in, 0 to 1, `t` seconds after a shock lands. */
export function punch(t: number): number {
  const { in: a, hold, out } = MARKET_SEQ.punch
  if (!(t > 0)) return 0
  if (t < a) return EASE_OUT(t / a)
  if (t <= a + hold) return 1
  if (t < a + hold + out) return 1 - EASE_IN_OUT_QUAD((t - a - hold) / out)
  return 0
}
