import { describe, expect, it } from 'vitest'
import { BURST } from '@/lib/futures/sequence'
import { STREAM, Stream, burstSlot } from '@/lib/futures/stream'

/**
 * After the signature sequence the futures keep coming: each drawn slot holds
 * its path a while, fades it, and launches a new member of the ensemble from
 * today. Nothing may pop — a path changes only when it has faded to nothing,
 * and a new one starts as a point at today — and the picture's weight must
 * hold steady, so the stream reads as life, not as flicker.
 */

const N = 512
const ink = (s: Stream) => {
  let t = 0
  for (let i = 0; i < N; i++) {
    const x = s.slot(i)
    t += x.alpha * x.reveal
  }
  return t / N
}

describe('the burst', () => {
  it('reveals each slot’s first path on the golden-ratio stagger, all of them whole at its end', () => {
    for (const i of [0, 1, 7, 300]) {
      expect(burstSlot(i, 0)).toEqual({ id: i, reveal: 0, alpha: 1 })
      expect(burstSlot(i, 1)).toEqual({ id: i, reveal: 1, alpha: 1 })
    }
    // Slot 0 launches first; a slot whose stagger is later is still waiting.
    const late = [...Array(N).keys()].find((i) => ((i * 0.618034) % 1) > 0.9)!
    expect(burstSlot(0, 0.1).reveal).toBeGreaterThan(0)
    expect(burstSlot(late, 0.1).reveal).toBe(0)
    expect(burstSlot(late, BURST.launch + BURST.front).reveal).toBe(1)
  })
})

describe('the stream', () => {
  it('begins exactly where the burst ended: every slot whole, on its first path', () => {
    const s = new Stream(N)
    s.update(0, N)
    for (let i = 0; i < N; i++) expect(s.slot(i)).toEqual({ id: i, reveal: 1, alpha: 1 })
  })

  it('never pops: a slot changes path only at zero alpha, and a new path starts from today', () => {
    const s = new Stream(N)
    const last = Array.from({ length: N }, (_, i) => s.slot(i))
    let switches = 0
    for (let t = 0; t < 3 * STREAM.cycle; t += 1 / 60) {
      s.update(t, N)
      for (let i = 0; i < N; i++) {
        const now = s.slot(i), was = last[i]!
        // Checked by hand: a million expect() calls would take the test's whole time budget.
        const at = `slot ${i} at ${t.toFixed(2)}s`
        if (now.id !== was.id) {
          if (was.alpha >= 0.02) throw new Error(`${at}: switched path while visible (alpha ${was.alpha})`)
          // A point at today: a frame of the front's quintic ease-out is at most a step or two of its 64.
          if (now.reveal >= 0.05) throw new Error(`${at}: a new path appeared already ${now.reveal} long`)
          if (now.id - was.id !== N) throw new Error(`${at}: skipped from path ${was.id} to ${now.id}`)
          switches++
        } else if (Math.abs(now.alpha - was.alpha) >= 0.05 || Math.abs(now.reveal - was.reveal) >= 0.05) {
          throw new Error(`${at}: jumped (alpha ${was.alpha} → ${now.alpha}, reveal ${was.reveal} → ${now.reveal})`)
        }
        last[i] = now
      }
    }
    // Every slot really cycled: about three launches each in three cycles.
    expect(switches).toBeGreaterThan(2 * N)
  })

  it('holds the picture’s weight steady once it is flowing', () => {
    const s = new Stream(N)
    const w: number[] = []
    for (let t = STREAM.cycle; t < 4 * STREAM.cycle; t += 0.25) {
      s.update(t, N)
      w.push(ink(s))
    }
    const mean = w.reduce((a, b) => a + b, 0) / w.length
    for (const x of w) expect(Math.abs(x - mean) / mean).toBeLessThan(0.05)
  })

  it('is paused by holding its clock: the same time is the same picture', () => {
    const a = new Stream(N), b = new Stream(N)
    a.update(12.5, N)
    b.update(12.5, N)
    b.update(12.5, N)
    for (let i = 0; i < N; i += 17) expect(b.slot(i)).toEqual(a.slot(i))
  })

  it('thins without a pop when the governor asks for fewer, and fills again', () => {
    const s = new Stream(N)
    const last = Array.from({ length: N }, (_, i) => s.slot(i))
    let active = N
    for (let t = 0; t < 5 * STREAM.cycle; t += 1 / 60) {
      if (t > STREAM.cycle && t < 3 * STREAM.cycle) active = N / 2
      else active = N
      s.update(t, active)
      for (let i = 0; i < N; i++) {
        const now = s.slot(i), was = last[i]!
        if (now.id === was.id && Math.abs(now.alpha - was.alpha) >= 0.05) throw new Error(`slot ${i} popped at ${t.toFixed(2)}s: ${was.alpha} → ${now.alpha}`)
        if (now.id !== was.id && (was.alpha >= 0.02 || now.alpha * now.reveal >= 0.05)) throw new Error(`slot ${i} switched visibly at ${t.toFixed(2)}s`)
        last[i] = now
      }
    }
    // Half the slots rest while it is thinned.
    const t = new Stream(N)
    for (let x = 0; x < 2.5 * STREAM.cycle; x += 1 / 30) t.update(x, x > STREAM.cycle ? N / 2 : N)
    let off = 0
    for (let i = 0; i < N; i++) if (t.slot(i).alpha === 0) off++
    expect(off).toBeGreaterThan(N * 0.4)
  })
})
