import { expect, test, type Page } from '@playwright/test'
import { GPU, errorsOf } from './hero-kit'

/**
 * /iv-surface, Fig. 1: the SSVI surface in 3D, to the hero's standard. It
 * says synthetic where it is drawn and reads correctly before any script; it
 * forms and takes one shock once per visit, finished by a click but not a
 * scroll; the slider applies the shock and every readout follows, the
 * arbitrage check included; a click-pin and the arrow keys agree; Pause holds
 * the drawing; reduced motion is a still frame that the slider still redraws;
 * and the phone's path survives its missing extensions and a lost context.
 * Fig. 2, the arbitrage bound, breaks on demand, on a fixed scale.
 */

test.use({ launchOptions: { args: GPU } })

const FIG = '#fig-iv-surface'
const STAGE = `${FIG} [data-seq]`
const seq = (page: Page) => page.locator(STAGE).getAttribute('data-seq')
const canvasShown = (page: Page) => page.locator(`${STAGE} canvas[data-live-canvas]`).evaluate((c) => getComputedStyle(c).visibility !== 'hidden' && Number(getComputedStyle(c).opacity) > 0.5)
const draws = (page: Page) => page.locator(`${STAGE} canvas[data-live-canvas]`).evaluate((c) => Number((c as HTMLCanvasElement).dataset.draws ?? 0))
const seen = (page: Page) => page.addInitScript(() => sessionStorage.setItem('surface-seq', '1'))
/** The margin's value for a label, from whichever copy this screen shows. */
const value = (page: Page, label: string) =>
  page
    .locator(`${FIG} dl:visible div`)
    // A label's phrases are held whole with no-break spaces: any space matches either.
    .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s\\u00a0]')}$`) }) })
    .locator('dd')
    .first()
async function goLive(page: Page) {
  await page.locator(STAGE).scrollIntoViewIfNeeded()
  const live = await expect
    .poll(() => canvasShown(page), { timeout: 20_000 })
    .toBe(true)
    .then(() => true, () => false)
  if (live) await page.waitForFunction(() => !document.querySelector('[data-surface-controls]')?.getAnimations({ subtree: true }).length)
  return live
}

test.describe('before any script runs', () => {
  test.use({ javaScriptEnabled: false })
  test('is the calm surface, says synthetic where it is drawn, and reads its numbers in the margin', async ({ page }) => {
    await page.goto('/iv-surface')
    await expect(page.locator(`${FIG} [data-iv-poster] img[data-mesh]`)).toBeVisible()
    await expect(page.locator(FIG)).toContainText(/Synthetic SSVI\s.*\snot market data/)
    await expect(value(page, '1-month vol, at the money')).toHaveText(/^\d+\.\d%$/)
    await expect(value(page, 'No static arbitrage')).toContainText('passes')
  })
})

test('goes live, forms and takes its shock once per visit: a reload does not replay it', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await page.goto('/iv-surface')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await expect.poll(() => seq(page), { timeout: 10_000 }).toBe('playing')
  // The shock reaches the margin while it plays: one-month at-the-money volatility rises well above calm.
  const calm = Number((await value(page, '1-month vol, at the money').textContent())!.replace('%', ''))
  await expect.poll(async () => Number((await value(page, '1-month vol, at the money').textContent())!.replace('%', '')), { timeout: 6_000 }).toBeGreaterThan(calm + 10)
  await expect.poll(() => seq(page), { timeout: 10_000 }).toBe('done')
  await page.reload()
  expect(await goLive(page)).toBe(true)
  await page.waitForTimeout(800)
  expect(await seq(page)).toBe('off')
  expect(errors).toEqual([])
})

for (const [w, h] of [[390, 844], [412, 839]] as const)
  test(`on a ${w}×${h} phone, unscrolled, the story waits for its stage rather than playing below the fold`, async ({ browser }) => {
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })
    const page = await ctx.newPage()
    await page.goto('/iv-surface')
    // Only the top of the stage is on this first screen: the story must not start (and be over) where it is not seen.
    await page.waitForTimeout(7_000)
    expect(await seq(page)).not.toBe('playing')
    expect(await seq(page)).not.toBe('done')
    await ctx.close()
  })

