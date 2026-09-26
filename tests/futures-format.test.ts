import { describe, expect, it } from 'vitest'
import { withError } from '@/lib/futures/format'

/**
 * The margin prints the estimate to the precision its error allows. A still
 * frame's CPU estimate of a few thousand paths is good to a few cents, and
 * printing it to four decimals claimed a precision it did not have.
 */
describe('an estimate with its error', () => {
  it('keeps two significant figures of the ± 2 SE band, and as many decimals in the estimate', () => {
    expect(withError(11.34861, 0.0011)).toBe('11.3486 ± 0.0022')
    expect(withError(11.3214, 0.1399)).toBe('11.32 ± 0.28')
    expect(withError(11.3491, 0.015)).toBe('11.349 ± 0.030')
  })
  it('never prints fewer than two decimals or more than four', () => {
    expect(withError(11.35, 0.6)).toBe('11.35 ± 1.20')
    expect(withError(11.348512, 0.00001)).toBe('11.3485 ± 0.0000')
  })
})
