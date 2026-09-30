import { describe, expect, it } from 'vitest'
import curve from '../content/data/ofz-curve.json'
import { fact } from '../content/facts'
import { zcy } from '../lib/gcurve'

/**
 * The BCS figure draws the OFZ curve continuously between the terms the
 * exchange publishes. That is only licensed if the formula in lib/gcurve.ts is
 * the formula the exchange uses — so every published yield, on every day
 * drawn, is reproduced from the thirteen parameters alone.
 */

describe('the G-curve formula reproduces the published yields', () => {
  it('covers every trading day of July and August 2023', () => {
    expect(curve.days.length).toBe(fact('bcTradingDays').value)
    expect(curve.days[0]!.date).toBe('2023-07-03')
    expect(curve.days.at(-1)!.date).toBe('2023-08-31')
  })

  it.each(curve.days.map((d) => [d.date, d] as const))('%s: every term within 0.005 pp', (_date, d) => {
    for (const [t, y] of d.published) {
      // The exchange publishes to four decimals and the central bank to two;
      // the tolerance is the coarser of the two.
      expect(Math.abs(zcy(d.params, t!) - y!)).toBeLessThan(0.005)
    }
  })

  it('and each day is fitted to real bonds, which sit near the curve', () => {
    for (const d of curve.days) {
      expect(d.bonds.length).toBeGreaterThan(10)
      for (const [dur, y] of d.bonds) {
        // Duration, not maturity, so a coupon bond sits a little off the zero
        // curve; 1.5 pp would mean the wrong bond or the wrong day.
        expect(Math.abs(zcy(d.params, Math.max(dur!, 0.1)) - y!)).toBeLessThan(1.5)
      }
    }
  })
})

describe('the key rate the figure marks is the Bank of Russia’s', () => {
  it('7.5% into July, 8.5% from 24 July, 12% from 15 August', () => {
    expect(curve.keyRate).toEqual([
      { from: '2023-06-01', rate: fact('bcKeyRateJune').value },
      { from: '2023-07-24', rate: fact('bcKeyRateJuly').value },
      { from: '2023-08-15', rate: fact('bcKeyRateAug').value },
    ])
  })
})
