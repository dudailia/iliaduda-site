import { describe, expect, it } from 'vitest'
import { framePose, restPose, type Pose } from '@/lib/futures/camera'
import { Director, type Moment } from '@/lib/futures/director'
import { FLIGHT_MS, Flight } from '@/lib/futures/flight'

/**
 * The camera's story, frame by frame. The review found two ways it broke
 * between states: Fly through pressed while the camera still held the
 * composed frame (the sequence, or Replay on its way back) was swallowed, and
 * a flight or rewind begun anywhere but at rest threw the wall's depth to its
 * end value in one frame, jumping the labels and the futures' gain.
 */

const DT = 1 / 60
const ASPECT = 1.12
const rest = restPose(ASPECT)

function moment(d: Partial<Moment> = {}): Moment {
  return { dt: DT, aspect: ASPECT, rest, flight: 0, sequence: false, speed: 1, ...d }
}

/**
 * Runs frames, returning the largest jump in depth and in eye position: how
 * far a frame's step departs from the step before it (a second difference).
 * A glide, however quick, changes its step a little each frame; a jump
 * changes it all at once.
 */
function run(dir: Director, frames: number, at: (i: number) => Partial<Moment>) {
  let depth = 0, eye = 0
  const d: number[] = [], e: Pose['eye'][] = []
  if (dir.pose) {
    d.push(dir.depth)
    e.push(dir.pose.eye)
  }
  for (let i = 0; i < frames; i++) {
    const pose = dir.step(moment(at(i)))
    d.push(dir.depth)
    e.push(pose.eye)
    const n = d.length
    if (n < 3) continue
    depth = Math.max(depth, Math.abs(d[n - 1]! - 2 * d[n - 2]! + d[n - 3]!))
    const [a, b, c] = [e[n - 3]!, e[n - 2]!, e[n - 1]!]
    eye = Math.max(eye, Math.hypot(c[0] - 2 * b[0] + a[0], c[1] - 2 * b[1] + a[1], c[2] - 2 * b[2] + a[2]))
  }
  return { depth, eye }
}

/** A director at rest. */
function rested() {
  const d = new Director()
  run(d, 200, () => ({}))
  expect(d.mode).toBe('rest')
  return d
}