test('while the story plays and its narration is below the fold, the stage says what is happening', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a laptop’s first screen')
  test.setTimeout(40_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/iv-surface')
  const caption = page.locator(`${STAGE} [data-phase-caption]`)
  const shown = () => caption.evaluate((c) => Number(getComputedStyle(c).opacity))
  // The narration under the stage is off the first screen here.
  const line = (await page.locator(`${FIG} [data-phase-line]`).boundingBox())!
  expect(line.y + line.height).toBeGreaterThan(900)
  if (!(await expect.poll(() => seq(page), { timeout: 15_000 }).toBe('playing').then(() => true, () => false))) return test.skip(true, 'no GPU here')
  await expect.poll(shown).toBeGreaterThan(0.9)
  await expect(caption).toContainText('Shock.', { timeout: 6_000 })
  await expect.poll(() => seq(page), { timeout: 10_000 }).toBe('done')
  await expect.poll(shown).toBeLessThan(0.05)
})

test('a story the page starts while the figure is paused still plays through, and the figure stays paused', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  // Paused in an earlier look at the page, before its story was ever seen.
  await page.addInitScript(() => sessionStorage.setItem('surface-paused', '1'))
  await page.goto('/iv-surface')
  // Half the stage in view: enough for the figure to go live and settle, and for its story to start a moment later
  // (45% held for 1.2 s), with nothing else on the page changing.
  await page.locator(STAGE).evaluate((el) => {
    const r = el.getBoundingClientRect()
    window.scrollBy(0, r.top - (innerHeight - r.height * 0.5))
  })
  const live = await expect
    .poll(() => canvasShown(page), { timeout: 20_000 })
    .toBe(true)
    .then(() => true, () => false)
  if (!live) return test.skip(true, 'no GPU here')
  await expect.poll(() => seq(page), { timeout: 12_000 }).toBe('done')
  await expect(page.locator(FIG).getByRole('button', { name: 'Resume' })).toBeVisible()
  // The pause kept for the visit is the browser's to know: the server's page hydrates without a mismatch.
  expect(errors).toEqual([])
})

test('a click finishes the signature at once; a scroll does not', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a mouse and a wheel')
  test.setTimeout(60_000)
  await page.goto('/iv-surface')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await expect.poll(() => seq(page), { timeout: 10_000 }).toBe('playing')
  await page.mouse.wheel(0, 40)
  await page.waitForTimeout(150)
  expect(await seq(page)).toBe('playing')
  await page.locator(`${FIG} figcaption`).click()
  await expect.poll(() => seq(page), { timeout: 1_500 }).toBe('done')
})

test('the slider applies the shock: the margin follows, and the surface stays free of static arbitrage at the largest', async ({ page }) => {
  await seen(page)
  await page.goto('/iv-surface')
  const atm = value(page, '1-month vol, at the money')
  const before = await atm.textContent()
  const slider = page.getByRole('slider', { name: /shock/i })
  await slider.fill('1.5')
  await expect(atm).not.toHaveText(before ?? '')
  await expect(page.locator(FIG).getByText('1.50×')).toBeVisible()
  await expect(value(page, 'No static arbitrage')).toContainText('passes')
  await expect(slider).toHaveAttribute('aria-valuetext', /1\.50 times a full shock/)
  await slider.fill('0')
  await expect(atm).toHaveText(before ?? '')
})

test('the arrow keys move the reading point and the margin follows; Home returns it', async ({ page }) => {
  await seen(page)
  await page.goto('/iv-surface')
  const strike = value(page, 'Strike')
  const before = await strike.textContent()
  await page.locator(STAGE).focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(strike).not.toHaveText(before ?? '')
  await page.keyboard.press('ArrowDown')
  await expect(page.locator(`${FIG} [aria-live="polite"]`)).toHaveText(/implied volatility \d+\.\d%/)
  await page.keyboard.press('Home')
  await expect(strike).toHaveText(before ?? '')
})

test('says nothing on its own: the reading point is announced only once the reader moves it', async ({ page }) => {
  await seen(page)
  await page.goto('/iv-surface')
  const region = page.locator(`${FIG} [aria-live="polite"]`)
  await page.waitForTimeout(1_200)
  await expect(region).toHaveText('')
  await page.locator(STAGE).focus()
  await page.keyboard.press('ArrowRight')
  await expect(region).toHaveText(/implied volatility \d+\.\d%/)
})

