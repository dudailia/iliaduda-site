import { expect, test } from '@playwright/test'

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
