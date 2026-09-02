import { describe, expect, it } from 'vitest'
import { facts, type Fact } from '../content/facts'

const entries = Object.entries(facts) as [string, Fact][]

describe('every number on the site has provenance', () => {
  it('has facts to check', () => {
    expect(entries.length).toBeGreaterThan(0)
  })

  // The gate. A fact without a source is a number nobody can re-check, which
  // is the thing this whole site is arguing against.
  it.each(entries)('%s cites a source', (_key, f) => {
    expect(f.source.trim().length).toBeGreaterThan(0)
  })

  it.each(entries)('%s cites a source specific enough to find', (_key, f) => {
    // A source has to name a file, a commit, a statute or a documented
    // constant. "internal notes" would pass a non-empty check and fail this one.
    const specific = /[/.]|@[0-9a-f]{7}|cell \d+|ФЗ|art\. \d|—/u.test(f.source)
    expect(specific, `source too vague: "${f.source}"`).toBe(true)
  })

  it.each(entries)('%s has a finite value', (_key, f) => {
    expect(Number.isFinite(f.value)).toBe(true)
  })

  it.each(entries)('%s has a non-empty label', (_key, f) => {
    expect(f.label.trim().length).toBeGreaterThan(0)
  })
})

describe('facts are not silently duplicated', () => {
  it('has no two keys with the same label and value', () => {
    const seen = new Map<string, string>()
    for (const [key, f] of entries) {
      const sig = `${f.label}::${f.value}`
      const prior = seen.get(sig)
      expect(prior, `${key} duplicates ${prior}`).toBeUndefined()
      seen.set(sig, key)
    }
  })
})