test('a point pinned by a click is where the arrow keys step from', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a mouse')
  test.setTimeout(60_000)
  await seen(page)
  await page.goto('/iv-surface')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  const box = (await page.locator(STAGE).boundingBox())!
  await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.62)
  const strike = value(page, 'Strike')
  await expect(strike).not.toHaveText(/^100\.0 /)
  const pinned = Number((await strike.textContent())!.split(' ')[0])
  await page.locator(STAGE).focus()
  await page.keyboard.press('ArrowRight')
  const next = Number((await strike.textContent())!.split(' ')[0])
  // One step from the pinned strike (about 2.5% of the forward), not a jump back to where the keys last left it.
  expect(Math.abs(next - pinned)).toBeLessThan(6)
  expect(next).toBeGreaterThan(pinned)
})

test('Pause holds the drawing; Resume lets it drift again', async ({ page }) => {
  test.setTimeout(60_000)
  await seen(page)
  await page.goto('/iv-surface')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await page.locator(FIG).getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(400)
  const n = await draws(page)
  await page.waitForTimeout(1_000)
  expect(await draws(page)).toBe(n)
  await page.locator(FIG).getByRole('button', { name: 'Resume' }).click()
  await expect.poll(() => draws(page), { timeout: 3_000 }).toBeGreaterThan(n + 10)
})

test('Replay sinks the surface into the page rather than cutting it, forms it again, and ends at calm', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await seen(page)
  await page.goto('/iv-surface')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await page.getByRole('slider', { name: /shock/i }).fill('1.5')
  await page.waitForTimeout(600)
  // A frame after the press the sheet is on its way down, not gone: it sinks over a third of a second.
  const after = await page.evaluate(async () => {
    const fig = document.querySelector('#fig-iv-surface')!
    const c = fig.querySelector('canvas[data-live-canvas]') as HTMLCanvasElement
    const b = [...fig.querySelectorAll('button')].find((x) => x.textContent === 'Replay') as HTMLButtonElement
    b.click()
    const frame = () => new Promise((r) => requestAnimationFrame(r))
    await frame()
    await frame()
    return Number(c.dataset.rise)
  })
  expect(after).toBeGreaterThan(0.5)
  expect(after).toBeLessThan(1)
  const rise = () => page.locator(`${STAGE} canvas[data-live-canvas]`).evaluate((c) => Number((c as HTMLCanvasElement).dataset.rise))
  await expect.poll(rise, { timeout: 2_000 }).toBeLessThan(0.05)
  await expect.poll(() => seq(page), { timeout: 10_000 }).toBe('done')
  expect(await rise()).toBe(1)
  // The story ends where the reader takes over: calm, with the slider back at nothing.
  await expect(page.locator(FIG).getByText('0.00×')).toBeVisible()
  await expect(page.locator(FIG)).toContainText('Calm.')
  expect(errors).toEqual([])
})

test('Replay plays the story even while the figure is paused, and it stays paused after', async ({ page }) => {
  test.setTimeout(60_000)
  await seen(page)
  await page.goto('/iv-surface')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await page.locator(FIG).getByRole('button', { name: 'Pause' }).click()
  await page.waitForTimeout(400)
  const n = await draws(page)
  await page.locator(FIG).getByRole('button', { name: 'Replay' }).click()
  await expect.poll(() => draws(page), { timeout: 3_000 }).toBeGreaterThan(n + 20)
  await expect.poll(() => seq(page), { timeout: 10_000 }).toBe('done')
  await expect(page.locator(FIG).getByRole('button', { name: 'Resume' })).toBeVisible()
  // After the story a paused figure draws nothing.
  await page.waitForTimeout(400)
  const m = await draws(page)
  await page.waitForTimeout(800)
  expect(await draws(page)).toBe(m)
})

test('the shock slider stays where it is when the figure goes live and its buttons arrive', async ({ page }) => {
  test.setTimeout(60_000)
  await seen(page)
  await page.goto('/iv-surface')
  const slider = page.getByRole('slider', { name: /shock/i })
  const before = (await slider.boundingBox())!
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  const after = (await slider.boundingBox())!
  expect(Math.round(after.x - before.x)).toBe(0)
})

