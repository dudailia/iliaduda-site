import { describe, expect, it } from 'vitest'
import { Flow, POSTER_T, posterFlow } from '@/lib/market/flow'
import { fingerprint } from '@/lib/market/fingerprint'
import { advanceInSlices } from '@/lib/market/slices'

/**
 * The page's market is built in a browser before either figure can draw it:
 * two minutes of burn-in and the still frame's twenty seconds, about forty
 * thousand orders. In one go that is a long task on a phone; so it is run in
 * slices of a few milliseconds, handing the page back between them. The
 * market is the same, because it only ever moves in whole quanta.
 */

describe('building the market in slices', () => {
  it('hands the page back between slices of at most the budget, and makes the still frame’s market', async () => {
    let clock = 0
    // Every look at the clock costs a millisecond: a slice of 6 ms makes about six pieces of work.
    const now = () => (clock += 1)
    let yields = 0
    const f = await advanceInSlices(new Flow(undefined, undefined, false), POSTER_T, 6, now, (next) => {
      yields++
      setTimeout(next, 0)
    })
    expect(yields).toBeGreaterThan(10)
    expect(fingerprint(f)).toBe(fingerprint(posterFlow()))
  })

  it('finishes at once, without handing back, when there is nothing left to run', async () => {
    const whole = posterFlow()
    let yields = 0
    const f = await advanceInSlices(whole, POSTER_T, 6, () => 0, () => yields++)
    expect(f).toBe(whole)
    expect(yields).toBe(0)
  })
})
