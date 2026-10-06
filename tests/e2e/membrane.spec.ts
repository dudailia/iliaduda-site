import { expect, test, type Page } from '@playwright/test'
import { GPU, errorsOf } from './hero-kit'

/**
 * /membrane, the directed study: Fig. 1, a drum ringing in the Fourier–Bessel modes the reader keeps, and Fig. 2, the
 * exercises' radial profiles against their series. The drum reads correctly before any script; goes live and is
 * drawn at a phone's size too (not into one pixel); plays its signature once per visit; every control moves the
 * margin, with the exercises' coefficients there; Pause holds it; reduced motion is a still frame every control
 * redraws; a lost context leaves the still frame. Fig. 2's error falls as terms are added.
 */

test.use({ launchOptions: { args: GPU } })

const FIG = '#fig-membrane'
const STAGE = '[data-membrane-stage]'
const seen = (page: Page) => page.addInitScript(() => sessionStorage.setItem('membrane-seq', '1'))
const time = (page: Page) => page.locator(`${FIG} [data-membrane-time]:visible`).first().textContent().then(Number)
const shown = (page: Page) => page.locator(`${STAGE} canvas`).evaluate((c) => getComputedStyle(c).visibility !== 'hidden' && Number(getComputedStyle(c).opacity) > 0.5)
async function goLive(page: Page) {
  // The stage at the top of the screen, its controls under it: a click on one then scrolls nothing, and the drum,
  // which waits off screen, stays on it.
  await page.locator(STAGE).evaluate((el) => el.scrollIntoView({ block: 'start' }))
  const live = await expect.poll(() => shown(page), { timeout: 20_000 }).toBe(true).then(() => true, () => false)
  // Its buttons have finished rising into place (240ms): a click on one still moving is retried by scrolling.
  if (live) await expect(page.locator(`${FIG} [data-live-buttons] > button`).last()).toHaveCSS('opacity', '1')
  return live
}
/** The colour at the drum's centre, read from the canvas in the frame it was drawn. */
const centre = (page: Page) =>
  page.locator(`${STAGE} canvas`).evaluate(
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
const paperRGB = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor.match(/\d+/g)!.slice(0, 3).map(Number))

test.describe('before any script runs', () => {
  test.use({ javaScriptEnabled: false })
  test('is the drum drawn, with its shape, energy and the exercises’ coefficients in the margin', async ({ page }) => {
    await page.goto('/membrane')
    await expect(page.locator(`${FIG} [data-membrane-poster] svg polyline`).first()).toBeAttached()
    await expect(page.locator(FIG)).toContainText('f = 2 sin 2θ, g = 0')
    await expect(page.locator(FIG)).toContainText('5.2698')
    await expect(page.locator(FIG)).toContainText('−0.3168')
  })
})

test('goes live and rings: its model time moves, and it is drawn (the stage is not paper)', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await seen(page)
  await page.goto('/membrane')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  const t0 = await time(page)
  await expect.poll(() => time(page), { timeout: 8_000 }).toBeGreaterThan(t0 + 0.5)
  const px = await centre(page)
  const paper = await paperRGB(page)
  expect(Math.abs(px[0]! - paper[0]!) + Math.abs(px[1]! - paper[1]!) + Math.abs(px[2]! - paper[2]!)).toBeGreaterThan(12)
  expect(errors).toEqual([])
})

test('plays its signature once per visit: a reload does not replay it', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/membrane')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await expect.poll(() => page.locator(STAGE).getAttribute('data-seq'), { timeout: 12_000 }).toBe('done')
  await page.reload()
  await page.locator(STAGE).scrollIntoViewIfNeeded()
  await page.waitForTimeout(1500)
  expect(await page.locator(STAGE).getAttribute('data-seq')).toBe('off')
})

