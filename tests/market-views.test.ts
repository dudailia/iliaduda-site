import { describe, expect, it } from 'vitest'
import { DEPTH, HEAT, PriceWindow, WINDOW, depthTone, heat, logTicks, priceTicks } from '../lib/market/views'

/**
 * The views' own arithmetic (lib/market/views.ts): the order book's price
 * window, which follows the price without chasing every tick; the tone a
 * queue is drawn in; and the ticks on both views' axes.
 */

describe('the order book’s price window', () => {
  it('holds still while the price stays in its middle, and follows it out, never letting it off the view', () => {
    const w = new PriceWindow(10_000)
    for (let i = 0; i < 120; i++) w.step(10_000 + 8 * Math.sin(i / 10), 1 / 60)
    expect(w.centre).toBe(10_000)
    // A shock's fall: 51 ticks at once, the deepest over twenty seeds.
    let worst = 0
    for (let i = 0; i < 180; i++) {
      w.step(9_949, 1 / 60)
      worst = Math.max(worst, Math.abs(9_949 - w.centre))
    }
    expect(worst).toBeLessThanOrEqual(WINDOW.half * WINDOW.clamp + 1e-9)
    // Settled with the price at the edge of the middle, below the centre.
    expect(Math.abs(w.centre - 9_949 - WINDOW.half * WINDOW.band)).toBeLessThan(0.5)
  })
})

describe('the tone of a queue', () => {
  it('rises with the shares waiting, from nothing at none toward full, the median queue a third of the way', () => {
    expect(heat(0)).toBe(0)
    let prev = 0
    for (let q = 1; q <= 300; q++) {
      expect(heat(q)).toBeGreaterThan(prev)
      prev = heat(q)
    }
    expect(heat(10)).toBeGreaterThan(0.25)
    expect(heat(10)).toBeLessThan(0.4)
    expect(heat(HEAT.full)).toBeGreaterThan(0.95)
    expect(prev).toBeLessThanOrEqual(1)
  })
})

describe('the tone of the book’s depth', () => {
  it('is paper where nothing waits, and darkens with every share between a price and the touch, never to full', () => {
    expect(depthTone(0)).toBe(0)
    let prev = 0
    for (let c = 1; c <= 3000; c += 7) {
      expect(depthTone(c)).toBeGreaterThan(prev)
      prev = depthTone(c)
    }
    // A calm book's median depth three ticks out (about 80 shares) is light, its median at the window's edge (about
    // 430) near half.
    expect(depthTone(80)).toBeLessThan(0.25)
    expect(depthTone(430)).toBeGreaterThan(0.4)
    expect(depthTone(430)).toBeLessThan(0.65)
    expect(prev).toBeLessThan(DEPTH.floor + DEPTH.range + 1e-9)
  })
})

describe('the axes', () => {
  it('ticks prices at round cents, a few across the view', () => {
    const t = priceTicks(9_964, 10_036)
    expect(t.length).toBeGreaterThanOrEqual(3)
    expect(t.length).toBeLessThanOrEqual(6)
    for (const p of t) expect(p % 10).toBe(0)
  })

  it('ticks a year’s prices at halvings and doublings of the price now', () => {
    expect(logTicks(100, 0.25, 4)).toEqual([25, 50, 100, 200, 400])
    expect(logTicks(100, 0.5, 2)).toEqual([50, 100, 200])
  })
})
