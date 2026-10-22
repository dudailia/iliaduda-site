import { expect, test } from '@playwright/test'
import { storyOutcome } from './story'
import { errorsOf } from './hero-kit'

/**
 * /iv-surface in WebKit at an iPhone's size, touch and pixel ratio (the
 * `iphone` project): the figure goes live, or keeps its still frame and says
 * why, and leaves the page clean. WebKit here is the desktop build, with the
 * desktop's WebGL: the phone's missing extensions are tested in Chromium
 * (iv-surface.spec.ts).
 */

test('goes live or says why, forms once, and leaves the page clean', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await page.goto('/iv-surface?debug=1')
  await page.locator('#fig-iv-surface [data-seq]').scrollIntoViewIfNeeded()
  const figure = page.locator('[data-stage-debug] div').filter({ has: page.locator('dt', { hasText: /^figure$/ }) }).locator('dd')
  await expect(figure).toHaveText(/^(live|declined: Still frame.*)$/, { timeout: 20_000 })
  // A 5s story (lib/surface/sequence.ts, FORM_MS): 50 slow frames at most (tests/e2e/story.ts).
  if ((await figure.textContent()) === 'live')
    // It plays to its end, or the figure, crawling, gives way to its still frame and says so (CI's WebKit; a phone plays it).
    expect(['done', 'gave way'], `the story ends within 80 frames or 15s, whichever is longer`).toContain(await storyOutcome(page, '#fig-iv-surface [data-seq]', 80))
  else await expect(page.locator('#fig-iv-surface').getByText(/Still frame/).first()).toBeVisible()
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(sw).toBeLessThanOrEqual(cw)
  expect(errors).toEqual([])
})

test.describe('an iPad mini turned sideways', () => {
  test.use({ viewport: { width: 1133, height: 673 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })

  // Under a finger the margin does not stick, so with its Greeks open it must fit the screen whole on its own.
  test('the margin with its Greeks open fits one screen', async ({ page }) => {
    await page.goto('/iv-surface')
    const greeks = page.locator('#fig-iv-surface details:visible').filter({ hasText: 'Greeks at the point' }).first()
    await greeks.locator('summary').tap()
    await expect(greeks).toHaveAttribute('open', '')
    await expect.poll(() => greeks.locator('dl').evaluate((d) => d.getAnimations().length)).toBe(0)
    const rail = greeks.locator('xpath=../..')
    const h = await rail.evaluate((e) => e.getBoundingClientRect().height)
    expect(h).toBeLessThanOrEqual(673 - 24)
  })
})
