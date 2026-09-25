import { describe, expect, it } from 'vitest'
import { EPISODE_MS, requestCode, used, WINDOWS, type Allowance } from '../lib/contact'

const H = 3_600_000
const empty: Allowance = { episodes: [], refused: false }

describe('the statutory contact allowance', () => {
  it('one episode spends one contact; a resend inside it spends nothing', () => {
    const a = requestCode(empty, 0)
    expect(a.outcome).toEqual({ ok: true, spent: 1 })
    const b = requestCode(a.next, EPISODE_MS - 1)
    expect(b.outcome).toEqual({ ok: true, spent: 0 })
    expect(b.next.episodes).toHaveLength(1)
  })
  it('the day cap holds on a rolling 24 hours, not a calendar day', () => {
    let a = empty
    a = requestCode(a, 0).next
    a = requestCode(a, 10 * 60_000).next
    const third = requestCode(a, 20 * 60_000)
    expect(third.outcome.ok).toBe(false)
    // Still refused 23 hours later: the window rolls, it does not reset at midnight.
    expect(requestCode(a, 23 * H).outcome.ok).toBe(false)
    expect(requestCode(a, 24 * H + 1).outcome.ok).toBe(true)
  })
  it('states the next allowed time conservatively, as now plus the window', () => {
    let a = empty
    a = requestCode(a, 0).next
    a = requestCode(a, 10 * 60_000).next
    const o = requestCode(a, 20 * 60_000).outcome
    expect(o.ok === false && o.reason === 'cap' && o.nextAt).toBe(20 * 60_000 + WINDOWS[0].ms)
  })
  it('the weekly cap binds when the daily one no longer does', () => {
    let a = empty
    for (const day of [0, 1, 2, 3]) a = requestCode(a, day * 25 * H).next
    expect(used(a, 4 * 25 * H, WINDOWS[1].ms)).toBe(4)
    const o = requestCode(a, 4 * 25 * H).outcome
    expect(o.ok === false && o.reason === 'cap' && o.window.key).toBe('week')
  })
  it('a refusal of interaction stops everything, before any cap is checked', () => {
    expect(requestCode({ episodes: [], refused: true }, 0).outcome).toEqual({ ok: false, reason: 'refused' })
  })
})
