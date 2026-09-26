import { expect, test, type Page } from '@playwright/test'
import { GPU, errorsOf, goLive, seen } from './hero-kit'

/**
 * ?debug=1: a report on the home figure that a reader can screenshot from a
 * phone. It must say whether the figure went live and, if not, why; which
 * tier and formats it chose; what the browser offers; how fast it runs. It
 * must still report when the figure never started, and must not exist at all
 * without the flag.
 */

test.use({ launchOptions: { args: GPU } })

const panel = (page: Page) => page.locator('[data-futures-debug]')
const row = (page: Page, k: string | RegExp) =>
  panel(page)
    .locator('div')
    .filter({ has: page.locator('dt', { hasText: k }) })
    .locator('dd')

test('reports what the live figure chose, how fast it runs and what the browser offers', async ({ page }) => {
  const errors = errorsOf(page)
  await seen(page)
  await page.goto('/?debug=1')
  await expect(panel(page)).toBeVisible()
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await expect(row(page, /^figure$/)).toHaveText('live')
  await expect(row(page, /^tier$/)).toHaveText(/^(high|mid|low) · quality \d · [1-9]\d* fps$/, { timeout: 5_000 })
  await expect(row(page, /^density$/)).toHaveText(/^rgba(16f|8)$/)
  await expect(row(page, /^probes$/)).toContainText('rgba32ui yes · r32ui yes')
  await expect(row(page, /^extensions \(\d+\)$/)).toContainText('WEBGL_lose_context')
  await expect(row(page, /^rate$/)).toHaveText(/paths\/s|measuring/)
  await page.getByRole('button', { name: 'Copy' }).click()
  await page.getByRole('button', { name: 'Hide' }).click()
  await expect(row(page, /^figure$/)).toHaveCount(0)
  expect(errors).toEqual([])
})

test('reports the reason when the figure keeps its still frame', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?debug=1')
  await expect(row(page, /^figure$/)).toHaveText('declined: Still frame: your system asks for reduced motion.')
  // The panel's own probe still describes the browser.
  await expect(row(page, /^webgl2$/)).toContainText('WebGL 2.0')
})

test('does not exist without the flag', async ({ page }) => {
  await page.goto('/')
  await page.waitForTimeout(500)
  await expect(panel(page)).toHaveCount(0)
})
