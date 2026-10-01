import { expect, test } from '@playwright/test'
import { errorsOf } from './hero-kit'

/**
 * /membrane in WebKit at an iPhone's size, touch and pixel ratio: the drum goes live and is drawn at the phone's size
 * (its renderer, arriving after the stage was sized, once drew into one pixel), or keeps its still frame and says why;
 * the page is left clean either way.
 */
test('goes live and is drawn at an iPhone’s size, or keeps its still frame, and leaves the page clean', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await page.addInitScript(() => sessionStorage.setItem('membrane-seq', '1'))
  await page.goto('/membrane')
  const stage = page.locator('[data-membrane-stage]')
  await stage.scrollIntoViewIfNeeded()
  const live = await expect
    .poll(() => stage.locator('canvas').evaluate((c) => Number(getComputedStyle(c).opacity) > 0.5), { timeout: 20_000 })
    .toBe(true)
    .then(() => true, () => false)
  if (live) {
    const px = await stage.locator('canvas').evaluate(
      (cv: HTMLCanvasElement) =>
        new Promise<number[]>((res) =>
          requestAnimationFrame(() => {
            const c = document.createElement('canvas')
            c.width = cv.width
            c.height = cv.height
            const g = c.getContext('2d')!
            g.drawImage(cv, 0, 0)
            res(Array.from(g.getImageData(Math.floor(cv.width / 2), Math.floor(cv.height / 2), 1, 1).data))
          }),
        ),
    )
    const paper = await page.evaluate(() => getComputedStyle(document.body).backgroundColor.match(/\d+/g)!.slice(0, 3).map(Number))
    expect(Math.abs(px[0]! - paper[0]!) + Math.abs(px[1]! - paper[1]!) + Math.abs(px[2]! - paper[2]!)).toBeGreaterThan(12)
  } else await expect(stage.locator('[data-membrane-poster] svg')).toBeVisible()
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(sw).toBeLessThanOrEqual(cw)
  expect(errors).toEqual([])
})