test('the still frame’s note is whole: nothing of it is cut off at the stage’s edge', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/iv-surface')
  const stage = (await page.locator(STAGE).boundingBox())!
  const note = page.locator(`${FIG} [data-iv-poster] [data-note] span.block:visible`).first()
  await expect(note).toBeVisible()
  const b = (await note.boundingBox())!
  expect(b.x).toBeGreaterThanOrEqual(stage.x)
  expect(b.x + b.width).toBeLessThanOrEqual(stage.x + stage.width)
})

test('a phone has its own framing: a taller stage, and only the poster drawn for it is fetched', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'a phone')
  const svgs: string[] = []
  page.on('request', (r) => {
    if (/\/iv-surface\/poster[^/]*\.svg$/.test(r.url())) svgs.push(new URL(r.url()).pathname)
  })
  await seen(page)
  await page.goto('/iv-surface')
  const b = (await page.locator(STAGE).boundingBox())!
  expect(b.width / b.height).toBeCloseTo(1.1, 1)
  await expect.poll(() => page.locator(`${STAGE} img[data-mesh]`).evaluate((i: HTMLImageElement) => i.currentSrc)).toMatch(/poster-tall\.svg$/)
  expect(svgs).toEqual(['/iv-surface/poster-tall.svg'])
})

test('every axis label is whole inside the stage while the surface drifts, at the narrowest screens each framing has', async ({ page, isMobile }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await seen(page)
  for (const width of isMobile ? [360, 390] : [640, 1440]) {
    await page.setViewportSize({ width, height: isMobile ? 800 : 900 })
    await page.goto('/iv-surface')
    if (!(await goLive(page))) return test.skip(true, 'no GPU here')
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(300)
      const out = await page.evaluate((sel) => {
        const stage = document.querySelector(sel)!.getBoundingClientRect()
        return [...document.querySelectorAll<HTMLElement>(`${sel} canvas + div span.block`)]
          .filter((s) => s.offsetParent !== null && getComputedStyle(s).display !== 'none' && s.textContent)
          .map((s) => ({ text: s.textContent!, r: s.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 0 && (r.left < stage.left - 0.5 || r.right > stage.right + 0.5 || r.top < stage.top - 0.5 || r.bottom > stage.bottom + 0.5))
          .map(({ text }) => text)
      }, STAGE)
      expect(out, `${width}px`).toEqual([])
    }
  }
  expect(errors).toEqual([])
})

test('at the largest shock the note’s words stay inside the stage, live and on the still frame', async ({ page }) => {
  for (const reduced of [false, true]) {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' })
    await seen(page)
    await page.goto('/iv-surface')
    if (!reduced && !(await goLive(page))) continue
    await page.locator(STAGE).scrollIntoViewIfNeeded()
    const slider = page.locator(`${FIG} input[type="range"]`)
    await slider.focus()
    await page.keyboard.press('End')
    await page.waitForTimeout(900)
    const stage = (await page.locator(STAGE).boundingBox())!
    const words = page.locator(`${STAGE} [data-note-words]:visible`).first()
    const w = (await words.boundingBox())!
    expect(w.y, reduced ? 'still' : 'live').toBeGreaterThanOrEqual(stage.y)
  }
})

test('the Greeks open and close with a short glide, not a jump', async ({ page, isMobile }) => {
  await page.goto('/iv-surface')
  const details = page.locator(`${FIG} details:visible`).first()
  const summary = details.locator('summary')
  const rows = details.locator('dl')
  await summary.scrollIntoViewIfNeeded()
  await summary.click()
  // Opening: the rows grow into place over 200ms.
  expect(await rows.evaluate((d) => d.getAnimations().length)).toBeGreaterThan(0)
  await expect(details).toHaveAttribute('open', '')
  await expect.poll(() => rows.evaluate((d) => d.getAnimations().length)).toBe(0)
  // Closing: the rows go first, over 150ms, and only then is it closed.
  await summary.click()
  expect(await details.evaluate((d) => (d as HTMLDetailsElement).open)).toBe(true)
  await expect.poll(() => details.evaluate((d) => (d as HTMLDetailsElement).open)).toBe(false)
  void isMobile
})

test('the reading tag glides to the dot’s other side when it runs out of room, instead of jumping', async ({ page }) => {
  await seen(page)
  await page.goto('/iv-surface')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  const tag = page.locator(`${STAGE} canvas ~ div [data-probe-tag]`)
  const t = await tag.evaluate((e) => `${getComputedStyle(e).transitionProperty} ${getComputedStyle(e).transitionDuration}`)
  expect(t).toMatch(/transform.*0\.12s/)
})

test('the margin reads the point in a few lines, and its Greeks are one step away', async ({ page }) => {
  await page.goto('/iv-surface')
  await expect(value(page, 'Implied · local vol')).toHaveText(/^\d+\.\d% · \d+\.\d%$/)
  const greeks = page.locator(`${FIG} details:visible`).filter({ hasText: 'Greeks at the point' }).first()
  await greeks.locator('summary').click()
  await expect(value(page, 'Delta')).toHaveText(/^\d\.\d{3}$/)
})

test('reduced motion: a click or tap on the still frame reads the point under it, and its dot moves there', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/iv-surface')
  const stage = page.locator(STAGE)
  await stage.scrollIntoViewIfNeeded()
  const before = await value(page, 'Strike').textContent()
  const dot = page.locator(`${STAGE} [data-still-dot]:visible`).first()
  const was = (await dot.boundingBox())!
  const b = (await stage.boundingBox())!
  // Toward the low strikes, near the front: well away from where the reading starts.
  const at = { x: b.x + b.width * 0.36, y: b.y + b.height * 0.62 }
  if (isMobile) await page.touchscreen.tap(at.x, at.y)
  else await page.mouse.click(at.x, at.y)
  await expect(value(page, 'Strike')).not.toHaveText(before!)
  // Its tag names the volatility there, as the margin does.
  const iv = (await value(page, 'Implied · local vol').textContent())!.split(' · ')[0]
  await expect(page.locator(`${STAGE} [data-probe-tag]:visible`)).toHaveText(`vol ${iv}`)
  const now = (await dot.boundingBox())!
  expect(Math.hypot(now.x + now.width / 2 - at.x, now.y + now.height / 2 - at.y)).toBeLessThan(12)
  expect(Math.hypot(now.x - was.x, now.y - was.y)).toBeGreaterThan(20)
})

