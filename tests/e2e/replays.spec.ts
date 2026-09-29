import { expect, test, type Page } from '@playwright/test'

/**
 * The two figures that replay once when first seen: the cricket match and the
 * CloseBooks batch. On a first look this visit they are still to be drawn from
 * first paint, so a replay never wipes a finished figure the reader has
 * already read; they play on the frames they are seen for; a second look this
 * visit is the finished figure; and only what the reader did not do on a
 * control is spoken.
 */

const ball = (page: Page) => page.getByRole('slider', { name: 'Ball' })
const played = (page: Page) => page.locator('#fig-replay path[data-played]')
const opacity = (page: Page) => played(page).evaluate((e) => Number(getComputedStyle(e).opacity))

test('the cricket line is still to be drawn on a first look, then draws from the first ball: nothing is wiped', async ({ page }) => {
  // What first paint shows, before any script of the page's own has run.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const w = window as unknown as { __first: { mark?: string; opacity: number } }
      const path = document.querySelector('#fig-replay path[data-played]')
      w.__first = { mark: document.documentElement.dataset.cricketSeq, opacity: path ? Number(getComputedStyle(path).opacity) : -1 }
    })
  })
  await page.goto('/cricstate')
  // Before the figure plays: nothing of the match drawn yet.
  expect(await page.evaluate(() => (window as unknown as { __first: unknown }).__first)).toEqual({ mark: '1', opacity: 0 })
  await page.locator('#fig-replay').scrollIntoViewIfNeeded()
  await expect.poll(async () => Number(await ball(page).inputValue()), { timeout: 3_000 }).toBeGreaterThan(0)
  // It started from the first ball, and the line was never shown whole first.
  const max = Number(await ball(page).getAttribute('max'))
  expect(Number(await ball(page).inputValue())).toBeLessThan(max)
  expect(await opacity(page)).toBe(1)
  await expect.poll(async () => Number(await ball(page).inputValue()), { timeout: 8_000 }).toBe(max)
  await expect(page.locator('#fig-replay [aria-live="polite"]')).toContainText('Replayed to the end')
})

test('a second look this visit is the finished match', async ({ page }) => {
  await page.goto('/cricstate')
  await page.locator('#fig-replay').scrollIntoViewIfNeeded()
  await expect.poll(async () => Number(await ball(page).inputValue()), { timeout: 3_000 }).toBeGreaterThan(0)
  await page.reload()
  expect(await page.evaluate(() => document.documentElement.dataset.cricketSeq)).toBeUndefined()
  await page.locator('#fig-replay').scrollIntoViewIfNeeded()
  await page.waitForTimeout(800)
  expect(await ball(page).inputValue()).toBe(await ball(page).getAttribute('max'))
  expect(await opacity(page)).toBe(1)
})

test('off screen, the cricket replay waits for the reader', async ({ page }) => {
  await page.goto('/cricstate')
  await page.locator('#fig-replay').scrollIntoViewIfNeeded()
  await expect.poll(async () => Number(await ball(page).inputValue()), { timeout: 3_000 }).toBeGreaterThan(0)
  // Well past it, so none of it is on screen.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(300)
  const held = Number(await ball(page).inputValue())
  await page.waitForTimeout(1_200)
  expect(Number(await ball(page).inputValue())).toBe(held)
})

test('off screen, the cricket replay asks for no frames, and carries on from where it was when seen again', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __raf: number }
    w.__raf = 0
    const raf = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (cb) => {
      w.__raf++
      return raf(cb)
    }
  })
  await page.goto('/cricstate')
  await page.locator('#fig-replay').scrollIntoViewIfNeeded()
  // Playing: past the first ball and short of the last (where the slider rests before the replay starts).
  const max = Number(await ball(page).getAttribute('max'))
  await expect
    .poll(async () => {
      const v = Number(await ball(page).inputValue())
      return v > 0 && v < max
    }, { timeout: 3_000 })
    .toBe(true)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(400)
  const count = () => page.evaluate(() => (window as unknown as { __raf: number }).__raf)
  const before = await count()
  const held = Number(await ball(page).inputValue())
  await page.waitForTimeout(1_000)
  // A second at 60 Hz would be about sixty frames: a few at most (the page's own scroll work).
  expect((await count()) - before).toBeLessThan(6)
  await page.locator('#fig-replay').scrollIntoViewIfNeeded()
  await expect.poll(async () => Number(await ball(page).inputValue()), { timeout: 3_000 }).toBeGreaterThan(held)
})