test('a shape and the modes move the margin: the exercises’ g = −cos θ, and an error that falls with more modes', async ({ page }) => {
  await seen(page)
  await page.goto('/membrane')
  await page.locator(FIG).getByRole('radio', { name: 'g = −cos θ' }).click()
  await expect(page.locator(FIG)).toContainText('f = 0, g = −cos θ')
  await expect(page.locator(FIG)).toContainText('−0.5776')
  await expect(page.locator(FIG)).toContainText('0.0737')
  const err = async () => Number.parseFloat((await page.locator(`${FIG} dl:visible div`).filter({ has: page.locator('dt', { hasText: /^Error/ }) }).locator('dd').first().textContent())!)
  const before = await err()
  await page.locator(`${FIG} input[type=range]`).fill('16')
  await expect.poll(err).toBeLessThan(before)
})

test('Pause holds the drum, and Resume lets it ring again', async ({ page }) => {
  test.setTimeout(60_000)
  await seen(page)
  await page.goto('/membrane')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await page.locator(FIG).getByRole('button', { name: 'Pause' }).click()
  // It coasts to rest over 240ms, then holds.
  await page.waitForTimeout(400)
  const held = await time(page)
  await page.waitForTimeout(1200)
  expect(await time(page)).toBe(held)
  await page.locator(FIG).getByRole('button', { name: 'Resume' }).click()
  await expect.poll(() => time(page), { timeout: 5_000 }).toBeGreaterThan(held)
})

test('reduced motion: a still frame, no live drum, and a shape still redraws it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/membrane')
  await page.locator(STAGE).scrollIntoViewIfNeeded()
  await page.waitForTimeout(1500)
  expect(await shown(page)).toBe(false)
  const pts = () => page.locator(`${STAGE} [data-membrane-poster] svg polyline`).nth(10).getAttribute('points')
  const before = await pts()
  await page.locator(FIG).getByRole('radio', { name: 'f = r sin θ' }).click()
  await expect.poll(pts).not.toBe(before)
  await expect(page.locator(FIG).getByRole('button', { name: 'Pause' })).toHaveCount(0)
})

test('a lost context leaves the still frame, without an error', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await seen(page)
  await page.goto('/membrane')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await page.locator(`${STAGE} canvas`).evaluate((c: HTMLCanvasElement) => c.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext())
  await expect(page.locator(`${STAGE} [data-membrane-poster] svg`)).toBeVisible({ timeout: 8_000 })
  expect(errors).toEqual([])
})

test('Fig. 2: the error in the mean falls as terms are added, and the step jumps where the exercise says', async ({ page }) => {
  await page.goto('/membrane')
  const fig = page.locator('#fig-convergence')
  await fig.scrollIntoViewIfNeeded()
  await fig.getByRole('radio', { name: 'f = 3, then 1' }).click()
  const err = async () => Number.parseFloat((await fig.locator('dl:visible div').filter({ has: page.locator('dt', { hasText: /^Error/ }) }).locator('dd').first().textContent())!)
  const two = await err()
  await fig.locator('input[type=range]').fill('12')
  await expect.poll(err).toBeLessThan(two)
  await expect(fig).toContainText('3 for r ≤ ½, 1 beyond')
})

test('one profile reads one relative error, in Fig. 1 struck as a drum and in Fig. 2 on its line', async ({ page }) => {
  await seen(page)
  await page.goto('/membrane')
  const row = (sel: string, label: RegExp) => page.locator(`${sel} dl:visible div`).filter({ has: page.locator('dt', { hasText: label }) }).locator('dd').first()
  await page.locator(FIG).getByRole('radio', { name: 'f = 2r + 1' }).click()
  const fig2 = page.locator('#fig-convergence')
  await fig2.getByRole('radio', { name: 'f = 2r + 1' }).click()
  await page.locator(`${FIG} input[type=range]`).fill('4')
  await fig2.locator('input[type=range]').fill('4')
  await expect.poll(() => row(FIG, /^Error/).textContent()).toMatch(/^\d+\.\d%$/)
  expect(await row(FIG, /^Error/).textContent()).toBe(await row('#fig-convergence', /^Error/).textContent())
})

