import { EASE_IN_OUT, bezier } from '../ease'

/**
 * The Fly-through clock: how far along the optional flythrough the camera
 * should be, 0 being the composed frame. The camera itself, pose by pose, is
 * lib/futures/camera.ts, which only the renderer loads.
 */

/**
 * Fly through: out on a curve that leaves at 0.4 of its mean speed (the reader pressed it: easeInOutQuad's zero start
 * speed showed nothing but the button's word for half a second) and lands at rest on the payoff view, peaking near
 * easeInOutQuad's own; a hold there; home on the site's in-out. `cubic-bezier(0.3, 0.12, 0.45, 1)`.
 */
const FLIGHT_OUT = bezier(0.3, 0.12, 0.45, 1)
export const FLIGHT_MS = 9000
export const HOLD_MS = 1200
export const RETURN_MS = 900

export function flightAt(ms: number): number {
  if (ms <= 0) return 0
  if (ms < FLIGHT_MS) return FLIGHT_OUT(ms / FLIGHT_MS)
  if (ms <= FLIGHT_MS + HOLD_MS) return 1
  if (ms < FLIGHT_MS + HOLD_MS + RETURN_MS) return 1 - EASE_IN_OUT((ms - FLIGHT_MS - HOLD_MS) / RETURN_MS)
  return 0
}

/**
 * The reader's flight. Its clock, like the sequence's, moves only on drawn
 * frames. `p` is where the camera should be; the renderer springs toward it,
 * so a stop mid-flight glides home instead of snapping.
 */
export class Flight {
  flying = false
  private ms = 0

  start(): void {
    this.flying = true
    this.ms = 0
  }

  stop(): void {
    this.flying = false
    this.ms = 0
  }

  advance(dtMs: number): void {
    if (!this.flying || !(dtMs > 0)) return
    this.ms += dtMs
    if (this.ms >= FLIGHT_MS + HOLD_MS + RETURN_MS) this.stop()
  }

  get p(): number {
    return this.flying ? flightAt(this.ms) : 0
  }
}
