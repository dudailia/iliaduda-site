import { expect, test } from '@playwright/test'
import { STAGE, errorsOf, goLive, seq } from './hero-kit'
import { storyOutcome } from './story'

/**
 * The home figure in WebKit at an iPhone's size, touch and pixel ratio (the
 * `iphone` project). WebKit here is the desktop build, with the desktop's
 * WebGL, so this proves the engine and the layout, not the phone's GPU: the
 * phone's missing extensions are tested in hero-formats.spec.ts, and what only
 * a real iPhone can show is listed in the milestone report.
 */

test('goes live or says why, plays its sequence, and leaves the page clean', async ({ page }) => {
  test.setTimeout(90_000)
  const errors = errorsOf(page)
  await page.goto('/?debug=1')
  const live = await goLive(page)
  const figure = page.locator('[data-stage-debug] div').filter({ has: page.locator('dt', { hasText: /^figure$/ }) }).locator('dd')
  if (live) {
    await expect(figure).toHaveText('live')
    await expect(page.locator(`${STAGE} [data-density]`)).toHaveAttribute('data-density', /^rgba(16f|8)$/)
    // A 3.6s story: 36 slow frames at most (tests/e2e/story.ts). It plays to its end, or the figure, crawling, gives
    // way to its still frame and says so (CI's WebKit; a phone plays it).
    const outcome = await storyOutcome(page, STAGE, 60)
    expect(['done', 'gave way'], `the story ends within 60 frames or 15s, whichever is longer (now ${await seq(page)})`).toContain(outcome)
  } else {
    await expect(figure).toHaveText(/^declined: Still frame/)
    await expect(page.getByText(/^Still frame/)).toBeVisible()
  }
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(sw).toBeLessThanOrEqual(cw)
  expect(errors).toEqual([])
})
