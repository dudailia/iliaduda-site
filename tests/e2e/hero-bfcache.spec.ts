import { expect, test } from '@playwright/test'
import { GPU, goLive, seq } from './hero-kit'

/**
 * The home figure and the back button. Playwright launches Chromium without
 * the back-forward cache; this file puts it back, so a page restored from the
 * cache — its script state intact, mid-sequence — is what is tested.
 */

test.use({ launchOptions: { args: GPU, ignoreDefaultArgs: ['--disable-back-forward-cache'] } })

test('leaving mid-sequence and coming back never replays it', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await expect.poll(() => seq(page), { timeout: 15_000, intervals: [50] }).toBe('playing')
  await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1))
  await page.goto('/about')
  await page.goBack()
  // A page restored from the cache gets its script context back a moment after goBack resolves.
  let restored: boolean | null = null
  for (let i = 0; i < 50 && restored === null; i++) {
    restored = await page.evaluate(() => (window as unknown as { marker?: number }).marker === 1).catch(() => null)
    if (restored === null) await page.waitForTimeout(100)
  }
  expect(restored).not.toBeNull()
  // From the cache it finishes; from a fresh load the session has seen it. Either way it does not play again.
  await expect.poll(() => seq(page), { timeout: 2_000 }).toBe(restored ? 'done' : 'off')
  await page.waitForTimeout(800)
  expect(await seq(page)).toBe(restored ? 'done' : 'off')
})
