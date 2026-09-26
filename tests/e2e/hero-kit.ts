import { expect, type Page } from '@playwright/test'

/** Helpers shared by the home figure's specs (hero, hero-bfcache, hero-software). */

export const GPU = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']

export const STAGE = '[data-seq]'
export const num = async (page: Page, sel: string, attr: string) => Number((await page.locator(sel).first().getAttribute(attr)) ?? NaN)
export const canvasShown = (page: Page) =>
  page.locator(`${STAGE} canvas`).evaluate((c) => getComputedStyle(c).visibility !== 'hidden' && Number(getComputedStyle(c).opacity) > 0.5)
export const seq = (page: Page) => page.locator(STAGE).getAttribute('data-seq')
export const fillOpacity = (page: Page) =>
  page.locator('[data-futures-poster] [data-fill]').first().evaluate((e) => Number(getComputedStyle(e).opacity))
export const errorsOf = (page: Page) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}
/** Bring the stage fully into view and wait for it to go live; false where this machine has no usable GPU. */
export async function goLive(page: Page) {
  await page.locator(STAGE).scrollIntoViewIfNeeded()
  return expect
    .poll(() => canvasShown(page), { timeout: 20_000 })
    .toBe(true)
    .then(() => true)
    .catch(() => false)
}
/** A visit on which the sequence has already been seen: the figure opens finished. */
export const seen = (page: Page) => page.addInitScript(() => sessionStorage.setItem('futures-seq', '1'))
/** Hold the lazily loaded renderer chunk back until `release` is called, and report when it was asked for. */
export async function holdRenderer(page: Page) {
  let loaded = false
  let open!: () => void
  const gate = new Promise<void>((r) => (open = r))
  let asked!: () => void
  const requested = new Promise<void>((r) => (asked = r))
  await page.route('**/_next/static/chunks/*.js', async (route) => {
    if (!loaded) return route.continue()
    asked()
    await gate
    await route.continue()
  })
  return { armed: () => (loaded = true), requested, release: () => open() }
}
/** Mean colour (0–1 sRGB) of a patch of the stage, from a screenshot decoded in the page. */
export async function patch(page: Page, box = { x0: 0, y0: 0, x1: 1, y1: 1 }) {
  const b64 = (await page.locator(STAGE).screenshot()).toString('base64')
  return page.evaluate(
    async ({ b64, box }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${b64}`
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const g = c.getContext('2d')!
      g.drawImage(img, 0, 0)
      const x0 = Math.round(img.width * box.x0), y0 = Math.round(img.height * box.y0)
      const d = g.getImageData(x0, y0, Math.max(1, Math.round(img.width * box.x1) - x0), Math.max(1, Math.round(img.height * box.y1) - y0)).data
      let r = 0, gr = 0, b = 0
      for (let i = 0; i < d.length; i += 4) {
        r += d[i]!
        gr += d[i + 1]!
        b += d[i + 2]!
      }
      const n = d.length / 4
      return [r / n / 255, gr / n / 255, b / n / 255] as [number, number, number]
    },
    { b64, box },
  )
}
export const luminance = ([r, g, b]: readonly number[]) => {
  const l = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * l(r!) + 0.7152 * l(g!) + 0.0722 * l(b!)
}
export const contrast = (a: readonly number[], b: readonly number[]) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}