test('the reader’s own steps on the ball slider are not spoken twice', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/cricstate')
  await ball(page).focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(500)
  await expect(page.locator('#fig-replay [aria-live="polite"]')).toHaveText('')
})

const rows = (page: Page) => page.locator('#fig-pipeline ol > li')
const shownRows = (page: Page) => rows(page).evaluateAll((ls) => ls.filter((l) => Number(getComputedStyle(l).opacity) > 0.5).length)

test('the CloseBooks batch is still to come on a first look, then arrives row by row: never backwards out of its end', async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const w = window as unknown as { __first: { mark?: string; shown: number } }
      const ls = [...document.querySelectorAll('#fig-pipeline ol > li')]
      w.__first = { mark: document.documentElement.dataset.closebooksSeq, shown: ls.filter((l) => Number(getComputedStyle(l).opacity) > 0.5).length }
    })
  })
  await page.goto('/closebooks')
  expect(await page.evaluate(() => (window as unknown as { __first: unknown }).__first)).toEqual({ mark: '1', shown: 0 })
  await page.locator('#fig-pipeline').scrollIntoViewIfNeeded()
  const n = await rows(page).count()
  await expect.poll(() => shownRows(page), { timeout: 3_000 }).toBeGreaterThan(0)
  // Arriving, not all there at once.
  expect(await shownRows(page)).toBeLessThan(n)
  await expect.poll(() => shownRows(page), { timeout: 5_000 }).toBe(n)
})

test('a reviewer’s approval lights the export count it moved', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/closebooks')
  await page.getByRole('button', { name: /^Approve line/ }).first().click()
  const lit = page.locator('#fig-pipeline [data-batch-rail] dd span.rounded-sm').first()
  await expect(lit).toBeAttached()
})

test('switching treatment: the rows that leave the top fade where they stood, then go', async ({ page }) => {
  await page.goto('/startup-investments')
  await page.locator('#fig-ranking').scrollIntoViewIfNeeded()
  await page.getByRole('radio', { name: 'Both fixed' }).click()
  const leaving = page.locator('#fig-ranking ol > li[aria-hidden="true"]')
  await expect(leaving.first()).toBeAttached()
  await expect(leaving).toHaveCount(0, { timeout: 1_000 })
})

test('a second switch while rows are moving takes them on from where they are, never back to where they were', async ({ page }) => {
  await page.goto('/startup-investments')
  await page.locator('#fig-ranking').scrollIntoViewIfNeeded()
  const names = () => page.locator('#fig-ranking ol > li[data-name]').evaluateAll((ls) => ls.map((l) => (l as HTMLElement).dataset.name!))
  const asWritten = await names()
  await page.getByRole('radio', { name: 'Both fixed' }).click()
  await page.waitForTimeout(120)
  // A row in the top twelve both ways, mid-move: where it is drawn, and a frame after switching straight back.
  const both = (await names()).filter((n) => asWritten.includes(n))
  const [mid, after] = await page.evaluate(async (ns) => {
    const find = (n: string) => [...document.querySelectorAll<HTMLElement>('#fig-ranking ol > li[data-name]')].find((li) => li.dataset.name === n)!
    const n = ns.find((x) => find(x).style.transform !== '') ?? ns[0]!
    const a = find(n).getBoundingClientRect().top
    ;[...document.querySelectorAll<HTMLButtonElement>('#fig-ranking [role="radio"]')].find((b) => b.textContent?.includes('As written'))!.click()
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    return [a, find(n).getBoundingClientRect().top]
  }, both)
  expect(Math.abs(after - mid)).toBeLessThan(40)
})
