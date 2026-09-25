import { expect, test } from '@playwright/test'
import { visiblePapers } from '../../content/papers'

/** Each paper's live figure does the one thing it exists to show. */

test('startup ranking: changing the treatment changes the top pick', async ({ page }) => {
  await page.goto('/startup-investments')
  const top = page.locator('#fig-ranking dd').first()
  await expect(top).toHaveText('Technology')
  await page.getByRole('radio', { name: 'Both fixed' }).click()
  await expect(top).toHaveText('Software')
  // Arrow keys move between treatments, as in any radio group.
  await page.keyboard.press('ArrowLeft')
  await expect(top).not.toHaveText('Software')
})

test('CloseBooks: approving a waiting row lets it through the export gate', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/closebooks')
  const exportable = page.locator('#fig-pipeline dt:has-text("Exportable") + dd').first()
  const before = await exportable.textContent()
  await page.getByRole('button', { name: /Approve line 5/ }).click()
  await expect(exportable).not.toHaveText(before ?? '')
  await page.getByRole('button', { name: /Map line 4/ }).click()
  await expect(page.locator('#fig-pipeline dt:has-text("Blocked") + dd').first()).toHaveText('0')
})

test('cricstate: the replay scrubs ball by ball from the keyboard', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/cricstate')
  const slider = page.getByRole('slider', { name: 'Ball' })
  await expect(slider).toHaveAttribute('aria-valuetext', /all out|159|wins/)
  await slider.focus()
  await page.keyboard.press('Home')
  await expect(slider).toHaveAttribute('aria-valuetext', /India 0 for 0, over 0\.1/)
  await page.keyboard.press('ArrowRight')
  await expect(slider).not.toHaveAttribute('aria-valuetext', /over 0\.1;/)
})

test('debt portal: the login spends the statutory allowance and stops at the cap', async ({ page }) => {
  await page.goto('/debt-portal')
  const request = page.getByRole('button', { name: /Request a login code|Send the code again/ })
  await request.click()
  await page.getByRole('button', { name: '+10 minutes' }).click()
  await request.click()
  await page.getByRole('button', { name: '+10 minutes' }).click()
  await page.getByRole('button', { name: /Request a login code/ }).click()
  await expect(page.locator('#fig-settlement [aria-live="polite"]').last()).toHaveText(/Not sent: 2 of 2 in the last 24 hours/)
})

test('opening a paper can morph its thumbnail: names match across the two pages', async ({ page }) => {
  await page.goto('/')
  for (const p of visiblePapers(false)) {
    const name = `fig-${p.slug}`
    const onHome = await page.evaluate((n) => [...document.querySelectorAll<HTMLElement>('*')].filter((e) => getComputedStyle(e).viewTransitionName === n).length, name)
    expect(onHome, `${name} on the contents page`).toBe(1)
  }
  for (const p of visiblePapers(false)) {
    await page.goto(p.href)
    const name = `fig-${p.slug}`
    const onPaper = await page.evaluate((n) => [...document.querySelectorAll<HTMLElement>('*')].filter((e) => getComputedStyle(e).viewTransitionName === n).length, name)
    expect(onPaper, `${name} on ${p.href}`).toBe(1)
  }
})
