import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { CV_PHONE, RESUME } from '../../lib/site'

/**
 * The CV is a page and a PDF printed from it at build time. Both must exist,
 * be linked where a recruiter looks, and hold to one sheet.
 */

const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length

test('the PDF is served as a one-page PDF', async ({ request }) => {
  const r = await request.get(RESUME.pdf)
  expect(r.status()).toBe(200)
  expect(r.headers()['content-type']).toContain('application/pdf')
  expect(pages(await r.body())).toBe(1)
})

test('the phone number is on the CV, beside the email, as a link a phone can call, and in the PDF', async ({ page, request }) => {
  await page.goto('/cv')
  const tel = page.locator('.cv-contact a[href^="tel:"]')
  await expect(tel).toHaveCount(1)
  await expect(tel).toHaveText(CV_PHONE.label)
  await expect(tel).toHaveAttribute('href', CV_PHONE.href)
  // The PDF's link annotations are plain text in the file: the number is printed on the sheet and callable from it.
  const pdf = (await (await request.get(RESUME.pdf)).body()).toString('latin1')
  expect(pdf).toContain(CV_PHONE.href)
})

test('the masthead and running head link the PDF, and /about links the page', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator(`header a[href="${RESUME.pdf}"]`).first()).toBeVisible()
  await page.goto('/about')
  await expect(page.locator(`header a[href="${RESUME.pdf}"]`).first()).toBeVisible()
  await expect(page.locator(`main a[href="${RESUME.page}"]`).first()).toBeVisible()
})

for (const format of ['Letter', 'A4'] as const) {
  test(`/cv prints to one ${format} page from the browser too`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'page.pdf is Chromium-only')
    await page.goto(RESUME.page)
    await page.evaluate(() => document.fonts.ready)
    const pdf = await page.pdf({ format, margin: { top: '0.5in', bottom: '0.5in', left: '0.55in', right: '0.55in' } })
    expect(pages(pdf)).toBe(1)
  })
}

test('printing hides the site chrome', async ({ page }) => {
  await page.emulateMedia({ media: 'print' })
  await page.goto(RESUME.page)
  await expect(page.locator('footer')).toBeHidden()
  await expect(page.getByRole('navigation', { name: 'Site' })).toBeHidden()
})

/**
 * The PDF as a résumé screener reads it: fonts embedded as ordinary TrueType (never Type 3, which some screeners garble),
 * and a raw text extraction, which infers every space from the gap between words, keeping every word whole and in
 * reading order. Runs where poppler's pdftotext and pdffonts are installed.
 */
test('the PDF reads cleanly to a résumé screener: TrueType fonts, every word whole, in order', async ({ request }) => {
  const tool = (name: string) => {
    try {
      execFileSync(name, ['-v'], { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }
  test.skip(!tool('pdftotext') || !tool('pdffonts'), 'poppler is not installed here')
  const dir = mkdtempSync(join(tmpdir(), 'cv-'))
  const file = join(dir, 'cv.pdf')
  writeFileSync(file, await (await request.get(RESUME.pdf)).body())
  const fonts = execFileSync('pdffonts', [file]).toString()
  expect(fonts).not.toMatch(/Type 3/)
  expect(fonts).toMatch(/TrueType/)
  const raw = execFileSync('pdftotext', ['-raw', file, '-']).toString()
  const layout = execFileSync('pdftotext', ['-layout', file, '-']).toString()
  const words = (t: string) => t.match(/[A-Za-z0-9’'.&/+-]+/g) ?? []
  const seen = new Set(words(layout))
  // A word the raw reading makes that the page does not show is two words run together ("IliaDuda").
  expect(words(raw).filter((w) => !seen.has(w))).toEqual([])
  // Reading order: the name, then the sections in the page's order.
  const at = (s: string) => raw.indexOf(s)
  expect(at('Ilia Duda')).toBe(0)
  for (const [a, b] of [['Ilia Duda', 'Education'], ['Education', 'Experience'], ['Experience', 'Research'], ['Research', 'Skills']]) expect(at(a)).toBeLessThan(at(b))
})
