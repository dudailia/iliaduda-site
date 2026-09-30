import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { otherWork, visiblePapers } from '../content/papers'

/**
 * Both Lighthouse configs cover every route the site serves, each under exactly one budget: a route missing from a
 * list is a page no gate measures, and one matching two entries of a matrix is held to two budgets at once.
 */
type Matrix = { matchingUrlPattern: string; assertions: Record<string, unknown> }[]
const read = (f: string) =>
  JSON.parse(readFileSync(f, 'utf8')) as { ci: { collect: { url: string[] }; assert: { assertMatrix: Matrix } } }

const routes = (production: boolean) => [
  '/',
  '/about',
  '/cv',
  ...visiblePapers(production).map((p) => p.href),
  ...otherWork.map((o) => o.href),
]

const budget = (m: Matrix, url: string, key: string) => {
  const hits = m.filter((e) => new RegExp(e.matchingUrlPattern).test(url))
  expect(hits, `${url} matches ${hits.length} budgets`).toHaveLength(1)
  const a = hits[0]!.assertions[key] as [string, { maxNumericValue: number }] | undefined
  return a?.[1].maxNumericValue
}

describe('the Lighthouse configs', () => {
  it('the local one measures every route, each against its page’s font budget', () => {
    const c = read('lighthouserc.json')
    for (const r of routes(false)) {
      const url = `http://127.0.0.1:4500${r}`
      expect(c.ci.collect.url, r).toContain(url)
      expect(budget(c.ci.assert.assertMatrix, url, 'resource-summary:font:size'), r).toBeGreaterThan(0)
    }
  })

  it('the production one measures every route, each against its transfer budget', () => {
    const c = read('lighthouserc.prod.json')
    for (const r of routes(true)) {
      const url = `https://iliaduda-site.vercel.app${r}`
      expect(c.ci.collect.url, r).toContain(url)
      expect(budget(c.ci.assert.assertMatrix, url, 'resource-summary:total:size'), r).toBeGreaterThan(0)
    }
  })
})
