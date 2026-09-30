import { describe, expect, it } from 'vitest'
import { RISE_MS, orderBookSequence, rowRise } from '@/lib/orderbook/sequence'

/**
 * The order book's signature: the terrain rising out of the page as the order
 * flow starts. A wave from now back into the past, each row on the burst's
 * quintic ease-out; the price river drawing in behind it; the camera lifting
 * from a grazing view of the flat page into its resting view; the labels last.
 */

describe('the rise', () => {
  it('starts flat and ends whole, every row', () => {
    for (let a = 0; a < 256; a += 17) {
      expect(rowRise(0, a, 256)).toBe(0)
      expect(rowRise(1, a, 256)).toBe(1)
    }
  })

  it('is a wave from now into the past: the front rises first', () => {
    expect(rowRise(0.25, 0, 256)).toBeGreaterThan(0.5)
    expect(rowRise(0.25, 255, 256)).toBe(0)
    let prev = Infinity
    for (let a = 0; a < 256; a++) {
      const r = rowRise(0.5, a, 256)
      expect(r).toBeLessThanOrEqual(prev)
      prev = r
    }
  })

  it('only ever rises, and neighbouring rows never tear apart', () => {
    for (let a = 0; a < 256; a += 5) {
      let prev = 0
      for (let u = 0; u <= 1.0001; u += 0.01) {
        const r = rowRise(u, a, 256)
        expect(r).toBeGreaterThanOrEqual(prev)
        prev = r
        expect(Math.abs(rowRise(u, a + 1, 256) - r)).toBeLessThan(0.05)
      }
    }
  })
})

describe('the sequence', () => {
  it('rises, draws the river, settles the camera and brings in the labels, in that order, in about three seconds', () => {
    expect(RISE_MS).toBeGreaterThanOrEqual(2800)
    expect(RISE_MS).toBeLessThanOrEqual(3600)
    const s = orderBookSequence()
    s.start()
    s.advance(RISE_MS * 0.05)
    const p = s.phases()
    expect(p.rise).toBeGreaterThan(0)
    expect(p.labels).toBe(0)
    s.advance(RISE_MS)
    expect(s.phases()).toEqual({ rise: 1, river: 1, settle: 1, labels: 1 })
  })
})
