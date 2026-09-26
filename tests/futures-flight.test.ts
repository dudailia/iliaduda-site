import { describe, expect, it } from 'vitest'
import { FLIGHT_MS, Flight, HOLD_MS, RETURN_MS, flightAt } from '@/lib/futures/flight'

/**
 * The Fly-through clock: out, a hold on the payoff view, and home. The path
 * the camera takes is tests/futures-camera.test.ts.
 */

describe('the flight clock', () => {
  it('flies out, holds on the payoff view, and comes home', () => {
    expect(flightAt(0)).toBe(0)
    expect(flightAt(FLIGHT_MS)).toBeCloseTo(1, 9)
    expect(flightAt(FLIGHT_MS + HOLD_MS / 2)).toBe(1)
    expect(flightAt(FLIGHT_MS + HOLD_MS + RETURN_MS)).toBeCloseTo(0, 9)
    expect(flightAt(FLIGHT_MS + HOLD_MS + RETURN_MS + 5000)).toBe(0)
    expect(flightAt(-100)).toBe(0)
  })

  it('never turns back on the way out, nor forward on the way home', () => {
    let prev = 0
    for (let ms = 0; ms <= FLIGHT_MS; ms += 25) {
      const p = flightAt(ms)
      expect(p).toBeGreaterThanOrEqual(prev - 1e-12)
      prev = p
    }
    prev = 1
    for (let ms = FLIGHT_MS + HOLD_MS; ms <= FLIGHT_MS + HOLD_MS + RETURN_MS; ms += 10) {
      const p = flightAt(ms)
      expect(p).toBeLessThanOrEqual(prev + 1e-12)
      prev = p
    }
  })

  it('is long enough to read and short enough to watch', () => {
    // The flight is the one long camera move on the site.
    expect(FLIGHT_MS).toBeGreaterThanOrEqual(6000)
    expect(FLIGHT_MS + HOLD_MS + RETURN_MS).toBeLessThanOrEqual(12_000)
  })
})

describe('Flight', () => {
  it('is at the composed frame until started', () => {
    const f = new Flight()
    f.advance(1000)
    expect(f.p).toBe(0)
    expect(f.flying).toBe(false)
  })

  it('runs on drawn frames and lands home by itself', () => {
    const f = new Flight()
    f.start()
    expect(f.flying).toBe(true)
    for (let ms = 0; ms < FLIGHT_MS; ms += 20) f.advance(20)
    expect(f.p).toBeCloseTo(1, 6)
    f.advance(HOLD_MS + RETURN_MS)
    expect(f.p).toBe(0)
    expect(f.flying).toBe(false)
  })

  it('stops wherever it is and asks to go home', () => {
    const f = new Flight()
    f.start()
    f.advance(FLIGHT_MS / 2)
    expect(f.p).toBeGreaterThan(0.2)
    f.stop()
    expect(f.flying).toBe(false)
    // Home is the target; the renderer's spring carries the camera there.
    expect(f.p).toBe(0)
  })
})
