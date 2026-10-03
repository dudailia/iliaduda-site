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
  it('states the moment the allowance reopens: the oldest contact ageing out, and it does not drift', () => {
    let a = empty
    a = requestCode(a, 0).next
    a = requestCode(a, 30 * 60_000).next
    const first = requestCode(a, 60 * 60_000).outcome
    const later = requestCode(a, 90 * 60_000).outcome
    expect(first.ok === false && first.reason === 'cap' && first.nextAt).toBe(WINDOWS[0].ms)
    expect(later.ok === false && later.reason === 'cap' && later.nextAt).toBe(WINDOWS[0].ms)
    // And at that moment a code is in fact allowed.
    expect(requestCode(a, WINDOWS[0].ms + 1).outcome.ok).toBe(true)
  })
  it('the weekly cap binds when the daily one no longer does', () => {
    let a = empty
    for (const day of [0, 1, 2, 3]) a = requestCode(a, day * 25 * H).next
    expect(used(a, 4 * 25 * H, WINDOWS[1].ms)).toBe(4)
    const o = requestCode(a, 4 * 25 * H).outcome
    expect(o.ok === false && o.reason === 'cap' && o.window.key).toBe('week')
  })
  it('names the window that binds and the moment all of them reopen, when more than one is at its cap', () => {
    // The reviewer's sequence: two codes, a day on, two more. Both the 24-hour and the 7-day windows are at their caps;
    // the first opens in hours, the week only when the first day's codes age out of it.
    let a = empty
    for (const t of [0, 20 * 60_000, 24 * H + 10 * 60_000, 24 * H + 40 * 60_000]) a = requestCode(a, t).next
    expect(a.episodes).toHaveLength(4)
    const now = 24 * H + 60 * 60_000
    const o = requestCode(a, now).outcome
    expect(o.ok === false && o.reason === 'cap' && o.window.key).toBe('week')
    const at = o.ok === false && o.reason === 'cap' ? o.nextAt : 0
    expect(at).toBe(WINDOWS[1].ms)
    // Refused until then, by whichever window still holds; allowed at that moment.
    expect(requestCode(a, 2 * 24 * H + 60 * 60_000).outcome.ok).toBe(false)
    expect(requestCode(a, at - 1).outcome.ok).toBe(false)
    expect(requestCode(a, at).outcome.ok).toBe(true)
  })
  it('a refusal of interaction stops everything, before any cap is checked', () => {
    expect(requestCode({ episodes: [], refused: true }, 0).outcome).toEqual({ ok: false, reason: 'refused' })
  })
})
