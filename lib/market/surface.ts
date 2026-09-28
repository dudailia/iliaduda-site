import { params } from '../surface/shock'
import type { Params } from '../surface/ssvi'

/**
 * /market's vol surface: the IV paper's own shock family (lib/surface/shock.ts),
 * with the market's stress (lib/market/stress.ts) as its amplitude in place of
 * the paper's story. At calm it is exactly the /iv-surface paper's calm
 * surface; a stressed market lifts the short end, steepens the skew and
 * inverts the term structure, up to a full shock and no further — inside the
 * envelope in which the shock family is tested free of static arbitrage
 * (tests/surface-dynamics.test.ts; again over this map, tests/market-surface.test.ts).
 */
export function surfaceOf(stress: number): Params {
  const a = stress > 0 ? (stress < 1 ? stress : 1) : 0
  return params(a, 1)
}
