import { expect, test } from '@playwright/test'
import { codepoints } from './fontset'
import { ROUTES } from './routes'

/**
 * Both font naming collisions this project hit were invisible on screen: one
 * generated a family literally called "serif", the other made a theme token
 * reference itself. Rendering survived both by luck. So the family is asserted
 * by name and the loaded status is asserted from the font set.
 */
test('the self-hosted faces are the ones actually in use', async ({ page }) => {
  await page.goto('/')
  const info = await page.evaluate(async () => {
    await document.fonts.ready
    const monoEl = document.querySelector('[class*="font-mono"]')
    return {
      body: getComputedStyle(document.body).fontFamily,
      mono: monoEl ? getComputedStyle(monoEl).fontFamily : '',
      loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
    }
  })
  expect(info.body).toMatch(/^sourceSerif\b/)
  expect(info.mono).toMatch(/^sourceCodePro\b/)
  expect(info.loaded).toContain('sourceSerif')
  expect(info.loaded).toContain('sourceCodePro')
})

/**
 * The faces are subsets, so a character outside them is drawn in whatever the
 * system falls back to: σ was, in the hero's subtitle, a heavier glyph from
 * another family. Every character a page shows must be in the site's fonts:
 * the main faces, or the supplement of Greek and mathematical characters that
 * a page fetches only when it shows one (app/globals.css). ∅ is in neither
 * Source face and waits for a change of copy; the list may not name a
 * character the fonts already have.
 */
const PENDING: Record<string, string> = {
  '/startup-investments': '∅',
}

test('every character a page shows is in the site\'s fonts', async ({ page }) => {
  const have = new Set([
    ...codepoints('public/fonts/source-serif-4-latin-var.woff2'),
    ...codepoints('public/fonts/source-code-pro-latin-var.woff2'),
    ...codepoints('public/fonts/source-serif-4-extra-var.woff2'),
    ...codepoints('public/fonts/source-code-pro-extra-var.woff2'),
  ])
  for (const [route, chars] of Object.entries(PENDING)) for (const ch of chars) expect(have.has(ch.codePointAt(0)!), `${ch} on ${route} is in the fonts now`).toBe(false)
  const missing = new Map<string, Set<string>>()
  for (const route of ROUTES) {
    await page.goto(route)
    const text = await page.evaluate(() => document.body.innerText + [...document.querySelectorAll('svg text')].map((t) => t.textContent).join(''))
    for (const ch of new Set(text)) {
      if (/\s/.test(ch) || have.has(ch.codePointAt(0)!) || PENDING[route]?.includes(ch)) continue
      missing.set(ch, (missing.get(ch) ?? new Set()).add(route))
    }
  }
  const found = [...missing].map(([ch, routes]) => `${ch} U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')} on ${[...routes].join(', ')}`)
  expect(found).toEqual([])
})
