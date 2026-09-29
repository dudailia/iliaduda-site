import { expect, test, type Page } from '@playwright/test'
import { GPU } from './hero-kit'

/**
 * The contents morph: a paper's thumbnail grows into its Fig. 1. That growth
 * is the figure's entrance, so a figure that has a signature or a replay does
 * not play it on top; and only a real morph counts as one: arriving any other
 * way (the footer, a link in the text, Back) is a plain page change, and the
 * figures that replay once when first seen still do. Coming back to the
 * contents, the figure shrinks into the thumbnail it came from.
 */

test.use({ launchOptions: { args: GPU } })

const mark = (page: Page, key: string) => page.evaluate((k) => document.documentElement.dataset[k] ?? null, key)

async function openFromContents(page: Page, slug: string) {
  await page.goto('/')
  const entry = page.locator('[data-vt-contents] li').filter({ has: page.locator(`[data-vt-thumb="fig-${slug}"]`) })
  await entry.scrollIntoViewIfNeeded()
  await entry.locator('h3 a').click()
  await page.waitForURL(`**/${slug}`)
}

test('through the contents, the order book’s figure arrives finished: its story does not play over the morph', async ({ page }) => {
  await openFromContents(page, 'order-book')
  expect(await mark(page, 'vtArrival')).toBe('1')
  expect(await mark(page, 'orderbookSeq')).toBe(null)
  const fill = page.locator('#fig-order-book [data-orderbook-poster] [data-fill]').first()
  await expect.poll(() => fill.evaluate((e) => Number(getComputedStyle(e).opacity))).toBe(1)
  await page.waitForTimeout(1_500)
  expect(await page.locator('#fig-order-book [data-seq]').getAttribute('data-seq')).toBe('off')
})

test('through the contents, the IV surface arrives finished too', async ({ page }) => {
  await openFromContents(page, 'iv-surface')
  expect(await mark(page, 'vtArrival')).toBe('1')
  expect(await mark(page, 'surfaceSeq')).toBe(null)
  await expect.poll(() => page.locator('#fig-iv-surface [data-iv-poster]').evaluate((e) => Number(getComputedStyle(e).opacity))).toBe(1)
})

test('through the contents, /market keeps its story: the morph lands on its calm, and the shock plays after it', async ({ page }) => {
  await openFromContents(page, 'market')
  expect(await mark(page, 'vtArrival')).toBe('1')
  expect(await mark(page, 'marketSeq')).toBe('1')
})

test('on a phone the thumbnail grows into the paper’s figure too, the figure’s top only needing to be on screen', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'a phone')
  await openFromContents(page, 'iv-surface')
  expect(await mark(page, 'vtArrival')).toBe('1')
})

test('arriving from the footer is no morph: nothing is marked as one, and the story is still to come', async ({ page }) => {
  await page.goto('/')
  await page.locator('footer nav[aria-label="Papers"] a[href="/order-book"]').click()
  await page.waitForURL('**/order-book')
  expect(await mark(page, 'vtArrival')).toBe(null)
  expect(await mark(page, 'orderbookSeq')).toBe('1')
})

test('a click that opens a new tab names nothing on the contents page', async ({ page, context }) => {
  await page.goto('/')
  const entry = page.locator('[data-vt-contents] li').filter({ has: page.locator('[data-vt-thumb="fig-order-book"]') })
  await entry.scrollIntoViewIfNeeded()
  const [popup] = await Promise.all([context.waitForEvent('page'), entry.locator('h3 a').click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] })])
  await popup.close()
  const named = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-vt-thumb]')].filter((e) => getComputedStyle(e).viewTransitionName !== 'none').length)
  expect(named).toBe(0)
})

test('back to the contents, the paper’s figure is the thumbnail it came from again', async ({ page, isMobile }) => {
  test.skip(isMobile, 'on a phone the contents link opens above the entry, its thumbnail off the screen')
  // Which thumbnails carry a name once the transition into the page is ready: the one the figure shrinks into.
  await page.addInitScript(() => {
    addEventListener('pagereveal', (e) => {
      const vt = (e as Event & { viewTransition?: ViewTransition | null }).viewTransition
      void vt?.ready.then(() => {
        ;(window as unknown as { __named: string[] }).__named = [...document.querySelectorAll<HTMLElement>('[data-vt-thumb]')]
          .filter((t) => getComputedStyle(t).viewTransitionName !== 'none')
          .map((t) => t.dataset.vtThumb!)
      })
    })
  })
  // The first entry in the contents, so its thumbnail is on the screen the contents link opens on.
  await openFromContents(page, 'closebooks')
  await page.locator('header a[href="/#contents"]').click()
  await page.waitForURL((u) => u.pathname === '/')
  await expect.poll(() => page.evaluate(() => (window as unknown as { __named?: string[] }).__named ?? null)).toEqual(['fig-closebooks'])
})

test('a morph mark left by a click that never became a transition does not make a later arrival a morph', async ({ page }) => {
  // Under reduced motion a Contents click marks the morph, but no transition runs: the arrival spends the mark.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openFromContents(page, 'market')
  expect(await page.evaluate(() => sessionStorage.getItem('vt-morph'))).toBe(null)
  // With motion again, a plain arrival (the home line's link) is no morph.
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await page.locator('[data-one-market] a[href="/market"]').click()
  await page.waitForURL('**/market')
  expect(await mark(page, 'vtArrival')).toBe(null)
})