test('the point being read is named beside its dot: while a mouse points, and for good once the reader sets it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a mouse')
  await seen(page)
  await page.goto('/iv-surface')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  const tag = page.locator(`${STAGE} canvas ~ div [data-probe-tag]`)
  const shown = () => tag.evaluate((t) => Number(getComputedStyle(t).opacity))
  // At rest the dot is the page's own starting point, and nothing is named.
  expect(await shown()).toBe(0)
  const b = (await page.locator(STAGE).boundingBox())!
  await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.6)
  await expect.poll(shown).toBeGreaterThan(0.9)
  await expect(tag).toHaveText(/^vol \d+\.\d%$/)
  // The tag says what the margin says: the implied volatility at the point.
  const iv = (await value(page, 'Implied · local vol').textContent())!.split(' · ')[0]
  await expect(tag).toHaveText(`vol ${iv}`)
  // Pointing away, it goes; a click pins the point, and the tag stays.
  await page.mouse.move(b.x + b.width * 0.5, b.y - 40)
  await expect.poll(shown).toBeLessThan(0.05)
  await page.mouse.click(b.x + b.width * 0.4, b.y + b.height * 0.6)
  await page.mouse.move(b.x + b.width * 0.5, b.y - 40)
  await page.waitForTimeout(400)
  expect(await shown()).toBeGreaterThan(0.9)
})

test('reduced motion: the still frame’s sheet is smooth, with no steps along its grid, and the slider redraws it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/iv-surface')
  const sheet = page.locator(`${STAGE} [data-still-sheet]`)
  await expect(sheet).toBeAttached()
  // The largest jump in brightness between neighbouring pixels across rows of the sheet (off it, the canvas is clear).
  const worst = () =>
    sheet.evaluate((c: HTMLCanvasElement) => {
      const g = c.getContext('2d')!
      let worst = 0
      for (const f of [0.4, 0.5, 0.6]) {
        const row = g.getImageData(0, Math.round(c.height * f), c.width, 1).data
        let prev = -1
        for (let x = 0; x < c.width; x++) {
          if (row[x * 4 + 3]! < 250) {
            prev = -1
            continue
          }
          const l = 0.2126 * row[x * 4]! + 0.7152 * row[x * 4 + 1]! + 0.0722 * row[x * 4 + 2]!
          if (prev >= 0) worst = Math.max(worst, Math.abs(l - prev))
          prev = l
        }
      }
      return worst
    })
  // The poster's facets stepped by far more; rasterisers differ by a level or two (Linux, Firefox), hence the room.
  expect(await worst()).toBeLessThan(6)
  const slider = page.locator(`${FIG} input[type="range"]`)
  await slider.focus()
  await page.keyboard.press('End')
  await page.waitForTimeout(300)
  expect(await worst()).toBeLessThan(6)
})