test('Replay lowers the drum and plays the story from its shape: the clock starts again at 0', async ({ page }) => {
  test.setTimeout(60_000)
  await seen(page)
  await page.goto('/membrane')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await expect.poll(() => time(page), { timeout: 8_000 }).toBeGreaterThan(1)
  await page.locator(FIG).getByRole('button', { name: 'Replay' }).click()
  await expect.poll(() => time(page), { timeout: 3_000, intervals: [50] }).toBe(0)
  await expect.poll(() => page.locator(STAGE).getAttribute('data-seq'), { timeout: 3_000 }).toBe('playing')
  await expect.poll(() => page.locator(STAGE).getAttribute('data-seq'), { timeout: 6_000 }).toBe('done')
})

test('a new shape starts its own clock: the drum is let go from the shape the margin names', async ({ page }) => {
  test.setTimeout(60_000)
  await seen(page)
  await page.goto('/membrane')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await expect.poll(() => time(page), { timeout: 8_000 }).toBeGreaterThan(1.5)
  await page.locator(FIG).getByRole('radio', { name: 'f = r sin θ' }).click()
  await expect.poll(() => time(page), { timeout: 2_000, intervals: [50] }).toBeLessThan(0.6)
  await expect(page.locator(FIG)).toContainText('f = r sin θ, g = 0')
})

test('Pause holds the story too: pressed as the drum rises, it waits there until Resume', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/membrane')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await expect.poll(() => page.locator(STAGE).getAttribute('data-seq'), { timeout: 12_000, intervals: [50] }).toBe('playing')
  await page.locator(FIG).getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(3_000)
  expect(await page.locator(STAGE).getAttribute('data-seq')).toBe('playing')
  await page.locator(FIG).getByRole('button', { name: 'Resume' }).click()
  await expect.poll(() => page.locator(STAGE).getAttribute('data-seq'), { timeout: 5_000 }).toBe('done')
})

test('the shapes are two radio groups the keyboard way: one tab stop each, the arrow keys moving the choice', async ({ page }) => {
  await seen(page)
  await page.goto('/membrane')
  const groups = page.locator(`${FIG} [data-membrane-controls] [role=radiogroup]`)
  await expect(groups).toHaveCount(2)
  for (const g of await groups.all()) await expect(g.locator('[tabindex="0"]')).toHaveCount(1)
  const first = page.locator(FIG).getByRole('radio', { name: 'f = 2 sin 2θ' })
  await first.focus()
  await page.keyboard.press('ArrowRight')
  const next = page.locator(FIG).getByRole('radio', { name: 'g = −cos θ' })
  await expect(next).toBeFocused()
  await expect(next).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator(FIG)).toContainText('f = 0, g = −cos θ')
  await page.keyboard.press('End')
  await expect(page.locator(FIG).getByRole('radio', { name: 'g = (r − 1) cos 2θ' })).toBeFocused()
  // Fig. 2's groups too.
  const p1 = page.locator('#fig-convergence').getByRole('radio', { name: 'f = 1', exact: true })
  await p1.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('#fig-convergence').getByRole('radio', { name: 'f = 3, then 1' })).toHaveAttribute('aria-checked', 'true')
})

test.describe('in a browser with no WebGL2', () => {
  test('shows the still frame and says why, and a shape still redraws it', async ({ page }) => {
    const errors = errorsOf(page)
    await page.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, ...rest: unknown[]) {
        return id === 'webgl2' ? null : (get as (...a: unknown[]) => RenderingContext | null).call(this, id, ...rest)
      } as typeof get
    })
    await page.goto('/membrane')
    await page.locator(STAGE).scrollIntoViewIfNeeded()
    const svg = page.locator(`${STAGE} [data-membrane-poster] svg`)
    await expect.poll(() => svg.evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 5_000 }).toBe(1)
    await expect(page.locator(FIG)).toContainText('Still frame: this browser has no WebGL2.')
    const pts = () => page.locator(`${STAGE} [data-membrane-poster] svg polyline`).nth(10).getAttribute('points')
    const before = await pts()
    await page.locator(FIG).getByRole('radio', { name: 'f = r sin θ' }).click()
    await expect.poll(pts).not.toBe(before)
    expect(errors).toEqual([])
  })
})
