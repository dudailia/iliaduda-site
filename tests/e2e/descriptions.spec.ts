import { expect, test } from '@playwright/test'
import { ROUTES } from './routes'

/**
 * What a search result and a shared link show for each page: its own description, 155 characters at most (a result
 * shows about that many, and cuts a longer one mid-sentence), the same in the page's description and its share card,
 * and no two pages alike. Written for the page, apart from its abstract.
 */
test('every page has its own description, short enough to be read whole in a search result', async ({ request }, info) => {
  test.skip(info.project.name !== 'desktop', 'one run: the pages are fetched, not drawn')
  const seen = new Map<string, string>()
  for (const route of [...ROUTES, '/nope']) {
    const html = await (await request.get(route)).text()
    const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? ''
    const og = html.match(/<meta property="og:description" content="([^"]*)"/)?.[1]
    const text = description.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
    expect(text.length, `${route}: "${text}"`).toBeGreaterThan(60)
    expect(text.length, `${route}: "${text}"`).toBeLessThanOrEqual(155)
    if (og !== undefined) expect(og, `${route}: share card`).toBe(description)
    // The 404 says what the site is, as the home page does; every other page says what it is itself.
    if (route !== '/nope' && route !== '/') {
      expect(seen.get(description), `${route} repeats ${seen.get(description)}`).toBeUndefined()
      seen.set(description, route)
    }
  }
})
