import { describe, expect, it } from 'vitest'
import { BAR_D, SCENE, ZWALL, blend, driftAt, endPose, flightPose, framePose, project, restPose, viewProjection, type Pose } from '@/lib/futures/camera'
import { AXIS, FRAME, HLEN, HX0, X0, X1, wy } from '@/lib/futures/world'

/**
 * The camera of a figure that is really three-dimensional. It opens on the
 * poster's rectangle exactly; settles into a three-quarter view where time
 * recedes into the scene; drifts there, and follows the reader's pointer or
 * tilt, without ever losing the picture; and flies through on request, ending
 * on the expiry wall and its bars with all of them in frame. These are the
 * fixes for what a phone showed: a flight that ended with the bars cut off on
 * the right and the camera inside the cloud.
 */

const ASPECTS = [0.55, 0.66, 0.8, 1.0, 1.12, 1.4, 1.8, 2.2] as const
const margin = (pose: Pose, aspect: number, pts: readonly (readonly number[])[]) => {
  const m = viewProjection(pose, aspect)
  let worst = 0
  for (const p of pts) {
    const [x, y, w] = project(m, p[0]!, p[1]!, p[2]!)
    if (w <= 0.05) return Infinity
    worst = Math.max(worst, Math.abs(x), Math.abs(y))
  }
  return worst
}
const spanOf = (pose: Pose, aspect: number, pts: readonly (readonly number[])[]) => {
  const m = viewProjection(pose, aspect)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const p of pts) {
    const [x, y] = project(m, p[0]!, p[1]!, p[2]!)
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
  }
  return { w: (x1 - x0) / 2, h: (y1 - y0) / 2 }
}
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!)
/** How far a point is from the dense core of the futures: the tube they fill from today to expiry. */
const fromCore = (e: readonly number[]) => {
  const x = Math.min(X1, Math.max(X0, e[0]!))
  const t = (x - X0) / (X1 - X0)
  return Math.max(0, Math.hypot(e[0]! - x, e[1]!, e[2]!) - 0.35 * Math.sqrt(t))
}
const WALL: number[][] = [
  [X1, wy(AXIS.lo), -ZWALL], [X1, wy(AXIS.lo), ZWALL], [X1, wy(AXIS.hi), -ZWALL], [X1, wy(AXIS.hi), ZWALL],
  [HX0 + HLEN, wy(AXIS.lo), -BAR_D], [HX0 + HLEN, wy(AXIS.lo), BAR_D], [HX0 + HLEN, wy(AXIS.hi), -BAR_D], [HX0 + HLEN, wy(AXIS.hi), BAR_D],
]

describe('the composed frame', () => {
  it('is the poster’s rectangle exactly, at any aspect', () => {
    for (const a of ASPECTS) {
      const m = viewProjection(framePose(a), a)
      const [ax, ay] = project(m, FRAME.x0, FRAME.y0, 0)
      const [bx, by] = project(m, FRAME.x1, FRAME.y1, 0)
      expect(ax).toBeCloseTo(-1, 2)
      expect(ay).toBeCloseTo(-1, 2)
      expect(bx).toBeCloseTo(1, 2)
      expect(by).toBeCloseTo(1, 2)
    }
  })
})

describe('the resting view', () => {
  it('holds the whole scene, with room for its labels, at every aspect from a phone to a wide laptop', () => {
    for (const a of ASPECTS) expect(margin(restPose(a), a, SCENE), `aspect ${a}`).toBeLessThanOrEqual(0.88)
  })

  it('fills the frame: the scene spans most of its limiting side', () => {
    for (const a of ASPECTS) {
      const s = spanOf(restPose(a), a, SCENE)
      expect(Math.max(s.w, s.h), `aspect ${a}`).toBeGreaterThan(0.72)
    }
  })

  it('is three-dimensional: time recedes, expiry further from the eye than today', () => {
    for (const a of ASPECTS) {
      const m = viewProjection(restPose(a), a)
      expect(project(m, X1, 0, 0)[2] / project(m, X0, 0, 0)[2], `aspect ${a}`).toBeGreaterThan(1.12)
    }
  })

  it('stays whole at the far ends of its drift and of the reader’s parallax', () => {
    for (const a of ASPECTS)
      for (const px of [-1, 1])
        for (const py of [-1, 1])
          for (const t of [0, 13, 29, 47, 71]) {
            const pose = restPose(a, driftAt(t), { x: px, y: py })
            expect(margin(pose, a, SCENE), `aspect ${a} parallax ${px},${py} t ${t}`).toBeLessThanOrEqual(0.94)
          }
  })

  it('drifts slowly and without end: bounded, continuous, and never back where it began within a minute', () => {
    let prev = driftAt(0)
    for (let t = 0.05; t < 240; t += 0.05) {
      const d = driftAt(t)
      expect(Math.abs(d.yaw)).toBeLessThanOrEqual(0.11)
      expect(Math.abs(d.pitch)).toBeLessThanOrEqual(0.06)
      expect(Math.abs(d.yaw - prev.yaw)).toBeLessThan(0.0015)
      prev = d
    }
    expect(Math.abs(driftAt(60).yaw - driftAt(0).yaw) + Math.abs(driftAt(60).pitch - driftAt(0).pitch)).toBeGreaterThan(0.005)
  })
})

