import { expect, test, type Page } from '@playwright/test'
import { GPU, STAGE, errorsOf, goLive, num, seen } from './hero-kit'

/**
 * The home figure at rest is in motion: new futures stream from today and the
 * view drifts, leaning toward a laptop's pointer or with a phone's tilt. Pause
 * holds all of it for the rest of the visit (WCAG 2.2.2), and a paused figure
 * draws nothing. iOS asks before a page reads the tilt, and only from a tap, so
 * the first tap on the figure asks, once.
 */

test.use({ launchOptions: { args: GPU } })

const draws = async (page: Page) => Number(await page.locator(`${STAGE} [data-draws]`).getAttribute('data-draws'))
const motion = (page: Page) =>
  page.locator('[data-stage-debug] div').filter({ has: page.locator('dt', { hasText: /^motion$/ }) }).locator('dd')

test('Pause holds the figure, so nothing is drawn; the pause lasts the visit, and Resume lets it move again', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await seen(page)
  await page.goto('/')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await expect(page.locator(`${STAGE} [data-camera]`)).toHaveAttribute('data-camera', 'rest', { timeout: 6_000 })
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(300)
  let before = await draws(page)
  await page.waitForTimeout(1500)
  // One or two are a quality step's redraw at its new resolution.
  expect((await draws(page)) - before).toBeLessThanOrEqual(2)
  await page.reload()
  expect(await goLive(page)).toBe(true)
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  before = await draws(page)
  await page.waitForTimeout(1500)
  expect((await draws(page)) - before).toBeGreaterThan(20)
  expect(errors).toEqual([])
})

test('the live controls arrive in turn, rising into place, while press and hover stay instant', async ({ page }) => {
  await seen(page)
  await page.goto('/')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  const t = await page.locator('[data-futures-controls] > button').evaluateAll((bs) =>
    bs.slice(0, 3).map((b) => {
      const c = getComputedStyle(b)
      const props = c.transitionProperty.split(', ')
      const delays = c.transitionDelay.split(', ')
      return Object.fromEntries(props.map((p, i) => [p, delays[i] ?? delays[0]]))
    }),
  )
  expect(t.map((d) => d.translate)).toEqual(['0s', '0.04s', '0.08s'])
  expect(t.map((d) => d.opacity)).toEqual(['0s', '0.04s', '0.08s'])
  expect(t.every((d) => d.scale === '0s' && d['border-color'] === '0s')).toBe(true)
})

test('paused, the numbers hold too, once there is an estimate to show', async ({ page }) => {
  test.setTimeout(60_000)
  await seen(page)
  await page.addInitScript(() => sessionStorage.setItem('futures-paused', '1'))
  await page.goto('/')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  const paths = () => num(page, '[data-paths]', 'data-paths')
  await expect.poll(paths, { timeout: 20_000 }).toBeGreaterThanOrEqual(1_048_576)
  await page.waitForTimeout(500)
  const held = await paths()
  await page.waitForTimeout(1500)
  expect(await paths()).toBe(held)
  expect(held).toBeLessThan(268_435_456)
  // Resumed, the run carries on to the end.
  await page.getByRole('button', { name: 'Resume' }).click()
  await expect.poll(paths, { timeout: 30_000 }).toBe(268_435_456)
})

test('a laptop’s pointer leans the view toward itself, and leaving lets it go', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a pointer that hovers')
  await seen(page)
  await page.goto('/?debug=1')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  const b = (await page.locator(STAGE).boundingBox())!
  await page.mouse.move(b.x + b.width * 0.95, b.y + b.height * 0.1)
  await expect(motion(page)).toContainText(/lean from pointer 0\.9\d, 0\.[89]\d/, { timeout: 2_000 })
  await page.mouse.move(b.x + b.width / 2, b.y + b.height + 200)
  await expect(motion(page)).toContainText('0.00, 0.00', { timeout: 2_000 })
})

test('a phone’s tilt leans the view', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'a phone')
  await seen(page)
  await page.goto('/?debug=1')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  const tilt = (beta: number, gamma: number) =>
    page.evaluate(([beta, gamma]) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta, gamma, alpha: 0 })), [beta, gamma] as const)
  await tilt(40, 5)
  await tilt(40, 16)
  await expect(motion(page)).toContainText(/lean from tilt 0\.[4-9]\d/, { timeout: 2_000 })
})

test('on iOS, the first tap on the figure asks to read the tilt, once, and then the tilt leans it', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'a phone')
  const errors = errorsOf(page)
  await page.addInitScript(() => {
    const w = window as unknown as { __asked: number }
    w.__asked = 0
    ;(DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission = () => {
      w.__asked++
      return Promise.resolve('granted')
    }
  })
  await seen(page)
  await page.goto('/?debug=1')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  const asked = () => page.evaluate(() => (window as unknown as { __asked: number }).__asked)
  expect(await asked()).toBe(0)
  const b = (await page.locator(STAGE).boundingBox())!
  await page.touchscreen.tap(b.x + b.width * 0.2, b.y + b.height * 0.15)
  await expect.poll(asked).toBe(1)
  await page.touchscreen.tap(b.x + b.width * 0.2, b.y + b.height * 0.15)
  await page.waitForTimeout(300)
  expect(await asked()).toBe(1)
  await page.evaluate(() => {
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 40, gamma: 0, alpha: 0 }))
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 40, gamma: 12, alpha: 0 }))
  })
  await expect(motion(page)).toContainText(/lean from tilt 0\.[4-9]\d/, { timeout: 2_000 })
  expect(errors).toEqual([])
})
