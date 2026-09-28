import { EASE_IN_OUT, EASE_IN_OUT_QUAD } from '../ease'
import { along, blend, driftOf, flightPose, framePose, type Drift, type Pose } from './camera'

/**
 * Where the camera is in the figure's story, frame by frame: the composed
 * frame while the signature sequence plays (and for a visit without one, its
 * first frame); the settle into depth once the payoff has appeared; rest,
 * which the renderer makes drift and lean with the reader; Fly through and
 * its way home; and Replay's rewind to the frame.
 *
 * Pure, so its transitions are tested frame by frame (tests/futures-director.test.ts).
 */

export type CamMode = 'frame' | 'settle' | 'rest' | 'flight' | 'return'

export const SETTLE_MS = 1800
export const REWIND_MS = 900
export const HOME_MS = 900

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** Labels step aside while the camera is in among the futures. */
export const outside = (p: number) => 1 - smooth(0.24, 0.34, p) + smooth(0.68, 0.78, p)

export interface Moment {
  /** Seconds since the last frame. */
  dt: number
  aspect: number
  /** The resting view this frame, with the drift and the reader's lean in it. */
  rest: Pose
  /** Fly through's clock: 0 on the ground. */
  flight: number
  /** Whether the signature sequence is waiting or playing: the composed frame holds until it is over. */
  sequence: boolean
  /** How fast the figure's own motion runs, 0…1 (Pause's ramp). */
  speed: number
}

export class Director {
  mode: CamMode = 'frame'
  /** How far the wall has come out of the flat frame: 0 in the composed frame, 1 at rest. */
  depth = 0
  /** How much the labels are with us: 1 but for the middle of a flight. */
  labels = 1
  /** Where the flight is, 0…1. */
  flightP = 0
  pose: Pose | null = null
  private t = 0
  private from: Pose | null = null
  private flightFrom: Pose | null = null
  /** The depth a move began at, which it eases from: a move may begin anywhere, and nothing jumps. */
  private depth0 = 0
  private last = 0
  /** The furthest the current flight has got: once the clock turns back, the camera heads home. */
  private flightMax = 0
  private first = true
  private then: (() => void) | null = null
  /** How fast the camera was moving when a flight was stopped, carried into its way home. */
  private carry: Drift | null = null

  get rewinding(): boolean {
    return this.then != null
  }

  /** Replay's way back to the composed frame; `then` runs once it is there. A second call on the way changes nothing. */
  rewind(then: () => void): void {
    if (this.then) return
    this.from = this.pose
    this.t = 0
    this.depth0 = this.depth
    this.then = then
  }

  step(m: Moment): Pose {
    const was = this.pose
    this.pose = this.move(m)
    if (was && this.mode === 'flight') this.speed = driftOf(was, this.pose, m.dt)
    return this.pose
  }
  private speed: Drift | null = null

  private move(m: Moment): Pose {
    const { rest, aspect } = m
    const p = m.flight
    // A flight begins from wherever the camera is: the frame, the settle, rest, its way home, or Replay's rewind,
    // which it takes the place of (the reader asked for the flight last).
    if (p > 0 && this.last === 0) {
      this.then = null
      this.flightFrom = this.pose ?? rest
      this.depth0 = this.depth
      this.mode = 'flight'
    }
    this.last = p
    this.flightP = p
    if (this.then) {
      this.t += m.dt * 1000
      const u = EASE_IN_OUT(clamp01(this.t / REWIND_MS))
      this.depth = this.depth0 * (1 - u)
      // The frame's labels come back as the camera gets there, as they do on the way home from a flight.
      this.labels = Math.max(this.labels, smooth(0.3, 0.8, u))
      const next = blend(this.from ?? rest, framePose(aspect), u)
      if (this.t >= REWIND_MS) {
        this.mode = 'frame'
        const then = this.then
        this.then = null
        then()
      }
      return next
    }
    // It turns back (the flight's own return, or a stop): home by the shortest arc, not back through the keys.
    if (this.mode === 'flight' && p < this.flightMax - 1e-9) {
      this.from = this.pose ?? rest
      this.depth0 = this.depth
      this.mode = 'return'
      this.t = 0
      this.carry = this.speed
    }
    this.flightMax = this.mode === 'flight' ? Math.max(this.flightMax, p) : 0
    // The composed frame holds until the sequence is over, so the price lands, and is read, before the view swings.
    if (!m.sequence && this.mode === 'frame' && !this.first) {
      this.mode = 'settle'
      this.t = 0
    }
    this.first = false
    switch (this.mode) {
      case 'frame':
        this.depth = 0
        this.labels = 1
        return framePose(aspect)
      case 'settle': {
        this.t += m.dt * 1000 * m.speed
        const u = EASE_IN_OUT_QUAD(clamp01(this.t / SETTLE_MS))
        this.depth = u
        this.labels = 1
        if (this.t >= SETTLE_MS) this.mode = 'rest'
        return blend(framePose(aspect), rest, u)
      }
      case 'rest':
        this.depth = 1
        this.labels = 1
        return rest
      case 'flight':
        this.depth = this.depth0 + (1 - this.depth0) * smooth(0, 0.12, p)
        this.labels = outside(p)
        return flightPose(p, aspect, this.flightFrom ?? rest)
      case 'return': {
        this.t += m.dt * 1000
        const s = clamp01(this.t / HOME_MS)
        const u = EASE_IN_OUT(s)
        this.depth = this.depth0 + (1 - this.depth0) * u
        this.labels = Math.max(this.labels, smooth(0.3, 0.8, u))
        if (this.t >= HOME_MS) {
          this.mode = 'rest'
          this.carry = null
        }
        // Home on the in-out, plus the speed the camera had when it was stopped, spent over the way (a Hermite
        // tangent: all of it at the start, none at the end), so it slows rather than stopping dead and starting again.
        const home = blend(this.from ?? rest, rest, u)
        return this.carry ? along(home, this.carry, (HOME_MS / 1000) * (s - 2 * s * s + s * s * s)) : home
      }
    }
  }
}