test('reduced motion: the still frame, never the canvas, and the slider still redraws it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/iv-surface')
  await page.waitForTimeout(1_500)
  const canvas = page.locator(`${STAGE} canvas[data-live-canvas]`)
  await expect(canvas).toHaveCSS('opacity', '0')
  // Never initialised: a canvas nobody drew into keeps its default width.
  expect(await canvas.getAttribute('width')).toBe(null)
  await expect(page.locator(FIG)).toContainText('Still frame: your system asks for reduced motion.')
  // The still frame is the sheet painted smooth, with its walls, contours and ticks inline over it; the slider redraws both.
  await expect(page.locator(`${FIG} [data-iv-poster] [data-still-sheet]`)).toBeVisible()
  const mesh = page.locator(`${FIG} [data-iv-poster] svg[data-mesh]`)
  await expect.poll(() => mesh.evaluate((m) => m.querySelectorAll('path').length), { timeout: 5_000 }).toBeGreaterThan(10)
  const lines = await mesh.innerHTML()
  const atm = await value(page, '1-month vol, at the money').textContent()
  await page.getByRole('slider', { name: /shock/i }).fill('1')
  await expect.poll(() => mesh.innerHTML(), { timeout: 5_000 }).not.toBe(lines)
  await expect(value(page, '1-month vol, at the money')).not.toHaveText(atm ?? '')
  await expect(page.locator(FIG).getByRole('button', { name: 'Pause' })).toHaveCount(0)
})

test('with iPhone Safari’s float extensions missing, it still goes live, without an error', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await page.addInitScript(() => {
    const P = WebGL2RenderingContext.prototype
    const get = P.getExtension
    const gone = ['EXT_color_buffer_float', 'EXT_float_blend', 'OES_texture_float_linear']
    P.getExtension = function (this: WebGL2RenderingContext, n: string) {
      return gone.includes(n) ? null : get.call(this, n)
    } as typeof P.getExtension
  })
  await seen(page)
  await page.goto('/iv-surface')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await expect.poll(() => draws(page), { timeout: 5_000 }).toBeGreaterThan(20)
  expect(errors).toEqual([])
})

test('a lost context shows the poster again, and a restored one brings the figure back, without an error', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await seen(page)
  await page.goto('/iv-surface')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await page.evaluate(() => {
    const c = document.querySelector('#fig-iv-surface canvas[data-live-canvas]') as HTMLCanvasElement
    const ext = c.getContext('webgl2')!.getExtension('WEBGL_lose_context')!
    ;(window as unknown as { __lose: WEBGL_lose_context }).__lose = ext
    ext.loseContext()
  })
  await expect.poll(() => canvasShown(page), { timeout: 5_000 }).toBe(false)
  await page.evaluate(() => (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext())
  await expect.poll(() => canvasShown(page), { timeout: 10_000 }).toBe(true)
  expect(errors).toEqual([])
})

test('on a first visit a lost context shows the finished poster, not an empty stage', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await page.goto('/iv-surface')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await expect.poll(() => seq(page), { timeout: 10_000 }).toBe('playing')
  await page.evaluate(() => {
    const c = document.querySelector('#fig-iv-surface canvas[data-live-canvas]') as HTMLCanvasElement
    const ext = c.getContext('webgl2')!.getExtension('WEBGL_lose_context')!
    ;(window as unknown as { __lose: WEBGL_lose_context }).__lose = ext
    ext.loseContext()
  })
  await expect.poll(() => canvasShown(page), { timeout: 5_000 }).toBe(false)
  const poster = page.locator(`${FIG} [data-iv-poster]`)
  await expect.poll(() => poster.evaluate((e) => Number(getComputedStyle(e).opacity)), { timeout: 2_000 }).toBeGreaterThan(0.9)
  await expect.poll(() => poster.locator('[data-fill]').first().evaluate((e) => Number(getComputedStyle(e).opacity)), { timeout: 2_000 }).toBeGreaterThan(0.9)
  await expect(page.locator(FIG)).toContainText('Still frame: the graphics context was lost.')
  await page.evaluate(() => (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext())
  await expect.poll(() => canvasShown(page), { timeout: 10_000 }).toBe(true)
  await expect(page.locator(FIG)).not.toContainText('Still frame: the graphics context was lost.')
  expect(errors).toEqual([])
})

