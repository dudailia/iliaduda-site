import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TITLE_PHRASES, papers } from '../content/papers'

/**
 * A title's phrases (content/papers.ts, TITLE_PHRASES) are where it breaks first on a narrow screen: joined by spaces
 * they must be a page's title exactly, or the page would fall back to its plain title and nobody would notice.
 */
describe('title phrases', () => {
  const nucarbon = readFileSync('app/(pages)/nucarbon/page.tsx', 'utf8')
  for (const [title, phrases] of Object.entries(TITLE_PHRASES)) {
    it(`"${title}" is a page title, in ${phrases.length} phrases`, () => {
      expect(phrases.length).toBeGreaterThan(1)
      const asWritten = JSON.stringify(title).slice(1, -1).replace(/ /g, '\\u00a0')
      expect(papers.some((p) => p.title === title) || nucarbon.includes(asWritten)).toBe(true)
    })
  }
})
