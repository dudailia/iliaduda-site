import { describe, expect, it } from 'vitest'
import { invert } from '../lib/m4'
import { pickTerrain, type Terrain } from '../lib/orderbook/pick'
import { POSTERS, posterMatrix } from '../lib/orderbook/poster'
import { apply, DX, DZ, height, Z_NOW } from '../lib/orderbook/view'

/**
 * Reading the terrain by pointing at it: the eye's ray through a point of the
 * picture is marched to where it meets the terrain, and the price level and
 * row found there are the ones drawn there. The live figure picks this way
 * through its own camera, and the still frame through its poster's, so a tap
 * reads a still frame too.
 */

// A book shaped as the real one is: walls rising away from the touch, and changing from row to row.
const terrain: Terrain = {
  centre: 10_000.3,
  frac: 0.4,
  rows: 200,
  depth: (age, price) => {
    const d = price - 10_000.3
    return Math.sign(d) * Math.abs(d) ** 1.15 * 30 * (1 + 0.2 * Math.sin(age / 9))
  },
}

describe('picking the terrain', () => {
  for (const p of POSTERS) {
    it(`finds the level and row drawn under a point of the ${p.variant} poster`, () => {
      const m = posterMatrix(p.w, p.h)
      const inv = invert(m)!
      let hits = 0
      for (const dp of [-40, -12, -3, 3, 9, 30])
        for (const age of [2, 20, 60, 110]) {
          const price = Math.round(terrain.centre) + dp
          const x = (price - terrain.centre) * DX, z = Z_NOW - (age + terrain.frac) * DZ
          const q = apply(m, x, height(terrain.depth(age, price)), z)
          const nx = q[0] / q[3], ny = q[1] / q[3]
          if (Math.abs(nx) > 1 || Math.abs(ny) > 1) continue
          const got = pickTerrain(inv, nx, ny, terrain)
          // A nearer ridge can stand in front of a far point: the pick is then on it, and never behind it.
          if (got && got.dp === dp && got.age === age) hits++
          else expect(got === null || got.age <= age, `${dp},${age} → ${JSON.stringify(got)}`).toBe(true)
        }
      expect(hits).toBeGreaterThan(12)
    })
  }

  it('finds nothing off the terrain: the sky above it', () => {
    const [p] = POSTERS
    const inv = invert(posterMatrix(p.w, p.h))!
    expect(pickTerrain(inv, 0, 0.99, terrain)).toBeNull()
  })
})
