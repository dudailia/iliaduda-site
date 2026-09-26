import { expect, test } from '@playwright/test'

/**
 * The IV paper's Fig. 1 (it was the home hero until the futures took over): it
 * says synthetic where it is drawn, it works from the keyboard, and reduced
 * motion means a still figure — the contour map — never the WebGL surface.
 */

const ROUTE = '/iv-surface'

test('the surface is labelled synthetic where it is drawn', async ({ page }) => {
  await page.goto(ROUTE)
  const fig = page.locator('#fig-surface')
  await expect(fig).toContainText(/synthetic parameters, set by hand · not market data/)
})

test('the arrow keys move the probe and the margin follows', async ({ page }) => {
  await page.goto(ROUTE)
  const group = page.getByRole('group', { name: /Implied volatility surface/ })
  const strike = page.locator('#fig-surface dl:visible dd').first()
  const before = await strike.textContent()
  await group.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(strike).not.toHaveText(before ?? '')
  await page.keyboard.press('Home')
  await expect(strike).toHaveText(before ?? '')
})

test('the live region announces the committed probe', async ({ page }) => {
  await page.goto(ROUTE)
  await page.getByRole('group', { name: /Implied volatility surface/ }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('#fig-surface [aria-live="polite"]')).toHaveText(/implied volatility \d+\.\d%/)
})

test.describe('reduced motion', () => {
  test('shows the still contour map and never the canvas', async ({ page }) => {
    // emulateMedia rather than test.use({ reducedMotion }): the fixture option
    // did not reach the page under this config, and the test passed a canvas
    // that was fully live — a gate that cannot fail is not a gate.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(ROUTE)
    await page.waitForTimeout(2500)
    const canvas = page.locator('#fig-surface canvas')
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    await expect(canvas).toHaveCSS('opacity', '0')
    // Never initialised: a canvas nobody drew into keeps its default width.
    expect(await canvas.getAttribute('width')).toBe(null)
    await expect(page.locator('#fig-surface svg[role="img"]')).toBeVisible()
  })
})
