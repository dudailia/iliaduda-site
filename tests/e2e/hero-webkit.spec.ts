import { expect, test } from '@playwright/test'
import { STAGE, errorsOf, goLive, seq } from './hero-kit'

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
    // The story is 3.6s of the figure's own time, which moves only on drawn frames, at most 100ms a frame: on a shared
    // CI runner WebKit drew too few frames for it to end within 15s (twice on main, once on a rebased branch), and it
    // was playing still. So it must end before both 15s and 60 of the page's frames have passed; a story that stalls
    // still fails, and one that runs ends in 36 frames at most, or in 3.6s at a display's rate.
    const ended = await page.evaluate(
      () =>
        new Promise<boolean>((res) => {
          const stage = document.querySelector('[data-seq]')!
          const t0 = performance.now()
          let frames = 0
          const step = () => {
            if (stage.getAttribute('data-seq') === 'done') return res(true)
            if (++frames > 60 && performance.now() - t0 > 15_000) return res(false)
            requestAnimationFrame(step)
          }
          requestAnimationFrame(step)
        }),
    )
    expect(ended, `the story ends within 60 frames or 15s, whichever is longer (now ${await seq(page)})`).toBe(true)
  } else {
    await expect(figure).toHaveText(/^declined: Still frame/)
    await expect(page.getByText(/^Still frame/)).toBeVisible()
  }
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(sw).toBeLessThanOrEqual(cw)
  expect(errors).toEqual([])
})
