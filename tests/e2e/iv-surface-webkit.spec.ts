import { expect, test } from '@playwright/test'
import { storyEnds } from './story'
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
    expect(await storyEnds(page, '#fig-iv-surface [data-seq]', 80), `the story ends within 80 frames or 15s, whichever is longer`).toBe(true)
  else await expect(page.locator('#fig-iv-surface').getByText(/Still frame/).first()).toBeVisible()
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(sw).toBeLessThanOrEqual(cw)
  expect(errors).toEqual([])
})
