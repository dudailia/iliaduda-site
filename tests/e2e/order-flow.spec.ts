import { expect, test, type Page } from '@playwright/test'
import { GPU, errorsOf } from './hero-kit'

/**
 * /order-book, Fig. 2: the order flow behind Fig. 1, on the same market at
 * the same moment. Its still frame and table before any script; live on the
 * shared clock, and held by the one Pause both figures share; an order read
 * from the keyboard, with what set it off adding up to all of it; the chosen
 * order marked on Fig. 1's terrain; and a still frame under reduced motion on
 * which reading still works.
 */

test.use({ launchOptions: { args: GPU } })

const FIG = '#fig-order-flow'
const canvas = (page: Page) => page.locator(`${FIG} canvas`)
const simT = async (page: Page) => Number(await canvas(page).getAttribute('data-sim-t'))
/** Whether the strips stream (Fig. 1 went live), or both figures keep their still moment (software WebGL, as on CI). */
async function streams(page: Page): Promise<boolean> {
  for (let i = 0; i < 100; i++) {
    if (Number(await canvas(page).getAttribute('data-draws')) > 10) return true
    if (await page.locator('#fig-order-book').getByText(/Still frame/).first().isVisible()) return false
    await page.waitForTimeout(150)
  }
  return false
}
const reading = (page: Page) => page.locator('#fig-order-flow-reading')
const seen = (page: Page) => page.addInitScript(() => sessionStorage.setItem('orderbook-seq', '1'))
const pct = (s: string) => [...s.matchAll(/(\d+\.\d)%/g)].map((m) => Number(m[1]))

test.describe('before any script runs', () => {
  test.use({ javaScriptEnabled: false })
  test('shows the still frame with its numbers, named lanes, and a table of the last twenty orders', async ({ page }) => {
    await page.goto('/order-book')
    const img = page.locator(`${FIG} img`)
    await expect(img).toHaveAttribute('alt', /\d+ market buys and \d+ market sells/)
    await expect(img).toHaveAttribute('loading', 'lazy')
    await expect(page.locator(`${FIG} tbody tr`)).toHaveCount(20)
    await expect(page.locator(FIG).getByText('Market buys', { exact: true }).first()).toBeAttached()
  })
})

test('the key’s swatch for an emptied queue is the ink its marks are drawn in', async ({ page }) => {
  await page.goto('/order-book')
  const [swatch, ink] = await page.evaluate(() => {
    const key = [...document.querySelectorAll<HTMLElement>('#fig-order-flow span')].find((s) => s.textContent?.startsWith('Shares at the touch'))!
    const probe = document.createElement('span')
    probe.style.color = 'var(--color-ink)'
    document.body.append(probe)
    return [getComputedStyle(key.querySelector('span')!).backgroundColor, getComputedStyle(probe).color]
  })
  expect(swatch).toBe(ink)
})

test('goes live on the market Fig. 1 draws, and one Pause holds both figures', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await seen(page)
  await page.goto('/order-book')
  await page.locator(FIG).scrollIntoViewIfNeeded()
  if (!(await streams(page))) return test.skip(true, 'no GPU here: Fig. 1 keeps its still frame, and Fig. 2 draws the same still moment')
  const t0 = await simT(page)
  await page.waitForTimeout(1_500)
  expect(await simT(page)).toBeGreaterThan(t0 + 0.8)
  await page.locator(FIG).getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(300)
  const held = await simT(page)
  await page.waitForTimeout(1_000)
  expect(await simT(page)).toBe(held)
  // The same Pause, seen from Fig. 1 (whose controls exist once it has gone live).
  const first = page.locator('#fig-order-book [data-orderbook-controls] button').first()
  if (await first.count()) await expect(first).toHaveText('Resume')
  await page.locator(FIG).getByRole('button', { name: 'Resume' }).click()
  await expect.poll(() => simT(page), { timeout: 3_000 }).toBeGreaterThan(held + 0.3)
  expect(errors).toEqual([])
})

test.describe('where Fig. 1 cannot go live', () => {
  test('Fig. 2 draws the same still moment as Fig. 1’s picture, with no Pause, and reading an order still works', async ({ page }) => {
    const errors = errorsOf(page)
    // A browser without WebGL2.
    await page.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, ...rest: unknown[]) {
        return id === 'webgl2' ? null : (get as (...a: unknown[]) => unknown).call(this, id, ...rest)
      } as typeof get
    })
    await seen(page)
    await page.goto('/order-book')
    await expect(page.locator('#fig-order-book')).toContainText('Still frame: this browser has no WebGL2.')
    await page.locator(FIG).scrollIntoViewIfNeeded()
    await expect.poll(() => canvas(page).getAttribute('data-draws').then(Number), { timeout: 10_000 }).toBeGreaterThan(0)
    const t0 = await simT(page)
    await page.waitForTimeout(1_200)
    // The market has not run on ahead of the picture above it.
    expect(await simT(page)).toBe(t0)
    await expect(page.locator(FIG).getByRole('button', { name: /Pause|Resume/ })).toHaveCount(0)
    await page.locator(`${FIG} [role="group"]`).focus()
    await page.keyboard.press('ArrowLeft')
    await expect(reading(page)).toContainText(/Market (buy|sell)/)
    expect(errors).toEqual([])
  })
})

