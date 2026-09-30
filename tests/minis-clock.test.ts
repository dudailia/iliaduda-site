import { describe, expect, it } from 'vitest'
import { MiniClock, MINI_FPS } from '../lib/minis/clock'

/**
 * The Contents miniatures share one clock: at most MINI_FPS frames a second, only for the minis on screen, none while
 * the page is hidden, and a mini back on screen picks up without a jump in its own time.
 */
describe('the miniatures’ clock', () => {
  it('draws at most thirty frames a second, whatever the display', () => {
    const c = new MiniClock()
    c.add('a')
    c.show('a', true)
    let drawn = 0
    for (let t = 0; t <= 1000; t += 1000 / 120) drawn += c.tick(t).length
    expect(MINI_FPS).toBe(30)
    expect(drawn).toBeGreaterThanOrEqual(29)
    expect(drawn).toBeLessThanOrEqual(31)
  })

  it('draws only the minis on screen', () => {
    const c = new MiniClock()
    c.add('a')
    c.add('b')
    c.show('a', true)
    const ids = new Set<string>()
    for (let t = 0; t <= 500; t += 16) for (const f of c.tick(t)) ids.add(f.id)
    expect([...ids]).toEqual(['a'])
  })

  it('draws nothing while the page is hidden, and is idle when nothing is on screen', () => {
    const c = new MiniClock()
    c.add('a')
    c.show('a', true)
    c.hide(true)
    let drawn = 0
    for (let t = 0; t <= 500; t += 16) drawn += c.tick(t).length
    expect(drawn).toBe(0)
    expect(c.idle).toBe(true)
    c.hide(false)
    expect(c.idle).toBe(false)
    c.show('a', false)
    expect(c.idle).toBe(true)
  })

  it('moves a mini’s own time only while it is drawn, a frame at most a tenth of a second', () => {
    const c = new MiniClock()
    c.add('a')
    c.show('a', true)
    let own = 0
    for (let t = 0; t <= 1000; t += 16) for (const f of c.tick(t)) own += f.dt
    expect(own).toBeGreaterThan(0.9)
    expect(own).toBeLessThan(1.05)
    // Off screen for a minute, then back: its time goes on from where it was, not a minute on.
    c.show('a', false)
    for (let t = 1000; t <= 61_000; t += 16) c.tick(t)
    c.show('a', true)
    let back = 0
    for (let t = 61_000; t <= 61_100; t += 16) for (const f of c.tick(t)) back += f.dt
    expect(back).toBeLessThan(0.2)
    const [f] = c.tick(61_200)
    expect(f?.t).toBeLessThan(1.4)
  })
})
