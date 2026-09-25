import { syntheticValue } from '@/content/synthetic'

/**
 * The debt portal's settlement arithmetic, ported for the live figure. The
 * mechanics are the portal's (src/lib/settlement/compute.ts); the discount
 * ladder and the monthly floor are ILLUSTRATIVE — the client's real terms are a
 * commercial decision that was never in the code, and the portal holds a
 * placeholder slot for them.
 *
 * Money is integer kopecks throughout; floats never touch it.
 */

/** Illustrative discount, basis points, by the longest term it applies to. */
export const LADDER: readonly (readonly [number, number])[] = [
  [1, 3000],
  [3, 2500],
  [6, 2000],
  [12, 1500],
  [24, 1000],
  [36, 500],
]
export const MAX_MONTHS = syntheticValue('stMaxMonths')
export const FLOOR = syntheticValue('stFloorRub') * 100 // kopecks

function assertInteger(n: number, what: string) {
  if (!Number.isInteger(n)) throw new Error(`${what} must be an integer, got ${n}`)
}

export function discountBp(months: number): number {
  for (const [upTo, bp] of LADDER) if (months <= upTo) return bp
  return 0
}

export interface Settlement {
  readonly months: number
  readonly bp: number
  readonly saved: number
  readonly payable: number
  readonly monthly: number
  readonly last: number
}

/** A term's settlement: the discount floored in kopecks, a recurring payment
 *  rounded up to a whole rouble, and a final payment that absorbs the rest. A
 *  single payment is the exact payable amount, kopecks included. */
export function settlementFor(debt: number, months: number): Settlement {
  assertInteger(debt, 'debt')
  assertInteger(months, 'months')
  if (months < 1) throw new Error('months must be at least 1')
  const bp = discountBp(months)
  const saved = Math.floor((debt * bp) / 10000)
  const payable = debt - saved
  if (months === 1) return { months, bp, saved, payable, monthly: payable, last: payable }
  const monthly = Math.ceil(payable / months / 100) * 100
  const last = payable - monthly * (months - 1)
  return { months, bp, saved, payable, monthly, last }
}

/** The longest term whose payments all stay at or above the floor. A small
 *  debt collapses to a single payment. */
export function maxTermFor(debt: number): number {
  for (let m = MAX_MONTHS; m > 1; m--) {
    const s = settlementFor(debt, m)
    if (s.monthly >= FLOOR && s.last > 0) return m
  }
  return 1
}

/** Every term up to the maximum, and whether it is offered. A term is offered
 *  only if its payment is strictly lower than the last offered one: at a
 *  ladder cliff, a longer term can cost more a month, and a term that is
 *  worse in every way is not a choice worth showing. */
export function terms(debt: number): readonly { months: number; offered: boolean; s: Settlement }[] {
  const out: { months: number; offered: boolean; s: Settlement }[] = []
  let lastMonthly = Infinity
  for (let m = 1; m <= maxTermFor(debt); m++) {
    const s = settlementFor(debt, m)
    const offered = s.monthly < lastMonthly
    if (offered) lastMonthly = s.monthly
    out.push({ months: m, offered, s })
  }
  return out
}

export const offeredTerms = (debt: number) => terms(debt).filter((t) => t.offered)

/** The offered term whose payment is nearest what the reader says they can
 *  pay; a tie goes to the longer term. */
export function termForMonthly(debt: number, monthlyKopecks: number): number {
  let best = offeredTerms(debt)[0]!
  for (const t of offeredTerms(debt)) {
    const d = Math.abs(t.s.monthly - monthlyKopecks)
    const bd = Math.abs(best.s.monthly - monthlyKopecks)
    if (d < bd || (d === bd && t.months > best.months)) best = t
  }
  return best.months
}

export const rub = (kopecks: number) =>
  `${(kopecks / 100).toLocaleString('en-US', { minimumFractionDigits: kopecks % 100 ? 2 : 0, maximumFractionDigits: 2 })} ₽`
