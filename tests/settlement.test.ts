import { describe, expect, it } from 'vitest'
import { FLOOR, maxTermFor, offeredTerms, settlementFor, terms, termForMonthly } from '../lib/settlement'

/** The invariants the portal's own tests assert, held against the port. */
const debts = [750_000, 6_000_000, 18_500_000, 14_730_099, 100]

describe('settlement arithmetic', () => {
  it('debt = payable + saved, exactly, for every term', () => {
    for (const d of debts) for (const t of terms(d)) expect(t.s.payable + t.s.saved).toBe(d)
  })
  it('the payments cover the payable amount, overshooting by less than one payment', () => {
    for (const d of debts)
      for (const { s } of terms(d)) {
        const paid = s.monthly * (s.months - 1) + s.last
        expect(paid).toBe(s.payable)
        expect(s.last).toBeGreaterThan(0)
        expect(s.last).toBeLessThanOrEqual(s.monthly)
      }
  })
  it('a single payment is the exact amount, kopecks included', () => {
    const s = settlementFor(14_730_099, 1)
    expect(s.monthly).toBe(s.payable)
    expect(s.payable % 100).not.toBe(0)
  })
  it('recurring payments are whole roubles', () => {
    for (const d of debts) for (const { s } of terms(d)) if (s.months > 1) expect(s.monthly % 100).toBe(0)
  })
  it('never offers a payment under the floor, and a small debt collapses to one payment', () => {
    for (const d of debts) for (const t of offeredTerms(d)) if (t.months > 1) expect(t.s.monthly).toBeGreaterThanOrEqual(FLOOR)
    expect(maxTermFor(750_000)).toBeLessThan(12)
    expect(maxTermFor(100)).toBe(1)
  })
  it('offered payments strictly fall as the term lengthens; dominated terms are hidden', () => {
    for (const d of debts) {
      const o = offeredTerms(d)
      for (let i = 1; i < o.length; i++) expect(o[i]!.s.monthly).toBeLessThan(o[i - 1]!.s.monthly)
    }
    expect(terms(18_500_000).some((t) => !t.offered)).toBe(true)
  })
  it('the inverse search picks the nearest offered term and breaks ties long', () => {
    const d = 6_000_000
    for (const t of offeredTerms(d)) expect(termForMonthly(d, t.s.monthly)).toBe(t.months)
  })
  it('refuses float money', () => {
    expect(() => settlementFor(1000.5, 3)).toThrow()
  })
})