describe('the settle from the composed frame into depth', () => {
  it('starts on the frame, ends at rest, and never passes through the futures', () => {
    for (const a of ASPECTS) {
      const f = framePose(a), r = restPose(a)
      expect(dist(blend(f, r, 0).eye, f.eye)).toBeLessThan(1e-9)
      expect(dist(blend(f, r, 1).eye, r.eye)).toBeLessThan(1e-9)
      let prev = f.eye
      for (let u = 0.01; u <= 1; u += 0.01) {
        const p = blend(f, r, u)
        expect(fromCore(p.eye), `u ${u.toFixed(2)}`).toBeGreaterThan(1)
        expect(dist(p.eye, prev)).toBeLessThan(0.12)
        prev = p.eye
      }
    }
  })
})

describe('Fly through', () => {
  it('ends facing the expiry wall with the wall and the full-length bars in frame, at every aspect', () => {
    for (const a of ASPECTS) expect(margin(endPose(a), a, WALL), `aspect ${a}`).toBeLessThanOrEqual(0.9)
  })

  it('never ends inside the cloud or behind the bars', () => {
    for (const a of ASPECTS) {
      const e = endPose(a).eye
      expect(fromCore(e)).toBeGreaterThan(0.6)
      expect(e[0]).toBeLessThan(HX0 + HLEN)
    }
  })

  it('moves smoothly from wherever the rest was, keeps its anchors in frame, and stays out of the dense core', () => {
    for (const a of ASPECTS) {
      const start = restPose(a, driftAt(17), { x: 0.4, y: -0.3 })
      let prev = flightPose(0, a, start)
      // The clock eases p out of 0, so in time the camera leaves rest at zero speed; in p, steps are compared from the first.
      let lastStep = dist(flightPose(0.002, a, start).eye, start.eye)
      expect(dist(prev.eye, start.eye)).toBeLessThan(1e-9)
      for (let p = 0.002; p <= 1; p += 0.002) {
        const q = flightPose(p, a, start)
        // No jump: the eye's step grows and shrinks gradually (the path is C1), and is never large.
        const step = dist(q.eye, prev.eye)
        expect(step, `eye p ${p.toFixed(3)} aspect ${a}`).toBeLessThan(0.1)
        expect(Math.abs(step - lastStep), `eye p ${p.toFixed(3)} aspect ${a}`).toBeLessThan(0.005)
        lastStep = step
        expect(fromCore(q.eye), `core p ${p.toFixed(3)} aspect ${a}`).toBeGreaterThan(0.25)
        // The hairball fix: the reader never loses both anchors. Today is in frame when the camera is down behind it,
        // the expiry axis from when it is alongside the fan, and one of them always.
        const m = viewProjection(q, a)
        const seen = (x: number) => {
          const [px, py, w] = project(m, x, 0, 0)
          return w > 0.05 && Math.max(Math.abs(px), Math.abs(py)) <= 0.95
        }
        if (Math.abs(p - 0.28) < 0.0015) expect(seen(X0), `today p ${p.toFixed(3)} aspect ${a}`).toBe(true)
        if (p >= 0.56) expect(seen(X1), `expiry p ${p.toFixed(3)} aspect ${a}`).toBe(true)
        expect(seen(X0) || seen(X1), `an anchor p ${p.toFixed(3)} aspect ${a}`).toBe(true)
        prev = q
      }
      expect(dist(flightPose(1, a, start).eye, endPose(a).eye)).toBeLessThan(1e-9)
    }
  })
})
