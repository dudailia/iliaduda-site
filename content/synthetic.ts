import type { Fact } from './facts'

/**
 * Synthetic facts: the hand-set SSVI parameters behind the hero figure and
 * paper 1. Not fitted to any market data and not any employer's model. Chosen
 * so the surface looks like an equity index — downward skew, a volatility
 * term structure that decays from the short end — and satisfies Gatheral and
 * Jacquier's sufficient no-arbitrage conditions, which tests/svi.test.ts
 * checks.
 *
 * Kept apart from facts.ts, which spreads them back into the one table the
 * gates read, for a single reason: the live figure runs in the browser, and
 * importing the full table there shipped every project's numbers to every
 * visitor in order to read seven.
 */
export const synthetic = {
  ivSigmaShort: {
    value: 0.26,
    unit: 'none',
    label: 'at-the-money volatility at the short end',
    source: 'lib/svi.ts — synthetic, set by hand',
    kind: 'synthetic',
  },
  ivSigmaLong: {
    value: 0.19,
    unit: 'none',
    label: 'long-run at-the-money volatility',
    source: 'lib/svi.ts — synthetic, set by hand',
    kind: 'synthetic',
  },
  ivKappa: {
    value: 1.5,
    unit: 'none',
    label: 'term-structure decay rate, per year',
    source: 'lib/svi.ts — synthetic, set by hand',
    kind: 'synthetic',
  },
  ivRho: {
    value: -0.62,
    unit: 'none',
    label: 'skew, ρ',
    source: 'lib/svi.ts — synthetic, set by hand',
    kind: 'synthetic',
  },
  ivEta: {
    value: 1.1,
    unit: 'none',
    label: 'curvature, η',
    source: 'lib/svi.ts — synthetic, set by hand; η(1+|ρ|) ≤ 2',
    kind: 'synthetic',
  },
  ivGamma: {
    value: 0.5,
    unit: 'none',
    label: 'power-law exponent, γ',
    source: 'lib/svi.ts — synthetic, set by hand',
    kind: 'synthetic',
  },
  ivForward: {
    value: 100,
    unit: 'none',
    label: 'forward price',
    source: 'lib/bs.ts — synthetic, a round number with rates and dividends at zero',
    kind: 'synthetic',
  },
} as const satisfies Record<string, Fact>

export type SyntheticKey = keyof typeof synthetic

/** Read a synthetic value. Safe to import from client components. */
export function syntheticValue(key: SyntheticKey): number {
  return synthetic[key].value
}
