import { describe, expect, it } from 'vitest'
import { Flow, MARKET, POSTER_T, SEED } from '../lib/market/flow'
import { orderBookShape } from '../lib/minis/orderBook'
import type { Shape } from '../lib/minis/shape'

const flat = (s: Shape) => [...s.context, ...s.claim].flat()
const moved = (a: Shape, b: Shape) => {
  const p = flat(a), q = flat(b)
  let m = 0
  for (let i = 0; i < p.length; i++) m = Math.max(m, Math.abs(p[i]![0] - q[i]![0]), Math.abs(p[i]![1] - q[i]![1]))
  return m
}

describe('the order book’s miniature', () => {
  it('glides between rows: a new row arriving moves no point further than the flow moves it within a row', () => {
    const f = new Flow(SEED, MARKET)
    f.advance(POSTER_T)
    let prev = orderBookShape(f)
    let rows = f.written
    let inside = 0, across = 0
    for (let q = 0; q < 60; q++) {
      f.step()
      const next = orderBookShape(f)
      const d = moved(prev, next)
      if (f.written !== rows) across = Math.max(across, d)
      else inside = Math.max(inside, d)
      rows = f.written
      prev = next
    }
    expect(across).toBeLessThanOrEqual(inside + 2)
  })
})
