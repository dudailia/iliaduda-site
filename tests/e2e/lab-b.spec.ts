import { expect, test, type Page } from '@playwright/test'

/**
 * Lab B, the order book as terrain. The hero either goes live on its first
 * real frame or keeps the poster; its readouts are computed from the running
 * simulation, so they move; the probe reads a level from the keyboard; and
 * the hero says, on the hero, that the market is synthetic.
 */

const ROUTE = '/lab/b'

/** The value next to a visible readout label. */
const readout = (page: Page, label: string) =>
  page.locator('dt').filter({ hasText: new RegExp(`^${label}$`), visible: true }).first().locator('xpath=following-sibling::dd[1]')

async function settle(page: Page): Promise<boolean> {
  await page.goto(ROUTE, { waitUntil: 'networkidle' })
  return page
    .waitForFunction(() => {
      const c = document.querySelector('canvas')
      return !!c && getComputedStyle(c).opacity === '1'
    }, null, { timeout: 12_000 })
    .then(() => true)
    .catch(() => false)
}

test('goes live on its first frame, or keeps the poster', async ({ page }) => {
  const live = await settle(page)
  const poster = page.locator('[data-lab-poster]')
  if (live) {
    // The canvas fades in over the poster, which is then hidden (kit underlay).
    await expect(poster).toHaveCSS('visibility', 'hidden', { timeout: 2000 })
    // The live labels are the renderer's: the price tag carries a computed mid.
    await expect(page.locator('section span', { hasText: /^Price \$\d+\.\d{2,3}$/ }).first()).toBeVisible()
  } else {
    await expect(poster).toBeVisible()
  }
})

test('says on the hero that the market is synthetic', async ({ page }) => {
  await page.goto(ROUTE)
  await expect(page.locator('section').first().getByText(/synthetic order flow/i)).toBeVisible()
})

test('readouts are computed numbers, and they move while the market runs', async ({ page }) => {
  const live = await settle(page)
  const rate = readout(page, 'Events, 10 s')
  const mid = readout(page, 'Mid')
  const trades = readout(page, 'Trades, 10 s')
  await expect(readout(page, 'Stationary rate')).toHaveText(/^\d+\.\d a second$/)
  await expect(readout(page, 'Branching ratio')).toHaveText(/^0\.\d\d$/)
  await expect(rate).toHaveText(/^\d+\.\d a second$/)
  await expect(mid).toHaveText(/^\$\d+\.\d{2,3}$/)
  await expect(readout(page, 'Spread')).toHaveText(/^\d+ ticks? · \$\d+\.\d{2}$/)
  const before = [await rate.innerText(), await mid.innerText(), await trades.innerText()].join('|')
  const r = Number.parseFloat(await rate.innerText())
  expect(r).toBeGreaterThan(3)
  expect(r).toBeLessThan(40)
  if (!live) return
  await expect
    .poll(async () => [await rate.innerText(), await mid.innerText(), await trades.innerText()].join('|'), { timeout: 10_000 })
    .not.toBe(before)
})

test('Pause stops the market; Resume starts it again', async ({ page }) => {
  const live = await settle(page)
  test.skip(!live, 'no live renderer on this device')
  const trades = readout(page, 'Trades, 10 s')
  const rate = readout(page, 'Events, 10 s')
  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByRole('button', { name: 'Resume' })).toHaveAttribute('aria-pressed', 'true')
  const frozen = [await rate.innerText(), await trades.innerText()].join('|')
  await page.waitForTimeout(2500)
  expect([await rate.innerText(), await trades.innerText()].join('|')).toBe(frozen)
  await page.getByRole('button', { name: 'Resume' }).click()
  await expect.poll(async () => [await rate.innerText(), await trades.innerText()].join('|'), { timeout: 10_000 }).not.toBe(frozen)
})

test('the keyboard probe reads a level, and a screen reader hears it once it settles', async ({ page }) => {
  await settle(page)
  const stage = page.getByRole('group', { name: /order book as terrain/i })
  await stage.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  const probe = page.locator('#lab-b-probe')
  await expect(probe).toContainText(/\$\d+\.\d{2}/)
  await expect(probe).toContainText(/shares|inside the spread/)
  await expect(probe).toContainText(/ago|now/)
  await page.keyboard.press('ArrowUp')
  await expect(probe).toContainText(/[1-9]\.\d s ago/)
  await expect(page.locator('[aria-live="polite"]').filter({ hasText: /\$\d+\.\d{2}/ })).toHaveCount(1, { timeout: 3000 })
  await page.keyboard.press('Escape')
  await expect(probe).toContainText(/hover or tap/)
})

test('reduced motion: the probe still reads the still frame', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(ROUTE)
  await page.getByRole('group', { name: /order book as terrain/i }).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('#lab-b-probe')).toContainText(/\$\d+\.\d{2}/)
})