describe('the camera director', () => {
  it('holds the composed frame through the sequence, and settles into depth once it is over', () => {
    const d = new Director()
    run(d, 60, () => ({ sequence: true }))
    expect(d.mode).toBe('frame')
    expect(d.depth).toBe(0)
    run(d, 1, () => ({}))
    expect(d.mode).toBe('settle')
    run(d, 200, () => ({}))
    expect(d.mode).toBe('rest')
    expect(d.depth).toBe(1)
  })

  it('takes off when Fly through is pressed while the camera holds the composed frame', () => {
    const d = new Director()
    run(d, 30, () => ({ sequence: true }))
    // The press finishes the sequence and starts the clock in the same frame.
    const f = new Flight()
    f.start()
    const seen = new Set<string>()
    for (let i = 0; i < 120; i++) {
      f.advance(DT * 1000)
      d.step(moment({ flight: f.p }))
      seen.add(d.mode)
    }
    expect(seen.has('flight')).toBe(true)
    expect(d.mode).toBe('flight')
  })

  it('flies when Fly through is pressed while Replay is on its way back, and the replay is dropped', () => {
    const d = rested()
    let replayed = false
    d.rewind(() => (replayed = true))
    run(d, 20, () => ({}))
    expect(d.rewinding).toBe(true)
    const f = new Flight()
    f.start()
    for (let i = 0; i < 90; i++) {
      f.advance(DT * 1000)
      d.step(moment({ flight: f.p }))
    }
    expect(d.mode).toBe('flight')
    expect(d.rewinding).toBe(false)
    expect(replayed).toBe(false)
  })

  it('moves the wall into depth smoothly whenever a flight begins: from the frame, mid-settle, paused mid-settle', () => {
    const starts: [string, () => Director][] = [
      ['the frame', () => {
        const d = new Director()
        run(d, 10, () => ({ sequence: true }))
        return d
      }],
      ['mid-settle', () => {
        const d = new Director()
        run(d, 2, () => ({}))
        run(d, 50, () => ({}))
        expect(d.mode).toBe('settle')
        return d
      }],
      ['a paused settle', () => {
        const d = new Director()
        run(d, 2, () => ({}))
        run(d, 30, () => ({}))
        run(d, 60, () => ({ speed: 0 }))
        expect(d.mode).toBe('settle')
        return d
      }],
    ]
    for (const [name, make] of starts) {
      const d = make()
      const f = new Flight()
      f.start()
      const { depth, eye } = run(d, Math.ceil(FLIGHT_MS / 1000 / DT) + 200, () => {
        f.advance(DT * 1000)
        return { flight: f.p }
      })
      expect(depth, `depth from ${name}`).toBeLessThan(0.05)
      expect(eye, `eye from ${name}`).toBeLessThan(0.12)
      expect(d.depth).toBe(1)
    }
  })

  it('brings the wall back smoothly when a flight is stopped early, and when Replay rewinds from mid-settle', () => {
    const d = new Director()
    run(d, 2, () => ({ sequence: true }))
    const f = new Flight()
    f.start()
    let stopped = false
    const early = run(d, 200, (i) => {
      if (i === 20) {
        f.stop()
        stopped = true
      }
      f.advance(DT * 1000)
      return { flight: f.p }
    })
    expect(stopped).toBe(true)
    expect(early.depth).toBeLessThan(0.05)
    expect(early.eye).toBeLessThan(0.12)
    expect(d.mode).toBe('rest')

    const s = new Director()
    run(s, 2, () => ({}))
    run(s, 40, () => ({}))
    expect(s.mode).toBe('settle')
    let again = false
    s.rewind(() => (again = true))
    const back = run(s, 80, () => ({ sequence: again }))
    expect(back.depth).toBeLessThan(0.05)
    expect(back.eye).toBeLessThan(0.12)
    expect(s.mode).toBe('frame')
    expect(s.depth).toBe(0)
  })

  it('carries the camera’s speed into the way home when a flight is stopped mid-move: it slows, it never stops dead', () => {
    const d = new Director()
    run(d, 2, () => ({ sequence: true }))
    run(d, 200, () => ({}))
    const f = new Flight()
    f.start()
    const eyes: Pose['eye'][] = []
    for (let i = 0; i < 400; i++) {
      // Stopped a little after the middle of the flight, where the camera moves fastest.
      if (i === Math.round(FLIGHT_MS / 1000 / DT / 2)) f.stop()
      f.advance(DT * 1000)
      eyes.push(d.step(moment({ flight: f.p })).eye)
    }
    const speed = (i: number) => Math.hypot(eyes[i]![0] - eyes[i - 1]![0], eyes[i]![1] - eyes[i - 1]![1], eyes[i]![2] - eyes[i - 1]![2])
    const at = Math.round(FLIGHT_MS / 1000 / DT / 2)
    const before = speed(at - 1)
    // The frames just after the stop keep most of the speed the camera had.
    expect(speed(at + 1)).toBeGreaterThan(before * 0.5)
    expect(speed(at + 2)).toBeGreaterThan(before * 0.4)
  })

  it('ends a rewind on the composed frame and runs what comes next once', () => {
    const d = rested()
    let n = 0
    // What comes next is the sequence again, which holds the frame.
    d.rewind(() => n++)
    d.rewind(() => n++)
    run(d, 80, () => ({ sequence: n > 0 }))
    expect(n).toBe(1)
    expect(d.mode).toBe('frame')
    const f = framePose(ASPECT)
    expect(d.pose!.eye.map((v, i) => Math.abs(v - f.eye[i]!)).every((x) => x < 1e-6)).toBe(true)
  })
})