test('its margin reads the title’s claim: the share of market orders set off by earlier ones, against the model', async ({ page }) => {
  await page.goto('/order-book')
  const rail = page.locator(FIG)
  await expect(rail.getByText('Market orders set off, 10 s').first()).toBeAttached()
  const value = rail.locator('dt', { hasText: 'Market orders set off, 10 s' }).first().locator('xpath=following-sibling::dd[1]')
  expect(pct((await value.textContent())!)[0]).toBeGreaterThan(50)
})

test('pointing at the strips holds them still to read, and moving away lets the market run on', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a mouse')
  test.setTimeout(60_000)
  await seen(page)
  await page.goto('/order-book')
  await page.locator(FIG).scrollIntoViewIfNeeded()
  if (!(await streams(page))) return test.skip(true, 'no GPU here: Fig. 1 keeps its still frame, and Fig. 2 draws the same still moment')
  const box = (await canvas(page).boundingBox())!
  await page.mouse.move(box.x + box.width * 0.6, box.y + 40)
  await page.waitForTimeout(300)
  const t0 = await simT(page)
  await page.waitForTimeout(1_000)
  expect(await simT(page)).toBe(t0)
  await page.mouse.move(box.x + box.width * 0.6, box.y - 120)
  await expect.poll(() => simT(page), { timeout: 3_000 }).toBeGreaterThan(t0 + 0.3)
})

test('a pinned order stays readable after the strips move past it, and says so', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a keyboard')
  test.setTimeout(60_000)
  await seen(page)
  await page.goto('/order-book')
  await page.locator(FIG).scrollIntoViewIfNeeded()
  if (!(await streams(page))) return test.skip(true, 'no GPU here: the strips do not move past a pinned order')
  const stage = page.locator(`${FIG} [role="group"]`)
  await stage.focus()
  await expect(reading(page)).toContainText(/Market buy\s*\d+ shares? at \$\d+\.\d{2}/)
  const first = await reading(page).locator('dd').first().innerText()
  // Focus moves on to the figure's own Pause, so the market runs again with the figure in view; the order stays pinned.
  await page.locator(FIG).getByRole('button', { name: 'Pause' }).focus()
  await expect(reading(page)).toContainText('off the strip', { timeout: 15_000 })
  // The kind and the order (its size and price) are the same; only its age, and the note, have moved on.
  expect((await reading(page).locator('dd').first().innerText()).split(' · ')[0]).toEqual(first.split(' · ')[0])
})

test('reads an order from the keyboard: what it was, and what set it off, adding up to all of it', async ({ page }) => {
  await seen(page)
  await page.goto('/order-book')
  const stage = page.locator(`${FIG} [role="group"]`)
  await stage.focus()
  await expect(reading(page)).toContainText(/Market buy\s*\d+ shares? at \$\d+\.\d{2}/)
  const text = await reading(page).innerText()
  // A market buy is set off by earlier market buys, market sells and cancelled asks, or comes on its own: all of it.
  const shares = pct(text)
  expect(shares.length).toBeGreaterThanOrEqual(2)
  expect(Math.abs(shares.reduce((a, b) => a + b, 0) - 100)).toBeLessThanOrEqual(0.3)
  await page.keyboard.press('ArrowUp')
  await expect(reading(page)).toContainText('Market sell')
  await page.keyboard.press('Escape')
  await expect(reading(page).locator('dd').first()).toContainText('—')
})

test('the order chosen in Fig. 2 is marked on Fig. 1’s terrain', async ({ page }) => {
  test.setTimeout(60_000)
  await seen(page)
  await page.goto('/order-book')
  await page.locator('#fig-order-book [data-seq]').scrollIntoViewIfNeeded()
  const live = await expect
    .poll(() => page.locator('#fig-order-book canvas').evaluate((c) => getComputedStyle(c).opacity), { timeout: 15_000 })
    .toBe('1')
    .then(() => true, () => false)
  if (!live) return test.skip(true, 'no GPU here')
  await page.locator(`${FIG} [role="group"]`).focus()
  await expect(reading(page)).toContainText('Market buy')
  await expect(page.locator('#fig-order-book-probe dd').first()).toContainText('$', { timeout: 3_000 })
})

test('reduced motion: one still frame, and reading an order still works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/order-book')
  await page.locator(FIG).scrollIntoViewIfNeeded()
  await expect.poll(() => canvas(page).getAttribute('data-draws').then(Number), { timeout: 5_000 }).toBeGreaterThan(0)
  // Drawn once, and again when its size is first known; after that, nothing moves.
  await page.waitForTimeout(500)
  const draws = Number(await canvas(page).getAttribute('data-draws'))
  await page.waitForTimeout(1_000)
  expect(Number(await canvas(page).getAttribute('data-draws'))).toBe(draws)
  await expect(page.locator(FIG).getByRole('button', { name: 'Pause' })).toHaveCount(0)
  await page.locator(`${FIG} [role="group"]`).focus()
  await expect(reading(page)).toContainText('Market buy')
})
