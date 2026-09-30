import { describe, expect, it } from 'vitest'
import { posterFlow } from '@/lib/market/flow'
import { rowAfter } from '@/lib/orderbook/read'

/**
 * Fig. 1 marks the order chosen in Fig. 2 on its terrain: on the first row of
 * the book written at or after the order, the one with the order in it. Rows
 * are stamped with the moment they were taken, which trails the market's clock
 * by up to a row; counting back from the clock instead lands on the row before
 * the order about half the time.
 */

describe('the row an order is in', () => {
  it('is the first row taken at or after the order, for every order in the window', () => {
    const f = posterFlow()
    // A clock between rows, as it is on most frames.
    f.advance(f.t + 1 / 30)
    let checked = 0
    for (let age = 0; age < f.eventCount; age++) {
      const e = f.event(age)
      const t = f.ev.t[e]!
      if (f.times[f.row(0)]! - t > 15) break
      if (t > f.times[f.row(0)]!) continue // after the newest row: not on the terrain yet
      const a = rowAfter(f, t)
      expect(f.times[f.row(a)]!).toBeGreaterThanOrEqual(t)
      if (a + 1 < f.written) expect(f.times[f.row(a + 1)]!).toBeLessThan(t)
      checked++
    }
    expect(checked).toBeGreaterThan(1000)
  })
})