test('reduced motion turned on and off again while the page is open: still, then live again, without an error', async ({ page }) => {
  test.setTimeout(60_000)
  const errors = errorsOf(page)
  await seen(page)
  await page.goto('/iv-surface')
  if (!(await goLive(page))) return test.skip(true, 'no GPU here')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => canvasShown(page), { timeout: 5_000 }).toBe(false)
  await expect(page.locator(FIG)).toContainText('Still frame: your system asks for reduced motion.')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(() => canvasShown(page), { timeout: 10_000 }).toBe(true)
  const n = await draws(page)
  await expect.poll(() => draws(page), { timeout: 5_000 }).toBeGreaterThan(n + 5)
  expect(errors).toEqual([])
})

test('?debug=1 reports the figure', async ({ page }) => {
  await seen(page)
  await page.goto('/iv-surface?debug=1')
  const row = (k: RegExp) => page.locator('[data-stage-debug] div').filter({ has: page.locator('dt', { hasText: k }) }).locator('dd')
  await expect(row(/^figure$/)).toHaveText(/^(live|starting|declined: Still frame.*)$/, { timeout: 10_000 })
  await expect(row(/^shock$/)).toHaveText(/^0\.00× · calm$/)
})

test('Fig. 2 holds its scale as the curvature moves: zero stays where it is, and a hump past the top says how high it goes', async ({ page }) => {
  await page.goto('/iv-surface')
  const fig = page.locator('#fig-bound')
  const eta = fig.getByRole('slider')
  // The zero line's label against the plot, both read in one frame: filling the slider scrolls the page.
  const at = () =>
    fig.evaluate((f) => {
      const plot = f.querySelector('[role="img"]')!
      const zero = [...plot.querySelectorAll('span')].find((s) => s.textContent === 'g = 0')!
      return zero.getBoundingClientRect().y - plot.getBoundingClientRect().y
    })
  const calm = await at()
  await eta.fill('3.5')
  expect(await at()).toBeCloseTo(calm, 0)
  await expect(fig.getByText(/^peak \d\.\d\d$/)).toBeVisible()
  await eta.fill('1.1')
  await expect(fig.getByText(/^peak /)).toHaveCount(0)
})

test('Fig. 2 names the negative density beside its dip, under zero and clear of the curve', async ({ page }) => {
  await page.goto('/iv-surface')
  const fig = page.locator('#fig-bound')
  await fig.getByRole('slider').fill('4')
  const label = fig.getByText('negative density', { exact: true })
  await expect(label).toBeVisible()
  const l = (await label.boundingBox())!
  const z = (await fig.getByText('g = 0', { exact: true }).boundingBox())!
  // Under the zero line, with the g = 0 label.
  expect(l.y).toBeGreaterThanOrEqual(z.y - 1)
  // Clear of the curve: nothing of the plotted line runs through the label's box.
  const crossed = await page.evaluate((b) => {
    const path = document.querySelector<SVGPathElement>('#fig-bound svg path[data-g]')!
    const svg = path.ownerSVGElement!
    const r = svg.getBoundingClientRect()
    const n = path.getTotalLength()
    for (let i = 0; i <= 400; i++) {
      const p = path.getPointAtLength((n * i) / 400)
      const x = r.left + (p.x / 100) * r.width, y = r.top + (p.y / 100) * r.height
      if (x > b.x && x < b.x + b.width && y > b.y && y < b.y + b.height) return true
    }
    return false
  }, l)
  expect(crossed).toBe(false)
})

test('Fig. 2 still breaks the surface on demand', async ({ page }) => {
  await page.goto('/iv-surface')
  const fig = page.locator('#fig-bound')
  const eta = fig.getByRole('slider')
  await eta.fill('3')
  await expect(fig).toContainText('present')
  await fig.getByRole('button', { name: /Back to the surface/ }).click()
  await expect(fig).toContainText('none')
})
