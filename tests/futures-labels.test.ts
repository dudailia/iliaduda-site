import { describe, expect, it } from 'vitest'
import { TICK_CLEAR, tickShown } from '@/lib/futures/world'

/**
 * A price tick gives way to the strike's name as the strike comes near it.
 * It used to vanish the moment the strike came within $14 and pop back as it
 * left; now it fades with the distance, so however the reader drags the
 * strike, the tick never jumps.
 */
describe('a tick near the strike', () => {
  it('is hidden under the strike, whole well clear of it, and in between follows the distance', () => {
    expect(tickShown(0)).toBe(0)
    expect(tickShown(TICK_CLEAR - 4)).toBe(0)
    expect(tickShown(TICK_CLEAR + 4)).toBe(1)
    expect(tickShown(40)).toBe(1)
    expect(tickShown(TICK_CLEAR)).toBeGreaterThan(0.2)
    expect(tickShown(TICK_CLEAR)).toBeLessThan(0.8)
  })
  it('never jumps: a dime of strike moves it by little', () => {
    let worst = 0
    for (let d = 0; d < 40; d += 0.1) worst = Math.max(worst, Math.abs(tickShown(d + 0.1) - tickShown(d)))
    expect(worst).toBeLessThan(0.03)
  })
})
