import { expect, test, type Page } from '@playwright/test'

/**
 * Prototype C: the vol surface through a simulated shock. The lab floor
 * (tests/e2e/lab.spec.ts) covers accessibility, origin, reduced motion and
 * copy; this checks that the figure does what its caption says. The live
 * surface starts by itself wherever WebGL runs on a GPU; on a software
 * rasteriser (headless CI) it waits for Play, so the spec presses it there.
 */

const ROUTE = '/lab/c'
const stage = (page: Page) => page.locator('section[data-live]')
const text = async (page: Page, id: string) => (await page.getByTestId(id).textContent())?.trim() ?? ''
const surface = (page: Page) => page.getByRole('group', { name: /implied volatility surface/i })
/**
 * Press a control, then bring the surface back on screen: on a phone the
 * controls sit below it, Playwright scrolls them to the middle of the
 * viewport, and the loop (rightly) pauses while the surface is off screen.
 */
async function press(page: Page, name: string) {
  await page.getByRole('button', { name }).click()
  await surface(page).scrollIntoViewIfNeeded()
}

/** Bring the surface live, pressing Play on a software rasteriser. False where WebGL2 is absent. */
async function goLive(page: Page): Promise<boolean> {
  await page.goto(ROUTE, { waitUntil: 'networkidle' })
  await expect(page.locator('[data-lab-poster]')).toBeVisible()
  const deadline = Date.now() + 25000
  while (Date.now() < deadline) {
    if ((await stage(page).getAttribute('data-live')) === 'true') return true
    const play = page.getByRole('button', { name: 'Play' })
    if ((await stage(page).getAttribute('data-tier')) === 'software' && (await play.isEnabled().catch(() => false))) {
      await press(page, 'Play')
    }
    await page.waitForTimeout(200)
  }
  return (await stage(page).getAttribute('data-live')) === 'true'
}

test.describe(ROUTE, () => {
  // A software rasteriser shared by parallel workers is slow; give the live tests room.
  test.describe.configure({ timeout: 90_000 })

  test('the poster is a real frame: readouts computed, the check passing, before any WebGL', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(ROUTE)
    await expect(page.locator('[data-lab-poster] svg path').first()).toBeAttached()
    expect(await page.locator('[data-lab-poster] svg path').count()).toBeGreaterThan(100)
    await expect(page.getByTestId('arb')).toHaveText('passes')
    expect(await text(page, 'atm')).toMatch(/^\d+\.\d%$/)
    await expect(page.getByText('SSVI surface · synthetic parameters, set by hand · not market data')).toBeVisible()
  })

  test('goes live, or stays on the poster where WebGL is absent', async ({ page }) => {
    const live = await goLive(page)
    const canvasShown = await page.locator('canvas').evaluate((c) => Number(getComputedStyle(c).opacity) > 0)
    const posterShown = await page.locator('[data-lab-poster]').evaluate((p) => Number(getComputedStyle(p.parentElement!).opacity) > 0)
    if (live) expect(canvasShown).toBe(true)
    else expect(posterShown).toBe(true)
  })

  test('the readouts move with the shock, the arbitrage check keeps passing, and Pause stops them', async ({ page }) => {
    test.skip(!(await goLive(page)), 'no WebGL2 here')
    const seen = new Set<string>()
    for (let i = 0; i < 8; i++) {
      seen.add(await text(page, 'atm'))
      await expect(page.getByTestId('arb')).toHaveText('passes')
      await page.waitForTimeout(250)
    }
    expect(seen.size).toBeGreaterThan(1)

    await press(page, 'Pause')
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
    // The frame already in flight when Pause lands is drawn; after that, nothing moves.
    await page.waitForTimeout(300)
    const held = await text(page, 'atm')
    await page.waitForTimeout(900)
    expect(await text(page, 'atm')).toBe(held)

    await press(page, 'Play')
    await expect.poll(async () => text(page, 'atm'), { timeout: 15_000 }).not.toBe(held)
  })

  test('the shock size slider changes the surface on screen', async ({ page }) => {
    test.skip(!(await goLive(page)), 'no WebGL2 here')
    await press(page, 'Pause')
    const before = await text(page, 'atm')
    const slider = page.getByRole('slider', { name: /shock size/i })
    await slider.focus()
    await page.keyboard.press('End')
    await surface(page).scrollIntoViewIfNeeded()
    await expect(slider).toHaveAttribute('aria-valuetext', /^1\.50 times/)
    await expect.poll(async () => text(page, 'atm'), { timeout: 15_000 }).not.toBe(before)
  })

  test('the keyboard reads a point on the surface', async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'networkidle' })
    await surface(page).focus()
    const where = await text(page, 'probe-where')
    const vol = await text(page, 'probe-vol')
    expect(where).toBe('strike 100%, 3 months')
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft')
    await expect.poll(async () => text(page, 'probe-where')).toMatch(/^strike 9\d%, 3 months$/)
    await expect.poll(async () => text(page, 'probe-vol')).not.toBe(vol)
    await page.keyboard.press('Home')
    await expect.poll(async () => text(page, 'probe-where')).toBe(where)
  })
})
