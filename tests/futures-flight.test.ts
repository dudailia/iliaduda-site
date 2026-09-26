import { describe, expect, it } from 'vitest'
import { pose, project, viewProjection } from '@/lib/futures/camera'
import { FLIGHT_MS, Flight, HOLD_MS, RETURN_MS, flightAt } from '@/lib/futures/flight'
import { MODEL } from '@/lib/futures/mc'
import { FRAME, X0, X1, wy } from '@/lib/futures/world'

/**
 * The optional flythrough. The camera must travel smoothly; the first frame
 * must be the poster's rectangle exactly, so the crossfade from the server's
 * still lands on the same picture; and — the fix for the lab's mid-flight
 * "hairball", where the camera plunged into the cloud and lost every anchor —
 * today's price stays in frame until the camera turns to face expiry, and the
 * expiry axis stays in frame after that.
 */

const ASPECTS = [0.7, 1.1, 1.6] as const
const inFrame = (m: Float32Array, x: number, y: number, z = 0, margin = 0.95) => {
  const [px, py, w] = project(m, x, y, z)
  return w > 0.05 && Math.abs(px) <= margin && Math.abs(py) <= margin
}
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!)

describe('the camera path', () => {
  it('moves smoothly: no jump between neighbouring moments of the flight', () => {
    for (const aspect of ASPECTS) {
      let prev = pose(0, aspect)
      for (let p = 0.001; p <= 1; p += 0.001) {
        const q = pose(p, aspect)
        expect(dist(q.eye, prev.eye), `eye at p=${p.toFixed(3)}, aspect ${aspect}`).toBeLessThan(0.05)
        expect(dist(q.target, prev.target), `target at p=${p.toFixed(3)}, aspect ${aspect}`).toBeLessThan(0.05)
        prev = q
      }
    }
  })

  it('opens on the poster’s rectangle exactly, at any aspect', () => {
    for (const aspect of ASPECTS) {
      const m = viewProjection(0, aspect)
      const [ax, ay] = project(m, FRAME.x0, FRAME.y0, 0)
      const [bx, by] = project(m, FRAME.x1, FRAME.y1, 0)
      expect(ax).toBeCloseTo(-1, 1)
      expect(ay).toBeCloseTo(-1, 1)
      expect(bx).toBeCloseTo(1, 1)
      expect(by).toBeCloseTo(1, 1)
    }
  })

  it('keeps today’s price in frame until the camera turns to face expiry', () => {
    for (const aspect of ASPECTS)
      for (let p = 0; p <= 0.6; p += 0.01)
        expect(inFrame(viewProjection(p, aspect), X0, wy(MODEL.s0)), `today at p=${p.toFixed(2)}, aspect ${aspect}`).toBe(true)
  })

  it('keeps the expiry axis in frame from then to the end', () => {
    for (const aspect of ASPECTS)
      for (let p = 0.6; p <= 1; p += 0.01)
        expect(inFrame(viewProjection(p, aspect), X1, wy(MODEL.s0)), `expiry at p=${p.toFixed(2)}, aspect ${aspect}`).toBe(true)
  })
})

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
