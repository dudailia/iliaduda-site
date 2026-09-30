import { describe, expect, it } from 'vitest'
import { categorise, exportable, type Account, type Line } from '../lib/closebooks'

/**
 * The live figure claims to run CloseBooks' own rules. These pin the ported
 * logic to the behaviour cited from the shipped code.
 */

const chart: Account[] = [
  { code: '4000', name: 'Consulting Revenue', type: 'revenue' },
  { code: '6150', name: 'Merchant Fees', type: 'expense' },
  { code: '6400', name: 'Software', type: 'expense' },
]
const line = (o: Partial<Line>): Line => ({
  date: '2026-09-01',
  description: 'AMAZON WEB SERVICES',
  amount: 500,
  type: 'debit',
  suggested: { code: '6400', name: 'Software' },
  stated: 0.96,
  ...o,
})

describe('CloseBooks categorisation rules', () => {
  it('approves a confident, well-described, resolvable suggestion', () => {
    expect(categorise(line({}), chart).status).toBe('approved')
  })
  it('takes 0.08 off an amount under $20 (categorize.ts:113-115)', () => {
    const r = categorise(line({ amount: 12.4, stated: 0.96 }), chart)
    expect(r.confidence).toBeCloseTo(0.88, 10)
    expect(r.status).toBe('approved')
    expect(categorise(line({ amount: 12.4, stated: 0.9 }), chart).status).toBe('pending')
  })
  it('caps a one-word, all-digit or four-character description at 0.60 (categorize.ts:118-123)', () => {
    for (const description of ['Venmo', '104233', 'ACH']) expect(categorise(line({ description }), chart).confidence).toBe(0.6)
  })
  it('caps and flags an account the chart does not have at 0.55 (coaValidation.ts:57-69)', () => {
    const r = categorise(line({ suggested: { code: '6200', name: 'Rent Expense' }, stated: 0.99 }), chart)
    expect(r.confidence).toBe(0.55)
    expect(r.status).toBe('flagged')
    expect(exportable(r.status, r.account)).toBe(false)
  })
  it('resolves by name when the code is wrong', () => {
    expect(categorise(line({ suggested: { code: '9999', name: 'software' } }), chart).account?.code).toBe('6400')
  })
  it('sends a credit to an expense account for review, capped at 0.60, even at 0.99 (coaValidation.ts:75-79, 85)', () => {
    const r = categorise(line({ type: 'credit', stated: 0.99 }), chart)
    expect(r.confidence).toBe(0.6)
    expect(r.status).toBe('pending')
  })
  it('lets only approved or edited rows with a real account through the export gate', () => {
    const acct = chart[0]!
    expect(exportable('approved', acct)).toBe(true)
    expect(exportable('edited', acct)).toBe(true)
    expect(exportable('pending', acct)).toBe(false)
    expect(exportable('approved', null)).toBe(false)
  })
})
